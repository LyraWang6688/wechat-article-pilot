import { randomUUID } from "node:crypto";
import { appConfig } from "../config.js";
import { redactValue } from "./redact.js";

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

const configuredLevel = appConfig.logLevel in LOG_LEVEL_ORDER ? (appConfig.logLevel as LogLevel) : "info";

export type LogMeta = Record<string, unknown>;

function shouldLog(level: LogLevel) {
  return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[configuredLevel];
}

function write(level: LogLevel, event: string, meta: LogMeta = {}) {
  if (!shouldLog(level)) {
    return;
  }

  const payload = redactValue({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...meta
  });

  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

export const logger = {
  debug: (event: string, meta?: LogMeta) => write("debug", event, meta),
  info: (event: string, meta?: LogMeta) => write("info", event, meta),
  warn: (event: string, meta?: LogMeta) => write("warn", event, meta),
  error: (event: string, meta?: LogMeta) => write("error", event, meta)
};

export function createTraceId(prefix = "trace") {
  return `${prefix}_${randomUUID()}`;
}
