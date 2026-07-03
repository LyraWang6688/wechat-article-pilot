import { LarkBaseService } from "./larkBase.service.js";
import { LarkCliRunner } from "./larkCliRunner.js";
import { LarkSharedService } from "./larkShared.service.js";
import { SyncArticleService } from "./syncArticle.service.js";
import { SystemService } from "./system.service.js";
import { TemplateBaseService } from "./templateBase.service.js";

const runner = new LarkCliRunner();
const larkBase = new LarkBaseService(runner);
const larkShared = new LarkSharedService(runner);

export const services = {
  larkShared,
  larkBase,
  syncArticle: new SyncArticleService(larkBase),
  system: new SystemService(runner),
  templateBase: new TemplateBaseService(larkBase, larkShared)
};
