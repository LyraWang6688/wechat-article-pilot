import {
  PUSH_DRAFT_TABLE_NAME,
  PUSH_DRAFT_TEMPLATE_FIELDS,
  PUSH_DRAFT_STATUSES
} from "../templates/pushDraftTable.js";
import { LarkCliError } from "./larkCliRunner.js";
import { logger } from "../utils/logger.js";
import { HttpError } from "../errors/HttpError.js";
import { LarkBaseService } from "./larkBase.service.js";
import { LarkSharedService } from "./larkShared.service.js";

export type CreatePushDraftTableInput = {
  baseToken: string;
  tableName?: string;
};

export type SetupWechatDraftWorkspaceInput = {
  baseName?: string;
  tableName?: string;
};

export type CreateWechatDraftWorkflowsInput = {
  baseToken: string;
  tableId: string;
  tableName?: string;
  webhookUrl: string;
  enable?: boolean;
};

export type CreateWechatDraftWorkflowInput = CreateWechatDraftWorkflowsInput & {
  workflowType: "sync" | "notify";
};

export class TemplateBaseService {
  constructor(
    private readonly larkBase: LarkBaseService,
    private readonly larkShared: LarkSharedService
  ) {}

  async createPushDraftTable(input: CreatePushDraftTableInput) {
    const tableName = input.tableName?.trim() || PUSH_DRAFT_TABLE_NAME;
    logger.info("template_push_draft_create_start", {
      baseToken: input.baseToken,
      tableName,
      fieldCount: PUSH_DRAFT_TEMPLATE_FIELDS.length,
      fieldNames: PUSH_DRAFT_TEMPLATE_FIELDS.map((field) => field.name)
    });
    const currentUser = await this.larkShared.getCurrentUser();
    logger.info("template_push_draft_current_user", {
      baseToken: input.baseToken,
      tableName,
      currentUser: {
        identity: currentUser.identity,
        verified: currentUser.verified,
        user: currentUser.user
      }
    });
    const table = await this.larkBase.createTable({
      baseToken: input.baseToken,
      name: tableName,
      fields: PUSH_DRAFT_TEMPLATE_FIELDS
    });

    logger.info("template_push_draft_create_success", {
      baseToken: input.baseToken,
      tableName,
      fieldCount: PUSH_DRAFT_TEMPLATE_FIELDS.length
    });
    return {
      tableName,
      tableId: findStringDeep(table.raw, ["table_id", "tableId", "id"]),
      trigger: {
        field: "status",
        value: "ready_to_upload"
      },
      writeBack: {
        field: "status",
        success: "uploaded_to_wechat",
        failure: "failed",
        allowed: [...PUSH_DRAFT_STATUSES]
      },
      currentUser,
      notificationStrategy: {
        preferred: currentUser.user.openId
          ? {
              type: "authorized_user",
              openId: currentUser.user.openId,
              userName: currentUser.user.userName
            }
          : null,
        note: "P0 单用户策略：一个用户一个应用一个 Base，不共享，因此默认通知当前授权用户。"
      },
      fields: PUSH_DRAFT_TEMPLATE_FIELDS,
      created: table
    };
  }

  async setupWechatDraftWorkspace(input: SetupWechatDraftWorkspaceInput) {
    const baseName = input.baseName?.trim() || "公众号文章同步工作台";
    const tableName = input.tableName?.trim() || PUSH_DRAFT_TABLE_NAME;

    logger.info("template_wechat_draft_setup_start", {
      baseName,
      tableName,
      fieldCount: PUSH_DRAFT_TEMPLATE_FIELDS.length,
      fieldNames: PUSH_DRAFT_TEMPLATE_FIELDS.map((field) => field.name)
    });
    const base = await this.createWechatDraftBase({ baseName });
    const table = await this.createWechatDraftTable({
      baseToken: base.baseToken,
      tableName
    });
    const currentUser = base.currentUser;
    const baseRaw = base.created.raw;
    const tableRaw = table.created.raw;
    const baseToken = base.baseToken || findStringDeep(baseRaw, ["base_token", "baseToken", "app_token", "appToken", "token"]);
    const tableId = table.tableId || findStringDeep(tableRaw, ["table_id", "tableId", "id"]);
    const baseUrl = base.baseUrl || findStringDeep(baseRaw, ["url", "base_url", "baseUrl", "app_url", "appUrl"]);
    const fields =
      baseToken && tableId
        ? await this.larkBase.listFields(baseToken, tableId).catch((error: unknown) => ({
            raw: {
              error: error instanceof Error ? error.message : String(error)
            },
            stdout: "",
            stderr: ""
          }))
        : null;
    const fieldMap = buildFieldMap(fields?.raw);

    logger.info("template_wechat_draft_setup_success", {
      baseName,
      tableName,
      baseToken,
      tableId,
      fieldCount: PUSH_DRAFT_TEMPLATE_FIELDS.length,
      resolvedFieldCount: Object.keys(fieldMap).length
    });

    return {
      baseName,
      tableName,
      baseToken,
      tableId,
      baseUrl,
      currentUser,
      fields: {
        template: PUSH_DRAFT_TEMPLATE_FIELDS,
        raw: fields?.raw ?? null,
        map: fieldMap
      },
      workflowTodos: buildWorkflowTodos({
        baseToken,
        tableId,
        tableName,
        fieldMap
      }),
      created: {
        base: base.created,
        table: table.created
      }
    };
  }

  async createWechatDraftBase(input: { baseName?: string }) {
    const baseName = input.baseName?.trim() || "公众号文章同步工作台";

    logger.info("template_wechat_draft_base_create_start", {
      baseName
    });
    const currentUser = await this.larkShared.getCurrentUser();
    const created = await this.larkBase.createBase({
      name: baseName
    });
    const baseToken = findStringDeep(created.raw, ["base_token", "baseToken", "app_token", "appToken", "token"]);
    const baseUrl = findStringDeep(created.raw, ["url", "base_url", "baseUrl", "app_url", "appUrl"]);

    logger.info("template_wechat_draft_base_create_success", {
      baseName,
      baseToken,
      baseUrl
    });
    return {
      baseName,
      baseToken,
      baseUrl,
      currentUser,
      created
    };
  }

  async createWechatDraftTable(input: { baseToken: string; tableName?: string }) {
    const tableName = input.tableName?.trim() || PUSH_DRAFT_TABLE_NAME;
    const table = await this.createPushDraftTable({
      baseToken: input.baseToken,
      tableName
    });

    const tableId = table.tableId || findStringDeep(table.created.raw, ["table_id", "tableId", "id"]);
    const fields =
      input.baseToken && tableId
        ? await this.larkBase.listFields(input.baseToken, tableId).catch((error: unknown) => ({
            raw: {
              error: error instanceof Error ? error.message : String(error)
            },
            stdout: "",
            stderr: ""
          }))
        : null;
    const fieldMap = buildFieldMap(fields?.raw);

    return {
      tableName,
      tableId,
      fields: {
        template: PUSH_DRAFT_TEMPLATE_FIELDS,
        raw: fields?.raw ?? null,
        map: fieldMap
      },
      created: table.created
    };
  }

  async createWechatDraftWorkflows(input: CreateWechatDraftWorkflowsInput) {
    const tableName = input.tableName?.trim() || PUSH_DRAFT_TABLE_NAME;
    const currentUser = await this.larkShared.getCurrentUser();
    const notifyUserOpenId = currentUser.user.openId;
    if (!currentUser.user.available || !notifyUserOpenId) {
      throw new HttpError(
        400,
        "当前飞书用户未完成授权，无法创建通知当前授权用户的工作流",
        "LARK_AUTH_USER_REQUIRED",
        {
          identity: currentUser.identity,
          verified: currentUser.verified,
          user: currentUser.user
        }
      );
    }

    const workflowInputs = buildWechatDraftWorkflowInputs({
      baseToken: input.baseToken,
      tableId: input.tableId,
      tableName,
      webhookUrl: input.webhookUrl,
      notifyUserOpenId,
      notifyUserName: currentUser.user.userName
    });

    logger.info("template_wechat_draft_workflows_start", {
      baseToken: input.baseToken,
      tableId: input.tableId,
      tableName,
      webhookUrl: input.webhookUrl,
      workflowCount: workflowInputs.length,
      notificationStrategy: "authorized_user",
      notifyUser: {
        openId: notifyUserOpenId,
        userName: currentUser.user.userName
      }
    });

    const results = [];
    for (const workflow of workflowInputs) {
      try {
        const created = await this.larkBase.createWorkflow({
          baseToken: input.baseToken,
          workflow
        });
        const workflowId = findStringDeep(created.raw, ["workflow_id", "workflowId", "id"]);
        const enabled = input.enable !== false && workflowId ? await this.larkBase.enableWorkflow(input.baseToken, workflowId) : null;
        results.push({
          ok: true,
          title: workflow.title,
          workflowId,
          created,
          enabled
        });
      } catch (error) {
        results.push({
          ok: false,
          title: workflow.title,
          error: formatWorkflowError(error)
        });
      }
    }

    logger.info("template_wechat_draft_workflows_finish", {
      baseToken: input.baseToken,
      tableId: input.tableId,
      tableName,
      successCount: results.filter((item) => item.ok).length,
      failedCount: results.filter((item) => !item.ok).length
    });

    return {
      baseToken: input.baseToken,
      tableId: input.tableId,
      tableName,
      webhookUrl: input.webhookUrl,
      currentUser,
      notificationStrategy: {
        type: "authorized_user",
        openId: notifyUserOpenId,
        userName: currentUser.user.userName,
        reason: "P0 单用户模式：一个用户一个应用一个 Base，不共享，先固定通知初始化并授权的用户。"
      },
      workflows: results,
      note: "Workflow JSON 已按 P0 单用户策略生成；通知工作流固定发送给当前授权用户。"
    };
  }

  async createWechatDraftWorkflow(input: CreateWechatDraftWorkflowInput) {
    const tableName = input.tableName?.trim() || PUSH_DRAFT_TABLE_NAME;
    const currentUser = await this.larkShared.getCurrentUser();
    const notifyUserOpenId = currentUser.user.openId;
    if (!currentUser.user.available || !notifyUserOpenId) {
      throw new HttpError(
        400,
        "当前飞书用户未完成授权，无法创建通知当前授权用户的工作流",
        "LARK_AUTH_USER_REQUIRED",
        {
          identity: currentUser.identity,
          verified: currentUser.verified,
          user: currentUser.user
        }
      );
    }

    const workflowInputs = buildWechatDraftWorkflowInputs({
      baseToken: input.baseToken,
      tableId: input.tableId,
      tableName,
      webhookUrl: input.webhookUrl,
      notifyUserOpenId,
      notifyUserName: currentUser.user.userName
    });
    const workflow = input.workflowType === "sync" ? workflowInputs[0] : workflowInputs[1];

    logger.info("template_wechat_draft_workflow_start", {
      baseToken: input.baseToken,
      tableId: input.tableId,
      tableName,
      webhookUrl: input.webhookUrl,
      workflowType: input.workflowType,
      title: workflow.title,
      receiver:
        input.workflowType === "notify"
          ? {
              openId: notifyUserOpenId,
              userName: currentUser.user.userName
            }
          : undefined
    });

    const created = await this.larkBase.createWorkflow({
      baseToken: input.baseToken,
      workflow
    });
    const workflowId = findStringDeep(created.raw, ["workflow_id", "workflowId", "id"]);
    const enabled = input.enable !== false && workflowId ? await this.larkBase.enableWorkflow(input.baseToken, workflowId) : null;

    logger.info("template_wechat_draft_workflow_success", {
      baseToken: input.baseToken,
      tableId: input.tableId,
      workflowType: input.workflowType,
      workflowId
    });

    return {
      ok: true,
      workflowType: input.workflowType,
      title: workflow.title,
      workflowId,
      created,
      enabled,
      currentUser,
      notificationStrategy:
        input.workflowType === "notify"
          ? {
              type: "authorized_user",
              openId: notifyUserOpenId,
              userName: currentUser.user.userName
            }
          : undefined
    };
  }
}

function findStringDeep(value: unknown, keys: string[]): string {
  if (!value || typeof value !== "object") {
    return "";
  }

  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      const found = (value as Record<string, unknown>)[key];
      if (typeof found === "string" && found) {
        return found;
      }
    }
  }

  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findStringDeep(child, keys);
      if (found) {
        return found;
      }
    }
    return "";
  }

  for (const child of Object.values(value)) {
    const found = findStringDeep(child, keys);
    if (found) {
      return found;
    }
  }
  return "";
}

function buildFieldMap(value: unknown) {
  const fields = collectFieldLikeObjects(value);
  return fields.reduce<Record<string, { id: string; type?: string }>>((acc, field) => {
    const name = getString(field, ["field_name", "fieldName", "name"]);
    const id = getString(field, ["field_id", "fieldId", "id"]);
    const type = getString(field, ["type", "field_type", "fieldType"]);
    if (name && id) {
      acc[name] = {
        id,
        type: type || undefined
      };
    }
    return acc;
  }, {});
}

function collectFieldLikeObjects(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== "object") {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectFieldLikeObjects(item));
  }

  const record = value as Record<string, unknown>;
  const name = getString(record, ["field_name", "fieldName", "name"]);
  const id = getString(record, ["field_id", "fieldId", "id"]);
  const current = name && id ? [record] : [];
  return current.concat(Object.values(record).flatMap((item) => collectFieldLikeObjects(item)));
}

function getString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value) {
      return value;
    }
  }
  return "";
}

function buildWorkflowTodos(input: {
  baseToken: string;
  tableId: string;
  tableName: string;
  fieldMap: Record<string, { id: string; type?: string }>;
}) {
  return [
    {
      key: "sync_request",
      title: "触发后端同步",
      status: input.baseToken && input.tableId ? "ready" : "waiting_for_base_ids",
      trigger: "status = ready_to_upload",
      action: "HTTPClientAction -> /api/webhooks/feishu/base-record-sync"
    },
    {
      key: "status_notify",
      title: "写回状态通知用户",
      status: input.fieldMap.status ? "ready" : "waiting_for_status_field",
      trigger: "status = uploaded_to_wechat / failed",
      action: "LarkMessageAction -> 当前授权用户"
    }
  ];
}

function buildWechatDraftWorkflowInputs(input: {
  baseToken: string;
  tableId: string;
  tableName: string;
  webhookUrl: string;
  notifyUserOpenId: string;
  notifyUserName?: string;
}) {
  const clientTokenPrefix = `${Date.now()}`;
  return [
    {
      client_token: `${clientTokenPrefix}-sync`,
      title: "推送草稿表：触发后端同步",
      steps: [
        {
          id: "step_trigger",
          type: "ChangeRecordTrigger",
          title: "新增或修改记录满足 ready_to_upload",
          next: "step_webhook",
          data: {
            table_name: input.tableName,
            trigger_control_list: [],
            condition_list: [
              {
                conjunction: "and",
                conditions: [
                  {
                    field_name: "status",
                    operator: "is",
                    value: [{ value_type: "option", value: { name: "ready_to_upload" } }]
                  }
                ]
              }
            ]
          }
        },
        {
          id: "step_webhook",
          type: "HTTPClientAction",
          title: "请求后端同步接口",
          next: null,
          data: {
            method: "POST",
            url: [{ value_type: "text", value: input.webhookUrl }],
            queries: [],
            headers: [{ key: "Content-Type", value: [{ value_type: "text", value: "application/json" }] }],
            body_type: "raw",
            raw_body: [
              {
                value_type: "text",
                value: `{"base_token":"${input.baseToken}","table_id":"${input.tableId}","record_id":"`
              },
              { value_type: "ref", value: "$.step_trigger.recordId" },
              { value_type: "text", value: '","event":"wechat_draft_sync"}' }
            ],
            response_type: "json",
            response_value: "{\"ok\":true}"
          }
        }
      ]
    },
    {
      client_token: `${clientTokenPrefix}-notify`,
      title: "推送草稿表：同步结果通知",
      steps: [
        {
          id: "step_trigger",
          type: "ChangeRecordTrigger",
          title: "新增或修改记录满足同步结果状态",
          next: "step_notify",
          data: {
            table_name: input.tableName,
            trigger_control_list: [],
            condition_list: [
              {
                conjunction: "and",
                conditions: [
                  {
                    field_name: "status",
                    operator: "containsAny",
                    value: [
                      { value_type: "option", value: { name: "uploaded_to_wechat" } },
                      { value_type: "option", value: { name: "failed" } }
                    ]
                  }
                ]
              }
            ]
          }
        },
        {
          id: "step_notify",
          type: "LarkMessageAction",
          title: "发送同步结果",
          next: null,
          data: {
            receiver: [
              {
                value_type: "user",
                value: {
                  id: input.notifyUserOpenId,
                  name: input.notifyUserName || "当前授权用户"
                }
              }
            ],
            send_to_everyone: false,
            title: [{ value_type: "text", value: "公众号草稿同步结果" }],
            content: [
              { value_type: "text", value: "记录状态已更新，请查看推送草稿表。记录链接：" },
              { value_type: "ref", value: "$.step_trigger.recordLink" }
            ],
            btn_list: [
              {
                text: "查看记录",
                btn_action: "openLink",
                link: [{ value_type: "ref", value: "$.step_trigger.recordLink" }]
              }
            ]
          }
        }
      ]
    }
  ];
}

function formatWorkflowError(error: unknown) {
  if (error instanceof LarkCliError) {
    return {
      message: error.message,
      command: error.command,
      args: error.args,
      exitCode: error.exitCode,
      stdout: error.stdout,
      stderr: error.stderr
    };
  }
  return {
    message: error instanceof Error ? error.message : String(error)
  };
}
