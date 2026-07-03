import { Router } from "express";
import { services } from "../services/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const systemRouter = Router();

systemRouter.get(
  "/env",
  asyncHandler(async (_req, res) => {
    const data = await services.system.getEnvironment();
    res.json({ ok: true, data });
  })
);
