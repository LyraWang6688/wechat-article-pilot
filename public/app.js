const $ = (id) => document.getElementById(id);

const AUTH_DEVICE_CODE_KEY = "wechatArticlePilot.authDeviceCode";
const PROGRESS_STATUS_KEY = "wechatArticlePilot.progressStatus";
const WORKSPACE_STATE_KEY = "wechatArticlePilot.workspaceState";
const DEFAULT_BASE_NAME = "公众号文章同步工作台";
const DEFAULT_TABLE_NAME = "推送草稿表";
let latestNoticeDetail = "";
let isBitableInitializing = false;

const TODO_PROGRESS_MAP = {
  createAppTodo: "progressCreateApp",
  authTodo: "progressAuth",
  wechatAppIdTodo: "progressWechat",
  wechatSecretTodo: "progressWechat"
};

const P0_REQUIRED_USER_SCOPES = [
  "base:app:create",
  "base:table:read",
  "base:table:create",
  "base:table:update",
  "base:table:delete",
  "base:field:read",
  "base:record:read",
  "base:record:create",
  "base:record:update",
  "base:workflow:create",
  "base:workflow:update"
];

function showResult(title, payload) {
  const panel = $("noticePanel");
  const titleElement = $("noticeTitle");
  const summaryElement = $("noticeSummary");
  const detailElement = $("noticeDetail");
  const linkElement = $("noticeLink");
  const ok = payload?.ok !== false && !payload?.error;
  const notice = buildNotice(title, payload, ok);

  latestNoticeDetail = JSON.stringify(payload, null, 2);
  panel.hidden = false;
  panel.className = `notice-panel ${ok ? "ok" : "warn"}`;
  titleElement.textContent = title;
  summaryElement.textContent = notice.summary;
  detailElement.textContent = latestNoticeDetail;
  if (notice.link) {
    linkElement.hidden = false;
    linkElement.href = notice.link;
    linkElement.textContent = notice.linkText || "打开链接";
  } else {
    linkElement.hidden = true;
    linkElement.removeAttribute("href");
  }
}

function buildNotice(title, payload, ok) {
  if (!ok) {
    return {
      summary: payload?.error?.message || payload?.message || "操作失败，请查看技术详情或联系开发者。"
    };
  }

  const raw = payload?.data?.raw;
  const verificationUrl = findDeepValue(raw, [
    "verification_url",
    "verification_uri",
    "verification_uri_complete",
    "verificationUrl",
    "verificationUri"
  ]);
  const userCode = findDeepValue(raw, ["user_code", "userCode"]);
  const deviceCode = findDeepValue(raw, ["device_code", "deviceCode"]);
  const baseToken = payload?.data?.baseToken || findDeepValue(raw, ["base_token", "baseToken", "app_token", "appToken"]);
  const tableId = payload?.data?.tableId || findDeepValue(raw, ["table_id", "tableId"]);
  const baseUrl = payload?.data?.baseUrl || findDeepValue(raw, ["url", "base_url", "baseUrl", "app_url", "appUrl"]);

  if (verificationUrl) {
    return {
      summary: userCode ? `请打开授权链接完成操作。页面验证码：${userCode}。` : "请打开授权链接完成操作。",
      link: verificationUrl,
      linkText: "打开授权链接"
    };
  }
  if (deviceCode) {
    return { summary: "授权已发起。请打开飞书授权页面完成授权，然后回到本页点击“我已完成授权”。" };
  }
  if (baseToken && tableId) {
    return {
      summary: baseUrl ? "模板数据表已创建，可以打开多维表格查看。" : "模板数据表已创建，系统已自动保存后续工作流所需信息。",
      link: baseUrl,
      linkText: "打开多维表格"
    };
  }
  if (title.includes("工作流")) {
    return { summary: "工作流创建流程已完成，请到飞书多维表格中确认是否启用成功。" };
  }
  if (title.includes("创建多维表格")) {
    return {
      summary: baseUrl ? "多维表格已创建，系统将继续新增推送草稿表。" : "多维表格已创建，系统将继续下一步。",
      link: baseUrl,
      linkText: "打开多维表格"
    };
  }
  if (title.includes("新增推送草稿表")) {
    return { summary: "推送草稿表已新增，系统将继续创建自动化推送工作流。" };
  }
  if (title.includes("自动化推送")) {
    return { summary: "自动化推送工作流已创建，系统将继续创建结果提醒工作流。" };
  }
  if (title.includes("自动提醒")) {
    return {
      summary: "多维表格、数据表和两条工作流都已创建完成。现在可以打开多维表格查看。",
      link: getWorkspaceState().baseUrl,
      linkText: "打开多维表格"
    };
  }
  if (title.includes("授权")) {
    return { summary: "授权状态已更新，可以继续下一步。" };
  }
  return { summary: "操作完成，可以继续下一步。" };
}

function setBusy(button, busy) {
  button.disabled = busy;
  button.dataset.originalText ||= button.textContent;
  button.textContent = busy ? "处理中..." : button.dataset.originalText;
}

async function requestJson(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw payload;
  }
  return payload;
}

async function withButton(button, title, action) {
  try {
    setBusy(button, true);
    const payload = await action();
    showResult(title, payload);
    return payload;
  } catch (error) {
    showResult(`${title}失败`, error);
    return null;
  } finally {
    setBusy(button, false);
  }
}

function getValue(id) {
  return $(id)?.value.trim() || "";
}

function loadProgressStatus() {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_STATUS_KEY) || "{}");
  } catch (_error) {
    return {};
  }
}

function saveProgressStatus(status) {
  localStorage.setItem(PROGRESS_STATUS_KEY, JSON.stringify(status));
}

function setStepStatus(id, status) {
  const element = $(id);
  if (!element) {
    return;
  }
  element.className = `progress-item ${status}`;
  const stored = loadProgressStatus();
  stored[id] = status;
  saveProgressStatus(stored);
}

function setTodoStatus(id, status) {
  const element = $(id);
  if (!element) {
    return;
  }
  element.className = `todo-dot ${status}`;
  const progressId = TODO_PROGRESS_MAP[id];
  if (progressId) {
    setStepStatus(progressId, status);
  }
}

function setAutomationStepStatus(id, status) {
  const element = $(id);
  if (!element) {
    return;
  }
  element.className = `automation-step ${status}`;
  const dot = element.querySelector(".todo-dot");
  if (dot) {
    dot.className = `todo-dot ${status}`;
  }
}

function resetBitableAutomationSteps() {
  ["bitableBaseStep", "bitableTableStep", "bitableSyncWorkflowStep", "bitableNotifyWorkflowStep"].forEach((id) =>
    setAutomationStepStatus(id, "pending")
  );
}

function setInputValue(id, value) {
  const element = $(id);
  if (element && value) {
    element.value = value;
  }
}

function getWebhookUrl() {
  return `${window.location.origin}/api/webhooks/feishu/base-record-sync`;
}

function saveWorkspaceState(state) {
  sessionStorage.setItem(WORKSPACE_STATE_KEY, JSON.stringify(state));
}

function getWorkspaceState() {
  try {
    return JSON.parse(sessionStorage.getItem(WORKSPACE_STATE_KEY) || "{}");
  } catch (_error) {
    return {};
  }
}

function updateWorkspaceLink(state = getWorkspaceState()) {
  const link = $("workspaceLinkStatus");
  const text = $("workspaceTextStatus");
  if (state.baseUrl) {
    link.hidden = false;
    link.href = state.baseUrl;
    text.hidden = true;
    return;
  }
  link.hidden = true;
  link.removeAttribute("href");
  text.hidden = false;
  text.textContent = state.baseToken && state.tableId ? "已创建，链接暂未返回" : "等待用户授权完成";
}

async function runBitableInitialization() {
  if (isBitableInitializing) {
    return;
  }
  isBitableInitializing = true;
  resetBitableAutomationSteps();
  setStepStatus("progressTable", "active");
  setStepStatus("progressWorkflow", "pending");
  updateWorkspaceLink({});

  try {
    setAutomationStepStatus("bitableBaseStep", "active");
    showResult("正在创建多维表格", {
      ok: true,
      data: {
        message: "正在创建公众号文章同步工作台。"
      }
    });
    const basePayload = await requestJson("/api/templates/wechat-draft/base", {
      method: "POST",
      body: JSON.stringify({
        baseName: DEFAULT_BASE_NAME
      })
    });
    const baseState = {
      baseName: basePayload.data?.baseName || DEFAULT_BASE_NAME,
      baseToken: basePayload.data?.baseToken,
      baseUrl: basePayload.data?.baseUrl
    };
    saveWorkspaceState(baseState);
    updateWorkspaceLink(baseState);
    setAutomationStepStatus("bitableBaseStep", "done");
    showResult("创建多维表格完成", basePayload);

    setAutomationStepStatus("bitableTableStep", "active");
    showResult("正在新增推送草稿表", {
      ok: true,
      data: {
        message: "正在新增推送草稿表并创建模板字段。"
      }
    });
    const tablePayload = await requestJson("/api/templates/wechat-draft/table", {
      method: "POST",
      body: JSON.stringify({
        baseToken: baseState.baseToken,
        tableName: DEFAULT_TABLE_NAME
      })
    });
    const workspace = {
      ...baseState,
      tableName: tablePayload.data?.tableName || DEFAULT_TABLE_NAME,
      tableId: tablePayload.data?.tableId
    };
    saveWorkspaceState(workspace);
    updateWorkspaceLink(workspace);
    setAutomationStepStatus("bitableTableStep", "done");
    setStepStatus("progressTable", "done");
    showResult("新增推送草稿表完成", tablePayload);

    setStepStatus("progressWorkflow", "active");
    setAutomationStepStatus("bitableSyncWorkflowStep", "active");
    showResult("正在创建自动化推送工作流", {
      ok: true,
      data: {
        message: "正在创建状态触发后端 webhook 的工作流。"
      }
    });
    const syncWorkflowPayload = await requestJson("/api/templates/wechat-draft/workflow", {
      method: "POST",
      body: JSON.stringify({
        baseToken: workspace.baseToken,
        tableId: workspace.tableId,
        tableName: workspace.tableName,
        webhookUrl: getWebhookUrl(),
        workflowType: "sync",
        enable: true
      })
    });
    setAutomationStepStatus("bitableSyncWorkflowStep", "done");
    showResult("创建自动化推送工作流完成", syncWorkflowPayload);

    setAutomationStepStatus("bitableNotifyWorkflowStep", "active");
    showResult("正在创建自动提醒推送结果工作流", {
      ok: true,
      data: {
        message: "正在创建同步结果飞书消息提醒工作流。"
      }
    });
    const notifyWorkflowPayload = await requestJson("/api/templates/wechat-draft/workflow", {
      method: "POST",
      body: JSON.stringify({
        baseToken: workspace.baseToken,
        tableId: workspace.tableId,
        tableName: workspace.tableName,
        webhookUrl: getWebhookUrl(),
        workflowType: "notify",
        enable: true
      })
    });
    setAutomationStepStatus("bitableNotifyWorkflowStep", "done");
    setStepStatus("progressWorkflow", "done");
    showResult("创建自动提醒推送结果工作流完成", notifyWorkflowPayload);
  } catch (error) {
    const activeStep = document.querySelector(".automation-step.active");
    if (activeStep?.id) {
      setAutomationStepStatus(activeStep.id, "warn");
    }
    if ($("progressTable")?.className.includes("active")) {
      setStepStatus("progressTable", "warn");
    }
    if ($("progressWorkflow")?.className.includes("active")) {
      setStepStatus("progressWorkflow", "warn");
    }
    showResult("多维表格自动初始化失败", error);
  } finally {
    isBitableInitializing = false;
  }
}

function setDeviceCode(value) {
  if (value) {
    sessionStorage.setItem(AUTH_DEVICE_CODE_KEY, value);
  }
  const stored = value || sessionStorage.getItem(AUTH_DEVICE_CODE_KEY) || "";
  const element = $("deviceCodeStatus");
  if (element) {
    element.textContent = stored ? "已发起，请完成飞书授权" : "尚未开始";
  }
  return stored;
}

function restoreProgress() {
  const stored = loadProgressStatus();
  Object.entries(stored).forEach(([id, status]) => {
    const element = $(id);
    if (element) {
      element.className = `progress-item ${status}`;
    }
  });
  setDeviceCode("");
  updateWorkspaceLink();
  updateWechatTodos();
}

function findDeepValue(value, keys) {
  if (!value || typeof value !== "object") {
    return "";
  }
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(value, key) && typeof value[key] === "string") {
      return value[key];
    }
  }
  for (const child of Object.values(value)) {
    const found = findDeepValue(child, keys);
    if (found) {
      return found;
    }
  }
  return "";
}

function updateWechatTodos() {
  const hasAppId = Boolean(getValue("wechatAppIdInput"));
  const hasSecret = Boolean(getValue("wechatSecretInput"));
  setTodoStatus("wechatAppIdTodo", hasAppId ? "done" : "pending");
  setTodoStatus("wechatSecretTodo", hasSecret ? "done" : "pending");
  setStepStatus("progressWechat", hasAppId && hasSecret ? "done" : hasAppId || hasSecret ? "active" : "pending");
}

$("initConfigBtn").addEventListener("click", async (event) => {
  setTodoStatus("createAppTodo", "active");
  const payload = await withButton(event.currentTarget, "飞书应用初始化", () =>
    requestJson("/api/lark/shared/config/init", {
      method: "POST",
      body: JSON.stringify({})
    })
  );
  setTodoStatus("createAppTodo", payload ? "done" : "warn");
});

$("startLoginBtn").addEventListener("click", async (event) => {
  setTodoStatus("authTodo", "active");
  const payload = await withButton(event.currentTarget, "发起用户授权", () =>
    requestJson("/api/lark/shared/auth/login/start", {
      method: "POST",
      body: JSON.stringify({ scopes: P0_REQUIRED_USER_SCOPES })
    })
  );
  const deviceCode = findDeepValue(payload?.data?.raw, ["device_code", "deviceCode"]);
  setDeviceCode(deviceCode);
  setTodoStatus("authTodo", deviceCode ? "active" : "warn");
});

$("completeLoginBtn").addEventListener("click", async (event) => {
  const deviceCode = setDeviceCode("");
  if (!deviceCode) {
    showResult("完成用户授权失败", {
      ok: false,
      error: {
        code: "MISSING_DEVICE_CODE",
        message: "请先点击“开始授权”，打开授权链接完成飞书授权后，再点击“我已完成授权”。"
      }
    });
    setTodoStatus("authTodo", "warn");
    return;
  }
  const payload = await withButton(event.currentTarget, "完成用户授权", () =>
    requestJson("/api/lark/shared/auth/login/complete", {
      method: "POST",
      body: JSON.stringify({ deviceCode })
    })
  );
  setTodoStatus("authTodo", payload ? "done" : "warn");
  if (payload) {
    await runBitableInitialization();
  }
});

$("wechatAppIdInput").addEventListener("input", updateWechatTodos);
$("wechatSecretInput").addEventListener("input", updateWechatTodos);

$("copyNoticeBtn").addEventListener("click", async (event) => {
  await navigator.clipboard.writeText(latestNoticeDetail);
  event.currentTarget.classList.add("copied");
  event.currentTarget.textContent = "Copied!";
  setTimeout(() => {
    event.currentTarget.classList.remove("copied");
    event.currentTarget.textContent = "复制详情";
  }, 1200);
});

$("clearNoticeBtn").addEventListener("click", () => {
  $("noticePanel").hidden = true;
});

restoreProgress();
