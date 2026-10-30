<script setup lang="ts">
import { computed, inject, nextTick, ref, useId, type Ref } from "vue";
import { ChevronLeft } from "lucide-vue-next";
import { VueDraggable } from "vue-draggable-plus";
import { dragPointFrom, isPointInDragTrash } from "../drag/trashDropZone";
import { buildAgentTaskPrompt } from "../drag/agentPrompt";
import type { Task, TaskColumn } from "../types";
import TaskCard from "./TaskCard.vue";

const props = defineProps<{
  column: TaskColumn;
  selectedTaskId: string | null;
  dragGroup?: string;
  collapsed?: boolean;
  collapseDisabled?: boolean;
  showMatches?: boolean;
}>();

const emit = defineEmits<{
  select: [taskId: string];
  toggle: [task: Task];
  updateTasks: [columnId: string, tasks: Task[]];
  dragStart: [origin: { taskId: string; index: number }];
  taskDrop: [result: { taskId: string; intoTrash: boolean }];
  toggleCollapse: [columnId: string];
  updateWipLimit: [columnId: string, limit: number | null];
}>();

const headingId = `column-${useId()}`;
const currentHeadingId = headingId;
const motionEnabled = inject<Ref<boolean>>("motionEnabled", ref(!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches));
const sortMotionDuration = computed(() => motionEnabled.value
  ? Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--motion-sort")) || 120
  : 0);

const taskList = computed({
  get: () => props.column.tasks,
  set: (tasks: Task[]) => emit("updateTasks", props.column.id, tasks),
});
const wipCount = computed(() => props.column.totalTaskCount ?? props.column.tasks.length);
const wipExceeded = computed(() =>
  props.column.wipLimit !== null && wipCount.value > props.column.wipLimit,
);

const canEditWip = computed(() => props.column.id === "doing" || props.column.id === "verify" || props.column.wipLimit !== null);
const isEditingWip = ref(false);
const tempWipLimit = ref<number | null>(props.column.wipLimit ?? 2);
const wipInputRef = ref<HTMLInputElement | null>(null);

function startEditingWip() {
  if (!canEditWip.value) return;
  tempWipLimit.value = props.column.wipLimit ?? 2;
  isEditingWip.value = true;
  nextTick(() => {
    wipInputRef.value?.focus();
    wipInputRef.value?.select();
  });
}

function saveWipInline() {
  if (!isEditingWip.value) return;
  isEditingWip.value = false;
  let nextLimit: number | null = null;
  if (tempWipLimit.value !== null && tempWipLimit.value !== undefined && String(tempWipLimit.value).trim() !== "") {
    const num = Number(tempWipLimit.value);
    if (Number.isFinite(num) && num >= 1) {
      nextLimit = Math.floor(num);
    } else {
      nextLimit = props.column.wipLimit;
    }
  } else {
    nextLimit = null;
  }
  if (nextLimit !== props.column.wipLimit) {
    emit("updateWipLimit", props.column.id, nextLimit);
  }
}

function cancelEditingWip() {
  isEditingWip.value = false;
  tempWipLimit.value = props.column.wipLimit ?? 2;
}

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

function setDragData(dataTransfer: DataTransfer, dragEl: HTMLElement) {
  const taskId = dragEl?.dataset?.taskId;
  if (!taskId) return;
  const task = props.column.tasks.find((t) => t.id === taskId);
  if (!task) return;
  const prompt = buildAgentTaskPrompt(task);
  dataTransfer.setData("text/plain", prompt);
  dataTransfer.setData("application/x-kanboard-task-id", taskId);
  dataTransfer.effectAllowed = "copyMove";
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
    :class="[`board-column--${column.id}`, { 'board-column--wip-exceeded': wipExceeded, 'board-column--collapsed': collapsed }]"
    :aria-labelledby="currentHeadingId"
    :data-column="column.id"
  >
      <header class="board-column__header" :class="{ 'board-column__header--collapsed': collapsed }">
        <div>
          <span class="board-column__signal" aria-hidden="true" />
          <h2 :id="currentHeadingId">
            <button
              class="board-column__toggle"
              type="button"
              :aria-label="`${collapsed ? '展开' : '收起'}${column.title}列`"
              :aria-expanded="!collapsed"
              :disabled="collapseDisabled"
              @click="emit('toggleCollapse', column.id)"
            >
              <span>{{ column.title }}</span>
              <ChevronLeft :size="14" aria-hidden="true" stroke-width="1.5" />
            </button>
          </h2>
        </div>
        <form v-if="isEditingWip" class="board-column__wip-form" @submit.prevent="saveWipInline">
          <input
            ref="wipInputRef"
            v-model.number="tempWipLimit"
            type="number"
            min="1"
            max="99"
            class="board-column__wip-inline-input"
            aria-label="输入新的在制品上限"
            @blur="saveWipInline"
            @keydown.esc.stop="cancelEditingWip"
          />
        </form>
        <span
          v-else
          class="board-column__wip-badge"
          :class="{ 'board-column__wip-badge--editable': canEditWip }"
          :aria-label="column.wipLimit === null ? undefined : `在制品 ${wipCount} / ${column.wipLimit}${canEditWip ? '，点击修改上限' : ''}`"
          :title="canEditWip ? '点击修改上限' : undefined"
          :role="canEditWip ? 'button' : undefined"
          :tabindex="canEditWip ? 0 : undefined"
          @click="canEditWip ? startEditingWip() : undefined"
          @keydown.enter.prevent="canEditWip ? startEditingWip() : undefined"
        >
          {{ wipCount }}<template v-if="column.wipLimit !== null"> / {{ column.wipLimit }}</template>
          <strong v-if="wipExceeded">超限</strong>
        </span>
        <small v-if="collapsed && showMatches" class="board-column__matches">匹配 {{ column.tasks.length }}</small>
      </header>
      <VueDraggable
        v-show="!collapsed"
        v-model="taskList"
        class="board-column__tasks"
        :group="{ name: dragGroup ?? 'personal-tasks' }"
        :on-move="allowInsert"
        draggable=".task-card"
        filter=".task-card__check"
        :prevent-on-filter="false"
        :force-fallback="false"
        :set-data="setDragData"
        :animation="sortMotionDuration"
        easing="cubic-bezier(0.23, 1, 0.32, 1)"
        :inert="collapsed || undefined"
        :aria-hidden="collapsed || undefined"
        :disabled="collapsed"
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
