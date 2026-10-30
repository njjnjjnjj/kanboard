<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { ArrowLeftRight, ChevronRight, FileText, GitCommitHorizontal, History, RotateCw, X } from "lucide-vue-next";
import type { TaskDescriptionHistory } from "../types";
import { diffDescription } from "../descriptionDiff";
import MarkdownEditor from "./MarkdownEditor.vue";

const props = defineProps<{ taskId: string; updatedAt: string }>();
const emit = defineEmits<{ close: [] }>();
const history = ref<TaskDescriptionHistory>({ versions: [], notes: [] });
const loading = ref(false);
const error = ref("");
const selectedVersion = ref<number | null>(null);
const mode = ref<"diff" | "preview">("diff");
const panel = ref<HTMLElement | null>(null);
const content = ref<HTMLElement | null>(null);
const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
let request = 0;

async function loadHistory() {
  const current = ++request;
  loading.value = true;
  error.value = "";
  try {
    const result = await invoke<TaskDescriptionHistory>("list_task_description_versions", { taskId: props.taskId });
    if (current !== request) return;
    history.value = { ...result, versions: result.versions.filter((item) => item.source === "agent") };
    if (!history.value.versions.some((item) => item.version === selectedVersion.value)) {
      selectedVersion.value = history.value.versions[0]?.version ?? null;
    }
  } catch (err) {
    if (current === request) error.value = `加载失败：${String(err)}`;
  } finally {
    if (current === request) loading.value = false;
  }
}
watch(() => [props.taskId, props.updatedAt], (value, previous) => {
  if (value[0] !== previous?.[0]) {
    selectedVersion.value = null;
    history.value = { versions: [], notes: [] };
    mode.value = "diff";
  }
  void loadHistory();
}, { immediate: true });

const selected = computed(() => history.value.versions.find((item) => item.version === selectedVersion.value));
const diff = computed(() => diffDescription(selected.value?.previousDescription ?? "", selected.value?.description ?? ""));
const added = computed(() => diff.value.filter((line) => line.kind === "added").length);
const removed = computed(() => diff.value.filter((line) => line.kind === "removed").length);
const formatTime = (value: string) => new Date(value).toLocaleString("zh-CN", {
  month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
});
const fullTime = (value: string) => new Date(value).toLocaleString("zh-CN", { hour12: false });

watch([selectedVersion, mode], () => { if (content.value) content.value.scrollTop = 0; });
function selectRevision(version: number) {
  selectedVersion.value = version;
  mode.value = "diff";
}
function navigateRevision(event: KeyboardEvent, index: number) {
  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
  event.preventDefault();
  const next = Math.max(0, Math.min(history.value.versions.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)));
  const revision = history.value.versions[next];
  if (revision) {
    selectRevision(revision.version);
    void nextTick(() => panel.value?.querySelectorAll<HTMLButtonElement>(".revision-item")[next]?.focus());
  }
}
function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopImmediatePropagation();
    emit("close");
  } else if (event.key === "Tab") {
    const controls = Array.from(panel.value?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], [tabindex="0"]') ?? [])
      .filter((element) => element.getClientRects().length > 0);
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.value)) {
      event.preventDefault(); last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first?.focus();
    }
  }
}
onMounted(() => {
  window.addEventListener("keydown", handleKeydown, true);
  panel.value?.focus();
});
onBeforeUnmount(() => {
  request++;
  window.removeEventListener("keydown", handleKeydown, true);
  returnFocus?.focus();
});
</script>

<template>
    <div class="description-history-layer" @click.self="emit('close')">
      <section ref="panel" class="description-history" :class="{ 'description-history--compact': !history.versions.length }" role="dialog" aria-modal="true" aria-labelledby="description-history-title" tabindex="-1">
        <header class="description-history__header">
          <div class="description-history__heading">
            <span class="description-history__mark"><History :size="19" aria-hidden="true" /></span>
            <div><h2 id="description-history-title">任务说明修改记录</h2><p>仅记录 Agent 通过 MCP 提交的修改</p></div>
          </div>
          <button class="icon-button" type="button" title="关闭（Esc）" aria-label="关闭修改记录" @click="emit('close')"><X :size="18" aria-hidden="true" /></button>
        </header>
        <div v-if="loading && !history.versions.length" class="description-history__state" role="status"><RotateCw :size="22" aria-hidden="true" /><strong>正在加载修改记录</strong></div>
        <div v-else-if="error" class="description-history__state" role="alert">
          <History :size="28" aria-hidden="true" /><strong>暂时无法读取修改记录</strong><p>{{ error }}</p>
          <button class="secondary-button" type="button" @click="loadHistory">重新加载</button>
        </div>
        <div v-else-if="!history.versions.length" class="description-history__state">
          <span class="description-history__empty-mark"><GitCommitHorizontal :size="27" aria-hidden="true" /></span>
          <strong>还没有 Agent 修改记录</strong><p>Agent 通过 MCP 修订任务说明后，会在这里显示修改内容。<br />人工编辑不会生成记录。</p>
        </div>
        <div v-else class="description-history__workspace">
          <aside class="revision-sidebar" aria-label="Agent 修改记录列表">
            <div class="revision-sidebar__heading"><span>修改记录</span><span>{{ history.versions.length }} 次</span></div>
            <div class="revision-list">
              <button v-for="(revision, index) in history.versions" :key="revision.version"
                class="revision-item" :class="{ 'revision-item--selected': revision.version === selectedVersion }"
                type="button" :aria-pressed="revision.version === selectedVersion"
                @click="selectRevision(revision.version)" @keydown="navigateRevision($event, index)">
                <span class="revision-item__rail"><GitCommitHorizontal :size="16" aria-hidden="true" /></span>
                <span class="revision-item__body">
                  <span class="revision-item__top"><span class="revision-item__number">#{{ revision.version }}</span><span v-if="index === 0" class="revision-item__latest">最新</span></span>
                  <strong>{{ revision.summary }}</strong>
                  <time :datetime="revision.createdAt" :title="fullTime(revision.createdAt)">{{ formatTime(revision.createdAt) }}<span> · Agent</span></time>
                </span>
                <ChevronRight v-if="revision.version === selectedVersion" class="revision-item__arrow" :size="14" aria-hidden="true" />
              </button>
            </div>
            <p class="revision-sidebar__footnote">选择一条记录，查看该次修改。</p>
          </aside>
          <main v-if="selected" class="revision-detail">
            <header class="revision-detail__header">
              <div class="revision-detail__eyebrow"><span>修订 #{{ selected.version }}</span><span>Agent · MCP</span><time :datetime="selected.createdAt">{{ fullTime(selected.createdAt) }}</time></div>
              <h3>{{ selected.summary }}</h3>
              <div class="revision-detail__toolbar">
                <div class="revision-segments" role="group" aria-label="记录查看方式">
                  <button type="button" :aria-pressed="mode === 'diff'" @click="mode = 'diff'"><ArrowLeftRight :size="14" aria-hidden="true" />本次变更</button>
                  <button type="button" :aria-pressed="mode === 'preview'" @click="mode = 'preview'"><FileText :size="14" aria-hidden="true" />修改后正文</button>
                </div>
                <div v-if="mode === 'diff'" class="revision-stats" aria-label="本次变更统计"><span class="revision-stats__added">+{{ added }}</span><span class="revision-stats__removed">−{{ removed }}</span><span>行</span></div>
                <span v-else class="revision-detail__readonly">只读预览</span>
              </div>
            </header>
            <div v-if="mode === 'diff'" class="revision-diff__heading"><span>修改前</span><span>修改后</span><span>本次 Agent 修改前后的差异</span></div>
            <div ref="content" class="revision-detail__content" :class="{ 'revision-detail__content--preview': mode === 'preview' }">
              <div v-if="mode === 'diff'" class="description-history__diff" aria-label="本次修改差异">
                <p v-if="!added && !removed" class="revision-no-change">本次记录的正文没有变化。</p>
                <div v-for="(line, index) in diff" :key="index" class="description-diff-line" :class="`description-diff-line--${line.kind}`">
                  <span>{{ line.oldLine }}</span><span>{{ line.newLine }}</span><span aria-hidden="true">{{ line.kind === 'added' ? '+' : line.kind === 'removed' ? '−' : '' }}</span><code>{{ line.text || ' ' }}</code>
                </div>
              </div>
              <MarkdownEditor v-else :key="selected.version" :model-value="selected.description" label="修改后正文" :readonly="true" :fullscreen="true" height="100%" />
            </div>
          </main>
        </div>
        <footer class="description-history__footer"><span>记录为只读，查看不会改变当前编辑内容</span><kbd>Esc 关闭</kbd></footer>
      </section>
    </div>
</template>
