import { Router } from "express";
import { HttpError } from "../errors/HttpError.js";
import { services } from "../services/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { logger } from "../utils/logger.js";

export const templateRouter = Router();

templateRouter.post(
  "/wechat-draft/base",
  asyncHandler(async (req, res) => {
    const { baseName } = req.body as {
      baseName?: string;
    };

    logger.info("template_wechat_draft_base_route_received", {
      traceId: res.locals.traceId,
      baseName
    });
    const data = await services.templateBase.createWechatDraftBase({
      baseName
    });

    logger.info("template_wechat_draft_base_route_success", {
      traceId: res.locals.traceId,
      baseName: data.baseName,
      baseToken: data.baseToken
    });
    res.json({ ok: true, data });
  })
);

templateRouter.post(
  "/wechat-draft/table",
  asyncHandler(async (req, res) => {
    const { baseToken, tableName } = req.body as {
      baseToken?: string;
      tableName?: string;
    };

    if (!baseToken) {
      throw new HttpError(400, "缺少 baseToken，请先创建多维表格", "MISSING_BASE_TOKEN");
    }

    logger.info("template_wechat_draft_table_route_received", {
      traceId: res.locals.traceId,
      baseToken,
      tableName
    });
    const data = await services.templateBase.createWechatDraftTable({
      baseToken,
      tableName
    });

    logger.info("template_wechat_draft_table_route_success", {
      traceId: res.locals.traceId,
      baseToken,
      tableName: data.tableName,
      tableId: data.tableId
    });
    res.json({ ok: true, data });
  })
);

templateRouter.post(
  "/wechat-draft/workflow",
  asyncHandler(async (req, res) => {
    const { baseToken, tableId, tableName, webhookUrl, workflowType, enable } = req.body as {
      baseToken?: string;
      tableId?: string;
      tableName?: string;
      webhookUrl?: string;
      workflowType?: "sync" | "notify";
      enable?: boolean;
    };

    if (!baseToken) {
      throw new HttpError(400, "缺少 baseToken，请先创建多维表格", "MISSING_BASE_TOKEN");
    }
    if (!tableId) {
      throw new HttpError(400, "缺少 tableId，请先创建数据表", "MISSING_TABLE_ID");
    }
    if (!webhookUrl) {
      throw new HttpError(400, "缺少 webhookUrl", "MISSING_WEBHOOK_URL");
    }
    if (!workflowType || !["sync", "notify"].includes(workflowType)) {
      throw new HttpError(400, "workflowType 只能是 sync 或 notify", "INVALID_WORKFLOW_TYPE");
    }

    logger.info("template_wechat_draft_workflow_route_received", {
      traceId: res.locals.traceId,
      baseToken,
      tableId,
      tableName,
      webhookUrl,
      workflowType,
      enable
    });
    const data = await services.templateBase.createWechatDraftWorkflow({
      baseToken,
      tableId,
      tableName,
      webhookUrl,
      workflowType,
      enable
    });

    logger.info("template_wechat_draft_workflow_route_success", {
      traceId: res.locals.traceId,
      baseToken,
      tableId,
      workflowType,
      workflowId: data.workflowId
    });
    res.json({ ok: true, data });
  })
);

templateRouter.post(
  "/wechat-draft/setup",
  asyncHandler(async (req, res) => {
    const { baseName, tableName } = req.body as {
      baseName?: string;
      tableName?: string;
    };

    logger.info("template_wechat_draft_setup_route_received", {
      traceId: res.locals.traceId,
      baseName,
      tableName
    });
    const data = await services.templateBase.setupWechatDraftWorkspace({
      baseName,
      tableName
    });

    logger.info("template_wechat_draft_setup_route_success", {
      traceId: res.locals.traceId,
      baseName: data.baseName,
      tableName: data.tableName,
      baseToken: data.baseToken,
      tableId: data.tableId
    });
    res.json({ ok: true, data });
  })
);

templateRouter.post(
  "/wechat-draft/workflows",
  asyncHandler(async (req, res) => {
    const { baseToken, tableId, tableName, webhookUrl, enable } = req.body as {
      baseToken?: string;
      tableId?: string;
      tableName?: string;
      webhookUrl?: string;
      enable?: boolean;
    };

    if (!baseToken) {
      throw new HttpError(400, "缺少 baseToken，请先创建模板数据表", "MISSING_BASE_TOKEN");
    }
    if (!tableId) {
      throw new HttpError(400, "缺少 tableId，请先创建模板数据表", "MISSING_TABLE_ID");
    }
    if (!webhookUrl) {
      throw new HttpError(400, "缺少 webhookUrl", "MISSING_WEBHOOK_URL");
    }

    logger.info("template_wechat_draft_workflows_route_received", {
      traceId: res.locals.traceId,
      baseToken,
      tableId,
      tableName,
      webhookUrl,
      enable
    });
    const data = await services.templateBase.createWechatDraftWorkflows({
      baseToken,
      tableId,
      tableName,
      webhookUrl,
      enable
    });

    logger.info("template_wechat_draft_workflows_route_success", {
      traceId: res.locals.traceId,
      baseToken,
      tableId,
      tableName,
      workflowCount: data.workflows.length,
      successCount: data.workflows.filter((item) => item.ok).length
    });
    res.json({ ok: true, data });
  })
);

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
