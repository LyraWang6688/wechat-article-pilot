import { Router } from "express";
import { HttpError } from "../errors/HttpError.js";
import { services } from "../services/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { logger } from "../utils/logger.js";

export const templateRouter = Router();

templateRouter.post(
  "/push-draft-table",
  asyncHandler(async (req, res) => {
    const { baseToken, tableName } = req.body as {
      baseToken?: string;
      tableName?: string;
    };

    if (!baseToken) {
      throw new HttpError(400, "缺少 baseToken", "MISSING_BASE_TOKEN");
    }

    logger.info("template_push_draft_route_received", {
      traceId: res.locals.traceId,
      baseToken,
      tableName
    });
    const data = await services.templateBase.createPushDraftTable({
      baseToken,
      tableName
    });

    logger.info("template_push_draft_route_success", {
      traceId: res.locals.traceId,
      baseToken,
      tableName: data.tableName
    });
    res.json({ ok: true, data });
  })
);
