import { Router } from "express";
import { HttpError } from "../errors/HttpError.js";
import { services } from "../services/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const larkSharedRouter = Router();

larkSharedRouter.get(
  "/version",
  asyncHandler(async (_req, res) => {
    const data = await services.larkShared.getVersion();
    res.json({ ok: true, data });
  })
);

larkSharedRouter.post(
  "/config/init",
  asyncHandler(async (req, res) => {
    const { appId, appSecret, brand, profileName } = req.body as {
      appId?: string;
      appSecret?: string;
      brand?: "feishu" | "lark";
      profileName?: string;
    };

    if (brand && !["feishu", "lark"].includes(brand)) {
      throw new HttpError(400, "brand 只能是 feishu 或 lark", "INVALID_BRAND");
    }

    const data = await services.larkShared.initConfig({
      appId,
      appSecret,
      brand,
      profileName
    });
    res.json({ ok: true, data });
  })
);

larkSharedRouter.post(
  "/auth/login/start",
  asyncHandler(async (req, res) => {
    const { domains } = req.body as { domains?: string[] };
    const data = await services.larkShared.startUserLogin(domains?.length ? domains : ["all"]);
    res.json({ ok: true, data });
  })
);

larkSharedRouter.post(
  "/auth/login/complete",
  asyncHandler(async (req, res) => {
    const { deviceCode } = req.body as { deviceCode?: string };
    if (!deviceCode) {
      throw new HttpError(400, "缺少 deviceCode", "MISSING_DEVICE_CODE");
    }

    const data = await services.larkShared.completeUserLogin(deviceCode);
    res.json({ ok: true, data });
  })
);

larkSharedRouter.get(
  "/auth/status",
  asyncHandler(async (_req, res) => {
    const data = await services.larkShared.getAuthStatus();
    res.json({ ok: true, data });
  })
);

larkSharedRouter.get(
  "/auth/current-user",
  asyncHandler(async (_req, res) => {
    const data = await services.larkShared.getCurrentUser();
    res.json({ ok: true, data });
  })
);

larkSharedRouter.get(
  "/profiles",
  asyncHandler(async (_req, res) => {
    const data = await services.larkShared.listProfiles();
    res.json({ ok: true, data });
  })
);
