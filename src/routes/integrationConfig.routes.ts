import { Router } from "express";
import { HttpError } from "../errors/HttpError.js";
import { services } from "../services/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { logger } from "../utils/logger.js";

export const integrationConfigRouter = Router();

integrationConfigRouter.post(
  "/wechat-binding",
  asyncHandler(async (req, res) => {
    const { baseToken, tableId, baseName, tableName, wechatAppId, wechatAppSecret } = req.body as {
      baseToken?: string;
      tableId?: string;
      baseName?: string;
      tableName?: string;
      wechatAppId?: string;
      wechatAppSecret?: string;
    };

    if (!baseToken || !tableId) {
      throw new HttpError(400, "缺少 baseToken 或 tableId，请先完成多维表格初始化", "MISSING_BASE_COORDINATES");
    }
    if (!wechatAppId || !wechatAppSecret) {
      throw new HttpError(400, "缺少微信公众号 AppID 或 AppSecret", "MISSING_WECHAT_CREDENTIALS");
    }

    logger.info("integration_wechat_binding_save_received", {
      traceId: res.locals.traceId,
      baseToken,
      tableId,
      baseName,
      tableName,
      wechatAppId,
      hasWechatAppSecret: Boolean(wechatAppSecret)
    });
    const data = await services.integrationConfig.saveWechatBinding({
      baseToken,
      tableId,
      baseName,
      tableName,
      wechatAppId,
      wechatAppSecret
    });

    logger.info("integration_wechat_binding_save_success", {
      traceId: res.locals.traceId,
      baseToken,
      tableId,
      wechatAppId
    });
    res.json({ ok: true, data });
  })
);

integrationConfigRouter.get(
  "/wechat-binding",
  asyncHandler(async (req, res) => {
    const baseToken = typeof req.query.baseToken === "string" ? req.query.baseToken : "";
    const tableId = typeof req.query.tableId === "string" ? req.query.tableId : "";

    if (!baseToken || !tableId) {
      throw new HttpError(400, "缺少 baseToken 或 tableId", "MISSING_BASE_COORDINATES");
    }

    const data = await services.integrationConfig.getWechatBinding(baseToken, tableId);
    res.json({
      ok: true,
      data: data || null
    });
  })
);
