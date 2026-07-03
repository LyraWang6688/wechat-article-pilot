export const PUSH_DRAFT_TABLE_NAME = "推送草稿表";

export const PUSH_DRAFT_COLUMNS = [
  "造物笔记",
  "边走边想",
  "书籍推荐",
  "热钱之外",
  "AI 简报",
  "从卡点到解法",
  "工具炼金术",
  "概念补给站"
] as const;

export const PUSH_DRAFT_STATUSES = ["ready_to_upload", "uploaded_to_wechat", "failed"] as const;

export type PushDraftColumn = (typeof PUSH_DRAFT_COLUMNS)[number];
export type PushDraftStatus = (typeof PUSH_DRAFT_STATUSES)[number];

export type PushDraftRecord = {
  article_id?: string;
  title?: string;
  author?: string;
  digest?: string;
  column?: PushDraftColumn;
  content_markdown?: string;
  content_html?: string;
  cover_image_url?: string;
  status?: PushDraftStatus;
  wechat_draft_media_id?: string;
  wechat_upload_result?: string;
  missing_fields?: string;
  warning_fields?: string;
  created_at?: string;
  updated_at?: string;
};

export const PUSH_DRAFT_TEMPLATE_FIELDS = [
  {
    name: "article_id",
    type: "auto_number",
    description: "主键，格式 yyyyMMdd + 3位序号",
    style: {
      rules: [
        { type: "created_time", date_format: "yyyyMMdd" },
        { type: "incremental_number", length: 3 }
      ]
    }
  },
  { name: "title", type: "text", description: "文章标题" },
  { name: "author", type: "text", description: "作者" },
  { name: "digest", type: "text", description: "摘要" },
  {
    name: "column",
    type: "select",
    multiple: false,
    options: PUSH_DRAFT_COLUMNS.map((name) => ({ name })),
    description: "公众号栏目"
  },
  { name: "content_markdown", type: "text", description: "Markdown 正文" },
  { name: "content_html", type: "text", description: "HTML 正文" },
  { name: "cover_image_url", type: "text", style: { type: "url" }, description: "封面图 URL" },
  {
    name: "status",
    type: "select",
    multiple: false,
    options: PUSH_DRAFT_STATUSES.map((name) => ({ name })),
    description: "同步状态"
  },
  { name: "wechat_draft_media_id", type: "text", description: "微信草稿 media_id" },
  { name: "wechat_upload_result", type: "text", description: "微信接口返回结果" },
  { name: "missing_fields", type: "text", description: "必填字段缺失检查结果" },
  { name: "warning_fields", type: "text", description: "非阻断告警" },
  { name: "created_at", type: "created_at", style: { format: "yyyy-MM-dd HH:mm" }, description: "记录创建时间" },
  { name: "updated_at", type: "updated_at", style: { format: "yyyy-MM-dd HH:mm" }, description: "记录更新时间" }
] as const;
