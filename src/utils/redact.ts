const SENSITIVE_KEY_PATTERN =
  /(secret|token|authorization|cookie|password|device_code|access_token|refresh_token|user_access_token|appSecret|app_secret|baseToken|base_token)/i;

const LONG_TOKEN_PATTERN = /\b([A-Za-z0-9_-]{8,})([A-Za-z0-9_-]{8,})([A-Za-z0-9_-]{4,})\b/g;

export function maskValue(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  if (value.length <= 8) {
    return "***";
  }

  return `${value.slice(0, 4)}***${value.slice(-4)}`;
}

export function truncateText(value: string, maxChars: number) {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}...<truncated ${value.length - maxChars} chars>`;
}

export function redactText(value: string) {
  return value.replace(LONG_TOKEN_PATTERN, (_match, start: string, _middle: string, end: string) => `${start}***${end}`);
}

export function redactValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item)) as T;
  }

  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, rawValue]) => {
      result[key] = SENSITIVE_KEY_PATTERN.test(key) ? maskValue(rawValue) : redactValue(rawValue);
    });
    return result as T;
  }

  if (typeof value === "string") {
    return redactText(value) as T;
  }

  return value;
}

export function redactArgs(args: string[]) {
  return args.map((arg, index) => {
    const prev = args[index - 1] || "";
    if (SENSITIVE_KEY_PATTERN.test(prev)) {
      return typeof maskValue(arg) === "string" ? (maskValue(arg) as string) : "***";
    }

    return redactText(arg);
  });
}
