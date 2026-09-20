<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { listen, type Event, type UnlistenFn } from "@tauri-apps/api/event";
import BoardColumn from "./components/BoardColumn.vue";
import FlowDashboard from "./components/FlowDashboard.vue";
import ProjectEditor from "./components/ProjectEditor.vue";
import ProjectSidebar from "./components/ProjectSidebar.vue";
import TaskInspector from "./components/TaskInspector.vue";
import TaskTrash from "./components/TaskTrash.vue";
import {
  createRecurringSuccessor,
  createTask,
  deleteTag,
  deleteTask,
  loadDeletedTasks,
  loadProjects,
  loadTags,
  loadTaskEvents,
  loadTaskWall,
  restoreTask,
  saveTaskOrder,
  saveProject,
  trashTask,
  updateTask,
} from "./data/taskRepository";
import { restoreDraggedCardToOrigin, type DragOrigin } from "./drag/dragPlaceholder";
import { dragPointFrom, isPointInDragTrash } from "./drag/trashDropZone";
import { startFirstOnboarding, startOnboarding } from "./onboarding";
import { calculateFlowMetrics } from "./flowMetrics";
import type { DeletedTask, FlowMetrics, Project, ProjectChanges, Tag, Task, TaskChanges, TaskColumn, TaskEvent, TaskScope } from "./types";

const columns = ref<TaskColumn[]>([]);
const projects = ref<Project[]>([]);
const tags = ref<Tag[]>([]);
const scope = ref<TaskScope>({ kind: "all" });
const selectedTaskId = ref<string | null>(null);
const quickTitle = ref("");
const quickInput = ref<HTMLInputElement | null>(null);
const searchInput = ref<HTMLInputElement | null>(null);
const searchQuery = ref("");
const filterMode = ref<"all" | "due" | "high" | "aging">("all");
const swimlaneMode = ref(false);
const dashboardOpen = ref(false);
const taskEvents = ref<TaskEvent[]>([]);
const deletedTasks = ref<DeletedTask[]>([]);
const recentlyDeleted = ref<{ task: Task; deletedAt: string } | null>(null);
const undoSeconds = ref(3);
const loading = ref(true);
const saving = ref(false);
const errorMessage = ref("");
const statusMessage = ref("");
const draggingTask = ref(false);
const trashActive = ref(false);
const dragOrigin = ref<DragOrigin | null>(null);
const projectEditorOpen = ref(false);
const editingProject = ref<Project | null>(null);

let orderQueue: Promise<boolean> = Promise.resolve(true);
let statusTimer: number | undefined;
let unlistenTaskCreated: UnlistenFn | undefined;
let undoTimer: number | undefined;

const selectedTask = computed(() => {
  for (const column of columns.value) {
    const task = column.tasks.find((item) => item.id === selectedTaskId.value);
    if (task) return task;
  }
  return null;
});

const allTasks = computed(() => columns.value.flatMap((column) => column.tasks));
const metrics = computed<FlowMetrics>(() => calculateFlowMetrics(allTasks.value, taskEvents.value));

function matchesScope(task: Task) {
  const currentScope = scope.value;
  if (currentScope.kind === "trash") return false;
  if (currentScope.kind === "all") return true;
  if (currentScope.kind === "unassigned") return task.projectId === null;
  if (currentScope.kind === "project") return task.projectId === currentScope.id;
  return task.tags.some((tag) => tag.id === currentScope.id);
}

const visibleColumns = computed(() =>
  columns.value.map((column) => ({
    ...column,
    totalTaskCount: column.tasks.length,
    tasks: column.tasks.filter(isVisibleTask),
  })),
);

const swimlanes = computed(() => {
  const lanes = projects.value
    .filter((project) => project.status === "active" && allTasks.value.some((task) => task.projectId === project.id && isVisibleTask(task)))
    .map((project) => ({ id: project.id, name: project.name, color: project.color, projectId: project.id as string | null }));
  if (allTasks.value.some((task) => task.projectId === null && isVisibleTask(task))) {
    lanes.push({ id: "unassigned", name: "无项目", color: "#8a8d87", projectId: null });
  }
  return lanes.map((lane) => ({
    ...lane,
    columns: columns.value.map((column) => ({
      ...column,
      totalTaskCount: column.tasks.filter((task) => task.projectId === lane.projectId).length,
      tasks: column.tasks.filter((task) => task.projectId === lane.projectId && isVisibleTask(task)),
    })),
  }));
});

const scopeTitle = computed(() => {
  const currentScope = scope.value;
  if (currentScope.kind === "trash") return "回收站";
  if (currentScope.kind === "project") {
    return projects.value.find((project) => project.id === currentScope.id)?.name ?? "项目";
  }
  if (currentScope.kind === "tag") {
    const tag = tags.value.find((item) => item.id === currentScope.id);
    return tag ? `#${tag.name}` : "标签";
  }
  return currentScope.kind === "unassigned" ? "无项目" : "全部任务";
});

const activeProject = computed(() => {
  const currentScope = scope.value;
  if (currentScope.kind !== "project") return null;
  return projects.value.find((project) => project.id === currentScope.id) ?? null;
});

const openTaskCount = computed(() =>
  visibleColumns.value
    .filter((column) => column.id !== "done")
    .reduce((total, column) => total + column.tasks.length, 0),
);

const totalOpenTaskCount = computed(() =>
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
    const [taskWall, projectList, tagList, events, trashedTasks] = await Promise.all([
      loadTaskWall(),
      loadProjects(),
      loadTags(),
      loadTaskEvents(),
      loadDeletedTasks(),
    ]);
    columns.value = taskWall;
    projects.value = projectList;
    tags.value = tagList;
    taskEvents.value = events;
    deletedTasks.value = trashedTasks;
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
    const projectId = scope.value.kind === "project" ? scope.value.id : null;
    const task = await createTask(title, target.id, projectId);
    task.projectId = projectId;
    task.project = projectId
      ? projects.value.find((project) => project.id === projectId) ?? null
      : null;
    target.tasks.push(task);
    quickTitle.value = "";
    selectedTaskId.value = task.id;
    await nextTick();
    // 标题来自快速添加，所以焦点落在还没填的“任务说明”上，可以直接接着写
    document.querySelector<HTMLTextAreaElement>("[data-inspector-description]")?.focus();
    announce("已添加到收集箱");
  } catch (error) {
    console.error(error);
    announce("添加失败，请重试");
  } finally {
    saving.value = false;
  }
}

function updateColumnTasks(columnId: string, tasks: Task[], projectId: string | null | undefined = undefined) {
  const column = columns.value.find((item) => item.id === columnId);
  if (column) {
    if (scope.value.kind === "all" && !searchQuery.value && filterMode.value === "all" && projectId === undefined) {
      column.tasks = tasks;
      return;
    }
    const belongsToView = (task: Task) => isVisibleTask(task) && (projectId === undefined || task.projectId === projectId);
    const queue = [...tasks];
    const merged: Task[] = [];
    for (const current of column.tasks) {
      if (belongsToView(current)) {
        const replacement = queue.shift();
        if (replacement) merged.push(replacement);
      } else {
        merged.push(current);
      }
    }
    column.tasks = [...merged, ...queue];
  }
}

function queueOrderSave() {
  orderQueue = orderQueue
    .then(() => saveTaskOrder(columns.value))
    .then(() => {
      announce("任务位置已保存");
      return true;
    })
    .catch(async (error) => {
      console.error(error);
      announce("位置保存失败，已恢复原顺序");
      await load();
      return false;
    });
  return orderQueue;
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
    const previousColumnId = task.columnId;
    if (changes.columnId === "blocked" && !changes.blockedReason) changes.blockedReason = "other";
    const shouldRepeat = changes.columnId === "done" && previousColumnId !== "done" && changes.recurrenceRule !== "none";
    const savedTags = await updateTask(taskId, changes);
    const moved = changes.columnId !== previousColumnId;
    if (moved) {
      const removed = removeTaskFromWall(taskId);
      const target = columns.value.find((column) => column.id === changes.columnId);
      if (removed && target) target.tasks.push(removed);
    }
    const { tagNames: _tagNames, ...taskChanges } = changes;
    Object.assign(task, taskChanges, {
      dueDate: changes.dueDate || null,
      project: changes.projectId
        ? projects.value.find((project) => project.id === changes.projectId) ?? null
        : null,
      tags: savedTags,
      completedAt: changes.columnId === "done" ? task.completedAt ?? new Date().toISOString() : null,
      startedAt: changes.columnId === "doing"
        ? previousColumnId === "doing" ? task.startedAt : new Date().toISOString()
        : null,
      blockedReason: changes.columnId === "blocked" ? changes.blockedReason : null,
      blockedSince: changes.columnId === "blocked"
        ? previousColumnId === "blocked" ? task.blockedSince : new Date().toISOString()
        : null,
      checklist: changes.checklist.map((item, index) => ({ ...item, position: (index + 1) * 1000 })),
      recurrenceRule: changes.recurrenceRule,
      updatedAt: new Date().toISOString(),
    });
    for (const tag of savedTags) {
      if (!tags.value.some((item) => item.id === tag.id)) tags.value.push(tag);
    }
    tags.value.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    if (moved) queueOrderSave();
    if (shouldRepeat) {
      await orderQueue;
      await createRecurringSuccessor(task);
      await load();
      announce("任务已完成，下一次任务已加入就绪");
      return;
    }
    if (!isVisibleTask(task)) selectedTaskId.value = null;
    announce("任务已保存");
  } catch (error) {
    console.error(error);
    announce("保存失败，请重试");
  } finally {
    saving.value = false;
  }
}

async function toggleTask(task: Task) {
  const nextColumnId = task.columnId === "done"
    ? "todo"
    : task.columnId === "doing" ? "verify" : "done";
  await saveChanges(task.id, {
    title: task.title,
    description: task.description,
    dueDate: task.dueDate,
    priority: task.priority,
    columnId: nextColumnId,
    projectId: task.projectId,
    tagNames: task.tags.map((tag) => tag.name),
    blockedReason: task.blockedReason,
    checklist: task.checklist,
    recurrenceRule: task.recurrenceRule,
  });
}

async function handleTaskCreated(event: Event<string | null>) {
  await load();
  if (event.payload) await openTask(event.payload);
}

function selectScope(nextScope: TaskScope) {
  scope.value = nextScope;
  if (nextScope.kind === "project") swimlaneMode.value = false;
  if (selectedTask.value && !matchesScope(selectedTask.value)) selectedTaskId.value = null;
}

function openProjectEditor(project: Project | null = null) {
  editingProject.value = project;
  projectEditorOpen.value = true;
}

async function persistProject(changes: ProjectChanges) {
  saving.value = true;
  try {
    const project = await saveProject(changes, editingProject.value?.id ?? null);
    const index = projects.value.findIndex((item) => item.id === project.id);
    if (index >= 0) projects.value[index] = { ...projects.value[index], ...project };
    else projects.value.push(project);
    projects.value.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    for (const task of allTasks.value) {
      if (task.projectId === project.id) {
        task.project = { id: project.id, name: project.name, color: project.color };
      }
    }
    if (project.status === "archived" && scope.value.kind === "project" && scope.value.id === project.id) {
      scope.value = { kind: "all" };
    }
    projectEditorOpen.value = false;
    announce(editingProject.value ? "项目已更新" : "项目已创建");
  } catch (error) {
    console.error(error);
    announce("项目保存失败，名称可能已存在");
  } finally {
    saving.value = false;
  }
}

async function removeTag(tag: Tag) {
  saving.value = true;
  try {
    await deleteTag(tag.id);
    tags.value = tags.value.filter((item) => item.id !== tag.id);
    for (const task of allTasks.value) {
      task.tags = task.tags.filter((item) => item.id !== tag.id);
    }
    if (scope.value.kind === "tag" && scope.value.id === tag.id) {
      scope.value = { kind: "all" };
    }
    announce(`已删除标签 #${tag.name}`);
  } catch (error) {
    console.error(error);
    announce("标签删除失败，请重试");
  } finally {
    saving.value = false;
  }
}

async function removeTask(taskId: string) {
  const task = findTask(taskId);
  if (!task) return;

  saving.value = true;
  // Detach from the wall first: a drop on the delete zone may already have been
  // committed into whichever column the pointer last hovered, and that card must
  // never be painted in a column while the delete is still in flight.
  removeTaskFromWall(taskId);
  if (selectedTaskId.value === taskId) selectedTaskId.value = null;

  try {
    const deletedAt = await trashTask(taskId);
    deletedTasks.value.unshift({ ...task, deletedAt });
    recentlyDeleted.value = { task, deletedAt };
    undoSeconds.value = 3;
    window.clearInterval(undoTimer);
    const deadline = Date.now() + 3000;
    undoTimer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      undoSeconds.value = remaining;
      if (remaining === 0) {
        window.clearInterval(undoTimer);
        recentlyDeleted.value = null;
      }
    }, 100);
    announce("任务已移入回收站");
  } catch (error) {
    console.error(error);
    announce("删除失败，请重试");
    await load();
  } finally {
    saving.value = false;
  }
}

/** Only real pointer coordinates decide whether a drag ended on the delete zone. */
function trackTrashPointer(event: MouseEvent | TouchEvent) {
  const over = isPointInDragTrash(dragPointFrom(event));
  trashActive.value = over;
  // While the pointer is on "delete" the card belongs to no column: keep it on the
  // slot it came from instead of the column the pointer last hovered.
  if (over) restoreDraggedCardToOrigin(dragOrigin.value);
}

function stopTrashTracking() {
  window.removeEventListener("mousemove", trackTrashPointer, true);
  window.removeEventListener("touchmove", trackTrashPointer, true);
  trashActive.value = false;
  dragOrigin.value = null;
}

function startTrashTracking() {
  window.addEventListener("mousemove", trackTrashPointer, true);
  window.addEventListener("touchmove", trackTrashPointer, true);
}

function beginTaskDrag(columnId: string, origin: { taskId: string; index: number }) {
  dragOrigin.value = { columnId, taskId: origin.taskId, index: origin.index };
  draggingTask.value = true;
  startTrashTracking();
}

async function handleTaskDrop(result: { taskId: string; intoTrash: boolean }) {
  const origin = dragOrigin.value;
  draggingTask.value = false;
  stopTrashTracking();
  if (!result.intoTrash) {
    const saved = await queueOrderSave();
    const movedTask = findTask(result.taskId);
    if (saved && origin?.columnId !== "done" && movedTask?.columnId === "done" && movedTask.recurrenceRule !== "none") {
      await createRecurringSuccessor(movedTask);
      await load();
      announce("任务已完成，下一次任务已加入就绪");
    }
    nextTick(() => {
      const exceeded = columns.value.find((column) =>
        column.wipLimit !== null && column.tasks.length > column.wipLimit,
      );
      if (exceeded) announce(`${exceeded.title}已超过 WIP 上限，建议先完成一项`);
    });
    return;
  }
  // Deleting is decided here and nowhere else, so a card released over the
  // delete zone can never stay behind in the column beneath it.
  if (result.taskId) await removeTask(result.taskId);
}

function selectRelativeTask(offset: number) {
  const tasks = visibleColumns.value.flatMap((column) => column.tasks);
  if (!tasks.length) return;
  const currentIndex = tasks.findIndex((task) => task.id === selectedTaskId.value);
  const nextIndex = currentIndex < 0
    ? 0
    : (currentIndex + offset + tasks.length) % tasks.length;
  const taskId = tasks[nextIndex]?.id;
  if (!taskId) return;
  openTask(taskId);
}

function matchesFilters(task: Task) {
  const query = searchQuery.value.trim().toLocaleLowerCase();
  if (query && ![task.title, task.description, task.project?.name ?? "", ...task.tags.map((tag) => tag.name)]
    .some((value) => value.toLocaleLowerCase().includes(query))) return false;
  if (filterMode.value === "due") return Boolean(task.dueDate) && task.columnId !== "done";
  if (filterMode.value === "high") return task.priority === "high";
  if (filterMode.value === "aging") {
    return task.columnId === "doing" && Boolean(task.startedAt) && Date.now() - Date.parse(task.startedAt!) >= 3 * 86400000;
  }
  return true;
}

function isVisibleTask(task: Task) {
  return matchesScope(task) && matchesFilters(task);
}

async function openTask(taskId: string) {
  selectedTaskId.value = taskId;
  await nextTick();
  document.querySelector<HTMLTextAreaElement>("[data-inspector-title]")?.focus();
}

async function closeTask() {
  const taskId = selectedTaskId.value;
  selectedTaskId.value = null;
  await nextTick();
  if (taskId) {
    document.querySelector<HTMLElement>(`[data-task-id="${taskId}"]`)?.focus();
  }
}

async function undoDelete() {
  const pending = recentlyDeleted.value;
  if (!pending) return;
  window.clearInterval(undoTimer);
  recentlyDeleted.value = null;
  saving.value = true;
  try {
    await restoreTask(pending.task.id);
    await load();
    announce("已撤回删除");
  } catch (error) {
    console.error(error);
    await load();
    announce("撤回失败，请从回收站恢复");
  } finally {
    saving.value = false;
  }
}

async function restoreDeletedTask(task: DeletedTask) {
  saving.value = true;
  try {
    await restoreTask(task.id);
    await load();
    announce(`已恢复：${task.title}`);
  } catch (error) {
    console.error(error);
    announce("恢复失败，请重试");
  } finally {
    saving.value = false;
  }
}

async function permanentlyDeleteTask(task: DeletedTask) {
  saving.value = true;
  try {
    await deleteTask(task.id);
    deletedTasks.value = deletedTasks.value.filter((item) => item.id !== task.id);
    if (recentlyDeleted.value?.task.id === task.id) {
      window.clearInterval(undoTimer);
      recentlyDeleted.value = null;
    }
    announce("任务已永久删除");
  } catch (error) {
    console.error(error);
    announce("永久删除失败，请重试");
  } finally {
    saving.value = false;
  }
}

function handleGlobalKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement;
  const editing = /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    quickInput.value?.focus();
    quickInput.value?.select();
    return;
  }
  if (event.key === "Escape") {
    if (selectedTaskId.value) closeTask();
    else quickInput.value?.focus();
    return;
  }
  if (editing || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === "/") {
    event.preventDefault();
    searchInput.value?.focus();
  } else if (event.key.toLowerCase() === "d") {
    dashboardOpen.value = true;
  } else if (event.key.toLowerCase() === "n") {
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

onMounted(async () => {
  window.addEventListener("keydown", handleGlobalKeydown);
  unlistenTaskCreated = await listen<string | null>("task-created", handleTaskCreated);
  await load();
  await nextTick();
  const splash = document.querySelector<HTMLElement>("#startup-splash");
  if (splash) {
    splash.setAttribute("aria-hidden", "true");
    window.setTimeout(() => splash.remove(), 180);
  }
  if (errorMessage.value) return;
  startFirstOnboarding();
});

onBeforeUnmount(() => {
  stopTrashTracking();
  window.removeEventListener("keydown", handleGlobalKeydown);
  unlistenTaskCreated?.();
  window.clearTimeout(statusTimer);
  window.clearInterval(undoTimer);
});
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="wall-heading">
        <span class="wall-heading__mark" aria-hidden="true" />
        <h1>任务墙</h1>
        <span>{{ totalOpenTaskCount }} 项未完成</span>
      </div>
      <form class="quick-add" data-tour="quick-capture" @submit.prevent="addTask">
        <span class="quick-add__mark" aria-hidden="true">＋</span>
        <input
          ref="quickInput"
          v-model="quickTitle"
          type="text"
          maxlength="160"
          autocomplete="off"
          aria-label="新任务标题"
          placeholder="记下一件事，回车加入收集箱"
        />
        <button class="primary-button" type="submit" :disabled="saving || !quickTitle.trim()">添加任务</button>
      </form>
      <div class="header-actions">
        <button
          class="text-button guide-button"
          data-tour="guide-help"
          type="button"
          :disabled="loading || Boolean(errorMessage)"
          @click="startOnboarding()"
        >使用引导</button>
        <div class="capture-shortcut" aria-hidden="true"><kbd>Ctrl K</kbd><span>快速记录</span></div>
      </div>
    </header>

    <div v-if="loading" class="system-state" role="status">正在打开本地任务墙…</div>
    <div v-else-if="errorMessage" class="system-state system-state--error" role="alert">
      <p>{{ errorMessage }}</p>
      <button class="secondary-button" type="button" @click="load">重试</button>
    </div>
    <main v-else class="wall-workspace">
      <ProjectSidebar
        data-tour="project-filter"
        :projects="projects"
        :tags="tags"
        :tasks="allTasks"
        :scope="scope"
        :trash-count="deletedTasks.length"
        @select="selectScope"
        @create-project="openProjectEditor()"
        @edit-project="openProjectEditor"
        @delete-tag="removeTag"
      />
      <TaskTrash
        v-if="scope.kind === 'trash'"
        :tasks="deletedTasks"
        :busy="saving"
        @restore="restoreDeletedTask"
        @delete="permanentlyDeleteTask"
      />
      <section v-else class="board-workspace" :aria-label="scopeTitle">
        <header class="board-context">
          <div>
            <span v-if="activeProject" class="project-dot" :style="{ backgroundColor: activeProject.color }" aria-hidden="true" />
            <h2>{{ scopeTitle }}</h2>
            <span>{{ openTaskCount }} 项未完成</span>
          </div>
          <div class="board-tools">
            <label class="board-search" data-tour="search-filter">
              <span aria-hidden="true">⌕</span>
              <input ref="searchInput" v-model="searchQuery" type="search" placeholder="搜索任务 /" aria-label="搜索任务" />
            </label>
            <div class="filter-tabs" data-tour="flow-filters" aria-label="任务筛选">
              <button type="button" :class="{ active: filterMode === 'all' }" @click="filterMode = 'all'">全部</button>
              <button type="button" :class="{ active: filterMode === 'due' }" @click="filterMode = 'due'">有期限</button>
              <button type="button" :class="{ active: filterMode === 'high' }" @click="filterMode = 'high'">高优先级</button>
              <button type="button" :class="{ active: filterMode === 'aging' }" @click="filterMode = 'aging'">长期 WIP</button>
            </div>
            <button class="tool-button" data-tour="swimlane" type="button" :aria-pressed="swimlaneMode" :disabled="scope.kind === 'project'" @click="swimlaneMode = !swimlaneMode">泳道</button>
            <button class="tool-button" data-tour="flow-dashboard" type="button" @click="dashboardOpen = true">统计</button>
            <button v-if="activeProject" class="text-button" type="button" @click="openProjectEditor(activeProject)">项目设置</button>
          </div>
        </header>
      <div
        v-if="!swimlaneMode || scope.kind === 'project'"
        class="board-columns"
        :class="{ 'board-columns--trash-target': trashActive }"
        aria-label="个人任务墙"
      >
        <BoardColumn
          v-for="column in visibleColumns"
          :key="column.id"
          :column="column"
          :selected-task-id="selectedTaskId"
          @select="openTask"
          @toggle="toggleTask"
          @update-tasks="updateColumnTasks"
          @task-drop="handleTaskDrop"
          @drag-start="beginTaskDrag(column.id, $event)"
        />
      </div>
      <div v-else class="swimlane-board" aria-label="按项目分组的任务墙">
        <section v-for="lane in swimlanes" :key="lane.id" class="swimlane-row">
          <header><i :style="{ backgroundColor: lane.color }" /><strong>{{ lane.name }}</strong></header>
          <div class="swimlane-columns">
            <BoardColumn
              v-for="column in lane.columns"
              :key="`${lane.id}-${column.id}`"
              :column="column"
              :selected-task-id="selectedTaskId"
              :drag-group="`lane-${lane.id}`"
              @select="openTask"
              @toggle="toggleTask"
              @update-tasks="(columnId, tasks) => updateColumnTasks(columnId, tasks, lane.projectId)"
              @task-drop="handleTaskDrop"
              @drag-start="beginTaskDrag(column.id, $event)"
            />
          </div>
        </section>
        <div v-if="!swimlanes.length" class="swimlane-empty">当前筛选下没有任务</div>
      </div>
      <button
        class="drag-trash"
        :class="{
          'drag-trash--visible': draggingTask || recentlyDeleted,
          'drag-trash--active': trashActive,
          'drag-trash--undo': recentlyDeleted,
        }"
        data-drag-trash
        type="button"
        :tabindex="recentlyDeleted ? 0 : -1"
        :aria-disabled="!recentlyDeleted"
        :aria-hidden="!draggingTask && !recentlyDeleted"
        :aria-label="recentlyDeleted ? '撤回删除' : '拖到这里删除任务'"
        @click="recentlyDeleted && undoDelete()"
      >
        <span v-if="recentlyDeleted" :key="recentlyDeleted.task.id" class="drag-trash__countdown" aria-hidden="true" />
        <svg v-if="recentlyDeleted" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M6.5 6H3.5V3M3.8 6a7 7 0 1 1-.3 7" />
        </svg>
        <svg v-else viewBox="0 0 20 20" aria-hidden="true">
          <path d="M3.5 5.5h13M8 3.5h4M6 5.5l.6 11h6.8l.6-11M8.2 8.2v5.5M11.8 8.2v5.5" />
        </svg>
        <span>{{ recentlyDeleted ? `撤回删除 · ${undoSeconds} 秒` : "拖到这里删除" }}</span>
      </button>
      </section>
      <Transition name="task-drawer">
        <div v-if="selectedTask" class="task-drawer-layer" @click.self="closeTask">
          <TaskInspector
            :task="selectedTask"
            :columns="columns"
            :projects="projects"
            :tags="tags"
            :saving="saving"
            @save="saveChanges"
            @delete="removeTask"
            @close="closeTask"
          />
        </div>
      </Transition>
    </main>

    <ProjectEditor
      :open="projectEditorOpen"
      :project="editingProject"
      :saving="saving"
      @close="projectEditorOpen = false"
      @save="persistProject"
    />

    <FlowDashboard :open="dashboardOpen" :metrics="metrics" @close="dashboardOpen = false" />

    <div class="sr-status" role="status" aria-live="polite">{{ statusMessage }}</div>
    <Transition name="toast">
      <div v-if="statusMessage" class="toast-message">{{ statusMessage }}</div>
    </Transition>
  </div>
</template>
