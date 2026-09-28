<script setup lang="ts">
import { ref, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { confirm, open as openDialog, save } from "@tauri-apps/plugin-dialog";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

interface StorageInfo {
  path: string;
  directory: string;
  version: string;
}

interface McpStatus {
  enabled: boolean;
  running: boolean;
  url: string;
  lastError: string | null;
}

const info = ref<StorageInfo | null>(null);
const busy = ref(false);
const autostartEnabled = ref(false);
const autostartLoading = ref(false);
const message = ref("");
const mcpStatus = ref<McpStatus | null>(null);
const mcpLoading = ref(false);
const codexLoading = ref(false);

watch(() => props.open, async (visible) => {
  if (!visible) return;
  message.value = "";
  autostartLoading.value = true;
  try {
    info.value = await invoke<StorageInfo>("get_storage_info");
  } catch (error) {
    message.value = `无法读取设置：${String(error)}`;
  }
  try {
    autostartEnabled.value = await isEnabled();
  } catch (error) {
    message.value = `无法读取开机自启状态：${String(error)}`;
  } finally {
    autostartLoading.value = false;
  }
  mcpLoading.value = true;
  try {
    mcpStatus.value = await invoke<McpStatus>("get_mcp_status");
  } catch (error) {
    message.value = `无法读取 MCP 服务状态：${String(error)}`;
  } finally {
    mcpLoading.value = false;
  }
}, { immediate: true });

function close() {
  if (!busy.value) emit("close");
}

async function run(action: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  message.value = "";
  try {
    await action();
  } catch (error) {
    message.value = String(error);
  } finally {
    busy.value = false;
  }
}

function exportBackup() {
  return run(async () => {
    const path = await save({
      title: "导出看板数据",
      defaultPath: `kanboard-backup-${new Date().toISOString().slice(0, 10)}.db`,
      filters: [{ name: "SQLite 数据库", extensions: ["db"] }],
    });
    if (!path) return;
    await invoke("export_data", { path });
    message.value = `已导出到 ${path}`;
  });
}

function importBackup() {
  return run(async () => {
    const path = await openDialog({
      title: "选择看板备份",
      multiple: false,
      directory: false,
      filters: [{ name: "SQLite 数据库", extensions: ["db", "sqlite", "sqlite3"] }],
    });
    if (!path) return;
    const approved = await confirm("导入将替换当前任务和项目数据。替换前的数据库会留在原目录中，确定继续吗？", {
      title: "导入看板数据",
      kind: "warning",
    });
    if (!approved) return;
    await invoke("import_data", { path });
    window.location.reload();
  });
}

function changeDirectory() {
  return run(async () => {
    const directory = await openDialog({ title: "选择新的数据存储目录", directory: true, multiple: false });
    if (!directory) return;
    const updated = await invoke<StorageInfo>("move_storage", { directory });
    if (updated.path !== info.value?.path) window.location.reload();
  });
}

async function toggleAutostart() {
  if (autostartLoading.value) return;
  autostartLoading.value = true;
  message.value = "";
  try {
    if (autostartEnabled.value) {
      await disable();
    } else {
      await enable();
    }
    autostartEnabled.value = await isEnabled();
  } catch (error) {
    message.value = `无法更新开机自启：${String(error)}`;
  } finally {
    autostartLoading.value = false;
  }
}

async function toggleMcp() {
  if (mcpLoading.value) return;
  mcpLoading.value = true;
  message.value = "";
  try {
    mcpStatus.value = await invoke<McpStatus>("set_mcp_enabled", {
      enabled: !mcpStatus.value?.enabled,
    });
    if (mcpStatus.value.enabled && !mcpStatus.value.running) {
      message.value = mcpStatus.value.lastError ?? "MCP 服务未能启动。";
    }
  } catch (error) {
    message.value = `无法更新 MCP 服务：${String(error)}`;
  } finally {
    mcpLoading.value = false;
  }
}

async function connectCodex() {
  if (codexLoading.value) return;
  codexLoading.value = true;
  message.value = "";
  try {
    const result = await invoke<{ opened: boolean; marketplacePath: string; deepLink: string }>("connect_codex");
    mcpStatus.value = await invoke<McpStatus>("get_mcp_status");
    message.value = result.opened
      ? "已打开 Codex，请在插件页面确认安装 Kanboard Agent。"
      : `集成文件已准备好，请在 Codex 中打开：${result.deepLink}`;
  } catch (error) {
    message.value = `无法连接 Codex：${String(error)}`;
  } finally {
    codexLoading.value = false;
  }
}
</script>

<template>
  <div v-if="open" class="settings-backdrop" @mousedown.self="close">
    <section class="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title" @keydown.esc.stop="close">
      <header>
        <div><h2 id="settings-title">设置</h2><p>本地数据与应用信息</p></div>
        <button class="icon-button" type="button" aria-label="关闭设置" :disabled="busy" @click="close"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" /></svg></button>
      </header>

      <div class="settings-panel__body">
        <section>
          <div class="settings-panel__toggle-row">
            <div>
              <h3>开机自启</h3>
              <p>登录系统后自动启动看板。</p>
            </div>
            <button
              class="settings-toggle"
              type="button"
              role="switch"
              :aria-checked="autostartEnabled"
              :aria-label="autostartEnabled ? '关闭开机自启' : '开启开机自启'"
              :disabled="autostartLoading"
              @click="toggleAutostart"
            >
              <span aria-hidden="true"></span>
            </button>
          </div>
        </section>

        <section>
          <div class="settings-panel__toggle-row">
            <div>
              <h3>AI 集成</h3>
              <p>允许 Codex 等 Agent 通过本机只读 MCP 服务获取当前看板数据。</p>
            </div>
            <button
              class="settings-toggle"
              type="button"
              role="switch"
              :aria-checked="mcpStatus?.enabled ?? false"
              :aria-label="mcpStatus?.enabled ? '关闭 MCP 服务' : '开启 MCP 服务'"
              :disabled="mcpLoading"
              @click="toggleMcp"
            >
              <span aria-hidden="true"></span>
            </button>
          </div>
          <div class="settings-panel__service-status" :class="{ 'is-running': mcpStatus?.running }">
            <span aria-hidden="true"></span>
            <span v-if="mcpStatus?.running">MCP 服务运行中 · {{ mcpStatus.url }}</span>
            <span v-else-if="mcpStatus?.enabled">MCP 服务启动失败</span>
            <span v-else>MCP 服务未开启</span>
          </div>
          <p v-if="mcpStatus?.lastError" class="settings-panel__service-error">{{ mcpStatus.lastError }}</p>
          <div class="settings-panel__actions">
            <button class="secondary-button" type="button" :disabled="codexLoading || mcpLoading" @click="connectCodex">
              {{ codexLoading ? "正在连接…" : "连接到 Codex" }}
            </button>
          </div>
          <small>连接会自动开启 MCP 服务，并在 Codex 中打开本地 Kanboard Agent 插件。服务仅监听 127.0.0.1，重新启动看板后会自动恢复。</small>
        </section>

        <section>
          <h3>数据备份</h3>
          <p>将任务、项目、标签及相关记录导出为 SQLite 文件，或从备份恢复。</p>
          <div class="settings-panel__actions">
            <button class="secondary-button" type="button" :disabled="busy || !info" @click="exportBackup">导出数据</button>
            <button class="secondary-button" type="button" :disabled="busy || !info" @click="importBackup">导入数据</button>
          </div>
        </section>

        <section>
          <h3>数据存储位置</h3>
          <p>当前数据库文件</p>
          <code class="settings-panel__path">{{ info?.path ?? "读取中…" }}</code>
          <div class="settings-panel__actions">
            <button class="secondary-button" type="button" :disabled="busy || !info" @click="changeDirectory">更改目录并迁移</button>
          </div>
          <small>迁移后会从新目录读取数据；原文件会保留，便于需要时恢复。</small>
        </section>

        <section class="settings-panel__version">
          <h3>关于</h3>
          <p>当前版本 {{ info?.version ?? "读取中…" }}</p>
        </section>
      </div>
      <p v-if="message" class="settings-panel__message" role="status">{{ message }}</p>
    </section>
  </div>
</template>
