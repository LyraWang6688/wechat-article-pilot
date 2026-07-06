import { LarkCliRunner } from "./larkCliRunner.js";
import { logger } from "../utils/logger.js";

export type BaseRecordListInput = {
  baseToken: string;
  tableId: string;
  viewId?: string;
  fieldIds?: string[];
  limit?: number;
  offset?: number;
};

export type BaseRecordGetInput = {
  baseToken: string;
  tableId: string;
  recordId: string;
  fieldIds?: string[];
};

export type BaseRecordAttachmentDownloadInput = {
  baseToken: string;
  tableId: string;
  recordId: string;
  fileToken: string;
  outputPath: string;
};

export type BaseTableCreateInput = {
  baseToken: string;
  name: string;
  fields?: readonly Record<string, unknown>[];
};

export type BaseCreateInput = {
  name: string;
  tableName?: string;
  fields?: readonly Record<string, unknown>[];
};

export type BaseWorkflowCreateInput = {
  baseToken: string;
  workflow: Record<string, unknown>;
};

export class LarkBaseService {
  constructor(private readonly runner: LarkCliRunner) {}

  async resolveUrl(url: string) {
    const result = await this.runner.run<unknown>(["base", "+url-resolve", "--url", url, "--format", "json"], {
      expectJson: true
    });

    return {
      raw: result.json,
      stdout: result.stdout,
      stderr: result.stderr
    };
  }

  async listFields(baseToken: string, tableId: string, limit = 200, offset = 0) {
    const result = await this.runner.run<unknown>(
      [
        "base",
        "+field-list",
        "--base-token",
        baseToken,
        "--table-id",
        tableId,
        "--limit",
        String(limit),
        "--offset",
        String(offset)
      ],
      {
        expectJson: true
      }
    );

    return {
      raw: result.json,
      stdout: result.stdout,
      stderr: result.stderr
    };
  }

  async createTable(input: BaseTableCreateInput) {
    const args = ["base", "+table-create", "--base-token", input.baseToken, "--name", input.name];

    if (input.fields?.length) {
      args.push("--fields", JSON.stringify(input.fields));
    }

    logger.info("base_table_create_start", {
      baseToken: input.baseToken,
      tableName: input.name,
      fieldCount: input.fields?.length || 0,
      fieldNames: input.fields?.map((field) => field.name)
    });
    const result = await this.runner.run<unknown>(args, {
      expectJson: true,
      timeoutMs: 5 * 60 * 1000
    });

    logger.info("base_table_create_success", {
      baseToken: input.baseToken,
      tableName: input.name,
      fieldCount: input.fields?.length || 0
    });
    return {
      raw: result.json,
      stdout: result.stdout,
      stderr: result.stderr
    };
  }

  async createBase(input: BaseCreateInput) {
    const args = ["base", "+base-create", "--name", input.name];

    if (input.tableName) {
      args.push("--table-name", input.tableName);
    }
    if (input.fields?.length) {
      args.push("--fields", JSON.stringify(input.fields));
    }

    logger.info("base_create_start", {
      baseName: input.name,
      tableName: input.tableName,
      fieldCount: input.fields?.length || 0,
      fieldNames: input.fields?.map((field) => field.name)
    });
    const result = await this.runner.run<unknown>(args, {
      expectJson: true,
      timeoutMs: 5 * 60 * 1000
    });

    logger.info("base_create_success", {
      baseName: input.name,
      tableName: input.tableName,
      fieldCount: input.fields?.length || 0
    });
    return {
      raw: result.json,
      stdout: result.stdout,
      stderr: result.stderr
    };
  }

  async createWorkflow(input: BaseWorkflowCreateInput) {
    const title = typeof input.workflow.title === "string" ? input.workflow.title : undefined;
    const args = ["base", "+workflow-create", "--base-token", input.baseToken, "--json", JSON.stringify(input.workflow)];

    logger.info("base_workflow_create_start", {
      baseToken: input.baseToken,
      title
    });
    const result = await this.runner.run<unknown>(args, {
      expectJson: true,
      timeoutMs: 5 * 60 * 1000
    });

    logger.info("base_workflow_create_success", {
      baseToken: input.baseToken,
      title
    });
    return {
      raw: result.json,
      stdout: result.stdout,
      stderr: result.stderr
    };
  }

  async enableWorkflow(baseToken: string, workflowId: string) {
    logger.info("base_workflow_enable_start", {
      baseToken,
      workflowId
    });
    const result = await this.runner.run<unknown>(
      ["base", "+workflow-enable", "--base-token", baseToken, "--workflow-id", workflowId],
      {
        expectJson: true,
        timeoutMs: 2 * 60 * 1000
      }
    );

    logger.info("base_workflow_enable_success", {
      baseToken,
      workflowId
    });
    return {
      raw: result.json,
      stdout: result.stdout,
      stderr: result.stderr
    };
  }

  async listRecords(input: BaseRecordListInput) {
    const args = [
      "base",
      "+record-list",
      "--base-token",
      input.baseToken,
      "--table-id",
      input.tableId,
      "--limit",
      String(input.limit ?? 200),
      "--offset",
      String(input.offset ?? 0),
      "--format",
      "json"
    ];

    if (input.viewId) {
      args.push("--view-id", input.viewId);
    }
    input.fieldIds?.forEach((fieldId) => {
      args.push("--field-id", fieldId);
    });

    const result = await this.runner.run<unknown>(args, {
      expectJson: true
    });

    return {
      raw: result.json,
      stdout: result.stdout,
      stderr: result.stderr
    };
  }

  async getRecord(input: BaseRecordGetInput) {
    const args = [
      "base",
      "+record-get",
      "--base-token",
      input.baseToken,
      "--table-id",
      input.tableId,
      "--record-id",
      input.recordId,
      "--format",
      "json"
    ];

    input.fieldIds?.forEach((fieldId) => {
      args.push("--field-id", fieldId);
    });

    logger.info("base_record_get_start", {
      baseToken: input.baseToken,
      tableId: input.tableId,
      recordId: input.recordId,
      fieldIds: input.fieldIds
    });
    const result = await this.runner.run<unknown>(args, {
      expectJson: true
    });

    logger.info("base_record_get_success", {
      baseToken: input.baseToken,
      tableId: input.tableId,
      recordId: input.recordId
    });
    return {
      raw: result.json,
      stdout: result.stdout,
      stderr: result.stderr
    };
  }

  async downloadRecordAttachment(input: BaseRecordAttachmentDownloadInput) {
    const args = [
      "base",
      "+record-download-attachment",
      "--base-token",
      input.baseToken,
      "--table-id",
      input.tableId,
      "--record-id",
      input.recordId,
      "--file-token",
      input.fileToken,
      "--output",
      input.outputPath,
      "--overwrite",
      "--format",
      "json"
    ];

    logger.info("base_record_attachment_download_start", {
      baseToken: input.baseToken,
      tableId: input.tableId,
      recordId: input.recordId,
      fileToken: input.fileToken,
      outputPath: input.outputPath
    });
    const result = await this.runner.run<unknown>(args, {
      expectJson: true,
      timeoutMs: 5 * 60 * 1000
    });

    logger.info("base_record_attachment_download_success", {
      baseToken: input.baseToken,
      tableId: input.tableId,
      recordId: input.recordId,
      fileToken: input.fileToken,
      outputPath: input.outputPath
    });
    return {
      raw: result.json,
      stdout: result.stdout,
      stderr: result.stderr,
      outputPath: input.outputPath
    };
  }

  async upsertRecord(baseToken: string, tableId: string, fields: Record<string, unknown>, recordId?: string) {
    const args = [
      "base",
      "+record-upsert",
      "--base-token",
      baseToken,
      "--table-id",
      tableId,
      "--json",
      JSON.stringify(fields)
    ];

    if (recordId) {
      args.push("--record-id", recordId);
    }

    logger.info("base_record_upsert_start", {
      baseToken,
      tableId,
      recordId,
      fieldNames: Object.keys(fields),
      fields
    });
    const result = await this.runner.run<unknown>(args, {
      expectJson: true
    });

    logger.info("base_record_upsert_success", {
      baseToken,
      tableId,
      recordId,
      fieldNames: Object.keys(fields)
    });
    return {
      raw: result.json,
      stdout: result.stdout,
      stderr: result.stderr
    };
  }
}
