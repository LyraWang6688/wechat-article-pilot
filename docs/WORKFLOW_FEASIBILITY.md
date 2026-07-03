# Workflow 可行性依据

本文档说明为什么本项目需要的两个飞书多维表格 Workflow 可以通过 `lark-cli base +workflow-*` 实现。

## 依据来源

- `lark-base-workflow-schema.md`：定义 Workflow `steps` 的单一事实来源，包括 Trigger、Action、Branch、System 的类型和字段。
- `lark-base-workflow-guide.md`：给出 `ButtonTrigger -> HTTPClientAction`、`LarkMessageAction` 等完整组合示例。
- `larksuite/cli` GitHub 源码：
  - `shortcuts/base/workflow_create.go` 声明 `+workflow-create`，通过 `POST /open-apis/base/v3/bases/:base_token/workflows` 创建工作流。
  - `shortcuts/base/workflow_enable.go` 声明 `+workflow-enable`，通过 `PATCH /open-apis/base/v3/bases/:base_token/workflows/:workflow_id/enable` 启用工作流。
  - `shortcuts/base/workflow_disable.go` 声明 `+workflow-disable`，通过 `PATCH /open-apis/base/v3/bases/:base_token/workflows/:workflow_id/disable` 禁用工作流。

## 目标工作流 1：状态触发后端同步

业务需求：

```text
当 推送草稿表.status = ready_to_upload 时，向后端 webhook 发送 HTTP 请求，携带 record_id。
```

可用节点：

- `SetRecordTrigger`：监听记录字段被修改，并支持字段级条件。
- `ChangeRecordTrigger`：新增或修改都可触发；如果希望新增记录时也触发，可用它。
- `HTTPClientAction`：向后端发送 HTTP 请求，支持 `method`、`url`、`headers`、`raw_body`。

推荐组合：

```text
SetRecordTrigger -> HTTPClientAction
```

推荐触发条件：

```json
{
  "table_name": "推送草稿表",
  "field_watch_info": [
    {
      "field_name": "status",
      "operator": "is",
      "value": [{ "value_type": "option", "value": { "name": "ready_to_upload" } }]
    }
  ],
  "condition_list": null
}
```

推荐 HTTP body 拼接方式：

```json
[
  { "value_type": "text", "value": "{\"event\":\"wechat_draft_sync\",\"record_id\":\"" },
  { "value_type": "ref", "value": "$.step_trigger.recordId" },
  { "value_type": "text", "value": "\"}" }
]
```

后端收到 `record_id` 后，再结合配置中的 `base_token`、`table_id` 调用：

```bash
lark-cli base +record-get --base-token "<base_token>" --table-id "<table_id>" --record-id "<record_id>" --format json
```

## 目标工作流 2：状态写回后通知用户

业务需求：

```text
后端把 status 写回 uploaded_to_wechat 或 failed 后，飞书消息通知当前操作人。
```

可用节点：

- `SetRecordTrigger`：监听 `status` 字段变化。
- `LarkMessageAction`：发送飞书消息，支持 `receiver`、`title`、`content`、`btn_list`。

推荐组合：

```text
SetRecordTrigger -> LarkMessageAction
```

推荐监听条件：

```json
{
  "table_name": "推送草稿表",
  "field_watch_info": [
    {
      "field_name": "status",
      "operator": "is",
      "value": [{ "value_type": "option", "value": { "name": "uploaded_to_wechat" } }]
    }
  ],
  "condition_list": null
}
```

失败状态可创建第二条分支或第二个通知工作流：

```json
{
  "field_name": "status",
  "operator": "is",
  "value": [{ "value_type": "option", "value": { "name": "failed" } }]
}
```

接收人规则：

```text
当前操作人
```

注意：Workflow schema 支持 `receiver` 使用 `ref`，但“当前操作人”到底映射为哪个触发器输出字段，需要用真实 workflow 返回或实测确认。若无法稳定引用当前操作人，建议模板表增加一个人员字段，例如 `operator` 或 `notify_user`，由前端/用户填写，消息工作流引用该人员字段。

当前阶段补充策略：

- 飞书初始化/授权后，可通过 `lark-cli auth status --json --verify` 获取当前授权用户的 `openId`、`userName`、`scope`、`tokenStatus`。
- 源码依据：`cmd/auth/status.go` 调用 `identitydiag.Diagnose(...)` 输出 user identity 信息；`internal/auth/verify.go` 会调用 `/authen/v1/user_info` 验证用户 token。
- 因此配置阶段可以知道“当前授权用户是谁”，并把该用户作为默认通知人参考。
- 但 workflow 触发时的“当前操作人”是否等同于配置阶段授权用户，仍需真实 workflow 实测；多人场景后续建议增加人员字段。

## 仍需实测确认

- `SetRecordTrigger.field_watch_info.value` 对单选字段是否必须使用 `value_type=option`。
- `$.step_trigger.recordId` 在实际工作流中的输出路径是否稳定。
- “当前操作人”在触发器输出中是否有稳定 ref 路径。
- 后端写回 `status` 是否会再次触发工作流 1；需要通过条件设计避免循环。
- 飞书工作流调用本地后端时必须使用公网可访问 URL，本地阶段需要 ngrok/frp/公网测试服务。

## 当前开发策略

- 模板表自动创建暂时占位，不立刻执行 `table-create/field-create`。
- 工作流创建先保留 JSON 模板和可行性文档。
- 先打通后端接收 `record_id` 并读取完整记录的飞书侧闭环。
