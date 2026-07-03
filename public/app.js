const $ = (id) => document.getElementById(id);

const output = $("output");
const copyOutputBtn = $("copyOutputBtn");

function showResult(title, payload) {
  const time = new Date().toLocaleString();
  output.textContent = `[${time}] ${title}\n${JSON.stringify(payload, null, 2)}\n\n${output.textContent}`;
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
  return $(id).value.trim();
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

function autofillBaseCoordinates(payload) {
  const raw = payload?.data?.raw;
  const stdout = payload?.data?.stdout || "";
  const baseToken = findDeepValue(raw, ["base_token", "baseToken", "app_token", "appToken"]);
  const tableId = findDeepValue(raw, ["table_id", "tableId"]);
  const viewId = findDeepValue(raw, ["view_id", "viewId"]);

  if (baseToken) {
    $("baseTokenInput").value = baseToken;
  }
  if (tableId) {
    $("tableIdInput").value = tableId;
  }
  if (viewId) {
    $("viewIdInput").value = viewId;
  }

  if (!baseToken && stdout) {
    const baseMatch = stdout.match(/(?:base_token|app_token|baseToken|appToken)["':\s]+([A-Za-z0-9_-]+)/);
    if (baseMatch) {
      $("baseTokenInput").value = baseMatch[1];
    }
  }
  if (!tableId && stdout) {
    const tableMatch = stdout.match(/(?:table_id|tableId)["':\s]+([A-Za-z0-9_-]+)/);
    if (tableMatch) {
      $("tableIdInput").value = tableMatch[1];
    }
  }
}

function renderEnvSummary(payload) {
  const data = payload?.data || {};
  const runtime = data.runtime || {};
  const larkCli = data.larkCli || {};
  const auth = data.auth || {};
  const user = auth.user || {};
  const items = [
    {
      label: "后端主机",
      value: runtime.hostname || "未知",
      detail: `${runtime.platform || "-"} / ${runtime.cwd || "-"}`
    },
    {
      label: "Node.js",
      value: runtime.nodeVersion || "未知",
      detail: `PID ${runtime.pid || "-"} / PORT ${runtime.port || "-"}`
    },
    {
      label: "lark-cli",
      value: larkCli.available ? "可用" : "不可用",
      detail: larkCli.available ? larkCli.version || larkCli.bin || "-" : larkCli.error?.message || larkCli.bin || "-",
      ok: Boolean(larkCli.available)
    },
    {
      label: "授权用户",
      value: auth.available ? user.userName || user.openId || "已授权" : "未授权/不可用",
      detail: auth.available ? `${user.tokenStatus || "-"} / ${user.openId || "-"}` : auth.error?.message || auth.identity || "-",
      ok: Boolean(auth.available)
    }
  ];

  $("envSummary").innerHTML = items
    .map((item) => {
      const className = typeof item.ok === "boolean" ? (item.ok ? " ok" : " warn") : "";
      return `<div class="status-item${className}">
        <span>${item.label}</span>
        <strong>${item.value}</strong>
        <small>${item.detail}</small>
      </div>`;
    })
    .join("");
}

$("checkEnvBtn").addEventListener("click", async (event) => {
  const payload = await withButton(event.currentTarget, "执行环境检查", () => requestJson("/api/system/env"));
  if (payload) {
    renderEnvSummary(payload);
  }
});

$("checkHealthBtn").addEventListener("click", (event) =>
  withButton(event.currentTarget, "服务检查", () => requestJson("/api/health"))
);

$("checkCliBtn").addEventListener("click", (event) =>
  withButton(event.currentTarget, "CLI 检查", () => requestJson("/api/lark/shared/version"))
);

$("initConfigBtn").addEventListener("click", (event) =>
  withButton(event.currentTarget, "飞书配置初始化", () =>
    requestJson("/api/lark/shared/config/init", {
      method: "POST",
      body: JSON.stringify({
        appId: getValue("appIdInput") || undefined,
        appSecret: getValue("appSecretInput") || undefined,
        brand: getValue("brandInput") || "feishu",
        profileName: getValue("profileNameInput") || undefined
      })
    })
  )
);

$("startLoginBtn").addEventListener("click", (event) =>
  withButton(event.currentTarget, "发起用户授权", () =>
    requestJson("/api/lark/shared/auth/login/start", {
      method: "POST",
      body: JSON.stringify({ domains: ["all"] })
    })
  )
);

$("completeLoginBtn").addEventListener("click", (event) =>
  withButton(event.currentTarget, "完成用户授权", () =>
    requestJson("/api/lark/shared/auth/login/complete", {
      method: "POST",
      body: JSON.stringify({ deviceCode: getValue("deviceCodeInput") })
    })
  )
);

$("authStatusBtn").addEventListener("click", (event) =>
  withButton(event.currentTarget, "授权状态", () => requestJson("/api/lark/shared/auth/status"))
);

$("currentUserBtn").addEventListener("click", (event) =>
  withButton(event.currentTarget, "当前授权用户", () => requestJson("/api/lark/shared/auth/current-user"))
);

$("resolveBaseBtn").addEventListener("click", async (event) => {
  const payload = await withButton(event.currentTarget, "解析多维表格链接", () =>
    requestJson("/api/lark/base/resolve-url", {
      method: "POST",
      body: JSON.stringify({ url: getValue("baseUrlInput") })
    })
  );
  autofillBaseCoordinates(payload);
});

$("createTemplateBtn").addEventListener("click", (event) =>
  withButton(event.currentTarget, "创建推送草稿表", () =>
    requestJson("/api/templates/push-draft-table", {
      method: "POST",
      body: JSON.stringify({
        baseToken: getValue("baseTokenInput"),
        tableName: "推送草稿表"
      })
    })
  )
);

$("listFieldsBtn").addEventListener("click", (event) =>
  withButton(event.currentTarget, "读取字段", () =>
    requestJson("/api/lark/base/fields", {
      method: "POST",
      body: JSON.stringify({
        baseToken: getValue("baseTokenInput"),
        tableId: getValue("tableIdInput"),
        limit: Number(getValue("limitInput") || 200),
        offset: Number(getValue("offsetInput") || 0)
      })
    })
  )
);

$("listRecordsBtn").addEventListener("click", (event) =>
  withButton(event.currentTarget, "读取记录", () =>
    requestJson("/api/lark/base/records", {
      method: "POST",
      body: JSON.stringify({
        baseToken: getValue("baseTokenInput"),
        tableId: getValue("tableIdInput"),
        viewId: getValue("viewIdInput") || undefined,
        limit: Number(getValue("limitInput") || 50),
        offset: Number(getValue("offsetInput") || 0)
      })
    })
  )
);

copyOutputBtn.addEventListener("click", async () => {
  await navigator.clipboard.writeText(output.textContent);
  copyOutputBtn.classList.add("copied");
  copyOutputBtn.textContent = "Copied!";
  setTimeout(() => {
    copyOutputBtn.classList.remove("copied");
    copyOutputBtn.textContent = "复制";
  }, 1200);
});

$("clearOutputBtn").addEventListener("click", () => {
  output.textContent = "";
});
