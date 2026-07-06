import { appConfig } from "../config.js";
import { HttpError } from "../errors/HttpError.js";
import type { PushDraftStatus } from "../templates/pushDraftTable.js";
import { logger } from "../utils/logger.js";
import { LarkBaseService } from "./larkBase.service.js";

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
  constructor(private readonly larkBase: LarkBaseService) {}

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
    }

    logger.info("sync_article_handle_success", {
      event: input.event || "wechat_draft_sync",
      baseToken: draftRecord.baseToken,
      tableId: draftRecord.tableId,
      recordId: draftRecord.recordId,
      writeBackStatus: input.writeBackStatus
    });
    const recordDebugSummary = summarizeRecordRaw(draftRecord.record.raw);
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
      recordDebugSummary,
      writeBack,
      nextStep: "微信侧暂未接入；当前 webhook 只验证飞书侧 record-get 和可选状态写回。"
    };
  }
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
