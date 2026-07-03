import { LarkCliRunner } from "./larkCliRunner.js";
import { logger } from "../utils/logger.js";

export type ConfigInitInput = {
  appId?: string;
  appSecret?: string;
  brand?: "feishu" | "lark";
  profileName?: string;
};

export type AuthLoginStartResult = {
  raw: unknown;
  stdout: string;
  stderr: string;
  scopes: string[];
  domains: string[];
  hint: string;
};

export const P0_REQUIRED_USER_SCOPES = [
  "base:app:create",
  "base:table:read",
  "base:table:create",
  "base:table:update",
  "base:table:delete",
  "base:field:read",
  "base:record:read",
  "base:record:create",
  "base:record:update",
  "base:workflow:create",
  "base:workflow:update"
] as const;

export class LarkSharedService {
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

    logger.info("lark_shared_config_init_start", {
      hasAppId: Boolean(input.appId),
      hasAppSecret: Boolean(input.appSecret),
      brand: input.brand,
      profileName: input.profileName
    });
    const result = await this.runner.run(args, {
      stdin: stdinParts.length ? `${stdinParts.join("\n")}\n` : undefined,
      timeoutMs: 10 * 60 * 1000
    });

    logger.info("lark_shared_config_init_success", {
      hasAppId: Boolean(input.appId),
      brand: input.brand,
      profileName: input.profileName
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      guide: [
        "如果命令打开浏览器或输出应用创建链接，请按页面引导创建/绑定飞书应用。",
        "应用创建完成后，继续执行用户授权步骤。",
        "后端不会把 app secret 放进命令行参数；如已填写，将通过 stdin 传给 lark-cli。"
      ]
    };
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
    return {
      raw: result.json,
      stdout: result.stdout,
      stderr: result.stderr,
      scopes,
      domains,
      hint: "请在前端展示返回的 verification_uri / user_code / qr 相关字段，用户完成授权后再调用完成授权接口。"
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
}
