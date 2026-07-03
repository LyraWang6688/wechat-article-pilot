import { LarkCliInteractiveProcess, LarkCliRunner } from "./larkCliRunner.js";
import { createTraceId, logger } from "../utils/logger.js";

export type ConfigInitInput = {
  appId?: string;
  appSecret?: string;
  brand?: "feishu" | "lark";
  profileName?: string;
};

export type AuthLoginStartResult = {
  deviceCode: string;
  verificationUrl: string;
  expiresIn?: number;
  raw: unknown;
  stdout: string;
  stderr: string;
  scopes: string[];
  domains: string[];
  hint: string;
};

type ConfigInitSession = {
  sessionId: string;
  process: LarkCliInteractiveProcess;
  createdAt: string;
  updatedAt: string;
};

type AuthLoginCompleteSession = {
  sessionId: string;
  process: LarkCliInteractiveProcess;
  createdAt: string;
  updatedAt: string;
};

export const P0_REQUIRED_USER_SCOPES = [
  "base:app:create",
  "base:table:read",
  "base:table:create",
  "base:table:update",
  "base:table:delete",
  "base:field:read",
  "base:field:create",
  "base:field:update",
  "base:view:write_only",
  "base:record:read",
  "base:record:create",
  "base:record:update",
  "base:workflow:create",
  "base:workflow:update"
] as const;

export class LarkSharedService {
  private configInitSession?: ConfigInitSession;
  private authLoginCompleteSession?: AuthLoginCompleteSession;

  constructor(private readonly runner: LarkCliRunner) {}

  async getVersion() {
    const result = await this.runner.run(["--version"]);
    return {
      stdout: result.stdout,
      stderr: result.stderr
    };
  }

  async initConfig(input: ConfigInitInput) {
    const args = ["config", "init", "--new"];
    const stdinParts: string[] = [];

    if (input.appId) {
      args.push("--app-id", input.appId);
    }
    if (input.brand) {
      args.push("--brand", input.brand);
    }
    if (input.profileName) {
      args.push("--profile", input.profileName);
    }
    if (input.appSecret) {
      args.push("--app-secret-stdin");
      stdinParts.push(input.appSecret);
    }

    const currentSession = this.configInitSession;
    if (currentSession?.process.running) {
      logger.info("lark_shared_config_init_reuse_running_session", {
        sessionId: currentSession.sessionId,
        callId: currentSession.process.callId
      });
      return this.buildConfigInitSessionResult(currentSession);
    }

    logger.info("lark_shared_config_init_start", {
      hasAppId: Boolean(input.appId),
      hasAppSecret: Boolean(input.appSecret),
      brand: input.brand,
      profileName: input.profileName
    });
    const sessionId = createTraceId("config_init");
    const now = new Date().toISOString();
    const process = this.runner.startInteractive(args, {
      stdin: stdinParts.length ? `${stdinParts.join("\n")}\n` : undefined,
      timeoutMs: 10 * 60 * 1000,
      onOutput: () => {
        if (this.configInitSession?.sessionId === sessionId) {
          this.configInitSession.updatedAt = new Date().toISOString();
        }
      }
    });
    this.configInitSession = {
      sessionId,
      process,
      createdAt: now,
      updatedAt: now
    };

    logger.info("lark_shared_config_init_session_started", {
      sessionId,
      callId: process.callId,
      pid: process.pid,
      hasAppId: Boolean(input.appId),
      brand: input.brand,
      profileName: input.profileName
    });
    return this.buildConfigInitSessionResult(this.configInitSession);
  }

  getConfigInitStatus(sessionId?: string) {
    const session = this.configInitSession;
    if (!session) {
      return {
        status: "idle",
        sessionId: sessionId || "",
        verificationUrl: "",
        raw: {
          stdout: "",
          stderr: ""
        },
        hint: "尚未开始创建新应用，请先点击创建新应用。"
      };
    }
    if (sessionId && session.sessionId !== sessionId) {
      return {
        status: "not_found",
        sessionId,
        verificationUrl: "",
        raw: {
          stdout: "",
          stderr: ""
        },
        hint: "没有找到对应的创建应用会话，请重新点击创建新应用。"
      };
    }

    return this.buildConfigInitSessionResult(session);
  }

  async startUserLogin(input: { domains?: string[]; scopes?: string[] } = {}) {
    const args = ["auth", "login", "--no-wait", "--json"];
    const scopes = input.scopes?.length ? input.scopes : [...P0_REQUIRED_USER_SCOPES];
    const domains = input.domains || [];

    if (scopes.length) {
      args.push("--scope", scopes.join(" "));
    }
    domains.forEach((domain) => {
      args.push("--domain", domain);
    });

    logger.info("lark_shared_auth_login_start", {
      scopes,
      domains
    });
    const result = await this.runner.run<unknown>(args, {
      expectJson: true,
      timeoutMs: 120000
    });

    logger.info("lark_shared_auth_login_started", {
      scopes,
      domains
    });
    const authPayload = parseAuthLoginStartPayload(result.json);
    if (!authPayload.deviceCode || !authPayload.verificationUrl) {
      logger.error("lark_shared_auth_login_parse_failed", {
        scopes,
        domains,
        hasDeviceCode: Boolean(authPayload.deviceCode),
        hasVerificationUrl: Boolean(authPayload.verificationUrl)
      });
    }
    return {
      deviceCode: authPayload.deviceCode,
      verificationUrl: authPayload.verificationUrl,
      expiresIn: authPayload.expiresIn,
      raw: result.json,
      stdout: result.stdout,
      stderr: result.stderr,
      scopes,
      domains,
      hint: "请在前端展示顶层 verificationUrl，用户完成授权后再用顶层 deviceCode 调用完成授权接口。"
    } satisfies AuthLoginStartResult;
  }

  async completeUserLogin(deviceCode: string) {
    logger.info("lark_shared_auth_login_complete_start", {
      hasDeviceCode: Boolean(deviceCode)
    });
    const result = await this.runner.run(["auth", "login", "--device-code", deviceCode, "--json"], {
      expectJson: true,
      timeoutMs: 5 * 60 * 1000
    });

    logger.info("lark_shared_auth_login_complete_success", {
      hasDeviceCode: Boolean(deviceCode)
    });
    return {
      raw: result.json,
      stdout: result.stdout,
      stderr: result.stderr
    };
  }

  startUserLoginCompletion(deviceCode: string) {
    const currentSession = this.authLoginCompleteSession;
    if (currentSession?.process.running) {
      logger.info("lark_shared_auth_login_complete_reuse_running_session", {
        sessionId: currentSession.sessionId,
        callId: currentSession.process.callId
      });
      return this.buildAuthLoginCompleteSessionResult(currentSession);
    }

    logger.info("lark_shared_auth_login_complete_session_start", {
      hasDeviceCode: Boolean(deviceCode)
    });
    const sessionId = createTraceId("auth_complete");
    const now = new Date().toISOString();
    const process = this.runner.startInteractive(["auth", "login", "--device-code", deviceCode, "--json"], {
      timeoutMs: 5 * 60 * 1000,
      onOutput: () => {
        if (this.authLoginCompleteSession?.sessionId === sessionId) {
          this.authLoginCompleteSession.updatedAt = new Date().toISOString();
        }
      }
    });
    this.authLoginCompleteSession = {
      sessionId,
      process,
      createdAt: now,
      updatedAt: now
    };

    logger.info("lark_shared_auth_login_complete_session_started", {
      sessionId,
      callId: process.callId,
      pid: process.pid
    });
    return this.buildAuthLoginCompleteSessionResult(this.authLoginCompleteSession);
  }

  getUserLoginCompletionStatus(sessionId?: string) {
    const session = this.authLoginCompleteSession;
    if (!session) {
      return {
        status: "idle",
        sessionId: sessionId || "",
        raw: {
          stdout: "",
          stderr: ""
        },
        hint: "尚未开始检测用户授权完成状态。"
      };
    }
    if (sessionId && session.sessionId !== sessionId) {
      return {
        status: "not_found",
        sessionId,
        raw: {
          stdout: "",
          stderr: ""
        },
        hint: "没有找到对应的用户授权检测会话，请重新发起授权。"
      };
    }

    return this.buildAuthLoginCompleteSessionResult(session);
  }

  async getAuthStatus() {
    logger.info("lark_shared_auth_status_start");
    const result = await this.runner.run(["auth", "status", "--json"], {
      expectJson: true
    });

    logger.info("lark_shared_auth_status_success", {
      identity: (result.json as { identity?: string } | undefined)?.identity
    });
    return {
      raw: result.json,
      stdout: result.stdout,
      stderr: result.stderr
    };
  }

  async getCurrentUser() {
    logger.info("lark_shared_current_user_start");
    const result = await this.runner.run<{
      identity?: string;
      verified?: boolean;
      identities?: {
        user?: {
          status?: string;
          available?: boolean;
          openId?: string;
          userName?: string;
          scope?: string;
          tokenStatus?: string;
        };
      };
    }>(["auth", "status", "--json", "--verify"], {
      expectJson: true
    });
    const user = result.json?.identities?.user;

    logger.info("lark_shared_current_user_success", {
      identity: result.json?.identity,
      verified: result.json?.verified,
      user: {
        available: Boolean(user?.available),
        status: user?.status,
        openId: user?.openId,
        userName: user?.userName,
        tokenStatus: user?.tokenStatus,
        scope: user?.scope
      }
    });
    return {
      identity: result.json?.identity,
      verified: result.json?.verified,
      user: {
        available: Boolean(user?.available),
        status: user?.status,
        openId: user?.openId,
        userName: user?.userName,
        tokenStatus: user?.tokenStatus,
        scope: user?.scope
      },
      stdout: result.stdout,
      stderr: result.stderr
    };
  }

  async listProfiles() {
    const result = await this.runner.run(["profile", "list"]);
    return {
      stdout: result.stdout,
      stderr: result.stderr
    };
  }

  private buildConfigInitSessionResult(session: ConfigInitSession) {
    const verificationUrl = findFirstUrl(`${session.process.stdout}\n${session.process.stderr}`);
    const status = getConfigInitSessionStatus(session.process);

    return {
      sessionId: session.sessionId,
      status,
      verificationUrl,
      startedAt: session.createdAt,
      updatedAt: session.updatedAt,
      pid: session.process.pid,
      callId: session.process.callId,
      raw: {
        verification_url: verificationUrl,
        stdout: session.process.stdout.trim(),
        stderr: session.process.stderr.trim(),
        running: session.process.running,
        exitCode: session.process.exitCode,
        error: session.process.error
      },
      guide: [
        "请打开页面提示里的飞书链接，按飞书页面完成新应用创建。",
        "创建完成后，系统会自动检测到流程结束。",
        "如果长时间没有出现链接，请查看服务器日志中的 lark_cli_interactive_stdout / stderr。"
      ]
    };
  }

  private buildAuthLoginCompleteSessionResult(session: AuthLoginCompleteSession) {
    const status = getConfigInitSessionStatus(session.process);
    return {
      sessionId: session.sessionId,
      status,
      startedAt: session.createdAt,
      updatedAt: session.updatedAt,
      pid: session.process.pid,
      callId: session.process.callId,
      raw: {
        stdout: session.process.stdout.trim(),
        stderr: session.process.stderr.trim(),
        parsed: status === "completed" ? parseJsonSafely(session.process.stdout) : undefined,
        running: session.process.running,
        exitCode: session.process.exitCode,
        error: session.process.error
      },
      hint:
        status === "running"
          ? "正在等待用户在飞书页面完成授权。"
          : status === "completed"
            ? "用户授权已完成。"
            : "用户授权检测失败，请重新发起授权。"
    };
  }
}

function getConfigInitSessionStatus(process: LarkCliInteractiveProcess) {
  if (process.running) {
    return "running";
  }
  if (process.exitCode === 0) {
    return "completed";
  }
  return "failed";
}

function findFirstUrl(value: string) {
  const [url = ""] = value.match(/https?:\/\/[^\s"'<>]+/g) || [];
  return url.replace(/[),.;，。]+$/, "");
}

function parseAuthLoginStartPayload(value: unknown) {
  const payload =
    value && typeof value === "object" && "data" in value && typeof (value as { data?: unknown }).data === "object"
      ? ((value as { data?: unknown }).data as Record<string, unknown>)
      : ((value || {}) as Record<string, unknown>);
  const verificationUrl = normalizeCliUrl(
    pickString(payload, ["verification_url", "verification_uri", "verification_uri_complete", "verificationUrl", "verificationUri"])
  );

  return {
    deviceCode: pickString(payload, ["device_code", "deviceCode"]),
    verificationUrl,
    expiresIn: pickNumber(payload, ["expires_in", "expiresIn"])
  };
}

function pickString(value: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string") {
      return candidate;
    }
  }
  return "";
}

function pickNumber(value: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "number") {
      return candidate;
    }
  }
  return undefined;
}

function normalizeCliUrl(value: string) {
  return value.trim().replace(/^`+|`+$/g, "").replace(/\\`$/g, "").replace(/[),.;，。]+$/, "");
}

function parseJsonSafely(value: string) {
  try {
    return JSON.parse(value);
  } catch (_error) {
    return undefined;
  }
}
