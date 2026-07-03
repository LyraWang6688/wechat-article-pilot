# CLI 集成经验：不要把引导式命令当成普通接口

## 背景

本项目后端通过 `lark-cli` 与飞书交互。实际测试发现，`lark-cli config init --new` 属于引导式命令：它会启动创建应用流程，输出飞书引导链接，并等待用户在浏览器中完成操作。

如果后端在普通 HTTP 请求里同步等待该命令完整退出，Nginx 会先超时，浏览器会看到 `504 Gateway Time-out`。

## 暴露的问题

- CLI 命令已经启动，但 HTTP 请求一直不返回。
- 反向代理不会无限等待长时间阻塞接口。
- 用户看不到 CLI 中途输出的引导链接。
- 前端按钮会停留在“处理中”，但后端实际已经卡在交互式 CLI 流程中。

## 经验原则

- 不要把引导式 CLI 命令直接映射成同步 HTTP 接口。
- 区分“短命令”和“长命令/交互命令”：
  - 短命令：如 `auth status`、`record-get`，可以等待命令退出后返回。
  - 引导命令：如 `config init --new`，应该启动后台会话并持续收集中间输出。
- 后端要尽早返回 `sessionId`，前端用轮询或 SSE 查询进度。
- stdout/stderr 必须实时采集并打日志，因为引导链接、验证码、错误提示经常出现在中间输出里。
- 反向代理超时时间不是根本解法，只能缓解，不能替代异步任务设计。

## 推荐模式

1. 前端点击按钮。
2. 后端启动 CLI 子进程。
3. 后端立刻返回 `sessionId`、当前状态和已捕获的输出。
4. 前端轮询状态接口。
5. 后端从 stdout/stderr 中提取链接或验证码。
6. 前端展示给用户。
7. 用户完成浏览器中的引导操作。
8. CLI 退出后，状态接口返回 `completed` 或 `failed`。

## 本项目对应实现

- `POST /api/lark/shared/config/init`
  - 启动 `lark-cli config init --new`。
  - 返回创建应用会话。

- `GET /api/lark/shared/config/init/status?sessionId=...`
  - 查询会话状态。
  - 返回 stdout/stderr、提取出的飞书引导链接、进程状态。

## 给其他 AI 的提醒

- 看到 `config init`、`auth login`、`device flow`、`browser verification` 这类 CLI 关键词时，先判断是否会阻塞。
- 不要只写 `await exec()` 然后等命令结束。
- 要先设计“启动、展示链接、用户完成、查询状态”的产品流程。
- 日志里至少记录：
  - CLI 命令和参数，敏感信息要脱敏。
  - 子进程 PID。
  - stdout/stderr 预览。
  - 退出码和耗时。
  - 会话 ID。
- 前端不要展示权限 scope、device code 等技术细节，除非用户明确需要排查。
