# WeChat Article Pilot

飞书多维表格 × 微信公众号后台桥接工具。

本项目把飞书多维表格作为文章内容和同步状态的操作台，通过后端中介层读取指定记录，并在后续阶段调用微信公众号 API 创建/更新草稿。

当前阶段优先打通飞书侧：

- 轻量前端配置页
- 飞书 CLI 初始化和用户授权
- Base 链接解析、字段读取、记录读取
- 推送草稿表模板创建
- Workflow webhook 占位
- 通过 `record_id` 读取一条 Base 记录的完整数据

## 技术栈

- 后端：Node.js + TypeScript + Express
- 前端：静态 HTML + vanilla JS，由后端直接 serve
- 飞书侧：`lark-cli` 子进程调用，优先使用用户身份授权
- 微信侧：当前暂不接入，后续通过 HTTP API 调用公众号后台

## 推荐开发方式

当前推荐使用“服务器开发执行机”模式：

```text
设备 A / B / C
远程编辑服务器项目或访问测试页面
        ↓
/opt/wechat-article-pilot-dev
服务器运行 Express 后端和 lark-cli
        ↓
飞书多维表格 / 飞书 Workflow
```

这种方式可以避免每次小改动都经历“本地修改 -> push GitHub -> 服务器 pull -> Docker build -> 重启”的完整部署链路。代码、后端进程、`lark-cli` 配置和日志都集中在服务器，GitHub 只用于阶段性版本沉淀。

服务器目录建议：

```text
/opt/wechat-article-pilot-dev
开发测试目录，远程编辑这里，运行 npm run dev 或 PM2 dev 进程

/opt/wechat-article-pilot-prod
未来正式部署目录，后续再接 Docker / PM2 / Nginx
```

当前服务器测试入口：

```text
https://draft-api.bamamei.online -> http://127.0.0.1:3010
```

详细流程见：

- [服务器远程开发流程](docs/REMOTE_SERVER_DEV.md)

## 本地临时运行

```bash
npm install
npm run dev
```

打开：

```text
http://localhost:3000
```

本地临时运行适合单设备快速验证。跨设备开发和飞书 Workflow 联调时，优先使用服务器开发执行机。

如当前运行后端的机器上 `lark-cli` 不在 PATH，可复制 `.env.example` 为 `.env`，配置绝对路径：

```text
LARK_CLI_BIN=C:\path\to\lark-cli.exe
```

如要让 webhook 只携带 `record_id`，可在 `.env` 中配置默认 Base 坐标：

```text
DEFAULT_BASE_TOKEN=bascnxxx
DEFAULT_TABLE_ID=tblxxx
```

## 当前操作流程

1. 检查执行环境：确认当前后端运行在哪台机器、Node.js、`lark-cli` 和授权用户状态。
2. 检查服务：确认 Express 后端可用。
3. 检查 CLI：后端执行 `lark-cli --version`。
4. 引导式配置初始化：后端执行 `lark-cli config init --new`。
5. 用户授权：后端执行 `lark-cli auth login --domain all --no-wait --json`。
6. 完成授权：用户扫码/浏览器确认后，把 `device_code` 填回页面。
7. 绑定 Base：后端执行 `lark-cli base +url-resolve --url <url> --format json`。
8. 创建模板表：后端执行 `lark-cli base +table-create --fields <template_fields>`。
9. 读取字段：后端执行 `lark-cli base +field-list`。
10. 读取记录列表：后端执行 `lark-cli base +record-list --format json`。
11. 读取单条记录：后端执行 `lark-cli base +record-get --record-id <record_id> --format json`。

## 关于 config init --new

`config init --new` 不是完全静默的一键操作，它更像飞书 CLI 的应用创建/绑定引导流程。页面上的“开始初始化”按钮只是触发后端执行 CLI，并把 CLI 输出展示给用户。

如果 CLI 要求打开浏览器、创建应用、开权限或继续确认，需要用户按输出提示手动完成。后端不会承诺替用户完全自动创建和审批飞书应用。

## 模板与 Workflow

模板表已支持通过接口自动创建，字段结构已沉淀到文档：

- [推送草稿表模板结构](docs/TEMPLATE_SCHEMA.md)
- [Workflow 可行性依据](docs/WORKFLOW_FEASIBILITY.md)
- [项目说明书](PROJECT_BRIEF.md)

推送草稿表触发规则：

```text
status = ready_to_upload
```

写回规则：

```text
成功：status = uploaded_to_wechat
失败：status = failed
```

当前 webhook：

```text
POST /api/webhooks/feishu/base-record-sync
```

请求体示例：

```json
{
  "base_token": "bascnxxx",
  "table_id": "tblxxx",
  "record_id": "recxxx",
  "event": "wechat_draft_sync"
}
```

本地验证可选写回状态：

```json
{
  "base_token": "bascnxxx",
  "table_id": "tblxxx",
  "record_id": "recxxx",
  "writeBackStatus": "failed"
}
```

## 已实现接口

```text
GET  /api/health
GET  /api/system/env
GET  /api/lark/shared/version
POST /api/lark/shared/config/init
POST /api/lark/shared/auth/login/start
POST /api/lark/shared/auth/login/complete
GET  /api/lark/shared/auth/status
GET  /api/lark/shared/auth/current-user
GET  /api/lark/shared/profiles
POST /api/lark/base/resolve-url
POST /api/lark/base/fields
POST /api/lark/base/records
POST /api/lark/base/records/get
POST /api/lark/base/records/upsert
POST /api/templates/push-draft-table
POST /api/webhooks/feishu/base-record-sync
```

创建模板表请求示例：

```json
{
  "baseToken": "bascnxxx",
  "tableName": "推送草稿表"
}
```

服务器执行环境检查：

```text
GET /api/system/env
```

用于查看当前后端主机、Node.js 版本、运行目录、`lark-cli` 可用性和当前飞书授权用户。

## PM2 开发进程

服务器开发期可用 PM2 避免 SSH 断开后进程退出：

```bash
npm install -g pm2
npm run pm2:dev
npm run pm2:dev:logs
```

常用命令：

```bash
npm run pm2:dev:restart
npm run pm2:dev:stop
pm2 status
```

默认 PM2 配置指向 `/opt/wechat-article-pilot-dev`。如果服务器目录不同，请修改 `ecosystem.config.cjs` 的 `cwd`。

## 日志与调试

后端输出 JSON Lines 日志，便于在本地终端或服务器日志中检索。

常用环境变量：

```text
LOG_LEVEL=info
LOG_CLI_STDOUT=true
LOG_CLI_STDOUT_MAX_CHARS=4000
LOG_CLI_STDERR_MAX_CHARS=4000
```

关键事件：

- `http_request_start` / `http_request_finish`：请求入口和响应耗时，包含 `traceId`。
- `lark_cli_call_start`：实际执行的 `lark-cli` 命令和参数。
- `lark_cli_call_success` / `lark_cli_call_failed`：CLI 出参、耗时、退出码、stdout/stderr 预览。
- `template_push_draft_create_start`：创建「推送草稿表」的业务入参。
- `feishu_webhook_base_record_sync_received`：飞书 Workflow 调后端 webhook 的原始输入。
- `sync_article_fetch_record_start`：后端根据 `record_id` 读取 Base 记录。
- `base_record_upsert_start`：状态写回 Base。

日志会自动脱敏常见敏感字段，例如 `secret`、`token`、`authorization`、`cookie`、`device_code`、`baseToken`。

## 安全注意

- 飞书 `appSecret` 通过 `stdin` 传给 `lark-cli`，不拼接到命令行参数。
- 微信 `AppSecret` 当前只做前端占位，尚未提交保存。
- P0 阶段未接 Supabase，不做多用户配置持久化。
- `.env` 不进入 Git，提交前请确认没有密钥、token、真实 AppSecret。

## 下一步

- 先完成飞书侧闭环：授权、Base 坐标、`record_id` webhook、完整记录读取、状态写回。
- 开发阶段优先使用服务器开发执行机，稳定后再整理生产部署目录。
- 模板表已支持通过 `+table-create` 创建；Workflow 自动创建后续再接。
- Workflow JSON 模板后续基于真实字段 ID 和公网 webhook URL 生成。
- 微信侧后续接入 `access_token`、永久素材、草稿新增和草稿更新。
- 引入 Supabase 存储用户配置、授权状态、Base 坐标和微信配置。
