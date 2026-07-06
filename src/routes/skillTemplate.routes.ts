import { Router } from "express";
import { HttpError } from "../errors/HttpError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

type SkillTemplateCategory = "common" | "personal";

type SkillTemplate = {
  category: SkillTemplateCategory;
  slug: string;
  name: string;
  description: string;
  usage: string;
};

type ZipFile = {
  name: string;
  content: string;
};

const ZIP_UTF8_FLAG = 0x0800;
const ZIP_STORE_METHOD = 0;

const SKILL_TEMPLATES: SkillTemplate[] = [
  {
    category: "common",
    slug: "wechat-brand-context",
    name: "wechat-brand-context",
    description: "公众号品牌定位、内容边界和表达风格上下文，供其他任务 Skill 反复引用。",
    usage: "作为公用 Skill，供标题、润色、排版、事实检查、发布检查等任务 Skill 参考。"
  },
  {
    category: "personal",
    slug: "wechat-content-polisher",
    name: "wechat-content-polisher",
    description: "在不改变作者原始逻辑的前提下，对公众号初稿做 GEO 友好润色。",
    usage: "输入公众号初稿，输出更清晰、更适合 AI 搜索理解的优化正文。"
  },
  {
    category: "personal",
    slug: "wechat-fact-checker",
    name: "wechat-fact-checker",
    description: "检查事实准确性、专业严谨度、平台兼容性和安全风险。",
    usage: "在发布前检查概念、数据、平台能力表述、兼容性和潜在风险。"
  },
  {
    category: "personal",
    slug: "wechat-geo-summary",
    name: "wechat-geo-summary",
    description: "面向 AI 搜索友好目标，提炼文章摘要、核心问题和 GEO 结构。",
    usage: "提炼文章摘要、关键词、问题表达和适合 AI 搜索引用的结构化信息。"
  },
  {
    category: "personal",
    slug: "wechat-html-css-layout",
    name: "wechat-html-css-layout",
    description: "生成适合公众号正文的 HTML 片段，作为自动化推送前置内容。",
    usage: "输入正文或 Markdown，输出可写入 content_html 字段的公众号正文 HTML。"
  },
  {
    category: "personal",
    slug: "wechat-publish-checker",
    name: "wechat-publish-checker",
    description: "在发布前对公众号文章进行完整性、规范性和风险检查。",
    usage: "检查标题、摘要、正文、封面、字段完整性和发布前风险。"
  },
  {
    category: "personal",
    slug: "wechat-title-generator",
    name: "wechat-title-generator",
    description: "结合品牌上下文和内容目标生成公众号标题候选。",
    usage: "输入文章主题、受众和正文要点，输出候选标题与推荐理由。"
  }
];

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

export const skillTemplateRouter = Router();

skillTemplateRouter.get(
  "/:category/:fileName",
  asyncHandler(async (req, res) => {
    const category = getParam(req.params.category) as SkillTemplateCategory;
    const fileName = getParam(req.params.fileName);
    const slug = fileName.replace(/\.zip$/i, "");
    const template = SKILL_TEMPLATES.find((item) => item.category === category && item.slug === slug);

    if (!template || !fileName.endsWith(".zip")) {
      throw new HttpError(404, "Skill 模板不存在", "SKILL_TEMPLATE_NOT_FOUND");
    }

    const zip = createZipBuffer(buildTemplateFiles(template));
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${template.slug}.zip"`);
    res.setHeader("Cache-Control", "public, max-age=300");
    res.send(zip);
  })
);

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function buildTemplateFiles(template: SkillTemplate): ZipFile[] {
  return [
    {
      name: "README.md",
      content: `# ${template.name}

${template.description}

## 用途

${template.usage}

## 使用方式

1. 下载并解压本压缩包。
2. 将 Skill 文件夹上传或导入到支持 Skill 的 Agent。
3. 在 Agent 中配合飞书 CLI 和工作台配置使用。

## 当前版本

这是固定 Skill 模板的初始版本，后续可以替换为正式 Skill 内容。
`
    },
    {
      name: "SKILL.md",
      content: `# ${template.name}

## Role

你是微信公众号 GEO 内容生产流程中的一个 Skill。

## Goal

${template.description}

## Context

本 Skill 用于“飞书多维表格 x 微信公众号后台 x Agent”的内容生产链路。Agent 需要能加载 Skill，并能调用飞书 CLI 将标题、摘要、正文 HTML、封面附件等信息写入指定飞书多维表格。

## Instructions

- 优先遵循公众号定位和 GEO 策略。
- 输出内容要便于写入飞书多维表格字段。
- 不直接调用微信公众号后台，由后端根据飞书记录自动创建公众号草稿。
- 如需要封面图片，请提醒用户将图片上传到 cover_image_url 附件字段。

## Output

根据用户输入输出可直接复制使用的内容，并注明建议写入的字段。
`
    }
  ];
}

function createZipBuffer(files: ZipFile[]) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const fileName = Buffer.from(file.name, "utf8");
    const data = Buffer.from(file.content, "utf8");
    const checksum = crc32(data);
    const localHeader = Buffer.alloc(30);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(ZIP_UTF8_FLAG, 6);
    localHeader.writeUInt16LE(ZIP_STORE_METHOD, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(fileName.length, 26);
    localHeader.writeUInt16LE(0, 28);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(ZIP_UTF8_FLAG, 8);
    centralHeader.writeUInt16LE(ZIP_STORE_METHOD, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(fileName.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    localParts.push(localHeader, fileName, data);
    centralParts.push(centralHeader, fileName);
    offset += localHeader.length + fileName.length + data.length;
  }

  const centralSize = centralParts.reduce((size, part) => size + part.length, 0);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(files.length, 8);
  endRecord.writeUInt16LE(files.length, 10);
  endRecord.writeUInt32LE(centralSize, 12);
  endRecord.writeUInt32LE(offset, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, endRecord]);
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
