<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import BoardColumn from "./components/BoardColumn.vue";
import TaskInspector from "./components/TaskInspector.vue";
import {
  createTask,
  deleteTask,
  loadTaskWall,
  saveTaskOrder,
  updateTask,
} from "./data/taskRepository";
import type { Task, TaskChanges, TaskColumn } from "./types";

const columns = ref<TaskColumn[]>([]);
const selectedTaskId = ref<string | null>(null);
const quickTitle = ref("");
const quickInput = ref<HTMLInputElement | null>(null);
const loading = ref(true);
const saving = ref(false);
const errorMessage = ref("");
const statusMessage = ref("");

let orderQueue = Promise.resolve();
let statusTimer: number | undefined;

const selectedTask = computed(() => {
  for (const column of columns.value) {
    const task = column.tasks.find((item) => item.id === selectedTaskId.value);
    if (task) return task;
  }
  return null;
});

const openTaskCount = computed(() =>
  columns.value
    .filter((column) => column.id !== "done")
    .reduce((total, column) => total + column.tasks.length, 0),
);

function announce(message: string) {
  statusMessage.value = message;
  window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => {
    statusMessage.value = "";
  }, 2200);
}

async function load() {
  loading.value = true;
  errorMessage.value = "";
  try {
    columns.value = await loadTaskWall();
    if (selectedTaskId.value && !selectedTask.value) selectedTaskId.value = null;
  } catch (error) {
    console.error(error);
    errorMessage.value = "无法打开本地数据库。请关闭应用后重新启动。";
  } finally {
    loading.value = false;
  }
}

async function addTask() {
  const title = quickTitle.value.trim();
  const target = columns.value.find((column) => column.id === "todo");
  if (!title || !target) return;

  saving.value = true;
  try {
    const task = await createTask(title, target.id);
    target.tasks.push(task);
    quickTitle.value = "";
    selectedTaskId.value = task.id;
    announce("已添加到待处理");
  } catch (error) {
    console.error(error);
    announce("添加失败，请重试");
  } finally {
    saving.value = false;
  }
}

function updateColumnTasks(columnId: string, tasks: Task[]) {
  const column = columns.value.find((item) => item.id === columnId);
  if (column) {
    tasks.forEach((task) => {
      task.columnId = columnId;
    });
    column.tasks = tasks;
  }
}

function queueOrderSave() {
  orderQueue = orderQueue
    .then(() => saveTaskOrder(columns.value))
    .then(() => announce("任务位置已保存"))
    .catch(async (error) => {
      console.error(error);
      announce("位置保存失败，已恢复原顺序");
      await load();
    });
}

function removeTaskFromWall(taskId: string): Task | null {
  for (const column of columns.value) {
    const index = column.tasks.findIndex((task) => task.id === taskId);
    if (index >= 0) return column.tasks.splice(index, 1)[0] ?? null;
  }
  return null;
}

function findTask(taskId: string): Task | null {
  for (const column of columns.value) {
    const task = column.tasks.find((item) => item.id === taskId);
    if (task) return task;
  }
  return null;
}

async function saveChanges(taskId: string, changes: TaskChanges) {
  const task = findTask(taskId);
  if (!task) return;

  saving.value = true;
  try {
    await updateTask(taskId, changes);
    const moved = changes.columnId !== task.columnId;
    if (moved) {
      const removed = removeTaskFromWall(taskId);
      const target = columns.value.find((column) => column.id === changes.columnId);
      if (removed && target) target.tasks.push(removed);
    }
    Object.assign(task, changes, {
      dueDate: changes.dueDate || null,
      completedAt: changes.columnId === "done" ? task.completedAt ?? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
    });
    if (moved) queueOrderSave();
    announce("任务已保存");
  } catch (error) {
    console.error(error);
    announce("保存失败，请重试");
  } finally {
    saving.value = false;
  }
}

async function toggleTask(task: Task) {
  const nextColumnId = task.columnId === "done" ? "todo" : "done";
  await saveChanges(task.id, {
    title: task.title,
    description: task.description,
    dueDate: task.dueDate,
    priority: task.priority,
    columnId: nextColumnId,
  });
}

async function removeTask(taskId: string) {
  saving.value = true;
  try {
    await deleteTask(taskId);
    removeTaskFromWall(taskId);
    selectedTaskId.value = null;
    announce("任务已删除");
  } catch (error) {
    console.error(error);
    announce("删除失败，请重试");
  } finally {
    saving.value = false;
  }
}

function selectRelativeTask(offset: number) {
  const tasks = columns.value.flatMap((column) => column.tasks);
  if (!tasks.length) return;
  const currentIndex = tasks.findIndex((task) => task.id === selectedTaskId.value);
  const nextIndex = currentIndex < 0
    ? 0
    : (currentIndex + offset + tasks.length) % tasks.length;
  selectedTaskId.value = tasks[nextIndex]?.id ?? null;
  nextTick(() => {
    document.querySelector<HTMLElement>(`[data-task-id="${selectedTaskId.value}"]`)?.focus();
  });
}

function handleGlobalKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement;
  const editing = /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable;
  if (event.key === "Escape") {
    selectedTaskId.value = null;
    quickInput.value?.focus();
    return;
  }
  if (editing || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key.toLowerCase() === "n") {
    event.preventDefault();
    quickInput.value?.focus();
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    selectRelativeTask(1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    selectRelativeTask(-1);
  }
}

onMounted(() => {
  window.addEventListener("keydown", handleGlobalKeydown);
  load();
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleGlobalKeydown);
  window.clearTimeout(statusTimer);
});
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="wordmark" aria-label="本地板">
        <span class="wordmark__mark" aria-hidden="true"><i /><i /><i /><i /></span>
        <span>本地板</span>
      </div>
      <div class="wall-heading">
        <h1>我的任务墙</h1>
        <span>{{ openTaskCount }} 项未完成</span>
      </div>
      <form class="quick-add" @submit.prevent="addTask">
        <input
          ref="quickInput"
          v-model="quickTitle"
          type="text"
          maxlength="160"
          autocomplete="off"
          aria-label="新任务标题"
          placeholder="快速添加待办…"
        />
        <button class="primary-button" type="submit" :disabled="saving || !quickTitle.trim()">添加</button>
      </form>
    </header>

    <div v-if="loading" class="system-state" role="status">正在打开本地任务墙…</div>
    <div v-else-if="errorMessage" class="system-state system-state--error" role="alert">
      <p>{{ errorMessage }}</p>
      <button class="secondary-button" type="button" @click="load">重试</button>
    </div>
    <main v-else class="wall-workspace">
      <div class="board-columns" aria-label="个人任务墙">
        <BoardColumn
          v-for="column in columns"
          :key="column.id"
          :column="column"
          :selected-task-id="selectedTaskId"
          @select="selectedTaskId = $event"
          @toggle="toggleTask"
          @update-tasks="updateColumnTasks"
          @reorder="queueOrderSave"
        />
      </div>
      <TaskInspector
        :task="selectedTask"
        :columns="columns"
        :saving="saving"
        @save="saveChanges"
        @delete="removeTask"
        @close="selectedTaskId = null"
      />
    </main>

    <div class="keyboard-hint" aria-hidden="true"><kbd>N</kbd> 新建 <kbd>↑↓</kbd> 浏览 <kbd>Esc</kbd> 关闭详情</div>
    <div class="sr-status" role="status" aria-live="polite">{{ statusMessage }}</div>
    <Transition name="toast">
      <div v-if="statusMessage" class="toast-message">{{ statusMessage }}</div>
    </Transition>
  </div>
</template>
