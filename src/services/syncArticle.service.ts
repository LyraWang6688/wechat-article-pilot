import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { appConfig } from "../config.js";
import { HttpError } from "../errors/HttpError.js";
import type { PushDraftStatus } from "../templates/pushDraftTable.js";
import { logger } from "../utils/logger.js";
import { IntegrationConfigService } from "./integrationConfig.service.js";
import { LarkBaseService } from "./larkBase.service.js";
import {
  normalizePushDraftRecord,
  type NormalizedPushDraftRecord,
  validatePushDraftForWechat
} from "./pushDraftRecord.service.js";
import { WechatService } from "./wechat.service.js";

const IMAGE_FIELD_HINT = /image|img|picture|photo|cover|attachment|file|media|mime|url|token|图片|封面|附件/i;
const MAX_DEBUG_FIELDS = 80;
const MAX_DEBUG_TEXT_LENGTH = 180;

export type FeishuRecordSyncInput = {
  baseToken?: string;
  tableId?: string;
  recordId?: string;
  event?: string;
  writeBackStatus?: PushDraftStatus;
};

type RecordValueDebugSummary = {
  path: string;
  kind: string;
  arrayLength?: number;
  objectKeys?: string[];
  imageLike: boolean;
  sample: unknown;
};

export class SyncArticleService {
  constructor(
    private readonly larkBase: LarkBaseService,
    private readonly wechat: WechatService,
    private readonly integrationConfig: IntegrationConfigService
  ) {}

  async fetchDraftRecord(input: FeishuRecordSyncInput) {
    const baseToken = input.baseToken || appConfig.defaultBaseToken;
    const tableId = input.tableId || appConfig.defaultTableId;
    const recordId = input.recordId;

    logger.info("sync_article_fetch_record_start", {
      baseToken,
      tableId,
      recordId,
      event: input.event,
      usedDefaultBaseToken: !input.baseToken && Boolean(appConfig.defaultBaseToken),
      usedDefaultTableId: !input.tableId && Boolean(appConfig.defaultTableId)
    });

    if (!baseToken || !tableId || !recordId) {
      logger.warn("sync_article_fetch_record_missing_input", {
        baseToken,
        tableId,
        recordId,
        hasDefaultBaseToken: Boolean(appConfig.defaultBaseToken),
        hasDefaultTableId: Boolean(appConfig.defaultTableId)
      });
      throw new HttpError(400, "缺少 baseToken、tableId 或 recordId", "MISSING_RECORD_SYNC_INPUT", {
        hasDefaultBaseToken: Boolean(appConfig.defaultBaseToken),
        hasDefaultTableId: Boolean(appConfig.defaultTableId)
      });
    }

    const record = await this.larkBase.getRecord({
      baseToken,
      tableId,
      recordId
    });

    logger.info("sync_article_fetch_record_success", {
      baseToken,
      tableId,
      recordId
    });
    return {
      baseToken,
      tableId,
      recordId,
      record
    };
  }

  async handleFeishuRecordSync(input: FeishuRecordSyncInput) {
    logger.info("sync_article_handle_start", {
      ...input
    });
    const draftRecord = await this.fetchDraftRecord(input);
    const recordDebugSummary = summarizeRecordRaw(draftRecord.record.raw);
    const normalizedRecord = normalizePushDraftRecord(draftRecord.record.raw);
    let writeBack:
      | {
          status: PushDraftStatus;
          result: Awaited<ReturnType<LarkBaseService["upsertRecord"]>>;
        }
      | undefined;

    if (input.writeBackStatus) {
      logger.info("sync_article_write_back_start", {
        baseToken: draftRecord.baseToken,
        tableId: draftRecord.tableId,
        recordId: draftRecord.recordId,
        writeBackStatus: input.writeBackStatus
      });
      const result = await this.larkBase.upsertRecord(
        draftRecord.baseToken,
        draftRecord.tableId,
        {
          status: input.writeBackStatus,
          wechat_upload_result: `飞书侧联调占位：已读取 record_id=${draftRecord.recordId}`
        },
        draftRecord.recordId
      );
      writeBack = {
        status: input.writeBackStatus,
        result
      };
      logger.info("sync_article_write_back_success", {
        baseToken: draftRecord.baseToken,
        tableId: draftRecord.tableId,
        recordId: draftRecord.recordId,
        writeBackStatus: input.writeBackStatus
      });

      logger.info("sync_article_handle_success", {
        event: input.event || "wechat_draft_sync",
        baseToken: draftRecord.baseToken,
        tableId: draftRecord.tableId,
        recordId: draftRecord.recordId,
        writeBackStatus: input.writeBackStatus
      });
      logger.info("sync_article_record_debug_summary", {
        baseToken: draftRecord.baseToken,
        tableId: draftRecord.tableId,
        recordId: draftRecord.recordId,
        recordDebugSummary
      });
      return {
        event: input.event || "wechat_draft_sync",
        received: true,
        draftRecord,
        normalizedRecord,
        recordDebugSummary,
        writeBack,
        nextStep: "已执行飞书侧联调写回；未调用微信接口。"
      };
    }

    logger.info("sync_article_record_debug_summary", {
      baseToken: draftRecord.baseToken,
      tableId: draftRecord.tableId,
      recordId: draftRecord.recordId,
      recordDebugSummary
    });
    const syncResult = await this.syncWechatDraft({
      baseToken: draftRecord.baseToken,
      tableId: draftRecord.tableId,
      recordId: draftRecord.recordId,
      record: normalizedRecord
    });

    logger.info("sync_article_handle_success", {
      event: input.event || "wechat_draft_sync",
      baseToken: draftRecord.baseToken,
      tableId: draftRecord.tableId,
      recordId: draftRecord.recordId,
      status: syncResult.status,
      draftMediaId: "draftMediaId" in syncResult ? syncResult.draftMediaId : undefined
    });
    return {
      event: input.event || "wechat_draft_sync",
      received: true,
      draftRecord,
      normalizedRecord,
      recordDebugSummary,
      syncResult,
      writeBack: syncResult.writeBack,
      nextStep: "已接入微信图文草稿链路：飞书附件封面 -> 微信永久图片素材 -> 微信草稿。"
    };
  }

  private async syncWechatDraft(input: {
    baseToken: string;
    tableId: string;
    recordId: string;
    record: NormalizedPushDraftRecord;
  }) {
    const validation = validatePushDraftForWechat(input.record);
    if (validation.missingFields.length > 0) {
      return this.writeFailure(input, `缺少或不满足必填字段：${validation.missingFields.join("；")}`, validation);
    }

    let tempDir: string | undefined;
    try {
      const tempRoot = path.join(process.cwd(), ".data");
      await mkdir(tempRoot, {
        recursive: true
      });
      tempDir = await mkdtemp(path.join(tempRoot, "wechat-cover-"));
      const coverImage = input.record.coverImage;
      if (!coverImage) {
        return this.writeFailure(input, "缺少封面附件 file_token", {
          missingFields: ["cover_image_url.file_token"],
          warningFields: validation.warningFields
        });
      }

      const coverPath = path.join(tempDir, sanitizeFileName(coverImage.name));
      const cliOutputPath = toCliRelativePath(coverPath);
      const wechatCredentials = await this.integrationConfig.getWechatCredentials(input.baseToken, input.tableId);
      await this.larkBase.downloadRecordAttachment({
        baseToken: input.baseToken,
        tableId: input.tableId,
        recordId: input.recordId,
        fileToken: coverImage.fileToken,
        outputPath: cliOutputPath
      });
      const material = await this.wechat.uploadPermanentImage({
        credentials: wechatCredentials,
        filePath: coverPath,
        fileName: coverImage.name
      });
      const draft = await this.wechat.addDraftArticle({
        title: input.record.title || "",
        author: input.record.author,
        digest: input.record.digest,
        content: input.record.content_html || "",
        thumbMediaId: material.mediaId,
        credentials: wechatCredentials
      });
      const resultMessage = [
        "微信图文草稿创建成功",
        `cover_media_id=${material.mediaId}`,
        `draft_media_id=${draft.mediaId}`,
        material.url ? `cover_url=${material.url}` : undefined,
        validation.warningFields.length ? `warnings=${validation.warningFields.join("；")}` : undefined
      ]
        .filter(Boolean)
        .join("；");
      const writeBackResult = await this.larkBase.upsertRecord(
        input.baseToken,
        input.tableId,
        {
          status: "uploaded_to_wechat",
          wechat_draft_media_id: draft.mediaId,
          wechat_upload_result: resultMessage,
          missing_fields: "",
          warning_fields: validation.warningFields.join("；")
        },
        input.recordId
      );

      return {
        status: "uploaded_to_wechat" as PushDraftStatus,
        coverMediaId: material.mediaId,
        draftMediaId: draft.mediaId,
        material,
        draft,
        validation,
        writeBack: {
          status: "uploaded_to_wechat" as PushDraftStatus,
          result: writeBackResult
        }
      };
    } catch (error) {
      logger.error("sync_article_wechat_draft_failed", {
        baseToken: input.baseToken,
        tableId: input.tableId,
        recordId: input.recordId,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      return this.writeFailure(input, error instanceof Error ? error.message : String(error), validation);
    } finally {
      if (tempDir) {
        await rm(tempDir, {
          recursive: true,
          force: true
        });
      }
    }
  }

  private async writeFailure(
    input: {
      baseToken: string;
      tableId: string;
      recordId: string;
    },
    message: string,
    validation: {
      missingFields: string[];
      warningFields: string[];
    }
  ) {
    const result = await this.larkBase.upsertRecord(
      input.baseToken,
      input.tableId,
      {
        status: "failed",
        wechat_upload_result: message,
        missing_fields: validation.missingFields.join("；"),
        warning_fields: validation.warningFields.join("；")
      },
      input.recordId
    );

    return {
      status: "failed" as PushDraftStatus,
      error: message,
      validation,
      writeBack: {
        status: "failed" as PushDraftStatus,
        result
      }
    };
  }
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_") || "cover-image";
}

function toCliRelativePath(filePath: string) {
  const relativePath = path.relative(process.cwd(), filePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new HttpError(500, "附件下载路径必须位于项目目录内", "UNSAFE_ATTACHMENT_OUTPUT_PATH", {
      filePath
    });
  }
  return relativePath.split(path.sep).join("/");
}

function summarizeRecordRaw(raw: unknown) {
  const rawObject = isRecord(raw) ? raw : undefined;
  const dataObject = isRecord(rawObject?.data) ? rawObject.data : undefined;
  const dataRows = Array.isArray(dataObject?.data) ? dataObject.data : undefined;
  const fieldSummaries = collectValueSummaries(raw).slice(0, MAX_DEBUG_FIELDS);

  return {
    topLevelKeys: rawObject ? Object.keys(rawObject) : [],
    dataKeys: dataObject ? Object.keys(dataObject) : [],
    dataShape: {
      isArray: Array.isArray(dataRows),
      rowCount: dataRows?.length ?? 0,
      firstRowCellCount: Array.isArray(dataRows?.[0]) ? dataRows[0].length : undefined
    },
    fieldSummaries,
    imageLikeFieldSummaries: fieldSummaries.filter((item) => item.imageLike)
  };
}

function collectValueSummaries(value: unknown, path = "raw", depth = 0, output: RecordValueDebugSummary[] = []) {
  if (output.length >= MAX_DEBUG_FIELDS || depth > 6) {
    return output;
  }

  if (Array.isArray(value)) {
    output.push({
      path,
      kind: "array",
      arrayLength: value.length,
      imageLike: isImageLike(path, value),
      sample: summarizeSample(value)
    });
    value.slice(0, 20).forEach((item, index) => {
      collectValueSummaries(item, `${path}[${index}]`, depth + 1, output);
    });
    return output;
  }

  if (isRecord(value)) {
    const objectKeys = Object.keys(value);
    output.push({
      path,
      kind: "object",
      objectKeys,
      imageLike: isImageLike(path, value),
      sample: summarizeSample(value)
    });
    objectKeys.slice(0, 20).forEach((key) => {
      collectValueSummaries(value[key], `${path}.${key}`, depth + 1, output);
    });
    return output;
  }

  output.push({
    path,
    kind: value === null ? "null" : typeof value,
    imageLike: isImageLike(path, value),
    sample: summarizeSample(value)
  });
  return output;
}

function summarizeSample(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > MAX_DEBUG_TEXT_LENGTH ? `${value.slice(0, MAX_DEBUG_TEXT_LENGTH)}...` : value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 3).map((item) => summarizeSample(item));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 12)
        .map(([key, item]) => [key, summarizeSample(item)])
    );
  }

  return value;
}

function isImageLike(path: string, value: unknown) {
  if (IMAGE_FIELD_HINT.test(path)) {
    return true;
  }

  if (isRecord(value)) {
    return Object.keys(value).some((key) => IMAGE_FIELD_HINT.test(key));
  }

  return typeof value === "string" && IMAGE_FIELD_HINT.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
