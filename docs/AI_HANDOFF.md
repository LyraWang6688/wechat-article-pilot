# AI 项目交接说明

本文档用于把 `wechat-article-pilot` 交给下一位 AI 或开发者时快速建立上下文。接手者应先读本文，再读 `PROJECT_BRIEF.md`、`docs/LARK_CLI_INIT_CONTEXT.md`、`docs/WORKFLOW_FEASIBILITY.md` 和 `docs/REMOTE_SERVER_DEV.md`。

## 1. 项目目标

本项目是一个「飞书多维表格 × 微信公众号后台」桥接工具。

P0 阶段先跑通飞书侧闭环：

- 创建飞书应用。
- 完成用户授权。
- 自动创建多维表格工作台。
- 自动新增「推送草稿表」和 15 个模板字段。
- 自动创建两条 Base Workflow。
- Workflow 触发后端 webhook。
- 后端根据 `record_id` 读取完整记录。
- 后端写回同步状态。
- 飞书通知当前授权用户。

微信侧图文草稿链路已经完成一次真实联调：

- 前端保存微信公众号 `AppID / AppSecret`。
- 后端按 `baseToken + tableId` 唯一绑定飞书工作台和微信公众号。
- 飞书附件字段返回 `file_token` 后，后端下载封面文件。
- 后端调用微信永久图片素材接口获取封面 `media_id`。
- 后端调用微信 `draft/add` 创建图文草稿。
- 后端写回 `uploaded_to_wechat`、`wechat_draft_media_id` 和 `wechat_upload_result`。

## 2. 技术栈和部署

- 前端：静态 `HTML + CSS + Vanilla JS`，暂不迁移 React / Tailwind。
- 后端：`Node.js + Express + TypeScript`。
- 飞书侧：服务器上的 `lark-cli`。
- 部署：Ubuntu VM + PM2 + Nginx。
- 服务器目录：`/opt/wechat-article-pilot-dev`。
- 线上开发域名：`draft-api.bamamei.online`，Nginx 反代到 `127.0.0.1:3010`。

## 3. 当前关键实现

### 3.1 飞书 CLI 初始化

- `lark-cli config init --new` 是交互式阻塞命令，不能当成同步 HTTP 请求。
- 当前代码已改为后端异步会话，前端轮询状态，避免 Nginx `504 Gateway Time-out`。
- 创建应用链接由按钮本身承载：点击「创建新应用」后，按钮变成「打开飞书创建链接」。

### 3.2 用户授权

- 授权使用 `lark-cli auth login --scope <scopes> --no-wait --json`。
- 点击「开始授权」后，按钮变成「打开飞书授权链接」。
- 页面上已经删除「我已完成授权」按钮。
- 后端新增异步授权完成检测：
  - `POST /api/lark/shared/auth/login/complete/start`
  - `GET /api/lark/shared/auth/login/complete/status?sessionId=...`
- 后端通过后台会话执行 `lark-cli auth login --device-code <device_code> --json`，前端轮询完成状态。
- 授权完成后，前端自动进入「多维表格初始化」并继续创建 Base / 表 / 工作流。

### 3.3 P0 必需授权 scope

当前授权必须包含：

```text
base:app:create
base:table:read
base:table:create
base:table:update
base:table:delete
base:field:read
base:field:create
base:field:update
base:view:write_only
base:record:read
base:record:create
base:record:update
docs:document.media:download
base:workflow:create
base:workflow:update
```

曾经漏掉 `base:field:create`、`base:field:update`、`base:view:write_only`，导致 `base +table-create --fields ...` 创建「推送草稿表」失败。

后来接入飞书附件封面下载时，`lark-cli base +record-download-attachment` 又实测需要 `docs:document.media:download`。不要只看命令名称判断权限，必须以真实 `missing_scope` 为准。

### 3.4 前端初始化向导

- 页面是左右布局。
- 左侧是配置进度器。
- 右侧是单板块向导。
- 已删除顶部总览和「最新操作提示」全局提示区，因为它们会破坏左右高度协调。
- 第一板块「飞书应用初始化」已简化，只保留：
  - `创建新应用`
  - `开始授权`
  - 授权后四项能力说明
- 不要再新增全局提示卡片。状态反馈优先放在当前卡片和左侧进度器。

## 4. 当前最新提交

最新提交应为：

```text
7b6395f fix: download lark attachments safely
```

这个提交的目的：补齐飞书附件下载 scope，并修复 `lark-cli base +record-download-attachment --output` 不能使用绝对路径的问题。

## 5. 当前最重要待办

### P0-1：飞书侧闭环

飞书侧创建应用、用户授权、创建多维表格、创建推送草稿表、创建同步/通知工作流、webhook 触发、record-get、状态写回均已验证。

### P0-2：微信图文草稿链路

当前已经真实跑通：

- 飞书 `cover_image_url` 字段实际是附件/图片对象数组。
- 后端读取 `file_token`。
- 后端下载飞书附件。
- 后端上传微信永久图片素材。
- 后端创建微信公众号图文草稿。
- 后端写回 `uploaded_to_wechat`。

成功写回示例：

```text
status = uploaded_to_wechat
wechat_draft_media_id = <微信草稿 media_id>
wechat_upload_result = 微信图文草稿创建成功；cover_media_id=<封面素材 media_id>；draft_media_id=<草稿 media_id>；cover_url=<微信图片素材 URL>
```

### P0-3：仍需继续验证的微信侧问题

- 微信正文 HTML 内的外部图片还没有替换成微信图文图片 URL。
- 正文图片需要走“上传图文消息内的图片获取 URL”接口，和封面永久素材不是同一条链路。
- 仍需检查微信后台草稿内容渲染是否符合预期。
- 标题超过 32 字、正文 HTML 过大、正文外链图片等可能导致后续草稿接口失败。

### P1-1：初始化链路迁移到用户本地 CLI

当前产品文案已经引导用户在本地电脑准备飞书 CLI，但现有初始化链路仍然是：

```text
用户浏览器点击创建/授权/初始化
-> 前端请求后端接口
-> 服务器 Node 进程执行服务器上的 lark-cli
-> 服务器创建飞书应用、授权、Base、数据表和工作流
```

这和目标产品形态不一致。后续需要改造为：

```text
用户在本地电脑安装飞书 CLI
-> 前端生成本地命令或 Agent 引导语
-> 用户本地 CLI / 用户常用 Agent 执行飞书应用创建、授权、Base、数据表和工作流初始化
-> 前端接收或粘贴初始化结果
-> 后端只保留 webhook、微信草稿同步和必要配置存储
```

迁移目标：

- 初始化链路不再依赖服务器上的 `lark-cli`。
- 服务器不再代用户执行 `lark-cli config init --new` 和 `lark-cli auth login`。
- 前端需要提供可复制的本地命令、Agent 引导语，以及初始化结果回填方式。
- 需要重新设计 `baseToken/tableId/baseUrl/workflow` 等结果如何从本地 CLI 回填到前端和后端。
- 后端仍可继续负责确定性的 webhook 接收、飞书记录读取、封面附件下载、微信草稿创建和飞书写回。

## 6. 关键风险和经验

- `lark-cli config init --new` 和 `auth login --device-code` 都可能阻塞，不能直接放在同步 HTTP 请求里。
- CLI 成功不等于用户流程成功，前端必须展示或承载用户下一步动作。
- 后端应返回稳定字段，不要让前端递归猜 `raw`。
- `base +workflow-create` 返回成功，不代表飞书 UI 能识别节点；UI 显示「未知操作」通常说明 workflow JSON 某个 action data 结构不符合编辑器 schema。
- 已经创建出来的旧工作流不会自动更新，需要删除旧工作流或重新创建。
- 当前 P0 是单用户模式：一个用户、一个飞书应用、一个 Base、不共享、通知当前授权用户。
- 多人协作、按记录人员字段通知、指定负责人通知，不属于当前 P0。
- 不要只看 CLI 命令名称判断权限，必须以真实执行结果为准。
- `base +record-download-attachment` 看起来像 Base 读取，但实际还需要 `docs:document.media:download`。
- `lark-cli base +record-download-attachment --output` 不能使用 `/tmp/...` 这类绝对路径，必须使用当前项目目录内的相对路径。
- 当前实现把附件临时下载到 `.data/wechat-cover-*`，传给 CLI 的是相对路径，传给 Node/微信上传逻辑的是绝对路径。
- 所有新增 CLI 命令都要先执行 `--help`，记录参数约束、路径限制、风险等级和输出格式。
- 遇到 CLI 报错要完整读取 `error.type/subtype/message/missing_scopes/param`，不要凭经验猜。
- 授权 scope 不要提前乱加；但一旦实测出现 `missing_scope`，要同时补前端授权清单和后端默认授权清单。
- webhook 自动化任务必须有成功写回和失败写回。`status=failed` + `wechat_upload_result` 对定位问题非常关键。
- 第三方配置必须绑定业务唯一键。当前使用 `baseToken + tableId` 绑定微信公众号 `AppID/AppSecret`，避免 A 表误用 B 公众号配置。
- 敏感信息不要回显，不要贴完整 `.data/integration-config.json`；如 `AppSecret` 已外泄，应立即在微信公众平台重置。

### 6.1 飞书附件封面到微信草稿的真实链路

飞书多维表格图片/附件字段在 `record-get` 中返回形态：

```json
[
  {
    "file_token": "...",
    "name": "build-notes.png",
    "size": 123456
  }
]
```

正确处理链路：

```text
cover_image_url 附件数组
-> 取第一个附件 file_token/name/size
-> lark-cli base +record-download-attachment 下载附件
-> 微信 material/add_material?type=image 上传永久图片素材
-> 取返回 media_id
-> 微信 draft/add 使用 thumb_media_id
-> 飞书写回 uploaded_to_wechat / wechat_draft_media_id / wechat_upload_result
```

注意：

- `file_token` 不能直接给微信。
- 微信图文封面需要永久素材 `media_id`，不是飞书 URL。
- 封面走永久素材接口；正文图片后续要走图文消息图片上传接口。
- 微信永久图片素材支持 `bmp/png/jpeg/jpg/gif`，10M 以内。
- 图文消息内正文图片接口要求更严，通常 `jpg/png` 且 1M 以内。

## 7. 服务器更新命令

```bash
cd /opt/wechat-article-pilot-dev
git pull
npm install
npm run typecheck
pm2 restart wechat-article-pilot-dev
pm2 logs wechat-article-pilot-dev --lines 80
```

确认版本：

```bash
cd /opt/wechat-article-pilot-dev
git log -1 --oneline
```

应看到：

```text
7b6395f fix: download lark attachments safely
```

## 8. 本地检查命令

每次修改后至少执行：

```bash
node --check public/app.js
npm run typecheck
git diff --check
```

如果改了前端 UI，建议本地启动并用浏览器快照确认：

```bash
npm run dev
```

## 9. 给下一位 AI 的明确要求

- 不要把交互式 CLI 当同步 HTTP 请求。
- 不要新增破坏左右高度的全局提示面板。
- 不要随意迁移 React/Tailwind。
- 不要凭自然语言猜飞书 workflow JSON。
- 不要一次性加复杂 workflow 字段；先最小可识别，再逐步加功能。
- 每次推送后，都给用户服务器更新命令和确认版本命令。
