const $ = (id) => document.getElementById(id);

const AUTH_DEVICE_CODE_KEY = "wechatArticlePilot.authDeviceCode";
const PROGRESS_STATUS_KEY = "wechatArticlePilot.progressStatus";
const WORKSPACE_STATE_KEY = "wechatArticlePilot.workspaceState";
const DEFAULT_BASE_NAME = "公众号文章同步工作台";
const DEFAULT_TABLE_NAME = "推送草稿表";
let latestNoticeDetail = "";
let isBitableInitializing = false;
let configInitPollTimer = null;
let currentWizardPanel = 0;

const TODO_PROGRESS_MAP = {
  createAppTodo: "progressCreateApp",
  authTodo: "progressAuth",
  wechatAppIdTodo: "progressWechat",
  wechatSecretTodo: "progressWechat"
};

const PROGRESS_STEP_IDS = ["progressCreateApp", "progressAuth", "progressTable", "progressWorkflow", "progressWechat"];
const WIZARD_PANELS = [
  {
    title: "飞书应用初始化",
    hint: "先完成创建新应用和用户授权",
    progressIds: ["progressCreateApp", "progressAuth"]
  },
  {
    title: "多维表格初始化",
    hint: "系统会自动创建工作台、数据表和工作流",
    progressIds: ["progressTable", "progressWorkflow"]
  },
  {
    title: "微信公众号信息",
    hint: "先预留公众号 AppID 和 AppSecret",
    progressIds: ["progressWechat"]
  }
];

const P0_REQUIRED_USER_SCOPES = [
  "base:app:create",
  "base:table:read",
  "base:table:create",
  "base:table:update",
  "base:table:delete",
  "base:field:read",
  "base:field:create",
  "base:field:update",
  "base:view:write_only",
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
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
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
  const verificationUrl = normalizeUrl(
    payload?.data?.verificationUrl ||
      findDeepValue(raw, ["verification_url", "verification_uri", "verification_uri_complete", "verificationUrl", "verificationUri"])
  );
  const userCode = findDeepValue(raw, ["user_code", "userCode"]);
  const deviceCode = payload?.data?.deviceCode || findDeepValue(raw, ["device_code", "deviceCode"]);
  const configInitUrl = normalizeUrl(payload?.data?.verificationUrl || "");
  const baseToken = payload?.data?.baseToken || findDeepValue(raw, ["base_token", "baseToken", "app_token", "appToken"]);
  const tableId = payload?.data?.tableId || findDeepValue(raw, ["table_id", "tableId"]);
  const baseUrl = normalizeUrl(payload?.data?.baseUrl || findDeepValue(raw, ["url", "base_url", "baseUrl", "app_url", "appUrl"]));

  if (configInitUrl) {
    return {
      summary:
        payload?.data?.status === "completed"
          ? "新应用创建流程已完成，可以继续进行用户授权。"
          : "请打开飞书引导链接，按页面提示完成新应用创建。",
      link: configInitUrl,
      linkText: "打开飞书引导链接"
    };
  }
  if (payload?.data?.sessionId && payload?.data?.status === "running") {
    return { summary: "创建新应用流程已启动，正在等待飞书返回引导链接。" };
  }
  if (payload?.data?.status === "completed") {
    return { summary: "新应用创建流程已完成，可以继续进行用户授权。" };
  }
  if (payload?.data?.status === "failed") {
    return { summary: "新应用创建流程失败，请查看技术详情或服务器日志。" };
  }

  if (verificationUrl) {
    return {
      summary: userCode ? `请打开授权链接完成飞书授权。页面验证码：${userCode}。` : "请打开授权链接完成飞书授权。",
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
  updateStatusBadge(element, status);
  const stored = loadProgressStatus();
  stored[id] = status;
  saveProgressStatus(stored);
  updateProgressOverview();
  updateWizardProgressHighlight();
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

function updateStatusBadge(container, status) {
  const badge = container.querySelector(".step-badge");
  if (!badge) {
    return;
  }
  badge.className = `status-badge step-badge ${status}`;
  badge.textContent = getStatusLabel(status);
}

function getStatusLabel(status) {
  if (status === "done") {
    return "已完成";
  }
  if (status === "active") {
    return "配置中";
  }
  if (status === "warn") {
    return "需处理";
  }
  return "待配置";
}

function updateProgressOverview() {
  const statuses = PROGRESS_STEP_IDS.map((id) => {
    const element = $(id);
    return element?.classList.contains("done") ? "done" : element?.classList.contains("warn") ? "warn" : element?.classList.contains("active") ? "active" : "pending";
  });
  const doneCount = statuses.filter((status) => status === "done").length;
  const warnCount = statuses.filter((status) => status === "warn").length;
  const percent = Math.round((doneCount / PROGRESS_STEP_IDS.length) * 100);
  const remaining = PROGRESS_STEP_IDS.length - doneCount;
  const overviewStatus = $("overviewStatus");

  if ($("overviewCompletedCount")) {
    $("overviewCompletedCount").textContent = String(doneCount);
  }
  if ($("overviewRemainingCount")) {
    $("overviewRemainingCount").textContent = String(remaining);
  }
  if ($("overviewPercent")) {
    $("overviewPercent").textContent = String(percent);
  }
  if ($("overviewBar")) {
    $("overviewBar").style.width = `${percent}%`;
  }
  if (overviewStatus) {
    overviewStatus.className = `status-badge ${warnCount ? "warn" : doneCount === PROGRESS_STEP_IDS.length ? "done" : "active"}`;
    overviewStatus.textContent = warnCount ? "需处理" : doneCount === PROGRESS_STEP_IDS.length ? "已完成" : "配置中";
  }
}

function setWizardPanel(index, options = {}) {
  const nextIndex = Math.max(0, Math.min(WIZARD_PANELS.length - 1, index));
  currentWizardPanel = nextIndex;
  document.querySelectorAll("[data-wizard-panel]").forEach((panel) => {
    panel.hidden = Number(panel.dataset.wizardPanel) !== nextIndex;
  });
  updateWizardNav();
  updateWizardProgressHighlight();
  syncWizardHeight();
  if (options.scroll !== false) {
    document.querySelector(".wizard-shell")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function updateWizardNav() {
  const panel = WIZARD_PANELS[currentWizardPanel];
  const prevButton = $("wizardPrevBtn");
  const nextButton = $("wizardNextBtn");
  if ($("wizardStepLabel")) {
    $("wizardStepLabel").textContent = `${currentWizardPanel + 1} / ${WIZARD_PANELS.length}`;
  }
  if ($("wizardPanelTitle")) {
    $("wizardPanelTitle").textContent = panel.title;
  }
  if ($("wizardPanelHint")) {
    $("wizardPanelHint").textContent = panel.hint;
  }
  if (prevButton) {
    prevButton.disabled = currentWizardPanel === 0;
  }
  if (nextButton) {
    nextButton.disabled = currentWizardPanel === WIZARD_PANELS.length - 1;
  }
}

function updateWizardProgressHighlight() {
  document.querySelectorAll(".progress-item").forEach((item) => item.classList.remove("current-panel"));
  const panel = WIZARD_PANELS[currentWizardPanel];
  panel.progressIds.forEach((id) => $(id)?.classList.add("current-panel"));
}

function syncWizardHeight() {
  const progressPanel = document.querySelector(".progress-panel");
  const wizardShell = document.querySelector(".wizard-shell");
  if (!progressPanel || !wizardShell || window.matchMedia("(max-width: 760px)").matches) {
    wizardShell?.style.removeProperty("--wizard-shell-height");
    wizardShell?.style.removeProperty("--wizard-panel-height");
    return;
  }
  const navHeight = document.querySelector(".wizard-nav")?.getBoundingClientRect().height || 0;
  const shellGap = 10;
  const shellHeight = Math.round(progressPanel.getBoundingClientRect().height);
  const panelHeight = Math.max(280, shellHeight - Math.round(navHeight) - shellGap);
  wizardShell.style.setProperty("--wizard-shell-height", `${shellHeight}px`);
  wizardShell.style.setProperty("--wizard-panel-height", `${panelHeight}px`);
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

function stopConfigInitPolling() {
  if (configInitPollTimer) {
    clearTimeout(configInitPollTimer);
    configInitPollTimer = null;
  }
}

function setConfigLink(value) {
  const link = $("configLinkStatus");
  const text = $("configLinkText");
  const url = normalizeUrl(value);
  if (!link || !text) {
    return;
  }
  if (!url) {
    link.hidden = true;
    link.removeAttribute("href");
    text.hidden = false;
    text.textContent = "点击创建后显示";
    return;
  }
  link.hidden = false;
  link.href = url;
  text.hidden = true;
}

function pollConfigInitStatus(sessionId, attempt = 0) {
  stopConfigInitPolling();
  if (!sessionId || attempt >= 300) {
    return;
  }

  configInitPollTimer = setTimeout(async () => {
    try {
      const payload = await requestJson(`/api/lark/shared/config/init/status?sessionId=${encodeURIComponent(sessionId)}`);
      showResult("创建新应用", payload);
      setConfigLink(payload.data?.verificationUrl);
      if (payload.data?.status === "completed") {
        setTodoStatus("createAppTodo", "done");
        stopConfigInitPolling();
        return;
      }
      if (payload.data?.status === "failed" || payload.data?.status === "not_found") {
        setTodoStatus("createAppTodo", "warn");
        stopConfigInitPolling();
        return;
      }
      setTodoStatus("createAppTodo", "active");
      pollConfigInitStatus(sessionId, attempt + 1);
    } catch (error) {
      showResult("检查创建新应用进度失败", error);
      setTodoStatus("createAppTodo", "warn");
      stopConfigInitPolling();
    }
  }, 2000);
}

async function runBitableInitialization() {
  if (isBitableInitializing) {
    return;
  }
  isBitableInitializing = true;
  setWizardPanel(1);
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

function setAuthLink(value) {
  const link = $("authLinkStatus");
  const url = normalizeUrl(value);
  if (!link) {
    return;
  }
  if (!url) {
    link.hidden = true;
    link.removeAttribute("href");
    return;
  }
  link.hidden = false;
  link.href = url;
}

function restoreProgress() {
  const stored = loadProgressStatus();
  Object.entries(stored).forEach(([id, status]) => {
    const element = $(id);
    if (element) {
      element.className = `progress-item ${status}`;
      updateStatusBadge(element, status);
    }
  });
  setDeviceCode("");
  setConfigLink("");
  setAuthLink("");
  updateWorkspaceLink();
  updateWechatTodos();
  updateProgressOverview();
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

function normalizeUrl(value) {
  if (!value || typeof value !== "string") {
    return "";
  }
  const [url = ""] = value.match(/https?:\/\/[^\s`"'<>]+/g) || [];
  return url.replace(/[),.;，。]+$/, "");
}

function updateWechatTodos() {
  const hasAppId = Boolean(getValue("wechatAppIdInput"));
  const hasSecret = Boolean(getValue("wechatSecretInput"));
  setTodoStatus("wechatAppIdTodo", hasAppId ? "done" : "pending");
  setTodoStatus("wechatSecretTodo", hasSecret ? "done" : "pending");
  setStepStatus("progressWechat", hasAppId && hasSecret ? "done" : hasAppId || hasSecret ? "active" : "pending");
}

$("initConfigBtn").addEventListener("click", async (event) => {
  stopConfigInitPolling();
  setTodoStatus("createAppTodo", "active");
  const payload = await withButton(event.currentTarget, "创建新应用", () =>
    requestJson("/api/lark/shared/config/init", {
      method: "POST",
      body: JSON.stringify({})
    })
  );
  if (!payload) {
    setTodoStatus("createAppTodo", "warn");
    return;
  }
  setTodoStatus("createAppTodo", payload.data?.status === "completed" ? "done" : "active");
  pollConfigInitStatus(payload.data?.sessionId);
});

$("startLoginBtn").addEventListener("click", async (event) => {
  setTodoStatus("authTodo", "active");
  const payload = await withButton(event.currentTarget, "发起用户授权", () =>
    requestJson("/api/lark/shared/auth/login/start", {
      method: "POST",
      body: JSON.stringify({ scopes: P0_REQUIRED_USER_SCOPES })
    })
  );
  const deviceCode = payload?.data?.deviceCode || "";
  const verificationUrl = payload?.data?.verificationUrl || "";
  setDeviceCode(deviceCode);
  setAuthLink(verificationUrl);
  setTodoStatus("authTodo", deviceCode ? "active" : "warn");
  if (deviceCode) {
    event.currentTarget.textContent = "重新获取授权链接";
    event.currentTarget.dataset.originalText = "重新获取授权链接";
  }
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
    setWizardPanel(1);
    await runBitableInitialization();
  }
});

$("wechatAppIdInput").addEventListener("input", updateWechatTodos);
$("wechatSecretInput").addEventListener("input", updateWechatTodos);

$("wizardPrevBtn").addEventListener("click", () => setWizardPanel(currentWizardPanel - 1));
$("wizardNextBtn").addEventListener("click", () => setWizardPanel(currentWizardPanel + 1));
document.querySelectorAll("[data-wizard-target]").forEach((item) => {
  const openTargetPanel = () => setWizardPanel(Number(item.dataset.wizardTarget || 0));
  item.addEventListener("click", openTargetPanel);
  item.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openTargetPanel();
    }
  });
});
window.addEventListener("resize", syncWizardHeight);

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
setWizardPanel(0, { scroll: false });
