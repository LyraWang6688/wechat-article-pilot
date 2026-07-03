import type { NextFunction, Request, Response } from "express";
import { createTraceId, logger } from "../utils/logger.js";
import { redactValue } from "../utils/redact.js";

const SAFE_HEADER_NAMES = ["user-agent", "content-type", "content-length", "x-request-id"];

function safeHeaders(headers: Request["headers"]) {
  return Object.fromEntries(SAFE_HEADER_NAMES.map((name) => [name, headers[name]]).filter(([, value]) => value !== undefined));
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const traceId = (req.headers["x-request-id"] as string | undefined) || createTraceId("req");
  const startedAt = Date.now();
  res.locals.traceId = traceId;
  res.setHeader("x-request-id", traceId);

  logger.info("http_request_start", {
    traceId,
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    headers: safeHeaders(req.headers),
    body: redactValue(req.body)
  });

  res.on("finish", () => {
    logger.info("http_request_finish", {
      traceId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt
    });
  });

  next();
}
