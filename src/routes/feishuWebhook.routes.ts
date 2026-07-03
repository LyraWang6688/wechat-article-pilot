import { Router } from "express";
import { HttpError } from "../errors/HttpError.js";
import { services } from "../services/index.js";
import { PUSH_DRAFT_STATUSES, type PushDraftStatus } from "../templates/pushDraftTable.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { logger } from "../utils/logger.js";

export const feishuWebhookRouter = Router();

feishuWebhookRouter.post(
  "/base-record-sync",
  asyncHandler(async (req, res) => {
    const { base_token, baseToken, table_id, tableId, record_id, recordId, event, writeBackStatus } = req.body as {
      base_token?: string;
      baseToken?: string;
      table_id?: string;
      tableId?: string;
      record_id?: string;
      recordId?: string;
      event?: string;
      writeBackStatus?: PushDraftStatus;
    };
    const traceId = res.locals.traceId as string | undefined;

    logger.info("feishu_webhook_base_record_sync_received", {
      traceId,
      body: req.body,
      normalized: {
        baseToken: baseToken || base_token,
        tableId: tableId || table_id,
        recordId: recordId || record_id,
        event,
        writeBackStatus
      }
    });

    if (writeBackStatus && !PUSH_DRAFT_STATUSES.includes(writeBackStatus)) {
      logger.warn("feishu_webhook_invalid_write_back_status", {
        traceId,
        writeBackStatus,
        allowed: PUSH_DRAFT_STATUSES
      });
      throw new HttpError(400, "writeBackStatus 不在允许范围内", "INVALID_WRITE_BACK_STATUS", {
        allowed: PUSH_DRAFT_STATUSES
      });
    }

    const data = await services.syncArticle.handleFeishuRecordSync({
      baseToken: baseToken || base_token,
      tableId: tableId || table_id,
      recordId: recordId || record_id,
      event,
      writeBackStatus
    });

    logger.info("feishu_webhook_base_record_sync_success", {
      traceId,
      recordId: recordId || record_id,
      event
    });
    res.json({ ok: true, data });
  })
);
