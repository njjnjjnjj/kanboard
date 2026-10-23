<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from "vue";
import { Minimize2 } from "lucide-vue-next";
import DateInput from "./DateInput.vue";
import MarkdownEditor from "./MarkdownEditor.vue";
import TagInput from "./TagInput.vue";
import TaskChecklist from "./TaskChecklist.vue";
import TaskSelect from "./TaskSelect.vue";
import type { BlockedReason, Project, Tag, Task, TaskChanges, TaskColumn } from "../types";

const props = defineProps<{
  task: Task;
  columns: TaskColumn[];
  projects: Project[];
  tags: Tag[];
  saving: boolean;
}>();

const emit = defineEmits<{
  save: [taskId: string, changes: TaskChanges];
  delete: [taskId: string];
  close: [];
}>();

const TABS = ["details", "checklist", "verification"] as const;
type TabType = typeof TABS[number];

const confirmingDelete = ref(false);
const activeTab = ref<TabType>("details");
const fullscreenTarget = ref<"description" | "verification" | null>(null);

const statusOptions = computed(() =>
  props.columns.map((column) => ({ value: column.id, label: column.title })),
);
const priorityOptions = [
  { value: "none", label: "普通" },
  { value: "high", label: "高" },
];
const blockedReasonOptions = [
  { value: "people", label: "等待其他人" },
  { value: "hardware", label: "等待硬件" },
  { value: "environment", label: "等待环境" },
  { value: "feedback", label: "等待反馈" },
  { value: "technical", label: "技术问题" },
  { value: "dependency", label: "外部依赖" },
  { value: "other", label: "其他" },
];
const recurrenceOptions = [
  { value: "none", label: "不重复" },
  { value: "daily", label: "每天" },
  { value: "weekly", label: "每周" },
  { value: "monthly", label: "每月" },
];
const projectOptions = computed(() => [
  { value: "", label: "无项目" },
  ...props.projects
    .filter((project) => project.status === "active" || project.id === props.task.projectId)
    .map((project) => ({ value: project.id, label: project.name })),
]);
const draft = reactive<TaskChanges>({
  title: "",
  description: "",
  dueDate: null,
  priority: "none",
  columnId: "todo",
  projectId: null,
  tagNames: [],
  blockedReason: null,
  checklist: [],
  recurrenceRule: "none",
  reviewNotes: "",
});

function openFullscreenDescription() {
  fullscreenTarget.value = "description";
}

function openFullscreenVerification() {
  fullscreenTarget.value = "verification";
}

function closeFullscreen() {
  fullscreenTarget.value = null;
}

function handleFullscreenEsc(e: KeyboardEvent) {
  if (e.key === "Escape" && fullscreenTarget.value) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    closeFullscreen();
  }
}

watch(fullscreenTarget, (val) => {
  if (val) {
    window.addEventListener("keydown", handleFullscreenEsc, { capture: true });
  } else {
    window.removeEventListener("keydown", handleFullscreenEsc, { capture: true });
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleFullscreenEsc, { capture: true });
});

watch(
  () => props.task,
  (task, previousTask) => {
    confirmingDelete.value = false;
    if (!previousTask || task.id !== previousTask.id) {
      activeTab.value = task.columnId === "verify" ? "verification" : "details";
    }
    draft.title = task.title;
    draft.description = task.description;
    draft.dueDate = task.dueDate;
    draft.priority = task.priority;
    draft.columnId = task.columnId;
    draft.projectId = task.projectId;
    draft.tagNames = task.tags.map((tag) => tag.name);
    draft.blockedReason = task.blockedReason;
    draft.checklist = task.checklist.map((item) => ({ ...item }));
    draft.recurrenceRule = task.recurrenceRule;
    draft.reviewNotes = task.reviewNotes || "";
  },
  { immediate: true, deep: true },
);

function submit() {
  if (!draft.title.trim()) return;
  emit("save", props.task.id, {
    ...draft,
    title: draft.title.trim(),
    dueDate: draft.dueDate || null,
  });
}

function setPriority(value: string) {
  if (value === "none" || value === "high") draft.priority = value;
}

function setProject(value: string) {
  draft.projectId = value || null;
}

function setBlockedReason(value: string) {
  draft.blockedReason = value as BlockedReason;
}

function setRecurrence(value: string) {
  if (value === "none" || value === "daily" || value === "weekly" || value === "monthly") {
    draft.recurrenceRule = value;
  }
}

function passVerification() {
  draft.columnId = "done";
  submit();
}

function submitWithShortcut(event: KeyboardEvent) {
  if (event.ctrlKey && !event.shiftKey && event.key === "Enter") {
    event.preventDefault();
    (event.currentTarget as HTMLElement).querySelector("form")?.requestSubmit();
  }
}

async function handleTabKeydown(event: KeyboardEvent) {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  const tabList = event.currentTarget as HTMLElement;
  const currentIndex = TABS.indexOf(activeTab.value);
  const delta = event.key === "ArrowRight" ? 1 : -1;
  const nextIndex = (currentIndex + delta + TABS.length) % TABS.length;
  activeTab.value = TABS[nextIndex];
  await nextTick();
  tabList?.querySelector<HTMLButtonElement>(`[aria-selected="true"]`)?.focus();
}
</script>

<template>
  <aside class="task-inspector" role="dialog" aria-modal="true" aria-label="任务详情" @keydown="submitWithShortcut">
    <form class="task-inspector__form" @submit.prevent="submit">
      <header class="task-inspector__header">
        <div>
          <strong>任务详情</strong>
          <span>{{ columns.find((column) => column.id === draft.columnId)?.title }}</span>
        </div>
        <button class="icon-button" type="button" aria-label="关闭任务详情" @click="emit('close')"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" /></svg></button>
      </header>

      <label class="field field--title">
        <span>任务标题</span>
        <textarea data-inspector-title v-model="draft.title" rows="3" maxlength="160" />
      </label>

      <div class="task-inspector__tabs" role="tablist" aria-label="任务编辑内容" @keydown="handleTabKeydown">
        <button
          id="task-details-tab"
          type="button"
          role="tab"
          aria-controls="task-details-panel"
          :aria-selected="activeTab === 'details'"
          :tabindex="activeTab === 'details' ? 0 : -1"
          @click="activeTab = 'details'"
        >
          任务详情
        </button>
        <button
          id="task-checklist-tab"
          type="button"
          role="tab"
          aria-controls="task-checklist-panel"
          :aria-selected="activeTab === 'checklist'"
          :tabindex="activeTab === 'checklist' ? 0 : -1"
          @click="activeTab = 'checklist'"
        >
          完成条件 <span>{{ draft.checklist.filter((item) => item.completed).length }}/{{ draft.checklist.length }}</span>
        </button>
        <button
          id="task-verification-tab"
          type="button"
          role="tab"
          aria-controls="task-verification-panel"
          :aria-selected="activeTab === 'verification'"
          :tabindex="activeTab === 'verification' ? 0 : -1"
          @click="activeTab = 'verification'"
        >
          验证方案 <span v-if="draft.columnId === 'verify'">待验证</span>
        </button>
      </div>

      <section id="task-details-panel" v-show="activeTab === 'details'" class="task-inspector__panel task-inspector__panel--details" role="tabpanel" aria-labelledby="task-details-tab">
        <div class="field-grid field-grid--primary">
          <div class="field field--project">
            <span>项目</span>
            <TaskSelect
              :model-value="draft.projectId ?? ''"
              :options="projectOptions"
              label="项目"
              @update:model-value="setProject"
            />
          </div>
          <div class="field">
            <span>状态</span>
            <TaskSelect v-model="draft.columnId" :options="statusOptions" label="状态" />
          </div>
          <div class="field">
            <span>优先级</span>
            <TaskSelect
              :model-value="draft.priority"
              :options="priorityOptions"
              label="优先级"
              @update:model-value="setPriority"
            />
          </div>
          <div class="field field--due">
            <span>截止时间</span>
            <DateInput v-model="draft.dueDate" label="截止日期" quick />
          </div>
          <div class="field field--recurrence" data-tour="recurrence">
            <span>重复</span>
            <TaskSelect
              :model-value="draft.recurrenceRule"
              :options="recurrenceOptions"
              label="重复规则"
              @update:model-value="setRecurrence"
            />
          </div>
          <div v-if="draft.columnId === 'blocked'" class="field field--blocked-reason">
            <span>阻塞原因</span>
            <TaskSelect
              :model-value="draft.blockedReason ?? 'other'"
              :options="blockedReasonOptions"
              label="阻塞原因"
              @update:model-value="setBlockedReason"
            />
          </div>
        </div>

        <div class="field field--tags">
          <span>标签</span>
          <TagInput v-model="draft.tagNames" :suggestions="tags" />
        </div>

        <div class="field field--description">
          <div class="field-header">
            <span>任务说明</span>
          </div>

          <MarkdownEditor
            v-model="draft.description"
            label="任务说明"
            placeholder="记录背景、下一步或需要注意的信息（支持所见即所得 Markdown、表格、图片上传、Ctrl+V 粘贴与全屏编辑）"
            :task-title="draft.title"
            :data-inspector-description="true"
            height="100%"
            @toggle-fullscreen="openFullscreenDescription"
          />
        </div>
      </section>

      <section id="task-checklist-panel" v-show="activeTab === 'checklist'" class="task-inspector__panel task-inspector__panel--checklist" role="tabpanel" aria-labelledby="task-checklist-tab" data-tour="checklist">
        <TaskChecklist v-model="draft.checklist" />
      </section>

      <section
        id="task-verification-panel"
        v-show="activeTab === 'verification'"
        class="task-inspector__panel task-inspector__panel--verification"
        role="tabpanel"
        aria-labelledby="task-verification-tab"
      >
        <div v-if="draft.columnId === 'verify'" class="task-verification__toolbar">
          <span>当前任务等待人工核验</span>
          <button
            type="button"
            class="secondary-button"
            @click="passVerification"
          >
            通过验证并完成
          </button>
        </div>

        <div class="field field--verification-notes">
          <div class="field-header">
            <span>验证方案说明</span>
          </div>

          <MarkdownEditor
            v-model="draft.reviewNotes"
            label="验证方案"
            placeholder="请使用结构化 Markdown 编写验证方案（优先使用表格、清单与代码块分项呈现，避免单行堆砌）：

### 1. 核心改动与实现方案
| 模块 / 文件 | 改动说明 |
| :--- | :--- |
| `src/...` | 描述... |

### 2. 交付成果
- [x] 完成项 1...

### 3. 测试与验证指南
| 验证项 | 测试命令 / 操作步骤 | 预期效果 |
| :--- | :--- | :--- |
| 自动化单测 | `npm test` | 通过全部测试 |"
            :task-title="draft.title"
            :data-inspector-review-notes="true"
            height="100%"
            @toggle-fullscreen="openFullscreenVerification"
          />
        </div>
      </section>

      <footer class="task-inspector__actions">
        <div v-if="confirmingDelete" class="delete-confirmation">
          <span>确定删除？</span>
          <button class="text-button text-button--danger" type="button" @click="emit('delete', task.id)">删除</button>
          <button class="text-button" type="button" @click="confirmingDelete = false">取消</button>
        </div>
        <button v-else class="text-button text-button--danger" type="button" @click="confirmingDelete = true">删除任务</button>

        <div class="task-inspector__save">
          <span>Ctrl + Enter</span>
          <button class="primary-button" type="submit" :disabled="saving || !draft.title.trim()">
            {{ saving ? "保存中…" : "保存更改" }}
          </button>
        </div>
      </footer>
    </form>

    <!-- 任务说明与验证方案统一全屏沉浸弹层 -->
    <Teleport to="body">
      <div
        v-if="fullscreenTarget"
        class="markdown-fullscreen-modal"
        role="dialog"
        aria-modal="true"
        :aria-label="fullscreenTarget === 'description' ? '全屏任务说明' : '全屏验证方案'"
      >
        <header class="markdown-fullscreen-modal__header">
          <div class="markdown-fullscreen-modal__title">
            <strong>{{ fullscreenTarget === 'description' ? '任务说明' : '验证方案' }} · 全屏</strong>
            <span v-if="draft.title" class="markdown-fullscreen-modal__task">{{ draft.title }}</span>
          </div>
          <div class="markdown-fullscreen-modal__actions">
            <button
              type="button"
              class="secondary-button markdown-fullscreen-modal__exit-btn"
              @click="closeFullscreen"
            >
              <Minimize2 :size="14" />
              <span>退出全屏 (Esc)</span>
            </button>
          </div>
        </header>

        <main class="markdown-fullscreen-modal__body">
          <MarkdownEditor
            v-if="fullscreenTarget === 'description'"
            key="desc-fullscreen"
            v-model="draft.description"
            label="任务说明"
            :task-title="draft.title"
            :fullscreen="true"
            height="100%"
            @toggle-fullscreen="closeFullscreen"
          />
          <MarkdownEditor
            v-else
            key="verify-fullscreen"
            v-model="draft.reviewNotes"
            label="验证方案"
            :task-title="draft.title"
            :fullscreen="true"
            height="100%"
            @toggle-fullscreen="closeFullscreen"
          />
        </main>
      </div>
    </Teleport>
  </aside>
</template>
