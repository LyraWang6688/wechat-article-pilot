import { appConfig } from "../config.js";
import { HttpError } from "../errors/HttpError.js";
import type { PushDraftStatus } from "../templates/pushDraftTable.js";
import { logger } from "../utils/logger.js";
import { LarkBaseService } from "./larkBase.service.js";

export type FeishuRecordSyncInput = {
  baseToken?: string;
  tableId?: string;
  recordId?: string;
  event?: string;
  writeBackStatus?: PushDraftStatus;
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
    return {
      event: input.event || "wechat_draft_sync",
      received: true,
      draftRecord,
      writeBack,
      nextStep: "微信侧暂未接入；当前 webhook 只验证飞书侧 record-get 和可选状态写回。"
    };
  }
}
