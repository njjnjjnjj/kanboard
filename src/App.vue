<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, watch } from "vue";
import { createBoardMotion } from "./boardMotion";
import SurfaceMotion from "./components/SurfaceMotion.vue";
import { invoke } from "@tauri-apps/api/core";
import { listen, type Event, type UnlistenFn } from "@tauri-apps/api/event";
import { onAction } from "@tauri-apps/plugin-notification";
import { Plus, Search, Trash2, Undo2 } from "lucide-vue-next";
import BoardColumn from "./components/BoardColumn.vue";
import FlowDashboard from "./components/FlowDashboard.vue";
import ProjectEditor from "./components/ProjectEditor.vue";
import ProjectSidebar from "./components/ProjectSidebar.vue";
import SettingsPanel from "./components/SettingsPanel.vue";
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
  sortDoneTasks,
  trashTask,
  updateColumnWipLimit,
  updateTask,
} from "./data/taskRepository";
import { restoreDraggedCardToOrigin, type DragOrigin } from "./drag/dragPlaceholder";
import { dragPointFrom, isPointInDragTrash } from "./drag/trashDropZone";
import { startFirstOnboarding, startOnboarding } from "./onboarding";
import { calculateFlowMetrics } from "./flowMetrics";
import { loadSopConfig, initSopListener } from "./data/sopRepository";
import type { DeletedTask, FlowMetrics, Project, ProjectChanges, Tag, Task, TaskChanges, TaskColumn, TaskEvent, TaskScope } from "./types";

const COLLAPSED_COLUMNS_KEY = "kanboard.collapsed-columns.v1";

function loadCollapsedColumns(): Set<string> {
  try {
    const stored = localStorage.getItem(COLLAPSED_COLUMNS_KEY);
    const saved: unknown = stored === null ? null : JSON.parse(stored);
    if (Array.isArray(saved) && saved.every((id) => typeof id === "string")) return new Set(saved);
  } catch {
    // Invalid or unavailable storage falls back to the initial board layout.
  }
  return new Set(["done"]);
}

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
const keyboardMotion = ref(false);
const reducedMotionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
const reducedMotion = ref(reducedMotionQuery?.matches ?? false);
const updateReducedMotion = (event: MediaQueryListEvent) => { reducedMotion.value = event.matches; };
const motionEnabled = computed(() => !keyboardMotion.value && !reducedMotion.value);
provide("motionEnabled", motionEnabled);
provide("motionReduced", reducedMotion);
const boardElement = ref<HTMLElement | null>(null);
const boardMotion = createBoardMotion();
const collapsedColumnIds = ref(loadCollapsedColumns());
// Only manual actions update this preference; task navigation and drag expansion do not.
const preferredCollapsedColumnIds = new Set(collapsedColumnIds.value);
const columnLayout = computed(() => ({
  minWidth: `${118 + columns.value.reduce((width, column) => width + (collapsedColumnIds.value.has(column.id) ? 64 : 180), 0)}px`,
  gridTemplateColumns: columns.value.map((column) =>
    collapsedColumnIds.value.has(column.id) ? "minmax(64px, 0fr)" : `minmax(180px, ${column.id === "doing" ? 1.18 : 1}fr)`,
  ).join(" "),
}));
const hasTaskFilters = computed(() => Boolean(searchQuery.value.trim()) || filterMode.value !== "all");
const dashboardOpen = ref(false);
const settingsOpen = ref(false);
const taskEvents = ref<TaskEvent[]>([]);
const deletedTasks = ref<DeletedTask[]>([]);
const recentlyDeleted = ref<{ task: Task; deletedAt: string } | null>(null);
const undoSeconds = ref(3);
const hasLoadedOnce = ref(false);
const initialLoading = ref(true);
const refreshing = ref(false);
const loading = computed(() => initialLoading.value && !hasLoadedOnce.value);
const saving = ref(false);
const errorMessage = ref("");
const statusMessage = ref("");
const draggingTask = ref(false);
watch(() => [...collapsedColumnIds.value], async (current, previous) => {
  const root = boardElement.value;
  if (!root || !motionEnabled.value || draggingTask.value) { boardMotion.cancel(); return; }
  const changed = new Set([...current, ...previous].filter((id) => current.includes(id) !== previous.includes(id)));
  const play = boardMotion.capture(root, changed);
  await nextTick();
  play();
});
watch([scope, swimlaneMode], () => boardMotion.cancel());
watch(reducedMotion, (value) => { if (value) boardMotion.cancel(); });
const usePointerMotion = () => { keyboardMotion.value = false; };
const useKeyboardMotion = () => { keyboardMotion.value = true; };
const trashActive = ref(false);
const dragOrigin = ref<DragOrigin | null>(null);
const dropReceivedInside = ref(false);
const dragSnapshot = ref<TaskColumn[] | null>(null);
const projectEditorOpen = ref(false);
const editingProject = ref<Project | null>(null);

let pendingRefreshAfterDrag = false;
const autoExpandedColumnIds = new Set<string>();
let dropIntoExpandedColumnId: string | null = null;
let queuedRefresh = false;
let orderQueue: Promise<boolean> = Promise.resolve(true);
let statusTimer: number | undefined;
let unlistenTaskCreated: UnlistenFn | undefined;
let unlistenMcpTaskUpdated: UnlistenFn | undefined;
let unlistenMcpTaskBlocked: UnlistenFn | undefined;
let unlistenOpenTask: UnlistenFn | undefined;
let unlistenMcpStatusTransition: UnlistenFn | undefined;
let notificationActionListener: { unregister(): Promise<void> } | (() => void) | undefined;
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
  columns.value.map((column) => {
    let colTasks = column.tasks.filter(isVisibleTask);
    if (column.id === "done") {
      colTasks = sortDoneTasks([...colTasks]);
    }
    return {
      ...column,
      totalTaskCount: column.tasks.filter(matchesScope).length,
      tasks: colTasks,
    };
  }),
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
    columns: columns.value.map((column) => {
      let laneTasks = column.tasks.filter((task) => task.projectId === lane.projectId && isVisibleTask(task));
      if (column.id === "done") {
        laneTasks = sortDoneTasks([...laneTasks]);
      }
      return {
        ...column,
        totalTaskCount: column.tasks.filter((task) => task.projectId === lane.projectId).length,
        tasks: laneTasks,
      };
    }),
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
provide("announce", announce);

function toggleColumnCollapse(columnId: string) {
  if (draggingTask.value) return;
  if (collapsedColumnIds.value.has(columnId)) {
    collapsedColumnIds.value.delete(columnId);
    preferredCollapsedColumnIds.delete(columnId);
  } else {
    collapsedColumnIds.value.add(columnId);
    preferredCollapsedColumnIds.add(columnId);
  }
  saveCollapsedColumns();
}

function expandAllColumns() {
  if (draggingTask.value) return;
  collapsedColumnIds.value.clear();
  preferredCollapsedColumnIds.clear();
  saveCollapsedColumns();
}

function saveCollapsedColumns() {
  try {
    localStorage.setItem(COLLAPSED_COLUMNS_KEY, JSON.stringify([...preferredCollapsedColumnIds]));
  } catch {
    announce("折叠状态已更新，但无法保存偏好");
  }
}

function reconcileColumns(currentColumns: TaskColumn[], newColumns: TaskColumn[]) {
  if (currentColumns.length === 0) {
    currentColumns.push(...newColumns);
    return;
  }

  const newColumnMap = new Map(newColumns.map((col) => [col.id, col]));
  const existingTaskMap = new Map<string, Task>();
  for (const col of currentColumns) {
    for (const t of col.tasks) {
      existingTaskMap.set(t.id, t);
    }
  }

  for (let i = currentColumns.length - 1; i >= 0; i--) {
    if (!newColumnMap.has(currentColumns[i].id)) {
      currentColumns.splice(i, 1);
    }
  }

  for (const newCol of newColumns) {
    let col = currentColumns.find((c) => c.id === newCol.id);
    if (!col) {
      col = { ...newCol, tasks: [] };
      currentColumns.push(col);
    }
    col.title = newCol.title;
    col.position = newCol.position;
    col.wipLimit = newCol.wipLimit;

    const nextTasks: Task[] = [];
    for (const freshTask of newCol.tasks) {
      const existing = existingTaskMap.get(freshTask.id);
      if (existing) {
        Object.assign(existing, freshTask);
        nextTasks.push(existing);
      } else {
        nextTasks.push(freshTask);
      }
    }
    if (col.id === "done") {
      sortDoneTasks(nextTasks);
    }
    col.tasks = nextTasks;
  }
}

function reconcileProjects(currentProjects: Project[], newProjects: Project[]) {
  const existingMap = new Map(currentProjects.map((p) => [p.id, p]));
  const result: Project[] = [];
  for (const p of newProjects) {
    const existing = existingMap.get(p.id);
    if (existing) {
      Object.assign(existing, p);
      result.push(existing);
    } else {
      result.push(p);
    }
  }
  currentProjects.splice(0, currentProjects.length, ...result);
}

function reconcileTags(currentTags: Tag[], newTags: Tag[]) {
  const existingMap = new Map(currentTags.map((t) => [t.id, t]));
  const result: Tag[] = [];
  for (const t of newTags) {
    const existing = existingMap.get(t.id);
    if (existing) {
      Object.assign(existing, t);
      result.push(existing);
    } else {
      result.push(t);
    }
  }
  currentTags.splice(0, currentTags.length, ...result);
}

let loadPromise: Promise<void> | null = null;
async function load(options: { initial?: boolean; silent?: boolean } = {}) {
  const isInitial = options.initial || !hasLoadedOnce.value;
  if (loadPromise) {
    if (!isInitial) queuedRefresh = true;
    return loadPromise;
  }

  loadPromise = (async () => {
    if (isInitial) {
      initialLoading.value = true;
      errorMessage.value = "";
    } else {
      refreshing.value = true;
    }
    try {
      const [taskWall, projectList, tagList, events, trashedTasks] = await Promise.all([
        loadTaskWall(),
        loadProjects(),
        loadTags(),
        loadTaskEvents(),
        loadDeletedTasks(),
      ]);

      if (isInitial) {
        columns.value = taskWall;
        projects.value = projectList;
        tags.value = tagList;
        taskEvents.value = events;
        deletedTasks.value = trashedTasks;
        hasLoadedOnce.value = true;
      } else {
        reconcileColumns(columns.value, taskWall);
        reconcileProjects(projects.value, projectList);
        reconcileTags(tags.value, tagList);
        taskEvents.value = events;
        deletedTasks.value = trashedTasks;
      }

      if (selectedTaskId.value && !selectedTask.value) selectedTaskId.value = null;
    } catch (error) {
      console.error(error);
      if (isInitial) {
        errorMessage.value = "无法打开本地数据库。请关闭应用后重新启动。";
      } else {
        announce("刷新数据失败，请重试");
      }
    } finally {
      if (isInitial) initialLoading.value = false;
      refreshing.value = false;
      loadPromise = null;
      if (queuedRefresh) {
        queuedRefresh = false;
        await load({ initial: false, silent: true });
      }
    }
  })();
  return loadPromise;
}

async function handleBackgroundRefresh() {
  if (draggingTask.value) {
    pendingRefreshAfterDrag = true;
    return;
  }
  await load({ initial: false, silent: true });
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
    collapsedColumnIds.value.delete(target.id);
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
      await load({ initial: false, silent: true });
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
    const savedTags = await updateTask(taskId, { ...changes, descriptionBase: changes.descriptionBase ?? task.description });
    const moved = changes.columnId !== previousColumnId;
    if (moved) {
      const removed = removeTaskFromWall(taskId);
      const target = columns.value.find((column) => column.id === changes.columnId);
      if (removed && target) {
        if (target.id === "done") {
          target.tasks.unshift(removed);
        } else {
          target.tasks.push(removed);
        }
      }
    }
    const { tagNames: _tagNames, descriptionBase: _descriptionBase, ...taskChanges } = changes;
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
      inAgentSop: changes.columnId === "verify" || changes.columnId === "done" ? false : task.inAgentSop,
      updatedAt: new Date().toISOString(),
    });
    for (const tag of savedTags) {
      if (!tags.value.some((item) => item.id === tag.id)) tags.value.push(tag);
    }
    tags.value.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    if (changes.columnId === "done") {
      const doneCol = columns.value.find((c) => c.id === "done");
      if (doneCol) sortDoneTasks(doneCol.tasks);
    }
    if (moved) queueOrderSave();
    if (shouldRepeat) {
      await orderQueue;
      await createRecurringSuccessor(task);
      await load({ initial: false, silent: true });
      announce("任务已完成，下一次任务已加入就绪");
      return;
    }
    if (!isVisibleTask(task)) selectedTaskId.value = null;
    announce("任务已保存");
  } catch (error) {
    console.error(error);
    announce(String(error));
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
    reviewNotes: task.reviewNotes,
  });
}

async function handleTaskCreated(event: Event<string | null>) {
  await load({ initial: false, silent: true });
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
        task.project = { id: project.id, name: project.name, color: project.color, path: project.path };
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
    await load({ initial: false, silent: true });
  } finally {
    saving.value = false;
  }
}

/** Use the same pointer hit test for the delete zone and collapsed columns. */
function trackTrashPointer(event: MouseEvent | TouchEvent | DragEvent) {
  const point = dragPointFrom(event);
  const over = isPointInDragTrash(point);
  trashActive.value = over;
  // While the pointer is on "delete" the card belongs to no column: keep it on the
  // slot it came from instead of the column the pointer last hovered.
  if (over) restoreDraggedCardToOrigin(dragOrigin.value);
  else if (point && draggingTask.value) {
    const column = document.elementFromPoint(point.x, point.y)?.closest<HTMLElement>(".board-column--collapsed");
    if (column?.dataset.column) {
      autoExpandedColumnIds.add(column.dataset.column);
      collapsedColumnIds.value.delete(column.dataset.column);
    }
  }
}

function handleInternalDrop(event: DragEvent) {
  dropReceivedInside.value = true;
  const column = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-column]") : null;
  if (!draggingTask.value || !column?.dataset.column || !autoExpandedColumnIds.has(column.dataset.column)) return;
  const lane = column.closest<HTMLElement>(".swimlane-row");
  const task = dragOrigin.value && findTask(dragOrigin.value.taskId);
  if (lane && lane.dataset.projectId !== (task?.projectId ?? "")) return;
  dropIntoExpandedColumnId = column.dataset.column;
}

function handleWindowDragStart() {
  dropReceivedInside.value = false;
}

function handleWindowDragOver(event: DragEvent) {
  // Always prevent default on dragover to permit drop and prevent the browser's 🚫 (no-drop) cursor!
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "move";
  }
  if (draggingTask.value) {
    trackTrashPointer(event);
  }
}

function handleWindowDragEnter(event: DragEvent) {
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "move";
  }
  if (draggingTask.value) trackTrashPointer(event);
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
  boardMotion.cancel();
  autoExpandedColumnIds.clear();
  dropIntoExpandedColumnId = null;
  dragOrigin.value = { columnId, taskId: origin.taskId, index: origin.index };
  dragSnapshot.value = JSON.parse(JSON.stringify(columns.value));
  dropReceivedInside.value = false;
  draggingTask.value = true;
  startTrashTracking();
}

async function handleTaskDrop(result: { taskId: string; intoTrash: boolean }) {
  const origin = dragOrigin.value;
  const wasInternalDrop = dropReceivedInside.value;
  const snapshot = dragSnapshot.value;
  const expandedDropColumnId = dropIntoExpandedColumnId;
  const temporarilyExpanded = [...autoExpandedColumnIds];
  autoExpandedColumnIds.clear();
  dropIntoExpandedColumnId = null;
  dragSnapshot.value = null;
  draggingTask.value = false;
  stopTrashTracking();

  try {
    if (pendingRefreshAfterDrag) {
      pendingRefreshAfterDrag = false;
      await load({ initial: false, silent: true });
    }

    if (result.intoTrash) {
      // Deleting is decided here and nowhere else, so a card released over the
      // delete zone can never stay behind in the column beneath it.
      if (result.taskId) await removeTask(result.taskId);
      return;
    }

    // When drag ends outside without an internal drop (e.g. dragged out to Codex or cancelled),
    // revert card to snapshot and do not save new order.
    const isExternalDrop = origin !== null && !wasInternalDrop;
    if (isExternalDrop) {
      if (snapshot) columns.value = snapshot;
      return;
    }

    // A quick release may arrive before the newly mounted Sortable list receives
    // its first dragover. Honor that column instead of the last list passed over.
    const expandedDropColumn = columns.value.find((column) => column.id === expandedDropColumnId);
    if (origin && expandedDropColumn && !expandedDropColumn.tasks.some((task) => task.id === origin.taskId)) {
      const task = removeTaskFromWall(origin.taskId);
      if (task) expandedDropColumn.tasks.push(task);
    }

    const saved = await queueOrderSave();
    const movedTask = findTask(result.taskId);
    if (saved && origin?.columnId !== "done" && movedTask?.columnId === "done" && movedTask.recurrenceRule !== "none") {
      await createRecurringSuccessor(movedTask);
      await load({ initial: false, silent: true });
      announce("任务已完成，下一次任务已加入就绪");
    }
    checkWipLimitExceeded();
  } finally {
    for (const columnId of temporarilyExpanded) {
      if (preferredCollapsedColumnIds.has(columnId)) collapsedColumnIds.value.add(columnId);
    }
  }
}

function checkWipLimitExceeded() {
  nextTick(() => {
    const exceeded = visibleColumns.value.find((column) =>
      column.wipLimit !== null && (column.totalTaskCount ?? column.tasks.length) > column.wipLimit,
    );
    if (exceeded) announce(`${exceeded.title}已超过 WIP 上限，建议先完成一项`);
  });
}

async function handleColumnWipLimit(columnId: string, newLimit: number | null) {
  try {
    await updateColumnWipLimit(columnId, newLimit);
    const col = columns.value.find((c) => c.id === columnId);
    if (col) {
      col.wipLimit = newLimit;
      announce(`${col.title}上限已更新为 ${newLimit ? `${newLimit} 项` : "无上限"}`);
    }
    checkWipLimitExceeded();
  } catch (error) {
    announce(`更新上限失败：${String(error)}`);
  }
}

function handleUpdateWipLimits(limits: { doing: number | null; verify: number | null }) {
  const doingCol = columns.value.find((c) => c.id === "doing");
  if (doingCol) doingCol.wipLimit = limits.doing;
  const verifyCol = columns.value.find((c) => c.id === "verify");
  if (verifyCol) verifyCol.wipLimit = limits.verify;
  checkWipLimitExceeded();
}

function selectRelativeTask(offset: number) {
  const tasks = visibleColumns.value.filter((column) => !collapsedColumnIds.value.has(column.id)).flatMap((column) => column.tasks);
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
  dashboardOpen.value = false;
  settingsOpen.value = false;
  projectEditorOpen.value = false;

  const targetTask = allTasks.value.find((item) => item.id === taskId);
  if (targetTask) {
    collapsedColumnIds.value.delete(targetTask.columnId);
    if (searchQuery.value && !matchesFilters(targetTask)) {
      searchQuery.value = "";
    }
    if (filterMode.value !== "all" && !matchesFilters(targetTask)) {
      filterMode.value = "all";
    }
    if (scope.value.kind === "trash") {
      scope.value = { kind: "all" };
    } else if (!matchesScope(targetTask)) {
      if (targetTask.projectId) {
        scope.value = { kind: "project", id: targetTask.projectId };
      } else {
        scope.value = { kind: "all" };
      }
    }
  }
  if (selectedTaskId.value === taskId) {
    selectedTaskId.value = null;
    await nextTick();
  }
  selectedTaskId.value = taskId;
  await nextTick();
  document.querySelector<HTMLElement>(`[data-task-id="${taskId}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
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
    await load({ initial: false, silent: true });
    announce("已撤回删除");
  } catch (error) {
    console.error(error);
    await load({ initial: false, silent: true });
    announce("撤回失败，请从回收站恢复");
  } finally {
    saving.value = false;
  }
}

async function restoreDeletedTask(task: DeletedTask) {
  saving.value = true;
  try {
    await restoreTask(task.id);
    await load({ initial: false, silent: true });
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
  keyboardMotion.value = true;
  if (event.defaultPrevented) return;
  const target = event.target as HTMLElement;
  const editing = /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    quickInput.value?.focus();
    quickInput.value?.select();
    return;
  }
  if (event.key === "Escape") {
    if (document.querySelector(".markdown-fullscreen-modal")) {
      return;
    }
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
  window.addEventListener("pointerdown", usePointerMotion, true);
  window.addEventListener("keydown", useKeyboardMotion, true);
  window.addEventListener("resize", boardMotion.cancel);
  reducedMotionQuery?.addEventListener("change", updateReducedMotion);
  loadSopConfig();
  initSopListener();
  window.addEventListener("keydown", handleGlobalKeydown);
  window.addEventListener("dragstart", handleWindowDragStart, true);
  window.addEventListener("dragenter", handleWindowDragEnter, true);
  window.addEventListener("dragover", handleWindowDragOver, true);
  window.addEventListener("drop", handleInternalDrop, true);
  unlistenTaskCreated = await listen<string | null>("task-created", handleTaskCreated);
  unlistenMcpTaskUpdated = await listen("mcp:task-updated", async () => {
    await handleBackgroundRefresh();
  });
  unlistenMcpTaskBlocked = await listen<{ taskId: string; title: string; reason: string; detail: string }>(
    "mcp:task-blocked",
    async (event) => {
      announce(`任务【${event.payload.title}】出现阻塞：${event.payload.detail}`);
      await handleBackgroundRefresh();
    },
  );
  unlistenOpenTask = await listen<string>("open-task", async (event) => {
    if (event.payload) {
      await load({ initial: false, silent: true });
      await openTask(event.payload);
    }
  });
  unlistenMcpStatusTransition = await listen<{
    taskId: string;
    title: string;
    fromStatus: string | null;
    toStatus: string;
    detail?: string;
  }>("mcp:status-transition", async (event) => {
    await handleBackgroundRefresh();
    const statusMap: Record<string, string> = {
      todo: "收集箱",
      backlog: "待办池",
      ready: "就绪",
      doing: "进行中",
      verify: "待验证",
      blocked: "阻塞",
      done: "已完成",
    };
    const targetName = statusMap[event.payload.toStatus] || "新状态";
    announce(`任务【${event.payload.title}】状态已流转至${targetName}`);
  });
  try {
    notificationActionListener = await onAction(async (action) => {
      const taskId = (action.notification?.extra?.taskId as string) || undefined;
      if (taskId) {
        await load({ initial: false, silent: true });
        await openTask(taskId);
      }
    });
  } catch {
    // onAction may not be available in non-desktop environments or testing
  }
  await load({ initial: true });
  try {
    const pendingTaskId = await invoke<string | null>("get_pending_open_task");
    if (pendingTaskId) {
      await openTask(pendingTaskId);
    }
  } catch {
    // Non-fatal if invoke is unavailable
  }
  await nextTick();
  const splash = document.querySelector<HTMLElement>("#startup-splash");
  if (splash) {
    splash.setAttribute("aria-hidden", "true");
    window.setTimeout(() => splash.remove(), 120);
  }
  if (errorMessage.value) return;
  startFirstOnboarding();
});

onBeforeUnmount(() => {
  boardMotion.cancel();
  window.removeEventListener("pointerdown", usePointerMotion, true);
  window.removeEventListener("keydown", useKeyboardMotion, true);
  window.removeEventListener("resize", boardMotion.cancel);
  reducedMotionQuery?.removeEventListener("change", updateReducedMotion);
  stopTrashTracking();
  window.removeEventListener("keydown", handleGlobalKeydown);
  window.removeEventListener("dragstart", handleWindowDragStart, true);
  window.removeEventListener("dragenter", handleWindowDragEnter, true);
  window.removeEventListener("dragover", handleWindowDragOver, true);
  window.removeEventListener("drop", handleInternalDrop, true);
  unlistenTaskCreated?.();
  unlistenMcpTaskUpdated?.();
  unlistenMcpTaskBlocked?.();
  unlistenOpenTask?.();
  unlistenMcpStatusTransition?.();
  if (typeof notificationActionListener === "function") {
    (notificationActionListener as () => void)();
  } else if (typeof (notificationActionListener as { unregister?: () => Promise<void> })?.unregister === "function") {
    (notificationActionListener as { unregister: () => Promise<void> }).unregister();
  }
  window.clearTimeout(statusTimer);
  window.clearInterval(undoTimer);
});
</script>

<template>
  <div class="app-shell" :data-input-mode="keyboardMotion ? 'keyboard' : 'pointer'" @keydown.capture="keyboardMotion = true" @pointerdown.capture="keyboardMotion = false">
    <header class="app-header">
      <div class="wall-heading">
        <span class="wall-heading__mark" aria-hidden="true" />
        <h1>任务墙</h1>
        <span>{{ totalOpenTaskCount }} 项未完成</span>
      </div>
      <form class="quick-add" data-tour="quick-capture" @submit.prevent="addTask">
        <span class="quick-add__mark" aria-hidden="true"><Plus :size="16" aria-hidden="true" stroke-width="2.5" /></span>
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
        <button class="text-button guide-button" type="button" @click="settingsOpen = true">设置</button>
        <div class="capture-shortcut" aria-hidden="true"><kbd>Ctrl K</kbd><span>快速记录</span></div>
      </div>
    </header>

    <div v-if="loading" class="system-state" role="status">正在打开本地任务墙…</div>
    <div v-else-if="errorMessage && !hasLoadedOnce" class="system-state system-state--error" role="alert">
      <p>{{ errorMessage }}</p>
      <button class="secondary-button" type="button" @click="() => load({ initial: true })">重试</button>
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
      <section v-else ref="boardElement" class="board-workspace" :aria-label="scopeTitle" @scroll.capture="boardMotion.cancel">
        <header class="board-context">
          <div>
            <span v-if="activeProject" class="project-dot" :style="{ backgroundColor: activeProject.color }" aria-hidden="true" />
            <h2>{{ scopeTitle }}</h2>
            <span>{{ openTaskCount }} 项未完成</span>
          </div>
          <div class="board-tools">
            <label class="board-search" data-tour="search-filter">
              <span class="board-search__icon" aria-hidden="true"><Search :size="14" aria-hidden="true" /></span>
              <input ref="searchInput" v-model="searchQuery" type="search" placeholder="搜索任务 /" aria-label="搜索任务" />
            </label>
            <div class="filter-tabs" data-tour="flow-filters" aria-label="任务筛选">
              <button type="button" :class="{ active: filterMode === 'all' }" @click="filterMode = 'all'">全部</button>
              <button type="button" :class="{ active: filterMode === 'due' }" @click="filterMode = 'due'">有期限</button>
              <button type="button" :class="{ active: filterMode === 'high' }" @click="filterMode = 'high'">高优先级</button>
              <button type="button" :class="{ active: filterMode === 'aging' }" @click="filterMode = 'aging'">长期 WIP</button>
            </div>
            <button v-if="collapsedColumnIds.size" class="tool-button" type="button" :disabled="draggingTask" @click="expandAllColumns">展开全部</button>
            <button class="tool-button" data-tour="swimlane" type="button" :aria-pressed="swimlaneMode" :disabled="scope.kind === 'project'" @click="swimlaneMode = !swimlaneMode">泳道</button>
            <button class="tool-button" data-tour="flow-dashboard" type="button" @click="dashboardOpen = true">统计</button>
            <button v-if="activeProject" class="text-button" type="button" @click="openProjectEditor(activeProject)">项目设置</button>
          </div>
        </header>
      <div
        v-if="!swimlaneMode || scope.kind === 'project'"
        class="board-columns"
        :style="{ gridTemplateColumns: columnLayout.gridTemplateColumns }"
        data-tour="board-columns"
        :class="{ 'board-columns--trash-target': trashActive }"
        aria-label="个人任务墙"
      >
        <BoardColumn
          v-for="column in visibleColumns"
          :key="column.id"
          :column="column"
          :selected-task-id="selectedTaskId"
          :collapsed="collapsedColumnIds.has(column.id)"
          :collapse-disabled="draggingTask"
          :show-matches="hasTaskFilters"
          @toggle-collapse="toggleColumnCollapse"
          @select="openTask"
          @toggle="toggleTask"
          @update-tasks="updateColumnTasks"
          @task-drop="handleTaskDrop"
          @drag-start="beginTaskDrag(column.id, $event)"
          @update-wip-limit="handleColumnWipLimit"
        />
      </div>
      <div v-else class="swimlane-board" aria-label="按项目分组的任务墙">
        <section v-for="lane in swimlanes" :key="lane.id" class="swimlane-row" :style="{ minWidth: columnLayout.minWidth }" :data-project-id="lane.projectId ?? ''">
          <header><i :style="{ backgroundColor: lane.color }" /><strong>{{ lane.name }}</strong></header>
          <div class="swimlane-columns" :style="{ gridTemplateColumns: columnLayout.gridTemplateColumns }">
            <BoardColumn
              v-for="column in lane.columns"
              :key="`${lane.id}-${column.id}`"
              :column="column"
              :selected-task-id="selectedTaskId"
              :collapsed="collapsedColumnIds.has(column.id)"
              :collapse-disabled="draggingTask"
              :show-matches="hasTaskFilters"
              @toggle-collapse="toggleColumnCollapse"
              :drag-group="`lane-${lane.id}`"
              @select="openTask"
              @toggle="toggleTask"
              @update-tasks="(columnId, tasks) => updateColumnTasks(columnId, tasks, lane.projectId)"
              @task-drop="handleTaskDrop"
              @drag-start="beginTaskDrag(column.id, $event)"
              @update-wip-limit="handleColumnWipLimit"
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
        <Undo2 v-if="recentlyDeleted" :size="18" aria-hidden="true" />
        <Trash2 v-else :size="18" aria-hidden="true" />
        <span>{{ recentlyDeleted ? `撤回删除 · ${undoSeconds} 秒` : "拖到这里删除" }}</span>
      </button>
      </section>
      <SurfaceMotion kind="drawer" panel=".task-inspector">
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
      </SurfaceMotion>
    </main>

    <ProjectEditor
      :open="projectEditorOpen"
      :project="editingProject"
      :saving="saving"
      @close="projectEditorOpen = false"
      @save="persistProject"
    />

    <FlowDashboard :open="dashboardOpen" :metrics="metrics" @close="dashboardOpen = false" />
    <SettingsPanel
      :open="settingsOpen"
      :columns="columns"
      @close="settingsOpen = false"
      @announce="announce"
      @update-wip-limits="handleUpdateWipLimits"
    />

    <div class="sr-status" role="status" aria-live="polite">{{ statusMessage }}</div>
    <SurfaceMotion kind="toast">
      <div v-if="statusMessage" class="toast-message">{{ statusMessage }}</div>
    </SurfaceMotion>
  </div>
</template>
