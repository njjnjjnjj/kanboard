<script setup lang="ts">
import { computed } from "vue";
import type { Task } from "../types";

const props = defineProps<{
  task: Task;
  selected: boolean;
}>();

const emit = defineEmits<{
  select: [taskId: string];
  toggle: [task: Task];
}>();

const isDone = computed(() => props.task.columnId === "done");
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
    :class="{ 'task-card--selected': selected, 'task-card--done': isDone }"
    :data-task-id="task.id"
    tabindex="0"
    @click="emit('select', task.id)"
    @keydown="selectFromKeyboard"
  >
    <div class="task-card__top">
      <button
        class="task-card__check"
        type="button"
        :aria-label="isDone ? `恢复任务：${task.title}` : `完成任务：${task.title}`"
        :aria-pressed="isDone"
        @click.stop="emit('toggle', task)"
      >
        <svg v-if="isDone" viewBox="0 0 16 16" aria-hidden="true">
          <path d="m3.5 8.2 2.7 2.7 6.3-6.3" />
        </svg>
      </button>
      <h3>{{ task.title }}</h3>
    </div>
    <p v-if="task.description" class="task-card__description">{{ task.description }}</p>
    <div v-if="task.dueDate || task.priority === 'high'" class="task-card__meta">
      <time
        v-if="task.dueDate"
        :datetime="task.dueDate"
        :class="{ 'task-card__due--overdue': isOverdue }"
      >
        {{ dueLabel }}
      </time>
      <span v-if="task.priority === 'high'" class="task-card__priority">高优先级</span>
    </div>
  </article>
</template>
