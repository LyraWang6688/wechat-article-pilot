import {
  PUSH_DRAFT_TABLE_NAME,
  PUSH_DRAFT_TEMPLATE_FIELDS,
  PUSH_DRAFT_STATUSES
} from "../templates/pushDraftTable.js";
import { logger } from "../utils/logger.js";
import { LarkBaseService } from "./larkBase.service.js";
import { LarkSharedService } from "./larkShared.service.js";

export type CreatePushDraftTableInput = {
  baseToken: string;
  tableName?: string;
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
        preferred: "workflow_current_operator",
        fallback: currentUser.user.openId
          ? {
              type: "authorized_user",
              openId: currentUser.user.openId,
              userName: currentUser.user.userName
            }
          : null,
        note: "当前阶段严格按 15 字段模板创建；如果 workflow 无法稳定引用当前操作人，再考虑新增人员字段。"
      },
      fields: PUSH_DRAFT_TEMPLATE_FIELDS,
      created: table
    };
  }
}
