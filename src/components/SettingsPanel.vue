<script setup lang="ts">
import SurfaceMotion from "./SurfaceMotion.vue";
import { computed, inject, onBeforeUnmount, ref, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { confirm, open as openDialog, save } from "@tauri-apps/plugin-dialog";
import {
  Bot,
  Database,
  FileText,
  Gauge,
  Minus,
  Plus,
  SlidersHorizontal,
  X,
} from "lucide-vue-next";
import MarkdownEditor from "./MarkdownEditor.vue";
import { currentSop, loadSopConfig, resetSopConfig, TASK_DESCRIPTION_POLICY } from "../data/sopRepository";
import { buildCustomSopPrompt } from "../drag/agentPrompt";
import { loadColumns, updateColumnWipLimits } from "../data/taskRepository";
import type { TaskColumn } from "../types";

const props = withDefaults(
  defineProps<{
    open: boolean;
    columns?: TaskColumn[];
  }>(),
  {
    columns: () => [],
  },
);
const emit = defineEmits<{
  close: [];
  announce: [message: string];
  updateWipLimits: [limits: { doing: number | null; verify: number | null }];
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

const tabs = [
  { id: "general", label: "常规与关于", icon: SlidersHorizontal, title: "常规与系统偏好", description: "开机自启与本地看板版本信息" },
  { id: "ai", label: "AI 协同接入", icon: Bot, title: "AI 集成与本地服务", description: "允许 Codex、Antigravity 等 Agent 通过 MCP 本机协议协同工作" },
  { id: "sop", label: "任务 SOP 规范", icon: FileText, title: "标准作业流程 (SOP)", description: "规范 Agent 接单、开发、提测与排版验收的执行标准" },
  { id: "wip", label: "在制品上限", icon: Gauge, title: "在制品上限 (WIP Limit)", description: "控制「进行中」与「待验证」并发任务数量，防范任务堆积" },
  { id: "data", label: "数据与存储", icon: Database, title: "数据备份与存储位置", description: "SQLite 数据库备份、恢复与本地存储目录迁移" },
] as const;

type TabId = typeof tabs[number]["id"];
const activeTab = ref<TabId>("general");

const currentTabInfo = computed(() => {
  return tabs.find((t) => t.id === activeTab.value) ?? tabs[0];
});

function handleNavKeydown(event: KeyboardEvent) {
  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
  event.preventDefault();
  const currentIndex = tabs.findIndex((t) => t.id === activeTab.value);
  if (currentIndex < 0) return;
  const nextIndex = event.key === "ArrowDown"
    ? (currentIndex + 1) % tabs.length
    : (currentIndex - 1 + tabs.length) % tabs.length;
  activeTab.value = tabs[nextIndex].id;
  const nextBtn = document.getElementById(`settings-tab-${tabs[nextIndex].id}`);
  nextBtn?.focus();
}

const sop = computed(() => {
  const config = currentSop.value;
  return {
    ...config,
    summary: (config.summary.includes("update_task_description") && config.summary.includes("人工编辑不生成")) ? config.summary : `${config.summary}\n\n${TASK_DESCRIPTION_POLICY}`,
    content: (config.content.includes("update_task_description") && config.content.includes("人工编辑不生成")) ? config.content : `${config.content}\n\n### 任务说明修订规范\n\n${TASK_DESCRIPTION_POLICY}`,
  };
});

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
  await initWipLimits();
}, { immediate: true });

function close() {
  if (!busy.value && !sopViewerOpen.value) emit("close");
}

function handlePanelKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
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

const doingWipLimit = ref<number | null>(2);
const verifyWipLimit = ref<number | null>(2);
const wipSaving = ref(false);

async function initWipLimits() {
  if (props.columns && props.columns.length > 0) {
    const doing = props.columns.find((c) => c.id === "doing");
    const verify = props.columns.find((c) => c.id === "verify");
    doingWipLimit.value = doing ? doing.wipLimit : 2;
    verifyWipLimit.value = verify ? verify.wipLimit : 2;
    return;
  }
  try {
    const cols = await loadColumns();
    const doing = cols.find((c) => c.id === "doing");
    const verify = cols.find((c) => c.id === "verify");
    doingWipLimit.value = doing?.wipLimit ?? 2;
    verifyWipLimit.value = verify?.wipLimit ?? 2;
  } catch {
    doingWipLimit.value = 2;
    verifyWipLimit.value = 2;
  }
}

watch(() => props.columns, () => {
  if (props.open && props.columns && props.columns.length > 0) {
    const doing = props.columns.find((c) => c.id === "doing");
    const verify = props.columns.find((c) => c.id === "verify");
    doingWipLimit.value = doing ? doing.wipLimit : 2;
    verifyWipLimit.value = verify ? verify.wipLimit : 2;
  }
}, { deep: true });

const doingCol = computed(() => props.columns.find((c) => c.id === "doing"));
const verifyCol = computed(() => props.columns.find((c) => c.id === "verify"));

const doingCurrentCount = computed(() => doingCol.value?.totalTaskCount ?? doingCol.value?.tasks?.length ?? 0);
const verifyCurrentCount = computed(() => verifyCol.value?.totalTaskCount ?? verifyCol.value?.tasks?.length ?? 0);

const doingCapacity = computed(() => {
  const count = doingCurrentCount.value;
  const limit = doingWipLimit.value;
  if (limit === null || limit === undefined || limit <= 0) {
    return { status: "unlimited", label: "自由流转", percent: 0, text: "未限制并发数量" };
  }
  if (count > limit) {
    return { status: "exceeded", label: `超限 ${count - limit} 项`, percent: 100, text: `当前负荷 ${count} / ${limit}（超出上限）` };
  }
  if (count === limit) {
    return { status: "full", label: "已满载", percent: 100, text: `工位已占满 ${count} / ${limit}` };
  }
  const pct = Math.round((count / limit) * 100);
  return { status: "healthy", label: `空闲 ${limit - count} 项`, percent: pct, text: `当前负荷 ${count} / ${limit}（${pct}%）` };
});

const verifyCapacity = computed(() => {
  const count = verifyCurrentCount.value;
  const limit = verifyWipLimit.value;
  if (limit === null || limit === undefined || limit <= 0) {
    return { status: "unlimited", label: "自由流转", percent: 0, text: "未限制验收队列" };
  }
  if (count > limit) {
    return { status: "exceeded", label: `超限 ${count - limit} 项`, percent: 100, text: `当前待检 ${count} / ${limit}（超出上限）` };
  }
  if (count === limit) {
    return { status: "full", label: "已满载", percent: 100, text: `队列已占满 ${count} / ${limit}` };
  }
  const pct = Math.round((count / limit) * 100);
  return { status: "healthy", label: `空闲 ${limit - count} 项`, percent: pct, text: `当前待检 ${count} / ${limit}（${pct}%）` };
});

const wipPresets = [
  { value: 1, label: "1 项", desc: "单人单线程专注" },
  { value: 2, label: "2 项", desc: "系统推荐默认" },
  { value: 4, label: "4 项", desc: "Agent 并发协同" },
  { value: 8, label: "8 项", desc: "团队高吞吐" },
  { value: null, label: "不限", desc: "自由流转无约束" },
];

function stepDoing(delta: number) {
  const current = doingWipLimit.value ?? 2;
  const next = Math.max(1, Math.min(99, current + delta));
  doingWipLimit.value = next;
}

function stepVerify(delta: number) {
  const current = verifyWipLimit.value ?? 2;
  const next = Math.max(1, Math.min(99, current + delta));
  verifyWipLimit.value = next;
}

async function saveWipLimits(options?: { silent?: boolean }) {
  const parseVal = (val: unknown): number | null => {
    if (val === "" || val === null || val === undefined) return null;
    const num = Number(val);
    if (!Number.isFinite(num)) return null;
    return Math.floor(num);
  };

  const doing = parseVal(doingWipLimit.value);
  const verify = parseVal(verifyWipLimit.value);

  if (doing !== null && doing < 1) {
    notify("「进行中」上限必须为大于等于 1 的整数或留空");
    return;
  }
  if (verify !== null && verify < 1) {
    notify("「待验证」上限必须为大于等于 1 的整数或留空");
    return;
  }

  wipSaving.value = true;
  try {
    await updateColumnWipLimits({
      doing,
      verify,
    });
    doingWipLimit.value = doing;
    verifyWipLimit.value = verify;
    emit("updateWipLimits", { doing, verify });
    if (!options?.silent) {
      notify("已保存在制品上限");
    }
  } catch (error) {
    notify(`保存在制品上限失败：${String(error)}`);
  } finally {
    wipSaving.value = false;
  }
}

async function resetWipLimits() {
  doingWipLimit.value = 2;
  verifyWipLimit.value = 2;
  await saveWipLimits({ silent: true });
  notify("已恢复默认在制品上限（各 2 项）");
}
</script>

<template>
  <SurfaceMotion kind="dialog" panel=".settings-panel">
  <div v-if="open" class="settings-backdrop" @mousedown.self="close">
    <section
      class="settings-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      @keydown="handlePanelKeydown"
    >
      <!-- Left Navigation Rail -->
      <aside class="settings-panel__nav">
        <header class="settings-panel__nav-header">
          <h2 id="settings-title">设置</h2>
          <p>系统与工作流偏好</p>
        </header>

        <nav
          class="settings-panel__nav-menu"
          role="tablist"
          aria-label="设置导航"
          @keydown="handleNavKeydown"
        >
          <button
            v-for="tab in tabs"
            :key="tab.id"
            :id="`settings-tab-${tab.id}`"
            type="button"
            role="tab"
            :aria-selected="activeTab === tab.id"
            :aria-controls="`settings-panel-${tab.id}`"
            class="settings-panel__nav-item"
            :class="{ 'is-active': activeTab === tab.id }"
            @click="activeTab = tab.id"
          >
            <component :is="tab.icon" :size="15" class="settings-panel__nav-icon" aria-hidden="true" />
            <span class="settings-panel__nav-label">{{ tab.label }}</span>
            <span
              v-if="tab.id === 'ai'"
              class="settings-panel__nav-status"
              :class="{ 'is-running': mcpStatus?.running }"
              :title="mcpStatus?.running ? 'MCP 服务运行中' : 'MCP 服务未开启'"
            />
            <span
              v-else-if="tab.id === 'sop' && sop.isCustom"
              class="settings-panel__nav-badge"
            >
              自定义
            </span>
          </button>
        </nav>
      </aside>

      <!-- Right Detail Stage -->
      <main class="settings-panel__stage">
        <header class="settings-panel__stage-header">
          <div>
            <h3>{{ currentTabInfo.title }}</h3>
            <p>{{ currentTabInfo.description }}</p>
          </div>
          <button
            class="icon-button"
            type="button"
            aria-label="关闭设置"
            :disabled="busy"
            @click="close"
          >
            <X :size="18" aria-hidden="true" />
          </button>
        </header>

        <div class="settings-panel__stage-body">
          <!-- Tab 1: 常规与系统 -->
          <section
            v-show="activeTab === 'general'"
            id="settings-panel-general"
            role="tabpanel"
            aria-labelledby="settings-tab-general"
            class="settings-panel__tab-pane"
          >
            <div class="settings-panel__section-block">
              <div class="settings-panel__toggle-row">
                <div>
                  <h4>开机自启</h4>
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
            </div>

            <div class="settings-panel__section-block settings-panel__version">
              <h4>关于看板</h4>
              <p>当前版本 {{ info?.version ?? "读取中…" }}</p>
              <small>本地优先、专注人机协同交付的轻量级工作流看板。</small>
            </div>
          </section>

          <!-- Tab 2: AI 接入 -->
          <section
            v-show="activeTab === 'ai'"
            id="settings-panel-ai"
            role="tabpanel"
            aria-labelledby="settings-tab-ai"
            class="settings-panel__tab-pane"
          >
            <div class="settings-panel__section-block">
              <div class="settings-panel__toggle-row">
                <div>
                  <h4>MCP 服务</h4>
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
            </div>

            <div class="settings-panel__section-block">
              <h4>快捷接入 Agent</h4>
              <p>写入对应 Agent 的本地插件或配置，一键就绪人机协同能力。</p>
              <div class="settings-panel__actions">
                <button
                  class="secondary-button"
                  type="button"
                  :disabled="codexLoading || antigravityLoading || mcpLoading"
                  @click="connectCodex"
                >
                  {{ codexLoading ? "正在连接…" : "连接到 Codex" }}
                </button>
                <button
                  class="secondary-button"
                  type="button"
                  :disabled="codexLoading || antigravityLoading || mcpLoading"
                  @click="connectAntigravity"
                >
                  {{ antigravityLoading ? "正在连接…" : "连接到 Antigravity" }}
                </button>
              </div>
              <small>连接会自动开启 MCP 服务。服务仅监听 127.0.0.1，重启看板后自动恢复。</small>
            </div>
          </section>

          <!-- Tab 3: SOP 规范 -->
          <section
            v-show="activeTab === 'sop'"
            id="settings-panel-sop"
            role="tabpanel"
            aria-labelledby="settings-tab-sop"
            class="settings-panel__tab-pane"
          >
            <div class="settings-panel__section-block settings-panel__sop-section">
              <div class="settings-panel__toggle-row">
                <div>
                  <h4>任务执行 SOP（标准作业流程）</h4>
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
            </div>
          </section>

          <!-- Tab 4: 在制品上限 (WIP Limit) -->
          <section
            v-show="activeTab === 'wip'"
            id="settings-panel-wip"
            role="tabpanel"
            aria-labelledby="settings-tab-wip"
            class="settings-panel__tab-pane"
          >
            <div class="settings-panel__section-block settings-panel__wip-section">
              <h4 class="sr-only">在制品上限 (WIP Limit)</h4>

              <!-- Full-width Workstation Lanes -->
              <div class="wip-workstations">
                <!-- Doing Lane -->
                <div
                  class="wip-card wip-card--doing"
                  :class="{
                    'wip-card--exceeded': doingCapacity.status === 'exceeded',
                    'wip-card--full': doingCapacity.status === 'full',
                  }"
                >
                  <header class="wip-card__header">
                    <div class="wip-card__title-wrap">
                      <span class="wip-card__pill wip-card__pill--doing">进行中</span>
                      <span class="wip-card__role">执行工位</span>
                      <span class="wip-card__count-hint">
                        当前任务 <strong>{{ doingCurrentCount }}</strong> 项
                        <template v-if="doingWipLimit !== null"> / 上限 {{ doingWipLimit }} 项</template>
                        <template v-else> · 无上限</template>
                      </span>
                    </div>
                    <span
                      class="wip-card__status-tag"
                      :class="`wip-card__status-tag--${doingCapacity.status}`"
                    >
                      {{ doingCapacity.label }}
                    </span>
                  </header>

                  <div
                    class="wip-card__progress-track"
                    role="progressbar"
                    :aria-valuenow="doingCurrentCount"
                    :aria-valuemin="0"
                    :aria-valuemax="doingWipLimit ?? 100"
                    :aria-valuetext="doingCapacity.text"
                  >
                    <div
                      class="wip-card__progress-fill"
                      :class="`wip-card__progress-fill--${doingCapacity.status}`"
                      :style="{ width: `${doingCapacity.percent}%` }"
                    />
                  </div>

                  <div class="wip-card__control-row">
                    <div class="wip-card__stepper-wrap">
                      <label class="wip-card__control-label" for="wip-limit-doing">
                        并发上限
                      </label>
                      <div class="wip-stepper">
                        <button
                          type="button"
                          class="wip-stepper__btn"
                          aria-label="减少「进行中」上限"
                          :disabled="doingWipLimit !== null && doingWipLimit <= 1"
                          @click="stepDoing(-1)"
                        >
                          <Minus :size="13" />
                        </button>
                        <input
                          id="wip-limit-doing"
                          v-model.number="doingWipLimit"
                          type="number"
                          min="1"
                          max="99"
                          step="1"
                          placeholder="不限"
                          class="wip-stepper__input"
                        />
                        <button
                          type="button"
                          class="wip-stepper__btn"
                          aria-label="增加「进行中」上限"
                          :disabled="doingWipLimit !== null && doingWipLimit >= 99"
                          @click="stepDoing(1)"
                        >
                          <Plus :size="13" />
                        </button>
                        <span class="wip-stepper__unit">项</span>
                      </div>
                    </div>

                    <div class="wip-card__presets" aria-label="快捷预设">
                      <span class="wip-card__presets-title">快捷：</span>
                      <button
                        v-for="preset in wipPresets"
                        :key="`doing-${preset.label}`"
                        type="button"
                        class="wip-preset-chip"
                        :class="{ 'is-active': doingWipLimit === preset.value }"
                        :title="preset.desc"
                        @click="doingWipLimit = preset.value"
                      >
                        {{ preset.label }}
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Verify Lane -->
                <div
                  class="wip-card wip-card--verify"
                  :class="{
                    'wip-card--exceeded': verifyCapacity.status === 'exceeded',
                    'wip-card--full': verifyCapacity.status === 'full',
                  }"
                >
                  <header class="wip-card__header">
                    <div class="wip-card__title-wrap">
                      <span class="wip-card__pill wip-card__pill--verify">待验证</span>
                      <span class="wip-card__role">验收工位</span>
                      <span class="wip-card__count-hint">
                        待验任务 <strong>{{ verifyCurrentCount }}</strong> 项
                        <template v-if="verifyWipLimit !== null"> / 上限 {{ verifyWipLimit }} 项</template>
                        <template v-else> · 无上限</template>
                      </span>
                    </div>
                    <span
                      class="wip-card__status-tag"
                      :class="`wip-card__status-tag--${verifyCapacity.status}`"
                    >
                      {{ verifyCapacity.label }}
                    </span>
                  </header>

                  <div
                    class="wip-card__progress-track"
                    role="progressbar"
                    :aria-valuenow="verifyCurrentCount"
                    :aria-valuemin="0"
                    :aria-valuemax="verifyWipLimit ?? 100"
                    :aria-valuetext="verifyCapacity.text"
                  >
                    <div
                      class="wip-card__progress-fill"
                      :class="`wip-card__progress-fill--${verifyCapacity.status}`"
                      :style="{ width: `${verifyCapacity.percent}%` }"
                    />
                  </div>

                  <div class="wip-card__control-row">
                    <div class="wip-card__stepper-wrap">
                      <label class="wip-card__control-label" for="wip-limit-verify">
                        并发上限
                      </label>
                      <div class="wip-stepper">
                        <button
                          type="button"
                          class="wip-stepper__btn"
                          aria-label="减少「待验证」上限"
                          :disabled="verifyWipLimit !== null && verifyWipLimit <= 1"
                          @click="stepVerify(-1)"
                        >
                          <Minus :size="13" />
                        </button>
                        <input
                          id="wip-limit-verify"
                          v-model.number="verifyWipLimit"
                          type="number"
                          min="1"
                          max="99"
                          step="1"
                          placeholder="不限"
                          class="wip-stepper__input"
                        />
                        <button
                          type="button"
                          class="wip-stepper__btn"
                          aria-label="增加「待验证」上限"
                          :disabled="verifyWipLimit !== null && verifyWipLimit >= 99"
                          @click="stepVerify(1)"
                        >
                          <Plus :size="13" />
                        </button>
                        <span class="wip-stepper__unit">项</span>
                      </div>
                    </div>

                    <div class="wip-card__presets" aria-label="快捷预设">
                      <span class="wip-card__presets-title">快捷：</span>
                      <button
                        v-for="preset in wipPresets"
                        :key="`verify-${preset.label}`"
                        type="button"
                        class="wip-preset-chip"
                        :class="{ 'is-active': verifyWipLimit === preset.value }"
                        :title="preset.desc"
                        @click="verifyWipLimit = preset.value"
                      >
                        {{ preset.label }}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div class="settings-panel__actions">
                <button
                  class="primary-button"
                  type="button"
                  :disabled="wipSaving || busy"
                  @click="saveWipLimits()"
                >
                  {{ wipSaving ? "保存中…" : "保存上限" }}
                </button>
                <button
                  class="secondary-button"
                  type="button"
                  :disabled="wipSaving || busy"
                  @click="resetWipLimits"
                >
                  恢复默认 (2项)
                </button>
              </div>
              <small>
                提示：上限超限时看板会高亮警示并提示，但不会硬性阻止拖拽与流转。您也可以直接在看板列头点击计数徽标进行快速行内调整。
              </small>
            </div>
          </section>

          <!-- Tab 5: 数据存储与迁移 -->
          <section
            v-show="activeTab === 'data'"
            id="settings-panel-data"
            role="tabpanel"
            aria-labelledby="settings-tab-data"
            class="settings-panel__tab-pane"
          >
            <div class="settings-panel__section-block">
              <h4>数据备份与恢复</h4>
              <p>将任务、项目、标签及相关记录导出为 SQLite 文件，或从备份恢复。</p>
              <div class="settings-panel__actions">
                <button class="secondary-button" type="button" :disabled="busy || !info" @click="exportBackup">导出数据</button>
                <button class="secondary-button" type="button" :disabled="busy || !info" @click="importBackup">导入数据</button>
              </div>
            </div>

            <div class="settings-panel__section-block">
              <h4>数据存储位置</h4>
              <p>当前数据库文件</p>
              <code class="settings-panel__path">{{ info?.path ?? "读取中…" }}</code>
              <div class="settings-panel__actions">
                <button class="secondary-button" type="button" :disabled="busy || !info" @click="changeDirectory">更改目录并迁移</button>
              </div>
              <small>迁移后会从新目录读取数据；原文件会保留，便于需要时恢复。</small>
            </div>
          </section>
        </div>
      </main>
    </section>

    <!-- SOP 规范全屏只读模态框 -->
    <Teleport to="body">
      <SurfaceMotion kind="dialog">
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
          </SurfaceMotion>
    </Teleport>
  </div>
  </SurfaceMotion>
</template>
