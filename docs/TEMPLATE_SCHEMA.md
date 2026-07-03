# 推送草稿表模板结构

模板表已支持通过后端接口创建；字段结构会映射为 `lark-cli base +table-create --fields` 可执行 JSON。

## 表名

```text
推送草稿表
```

## 字段清单

| 字段名 | 类型 | 说明 |
|---|---|---|
| `article_id` | 自动编号 | 主键，格式 `yyyyMMdd + 3位序号` |
| `title` | 文本 | 文章标题 |
| `author` | 文本 | 作者 |
| `digest` | 文本 | 摘要 |
| `column` | 单选 | 公众号栏目，8 个固定选项 |
| `content_markdown` | 文本 | Markdown 正文 |
| `content_html` | 文本 | HTML 正文 |
| `cover_image_url` | URL | 封面图 URL |
| `status` | 单选 | 同步状态，3 个固定选项 |
| `wechat_draft_media_id` | 文本 | 微信草稿 media_id |
| `wechat_upload_result` | 文本 | 微信接口返回结果 |
| `missing_fields` | 文本 | 必填字段缺失检查结果 |
| `warning_fields` | 文本 | 非阻断告警 |
| `created_at` | 创建时间 | 记录创建时间 |
| `updated_at` | 修改时间 | 记录更新时间 |

## column 选项

- `造物笔记`
- `边走边想`
- `书籍推荐`
- `热钱之外`
- `AI 简报`
- `从卡点到解法`
- `工具炼金术`
- `概念补给站`

## status 选项

- `ready_to_upload`
- `uploaded_to_wechat`
- `failed`

## 触发规则

```text
status = ready_to_upload
```

当 `status` 被设置为 `ready_to_upload` 时，飞书 Workflow 调用后端 webhook。

## 写回规则

- 成功：后端写回 `status = uploaded_to_wechat`。
- 失败：后端写回 `status = failed`，同时写入 `wechat_upload_result`、`missing_fields` 或 `warning_fields`。

## 当前操作人通知规则

目标规则：

```text
飞书消息通知当前操作人
```

当前策略：

- 前期飞书初始化/授权后，可通过 `lark-cli auth status --json --verify` 获取当前授权用户的 `openId` 和 `userName`。
- 模板创建接口会返回当前授权用户信息，作为后续 workflow 通知人的默认参考。
- Workflow 触发器是否能稳定输出“当前操作人”的 ref 仍需在真实 Base 中实测。
- 如果不能稳定引用，再考虑新增一个人员字段作为通知接收人字段；当前创建表严格遵守 15 字段模板，不额外加字段。
