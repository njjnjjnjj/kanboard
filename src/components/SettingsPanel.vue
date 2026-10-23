<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { confirm, open as openDialog, save } from "@tauri-apps/plugin-dialog";
import MarkdownEditor from "./MarkdownEditor.vue";
import { currentSop, loadSopConfig, resetSopConfig } from "../data/sopRepository";
import { buildCustomSopPrompt } from "../drag/agentPrompt";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{
  close: [];
  announce: [message: string];
}>();

const injectedAnnounce = inject<((msg: string) => void) | undefined>("announce", undefined);

function notify(msg: string) {
  if (injectedAnnounce) {
    injectedAnnounce(msg);
  }
  emit("announce", msg);
}

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
const mcpStatus = ref<McpStatus | null>(null);
const mcpLoading = ref(false);
const codexLoading = ref(false);
const antigravityLoading = ref(false);
const sopViewerOpen = ref(false);
const sopResetting = ref(false);
const sopPromptCopied = ref(false);
let sopCopyTimer: ReturnType<typeof setTimeout> | null = null;

const sop = computed(() => currentSop.value);

function handleSopViewerEscape(event: KeyboardEvent) {
  if (event.key !== "Escape" || !sopViewerOpen.value) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  sopViewerOpen.value = false;
}

// 只读正文不可聚焦，Esc 可能落到 body；在窗口捕获阶段统一处理。
watch(sopViewerOpen, (visible) => {
  if (visible) {
    window.addEventListener("keydown", handleSopViewerEscape, true);
  } else {
    window.removeEventListener("keydown", handleSopViewerEscape, true);
  }
}, { flush: "sync" });

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleSopViewerEscape, true);
});

watch(() => props.open, async (visible) => {
  if (!visible) {
    sopViewerOpen.value = false;
    return;
  }
  autostartLoading.value = true;
  try {
    info.value = await invoke<StorageInfo>("get_storage_info");
  } catch (error) {
    notify(`无法读取设置：${String(error)}`);
  }
  try {
    autostartEnabled.value = await isEnabled();
  } catch (error) {
    notify(`无法读取开机自启状态：${String(error)}`);
  } finally {
    autostartLoading.value = false;
  }
  mcpLoading.value = true;
  try {
    mcpStatus.value = await invoke<McpStatus>("get_mcp_status");
  } catch (error) {
    notify(`无法读取 MCP 服务状态：${String(error)}`);
  } finally {
    mcpLoading.value = false;
  }
  await loadSopConfig();
}, { immediate: true });

function close() {
  if (!busy.value && !sopViewerOpen.value) emit("close");
}

function handlePanelKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    if (sopViewerOpen.value) {
      sopViewerOpen.value = false;
      e.stopPropagation();
      return;
    }
    close();
  }
}

async function run(action: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  try {
    await action();
  } catch (error) {
    notify(String(error));
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
    notify(`已导出到 ${path}`);
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
  try {
    if (autostartEnabled.value) {
      await disable();
    } else {
      await enable();
    }
    autostartEnabled.value = await isEnabled();
  } catch (error) {
    notify(`无法更新开机自启：${String(error)}`);
  } finally {
    autostartLoading.value = false;
  }
}

async function toggleMcp() {
  if (mcpLoading.value) return;
  mcpLoading.value = true;
  try {
    mcpStatus.value = await invoke<McpStatus>("set_mcp_enabled", {
      enabled: !mcpStatus.value?.enabled,
    });
    if (mcpStatus.value.enabled && !mcpStatus.value.running) {
      notify(mcpStatus.value.lastError ?? "MCP 服务未能启动。");
    }
  } catch (error) {
    notify(`无法更新 MCP 服务：${String(error)}`);
  } finally {
    mcpLoading.value = false;
  }
}

async function connectCodex() {
  if (codexLoading.value) return;
  codexLoading.value = true;
  try {
    const result = await invoke<{ opened: boolean; marketplacePath: string; deepLink: string }>("connect_codex");
    mcpStatus.value = await invoke<McpStatus>("get_mcp_status");
    notify(
      result.opened
        ? "已打开 Codex，请在插件页面确认安装 Kanboard Agent。"
        : `集成文件已准备好，请在 Codex 中打开：${result.deepLink}`,
    );
  } catch (error) {
    notify(`无法连接 Codex：${String(error)}`);
  } finally {
    codexLoading.value = false;
  }
}

async function connectAntigravity() {
  if (antigravityLoading.value) return;
  antigravityLoading.value = true;
  try {
    const result = await invoke<{ configPath: string; configured: boolean }>("connect_antigravity");
    mcpStatus.value = await invoke<McpStatus>("get_mcp_status");
    notify(`已成功配置 Antigravity！配置已写入 ${result.configPath}。`);
  } catch (error) {
    notify(`无法连接 Antigravity：${String(error)}`);
  } finally {
    antigravityLoading.value = false;
  }
}

async function copyCustomSopPrompt() {
  const prompt = buildCustomSopPrompt(sop.value.summary);
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(prompt);
    } else {
      const ta = document.createElement("textarea");
      ta.value = prompt;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    sopPromptCopied.value = true;
    if (sopCopyTimer) clearTimeout(sopCopyTimer);
    sopCopyTimer = setTimeout(() => {
      sopPromptCopied.value = false;
    }, 2500);
    notify("已复制【自定义 SOP】引导提示词，发送给 Agent 即可开启协同定制。");
  } catch (err) {
    notify(`复制提示词失败：${String(err)}`);
  }
}

async function handleResetSop() {
  if (sopResetting.value) return;
  const approved = await confirm("确定将 SOP 重置为系统默认预置的标准作业流程吗？", {
    title: "重置 SOP 规范",
    kind: "warning",
  });
  if (!approved) return;

  sopResetting.value = true;
  try {
    await resetSopConfig();
    notify("SOP 已成功重置为系统默认规范。");
  } catch (error) {
    notify(`重置 SOP 失败：${String(error)}`);
  } finally {
    sopResetting.value = false;
  }
}
</script>

<template>
  <div v-if="open" class="settings-backdrop" @mousedown.self="close">
    <section class="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title" @keydown="handlePanelKeydown">
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
            <button class="secondary-button" type="button" :disabled="codexLoading || antigravityLoading || mcpLoading" @click="connectCodex">
              {{ codexLoading ? "正在连接…" : "连接到 Codex" }}
            </button>
            <button class="secondary-button" type="button" :disabled="codexLoading || antigravityLoading || mcpLoading" @click="connectAntigravity">
              {{ antigravityLoading ? "正在连接…" : "连接到 Antigravity" }}
            </button>
          </div>
          <small>连接会自动开启 MCP 服务，并写入对应 Agent 的本地插件或配置。服务仅监听 127.0.0.1，重新启动看板后会自动恢复。</small>
        </section>

        <section class="settings-panel__sop-section">
          <div class="settings-panel__toggle-row">
            <div>
              <h3>任务执行 SOP（标准作业流程）</h3>
              <p>规范 Agent 接单、开发、提测与排版验收的执行标准。</p>
            </div>
            <span
              class="sop-status-badge"
              :class="{ 'is-custom': sop.isCustom }"
            >
              {{ sop.isCustom ? "自定义版本" : "系统默认" }}
            </span>
          </div>

          <div class="sop-summary-card">
            <span class="sop-summary-label">当前下发生效概述：</span>
            <p class="sop-summary-text">{{ sop.summary }}</p>
          </div>

          <div class="settings-panel__actions">
            <button
              class="secondary-button"
              type="button"
              @click="sopViewerOpen = true"
            >
              查看完整 SOP
            </button>
            <button
              class="secondary-button"
              type="button"
              :disabled="busy"
              @click="copyCustomSopPrompt"
            >
              {{ sopPromptCopied ? "已复制引导词" : "协同定制 SOP" }}
            </button>
            <button
              v-if="sop.isCustom"
              class="text-button text-button--danger"
              type="button"
              :disabled="sopResetting"
              @click="handleResetSop"
            >
              {{ sopResetting ? "重置中…" : "重置为默认" }}
            </button>
          </div>
          <small>
            通过「协同定制 SOP」复制意图提示词发给 Agent，经您明确确认后自动写入系统生效；点击「查看完整 SOP」可在大屏全屏只读浏览。
          </small>
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
    </section>

    <!-- SOP 规范全屏只读模态框 -->
    <Teleport to="body">
      <div
        v-if="sopViewerOpen"
        class="markdown-fullscreen-modal"
        role="dialog"
        aria-modal="true"
        aria-label="标准作业流程 (SOP) · 全屏只读"
      >
        <header class="markdown-fullscreen-modal__header">
          <div class="markdown-fullscreen-modal__title">
            <strong>标准作业流程 (SOP) · 全屏只读</strong>
            <span class="markdown-fullscreen-modal__task">
              {{ sop.isCustom ? "自定义版本" : "系统默认版本" }}
            </span>
          </div>
          <div class="markdown-fullscreen-modal__info">
            <span class="info-stat">{{ sop.content.length }} 字符</span>
            <span class="info-sep">·</span>
            <span class="info-stat">只读模式</span>
            <span class="info-sep">·</span>
            <button
              type="button"
              class="info-esc-btn"
              title="按 Esc 键或点击退出全屏"
              @click="sopViewerOpen = false"
            >
              <span>按</span>
              <kbd>Esc</kbd>
              <span>退出</span>
            </button>
          </div>
        </header>

        <main class="markdown-fullscreen-modal__body">
          <MarkdownEditor
            :key="sop.content"
            :model-value="sop.content"
            :readonly="true"
            :fullscreen="true"
            label="SOP 规范文档"
            height="100%"
            @toggle-fullscreen="sopViewerOpen = false"
          />
        </main>
      </div>
    </Teleport>
  </div>
</template>
