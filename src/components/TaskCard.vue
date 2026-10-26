<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { elapsedLabel, isAgingWarning } from "../flowTime";
import { buildAgentTaskPrompt } from "../drag/agentPrompt";
import type { Task } from "../types";

const props = defineProps<{
  task: Task;
  selected: boolean;
}>();

const emit = defineEmits<{
  select: [taskId: string];
  toggle: [task: Task];
}>();

const copied = ref(false);
let copiedTimer: ReturnType<typeof setTimeout> | null = null;

async function copyPrompt(event: Event) {
  event.stopPropagation();
  const prompt = buildAgentTaskPrompt(props.task);
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(prompt);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = prompt;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    copied.value = true;
    if (copiedTimer) clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => {
      copied.value = false;
      copiedTimer = null;
    }, 1500);
  } catch (error) {
    console.error("Failed to copy prompt:", error);
  }
}

onBeforeUnmount(() => {
  if (copiedTimer) clearTimeout(copiedTimer);
});

const isDone = computed(() => props.task.columnId === "done");
const isAgentActive = computed(() => Boolean(props.task.inAgentSop) && props.task.columnId !== "verify" && props.task.columnId !== "done");
const toggleLabel = computed(() => {
  if (isDone.value) return `恢复任务：${props.task.title}`;
  if (props.task.columnId === "doing") return `提交验证：${props.task.title}`;
  return `完成任务：${props.task.title}`;
});
const ageSince = computed(() => props.task.columnId === "doing"
  ? props.task.startedAt
  : props.task.columnId === "blocked" ? props.task.blockedSince : null,
);
const ageLabel = computed(() => elapsedLabel(ageSince.value));
const agingWarning = computed(() => isAgingWarning(ageSince.value));
const blockedReasonLabels = {
  people: "等待其他人",
  hardware: "等待硬件",
  environment: "等待环境",
  feedback: "等待反馈",
  technical: "技术问题",
  dependency: "外部依赖",
  other: "其他",
} as const;
const todayKey = computed(() => {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${today.getFullYear()}-${month}-${day}`;
});
const isOverdue = computed(() => {
  if (!props.task.dueDate || isDone.value) return false;
  return props.task.dueDate < todayKey.value;
});

const dueLabel = computed(() => {
  if (!props.task.dueDate) return "";
  const today = new Date();
  const date = new Date(`${props.task.dueDate}T00:00:00`);
  if (props.task.dueDate === todayKey.value) return "今天";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
  }).format(date);
});
const checklistProgress = computed(() => {
  if (!props.task.checklist.length) return "";
  return `${props.task.checklist.filter((item) => item.completed).length}/${props.task.checklist.length}`;
});

function onDragStart(event: DragEvent) {
  if (!event.dataTransfer) return;
  const prompt = buildAgentTaskPrompt(props.task);
  event.dataTransfer.setData("text/plain", prompt);
  event.dataTransfer.setData("application/x-kanboard-task-id", props.task.id);
  event.dataTransfer.effectAllowed = "copyMove";
}

function selectFromKeyboard(event: KeyboardEvent) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    emit("select", props.task.id);
  }
}
</script>

<template>
  <article
    class="task-card"
    :class="{ 'task-card--selected': selected, 'task-card--done': isDone, 'task-card--agent-active': isAgentActive }"
    :data-task-id="task.id"
    tabindex="0"
    draggable="true"
    @dragstart="onDragStart"
    @click="emit('select', task.id)"
    @keydown="selectFromKeyboard"
  >
    <div class="task-card__top">
      <button
        class="task-card__check"
        type="button"
        :aria-label="toggleLabel"
        :aria-pressed="isDone"
        @click.stop="emit('toggle', task)"
      >
        <svg v-if="isDone" viewBox="0 0 16 16" aria-hidden="true">
          <path d="m3.5 8.2 2.7 2.7 6.3-6.3" />
        </svg>
      </button>
      <h3>{{ task.title }}</h3>
    </div>
    <div v-if="task.project || task.tags.length" class="task-card__identity">
      <span v-if="task.project" class="task-card__project">
        <i :style="{ backgroundColor: task.project.color }" aria-hidden="true" />
        {{ task.project.name }}
      </span>
      <span v-for="tag in task.tags.slice(0, 2)" :key="tag.id" class="task-card__tag">#{{ tag.name }}</span>
      <span v-if="task.tags.length > 2" class="task-card__tag-more">+{{ task.tags.length - 2 }}</span>
    </div>
    <p v-if="task.description" class="task-card__description">{{ task.description }}</p>
    <div v-if="task.dueDate || task.priority === 'high' || ageLabel || checklistProgress || task.recurrenceRule !== 'none'" class="task-card__meta">
      <span v-if="ageLabel" class="task-card__age" :class="{ 'task-card__age--warning': agingWarning }">
        {{ task.columnId === "blocked" ? "阻塞" : "进行" }} · {{ ageLabel }}<template v-if="agingWarning"> ⚠</template>
      </span>
      <time
        v-if="task.dueDate"
        :datetime="task.dueDate"
        :class="{ 'task-card__due--overdue': isOverdue }"
      >
        {{ dueLabel }}
      </time>
      <span v-if="task.priority === 'high'" class="task-card__priority">高优先级</span>
      <span v-if="checklistProgress">清单 {{ checklistProgress }}</span>
      <span v-if="task.recurrenceRule !== 'none'">↻</span>
    </div>
    <p v-if="task.columnId === 'blocked' && task.blockedReason" class="task-card__blocked-reason">
      {{ blockedReasonLabels[task.blockedReason] }}
    </p>
    <button
      class="task-card__copy-btn"
      :class="{ 'task-card__copy-btn--copied': copied }"
      type="button"
      :title="copied ? '已复制 AI 派发 Prompt' : '复制 AI 派发 Prompt'"
      :aria-label="copied ? '已复制 AI 派发 Prompt' : '复制 AI 派发 Prompt'"
      @click.stop="copyPrompt"
      @keydown.stop
    >
      <svg v-if="copied" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m3.5 8.2 2.7 2.7 6.3-6.3" />
      </svg>
      <svg v-else viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
        <path d="M10.5 5.5V3.5a1.5 1.5 0 0 0-1.5-1.5H3.5a1.5 1.5 0 0 0-1.5 1.5V9.5a1.5 1.5 0 0 0 1.5 1.5h2" />
      </svg>
    </button>
  </article>
</template>
