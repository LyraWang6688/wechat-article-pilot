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

微信侧当前只保留 `AppID / AppSecret` 前端占位，尚未真正保存或调用微信公众号 API。

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
base:workflow:create
base:workflow:update
```

曾经漏掉 `base:field:create`、`base:field:update`、`base:view:write_only`，导致 `base +table-create --fields ...` 创建「推送草稿表」失败。

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
460be9b fix: simplify notify workflow action
```

这个提交的目的：修复「同步结果通知」工作流在飞书 UI 中显示「未知操作」的问题。

## 5. 当前最重要待办

### P0-1：验证通知工作流是否还显示「未知操作」

更新服务器到最新代码后，重新创建「推送草稿表：同步结果通知」工作流。

检查飞书 UI：

- 如果第二个节点从「未知操作」变成「发送飞书消息」，说明 `LarkMessageAction` 最小结构可用。
- 如果仍然是「未知操作」，下一位 AI 必须继续对照官方 schema/guide 排查，不要凭感觉猜 JSON。

官方参考文件在本机：

```text
C:\Users\Admin\.trae-cn\skills\lark-base\references\lark-base-workflow-schema.md
C:\Users\Admin\.trae-cn\skills\lark-base\references\lark-base-workflow-guide.md
```

当前通知动作已收敛为最小结构：

```ts
receiver: [
  {
    value_type: "user",
    value: {
      id: notifyUserOpenId,
      name: notifyUserName
    }
  }
],
send_to_everyone: false,
title: [{ value_type: "text", value: "公众号草稿同步结果" }],
content: [
  {
    value_type: "text",
    value: "推送草稿表中有记录状态已更新，请打开多维表格查看同步结果。"
  }
],
btn_list: []
```

不要先加回动态记录链接按钮。先验证最小 `LarkMessageAction` 能被飞书 UI 识别。

### P0-2：验证推送工作流触发后端 webhook

通知工作流 UI 正常后，再测试：

- 修改一条记录 `status = ready_to_upload`。
- 检查飞书工作流是否请求后端 webhook。
- 后端是否收到 `base_token / table_id / record_id`。
- 后端是否能根据 `record_id` 读取完整记录。

### P0-3：验证状态写回和通知闭环

后端读取记录成功后，继续验证：

- 后端写回 `uploaded_to_wechat` 或 `failed`。
- 写回状态是否触发第二条通知工作流。
- 是否会误触发第一条同步工作流造成循环。

### P1：微信公众号 API 接入

飞书侧闭环稳定后再开始微信侧：

- 保存并保护 `AppID / AppSecret`。
- 获取 `access_token`。
- 上传永久素材。
- 创建或更新公众号草稿。
- 把微信接口返回结果写回飞书记录。

## 6. 关键风险和经验

- `lark-cli config init --new` 和 `auth login --device-code` 都可能阻塞，不能直接放在同步 HTTP 请求里。
- CLI 成功不等于用户流程成功，前端必须展示或承载用户下一步动作。
- 后端应返回稳定字段，不要让前端递归猜 `raw`。
- `base +workflow-create` 返回成功，不代表飞书 UI 能识别节点；UI 显示「未知操作」通常说明 workflow JSON 某个 action data 结构不符合编辑器 schema。
- 已经创建出来的旧工作流不会自动更新，需要删除旧工作流或重新创建。
- 当前 P0 是单用户模式：一个用户、一个飞书应用、一个 Base、不共享、通知当前授权用户。
- 多人协作、按记录人员字段通知、指定负责人通知，不属于当前 P0。

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
460be9b fix: simplify notify workflow action
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
