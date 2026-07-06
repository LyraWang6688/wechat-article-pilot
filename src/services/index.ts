import { IntegrationConfigService } from "./integrationConfig.service.js";
import { LarkBaseService } from "./larkBase.service.js";
import { LarkCliRunner } from "./larkCliRunner.js";
import { LarkSharedService } from "./larkShared.service.js";
import { SyncArticleService } from "./syncArticle.service.js";
import { SystemService } from "./system.service.js";
import { TemplateBaseService } from "./templateBase.service.js";
import { WechatService } from "./wechat.service.js";

const runner = new LarkCliRunner();
const larkBase = new LarkBaseService(runner);
const larkShared = new LarkSharedService(runner);
const wechat = new WechatService();
const integrationConfig = new IntegrationConfigService();

export const services = {
  integrationConfig,
  larkShared,
  larkBase,
  wechat,
  syncArticle: new SyncArticleService(larkBase, wechat, integrationConfig),
  system: new SystemService(runner),
  templateBase: new TemplateBaseService(larkBase, larkShared)
};
