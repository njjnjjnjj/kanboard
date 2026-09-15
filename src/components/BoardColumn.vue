<script setup lang="ts">
import { computed } from "vue";
import { VueDraggable } from "vue-draggable-plus";
import type { Task, TaskColumn } from "../types";
import TaskCard from "./TaskCard.vue";

const props = defineProps<{
  column: TaskColumn;
  selectedTaskId: string | null;
}>();

const emit = defineEmits<{
  select: [taskId: string];
  toggle: [task: Task];
  updateTasks: [columnId: string, tasks: Task[]];
  reorder: [];
}>();

const taskList = computed({
  get: () => props.column.tasks,
  set: (tasks: Task[]) => emit("updateTasks", props.column.id, tasks),
});
</script>

<template>
  <section class="board-column" :aria-labelledby="`column-${column.id}`">
    <header class="board-column__header">
      <h2 :id="`column-${column.id}`">{{ column.title }}</h2>
      <span>{{ column.tasks.length }}</span>
    </header>

    <VueDraggable
      v-model="taskList"
      class="board-column__tasks"
      :group="{ name: 'personal-tasks' }"
      draggable=".task-card"
      handle=".task-card__grip"
      :force-fallback="true"
      :fallback-on-body="true"
      :fallback-tolerance="4"
      :animation="160"
      easing="cubic-bezier(0.2, 0.8, 0.2, 1)"
      ghost-class="task-card--ghost"
      chosen-class="task-card--chosen"
      drag-class="task-card--dragging"
      :aria-label="`${column.title}任务列表`"
      @end="emit('reorder')"
    >
      <TaskCard
        v-for="task in column.tasks"
        :key="task.id"
        :task="task"
        :selected="selectedTaskId === task.id"
        @select="emit('select', $event)"
        @toggle="emit('toggle', $event)"
      />
    </VueDraggable>
  </section>
</template>
