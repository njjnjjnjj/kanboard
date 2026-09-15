<script setup lang="ts">
import { computed } from "vue";
import { VueDraggable } from "vue-draggable-plus";
import { dragPointFrom, isPointInDragTrash } from "../drag/trashDropZone";
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
  dragStart: [origin: { taskId: string; index: number }];
  taskDrop: [result: { taskId: string; intoTrash: boolean }];
}>();

const taskList = computed({
  get: () => props.column.tasks,
  set: (tasks: Task[]) => emit("updateTasks", props.column.id, tasks),
});

/**
 * The delete zone covers the lower part of every column. Sortable resolves the
 * drop target from the element under the pointer, so a column must refuse any
 * insertion while the pointer is inside the zone, otherwise the card is handed
 * to whichever column sits underneath it.
 */
function allowInsert(_event: unknown, originalEvent: unknown) {
  return !isPointInDragTrash(dragPointFrom(originalEvent));
}

interface SortableDragEvent {
  item?: HTMLElement | null;
  oldDraggableIndex?: number;
  originalEvent?: unknown;
}

function startDrag(event: SortableDragEvent) {
  emit("dragStart", {
    taskId: event.item?.dataset?.taskId ?? "",
    index: event.oldDraggableIndex ?? -1,
  });
}

function endDrag(event: SortableDragEvent) {
  const taskId = event.item?.dataset?.taskId ?? "";
  // Read the zone geometry while it is still painted, then hide it.
  const intoTrash = isPointInDragTrash(dragPointFrom(event.originalEvent));
  emit("taskDrop", { taskId, intoTrash });
}
</script>

<template>
  <section
    class="board-column"
    :class="`board-column--${column.id}`"
    :aria-labelledby="`column-${column.id}`"
    :data-column="column.id"
  >
    <header class="board-column__header">
      <div>
        <span class="board-column__signal" aria-hidden="true" />
        <h2 :id="`column-${column.id}`">{{ column.title }}</h2>
      </div>
      <span>{{ column.tasks.length }}</span>
    </header>

    <VueDraggable
      v-model="taskList"
      class="board-column__tasks"
      :group="{ name: 'personal-tasks' }"
      :on-move="allowInsert"
      draggable=".task-card"
      filter=".task-card__check"
      :prevent-on-filter="false"
      :force-fallback="true"
      :fallback-on-body="true"
      :fallback-tolerance="4"
      :animation="160"
      easing="cubic-bezier(0.2, 0.8, 0.2, 1)"
      ghost-class="task-card--ghost"
      chosen-class="task-card--chosen"
      drag-class="task-card--dragging"
      :aria-label="`${column.title}任务列表`"
      @start="startDrag"
      @end="endDrag"
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
