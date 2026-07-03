import { Router } from "express";
import { HttpError } from "../errors/HttpError.js";
import { services } from "../services/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const larkBaseRouter = Router();

larkBaseRouter.post(
  "/resolve-url",
  asyncHandler(async (req, res) => {
    const { url } = req.body as { url?: string };
    if (!url) {
      throw new HttpError(400, "缺少多维表格链接", "MISSING_BASE_URL");
    }

    const data = await services.larkBase.resolveUrl(url);
    res.json({ ok: true, data });
  })
);

larkBaseRouter.post(
  "/fields",
  asyncHandler(async (req, res) => {
    const { baseToken, tableId, limit, offset } = req.body as {
      baseToken?: string;
      tableId?: string;
      limit?: number;
      offset?: number;
    };
    if (!baseToken || !tableId) {
      throw new HttpError(400, "缺少 baseToken 或 tableId", "MISSING_BASE_COORDINATES");
    }

    const data = await services.larkBase.listFields(baseToken, tableId, limit, offset);
    res.json({ ok: true, data });
  })
);

larkBaseRouter.post(
  "/records",
  asyncHandler(async (req, res) => {
    const { baseToken, tableId, viewId, fieldIds, limit, offset } = req.body as {
      baseToken?: string;
      tableId?: string;
      viewId?: string;
      fieldIds?: string[];
      limit?: number;
      offset?: number;
    };
    if (!baseToken || !tableId) {
      throw new HttpError(400, "缺少 baseToken 或 tableId", "MISSING_BASE_COORDINATES");
    }

    const data = await services.larkBase.listRecords({
      baseToken,
      tableId,
      viewId,
      fieldIds,
      limit,
      offset
    });
    res.json({ ok: true, data });
  })
);

larkBaseRouter.post(
  "/records/get",
  asyncHandler(async (req, res) => {
    const { baseToken, tableId, recordId, fieldIds } = req.body as {
      baseToken?: string;
      tableId?: string;
      recordId?: string;
      fieldIds?: string[];
    };
    if (!baseToken || !tableId || !recordId) {
      throw new HttpError(400, "缺少 baseToken、tableId 或 recordId", "MISSING_RECORD_GET_INPUT");
    }

    const data = await services.larkBase.getRecord({
      baseToken,
      tableId,
      recordId,
      fieldIds
    });
    res.json({ ok: true, data });
  })
);

larkBaseRouter.post(
  "/records/upsert",
  asyncHandler(async (req, res) => {
    const { baseToken, tableId, recordId, fields } = req.body as {
      baseToken?: string;
      tableId?: string;
      recordId?: string;
      fields?: Record<string, unknown>;
    };
    if (!baseToken || !tableId || !fields) {
      throw new HttpError(400, "缺少 baseToken、tableId 或 fields", "MISSING_UPSERT_INPUT");
    }

    const data = await services.larkBase.upsertRecord(baseToken, tableId, fields, recordId);
    res.json({ ok: true, data });
  })
);
