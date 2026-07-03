import { spawn } from "node:child_process";
import { appConfig } from "../config.js";
import { createTraceId, logger } from "../utils/logger.js";
import { redactArgs, redactText, truncateText } from "../utils/redact.js";

export type LarkCliRunOptions = {
  stdin?: string;
  timeoutMs?: number;
  expectJson?: boolean;
};

export type LarkCliInteractiveOptions = {
  stdin?: string;
  timeoutMs?: number;
  onOutput?: (process: LarkCliInteractiveProcess) => void;
};

export type LarkCliRunResult<T = unknown> = {
  command: string;
  args: string[];
  stdout: string;
  stderr: string;
  json?: T;
};

export type LarkCliInteractiveProcess = {
  callId: string;
  command: string;
  args: string[];
  pid?: number;
  startedAt: string;
  stdout: string;
  stderr: string;
  running: boolean;
  exitCode?: number | null;
  error?: string;
  kill: () => void;
};

export class LarkCliError extends Error {
  public readonly command: string;
  public readonly args: string[];
  public readonly exitCode: number | null;
  public readonly stdout: string;
  public readonly stderr: string;

  constructor(params: {
    command: string;
    args: string[];
    exitCode: number | null;
    stdout: string;
    stderr: string;
    message?: string;
  }) {
    super(params.message || params.stderr || params.stdout || "lark-cli 执行失败");
    this.name = "LarkCliError";
    this.command = params.command;
    this.args = params.args;
    this.exitCode = params.exitCode;
    this.stdout = params.stdout;
    this.stderr = params.stderr;
  }
}

export class LarkCliRunner {
  constructor(
    private readonly bin = appConfig.larkCliBin,
    private readonly defaultTimeoutMs = appConfig.larkCliTimeoutMs
  ) {}

  startInteractive(args: string[], options: LarkCliInteractiveOptions = {}): LarkCliInteractiveProcess {
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const callId = createTraceId("cli");
    const startedAt = Date.now();
    const redactedArgs = redactArgs(args);

    logger.info("lark_cli_interactive_start", {
      callId,
      command: this.bin,
      args: redactedArgs,
      timeoutMs,
      stdinProvided: Boolean(options.stdin),
      stdinLength: options.stdin?.length
    });

    const child = spawn(this.bin, args, {
      shell: process.platform === "win32",
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });
    const interactiveProcess: LarkCliInteractiveProcess = {
      callId,
      command: this.bin,
      args,
      pid: child.pid,
      startedAt: new Date(startedAt).toISOString(),
      stdout: "",
      stderr: "",
      running: true,
      kill: () => {
        if (interactiveProcess.running) {
          child.kill();
        }
      }
    };

    const notifyOutput = () => {
      options.onOutput?.(interactiveProcess);
    };

    const timer = setTimeout(() => {
      if (!interactiveProcess.running) {
        return;
      }
      interactiveProcess.running = false;
      interactiveProcess.exitCode = null;
      interactiveProcess.error = `lark-cli 交互式命令超时：${timeoutMs}ms`;
      child.kill();
      logger.error("lark_cli_interactive_timeout", {
        callId,
        command: this.bin,
        args: redactedArgs,
        durationMs: Date.now() - startedAt,
        timeoutMs,
        stdoutPreview: previewStdout(interactiveProcess.stdout),
        stderrPreview: previewStderr(interactiveProcess.stderr)
      });
      notifyOutput();
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      interactiveProcess.stdout += chunk;
      logger.info("lark_cli_interactive_stdout", {
        callId,
        command: this.bin,
        args: redactedArgs,
        stdoutPreview: previewStdout(chunk)
      });
      notifyOutput();
    });
    child.stderr.on("data", (chunk: string) => {
      interactiveProcess.stderr += chunk;
      logger.info("lark_cli_interactive_stderr", {
        callId,
        command: this.bin,
        args: redactedArgs,
        stderrPreview: previewStderr(chunk)
      });
      notifyOutput();
    });
    child.on("error", (error) => {
      if (!interactiveProcess.running) {
        return;
      }
      interactiveProcess.running = false;
      interactiveProcess.exitCode = null;
      interactiveProcess.error = error.message;
      clearTimeout(timer);
      logger.error("lark_cli_interactive_error", {
        callId,
        command: this.bin,
        args: redactedArgs,
        durationMs: Date.now() - startedAt,
        message: error.message,
        stdoutPreview: previewStdout(interactiveProcess.stdout),
        stderrPreview: previewStderr(interactiveProcess.stderr)
      });
      notifyOutput();
    });
    child.on("close", (exitCode) => {
      if (!interactiveProcess.running && interactiveProcess.error) {
        return;
      }
      interactiveProcess.running = false;
      interactiveProcess.exitCode = exitCode;
      clearTimeout(timer);
      const logPayload = {
        callId,
        command: this.bin,
        args: redactedArgs,
        exitCode,
        durationMs: Date.now() - startedAt,
        stdoutPreview: previewStdout(interactiveProcess.stdout),
        stderrPreview: previewStderr(interactiveProcess.stderr)
      };
      if (exitCode === 0) {
        logger.info("lark_cli_interactive_success", logPayload);
      } else {
        logger.error("lark_cli_interactive_failed", logPayload);
      }
      notifyOutput();
    });

    if (options.stdin) {
      child.stdin.write(options.stdin);
    }
    child.stdin.end();
    return interactiveProcess;
  }

  run<T = unknown>(args: string[], options: LarkCliRunOptions = {}): Promise<LarkCliRunResult<T>> {
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const callId = createTraceId("cli");
    const startedAt = Date.now();
    const redactedArgs = redactArgs(args);

    logger.info("lark_cli_call_start", {
      callId,
      command: this.bin,
      args: redactedArgs,
      timeoutMs,
      expectJson: Boolean(options.expectJson),
      stdinProvided: Boolean(options.stdin),
      stdinLength: options.stdin?.length
    });

    return new Promise((resolve, reject) => {
      const child = spawn(this.bin, args, {
        shell: process.platform === "win32",
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"]
      });

      let stdout = "";
      let stderr = "";
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        child.kill();
        logger.error("lark_cli_call_timeout", {
          callId,
          command: this.bin,
          args: redactedArgs,
          durationMs: Date.now() - startedAt,
          timeoutMs,
          stdoutPreview: previewStdout(stdout),
          stderrPreview: previewStderr(stderr)
        });
        reject(
          new LarkCliError({
            command: this.bin,
            args,
            exitCode: null,
            stdout,
            stderr,
            message: `lark-cli 执行超时：${timeoutMs}ms`
          })
        );
      }, timeoutMs);

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.on("error", (error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        logger.error("lark_cli_call_error", {
          callId,
          command: this.bin,
          args: redactedArgs,
          durationMs: Date.now() - startedAt,
          message: error.message,
          stdoutPreview: previewStdout(stdout),
          stderrPreview: previewStderr(stderr)
        });
        reject(
          new LarkCliError({
            command: this.bin,
            args,
            exitCode: null,
            stdout,
            stderr,
            message: error.message
          })
        );
      });
      child.on("close", (exitCode) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);

        if (exitCode !== 0) {
          logger.error("lark_cli_call_failed", {
            callId,
            command: this.bin,
            args: redactedArgs,
            exitCode,
            durationMs: Date.now() - startedAt,
            stdoutPreview: previewStdout(stdout),
            stderrPreview: previewStderr(stderr)
          });
          reject(
            new LarkCliError({
              command: this.bin,
              args,
              exitCode,
              stdout,
              stderr
            })
          );
          return;
        }

        const result: LarkCliRunResult<T> = {
          command: this.bin,
          args,
          stdout: stdout.trim(),
          stderr: stderr.trim()
        };

        if (options.expectJson) {
          try {
            result.json = JSON.parse(result.stdout) as T;
          } catch (error) {
            logger.error("lark_cli_json_parse_failed", {
              callId,
              command: this.bin,
              args: redactedArgs,
              exitCode,
              durationMs: Date.now() - startedAt,
              message: (error as Error).message,
              stdoutPreview: previewStdout(stdout),
              stderrPreview: previewStderr(stderr)
            });
            reject(
              new LarkCliError({
                command: this.bin,
                args,
                exitCode,
                stdout,
                stderr,
                message: `lark-cli 输出不是合法 JSON：${(error as Error).message}`
              })
            );
            return;
          }
        }

        logger.info("lark_cli_call_success", {
          callId,
          command: this.bin,
          args: redactedArgs,
          exitCode,
          durationMs: Date.now() - startedAt,
          parsedJson: Boolean(result.json),
          stdoutPreview: previewStdout(result.stdout),
          stderrPreview: previewStderr(result.stderr)
        });
        resolve(result);
      });

      if (options.stdin) {
        child.stdin.write(options.stdin);
      }
      child.stdin.end();
    });
  }
}

function previewStdout(value: string) {
  if (!appConfig.logCliStdout) {
    return "<disabled>";
  }

  return redactText(truncateText(value.trim(), appConfig.logCliStdoutMaxChars));
}

function previewStderr(value: string) {
  return redactText(truncateText(value.trim(), appConfig.logCliStderrMaxChars));
}
