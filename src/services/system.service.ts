import os from "node:os";
import { appConfig } from "../config.js";
import { logger } from "../utils/logger.js";
import { redactText, truncateText } from "../utils/redact.js";
import { LarkCliError, LarkCliRunner } from "./larkCliRunner.js";

type AuthStatusJson = {
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
};

export class SystemService {
  constructor(private readonly runner: LarkCliRunner) {}

  async getEnvironment() {
    logger.info("system_env_check_start");
    const [larkCli, auth] = await Promise.all([this.checkLarkCli(), this.checkAuth()]);
    const data = {
      runtime: {
        hostname: os.hostname(),
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        pid: process.pid,
        cwd: process.cwd(),
        nodeEnv: process.env.NODE_ENV || "development",
        port: appConfig.port
      },
      config: {
        larkCliBin: appConfig.larkCliBin,
        hasDefaultBaseToken: Boolean(appConfig.defaultBaseToken),
        hasDefaultTableId: Boolean(appConfig.defaultTableId),
        publicDir: appConfig.publicDir
      },
      larkCli,
      auth
    };

    logger.info("system_env_check_success", {
      hostname: data.runtime.hostname,
      larkCliAvailable: data.larkCli.available,
      authAvailable: data.auth.available,
      authUserName: data.auth.user?.userName
    });
    return data;
  }

  private async checkLarkCli() {
    try {
      const result = await this.runner.run(["--version"], {
        timeoutMs: 15000
      });
      return {
        available: true,
        bin: appConfig.larkCliBin,
        version: result.stdout || result.stderr
      };
    } catch (error) {
      return {
        available: false,
        bin: appConfig.larkCliBin,
        error: formatError(error)
      };
    }
  }

  private async checkAuth() {
    try {
      const result = await this.runner.run<AuthStatusJson>(["auth", "status", "--json", "--verify"], {
        expectJson: true,
        timeoutMs: 30000
      });
      const user = result.json?.identities?.user;
      return {
        available: Boolean(user?.available),
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
      };
    } catch (error) {
      return {
        available: false,
        error: formatError(error)
      };
    }
  }
}

function formatError(error: unknown) {
  if (error instanceof LarkCliError) {
    return {
      name: error.name,
      message: error.message,
      exitCode: error.exitCode,
      stdoutPreview: redactText(truncateText(error.stdout, 1000)),
      stderrPreview: redactText(truncateText(error.stderr, 1000))
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message
    };
  }

  return {
    name: "UnknownError",
    message: String(error)
  };
}
