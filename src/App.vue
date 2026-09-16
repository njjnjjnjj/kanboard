<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import BoardColumn from "./components/BoardColumn.vue";
import ProjectEditor from "./components/ProjectEditor.vue";
import ProjectSidebar from "./components/ProjectSidebar.vue";
import TaskInspector from "./components/TaskInspector.vue";
import {
  createTask,
  deleteTag,
  deleteTask,
  loadProjects,
  loadTags,
  loadTaskWall,
  saveTaskOrder,
  saveProject,
  updateTask,
} from "./data/taskRepository";
import { restoreDraggedCardToOrigin, type DragOrigin } from "./drag/dragPlaceholder";
import { dragPointFrom, isPointInDragTrash } from "./drag/trashDropZone";
import type { Project, ProjectChanges, Tag, Task, TaskChanges, TaskColumn, TaskScope } from "./types";

const columns = ref<TaskColumn[]>([]);
const projects = ref<Project[]>([]);
const tags = ref<Tag[]>([]);
const scope = ref<TaskScope>({ kind: "all" });
const selectedTaskId = ref<string | null>(null);
const quickTitle = ref("");
const quickInput = ref<HTMLInputElement | null>(null);
const loading = ref(true);
const saving = ref(false);
const errorMessage = ref("");
const statusMessage = ref("");
const draggingTask = ref(false);
const trashActive = ref(false);
const dragOrigin = ref<DragOrigin | null>(null);
const projectEditorOpen = ref(false);
const editingProject = ref<Project | null>(null);

let orderQueue = Promise.resolve();
let statusTimer: number | undefined;

const selectedTask = computed(() => {
  for (const column of columns.value) {
    const task = column.tasks.find((item) => item.id === selectedTaskId.value);
    if (task) return task;
  }
  return null;
});

const allTasks = computed(() => columns.value.flatMap((column) => column.tasks));

function matchesScope(task: Task) {
  const currentScope = scope.value;
  if (currentScope.kind === "all") return true;
  if (currentScope.kind === "unassigned") return task.projectId === null;
  if (currentScope.kind === "project") return task.projectId === currentScope.id;
  return task.tags.some((tag) => tag.id === currentScope.id);
}

const visibleColumns = computed(() =>
  columns.value.map((column) => ({
    ...column,
    tasks: column.tasks.filter(matchesScope),
  })),
);

const scopeTitle = computed(() => {
  const currentScope = scope.value;
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
    const [taskWall, projectList, tagList] = await Promise.all([
      loadTaskWall(),
      loadProjects(),
      loadTags(),
    ]);
    columns.value = taskWall;
    projects.value = projectList;
    tags.value = tagList;
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
    if (scope.value.kind === "all") {
      column.tasks = tasks;
      return;
    }
    const queue = [...tasks];
    const merged: Task[] = [];
    for (const current of column.tasks) {
      if (matchesScope(current)) {
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
    const savedTags = await updateTask(taskId, changes);
    const moved = changes.columnId !== task.columnId;
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
      updatedAt: new Date().toISOString(),
    });
    for (const tag of savedTags) {
      if (!tags.value.some((item) => item.id === tag.id)) tags.value.push(tag);
    }
    tags.value.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    if (moved) queueOrderSave();
    if (!matchesScope(task)) selectedTaskId.value = null;
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
    projectId: task.projectId,
    tagNames: task.tags.map((tag) => tag.name),
  });
}

function selectScope(nextScope: TaskScope) {
  scope.value = nextScope;
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
    await deleteTask(taskId);
    announce("任务已删除");
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
  draggingTask.value = false;
  stopTrashTracking();
  if (!result.intoTrash) {
    queueOrderSave();
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
  stopTrashTracking();
  window.removeEventListener("keydown", handleGlobalKeydown);
  window.clearTimeout(statusTimer);
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
      <form class="quick-add" @submit.prevent="addTask">
        <span class="quick-add__mark" aria-hidden="true">＋</span>
        <input
          ref="quickInput"
          v-model="quickTitle"
          type="text"
          maxlength="160"
          autocomplete="off"
          aria-label="新任务标题"
          placeholder="记下一件事，回车加入待处理"
        />
        <button class="primary-button" type="submit" :disabled="saving || !quickTitle.trim()">添加任务</button>
      </form>
      <div class="capture-shortcut" aria-hidden="true"><kbd>N</kbd><span>快速记录</span></div>
    </header>

    <div v-if="loading" class="system-state" role="status">正在打开本地任务墙…</div>
    <div v-else-if="errorMessage" class="system-state system-state--error" role="alert">
      <p>{{ errorMessage }}</p>
      <button class="secondary-button" type="button" @click="load">重试</button>
    </div>
    <main v-else class="wall-workspace">
      <ProjectSidebar
        :projects="projects"
        :tags="tags"
        :tasks="allTasks"
        :scope="scope"
        @select="selectScope"
        @create-project="openProjectEditor()"
        @edit-project="openProjectEditor"
        @delete-tag="removeTag"
      />
      <section class="board-workspace" :aria-label="scopeTitle">
        <header class="board-context">
          <div>
            <span v-if="activeProject" class="project-dot" :style="{ backgroundColor: activeProject.color }" aria-hidden="true" />
            <h2>{{ scopeTitle }}</h2>
            <span>{{ openTaskCount }} 项未完成</span>
          </div>
          <button
            v-if="activeProject"
            class="text-button"
            type="button"
            @click="openProjectEditor(activeProject)"
          >
            项目设置
          </button>
        </header>
      <div
        class="board-columns"
        :class="{ 'board-columns--trash-target': trashActive }"
        aria-label="个人任务墙"
      >
        <BoardColumn
          v-for="column in visibleColumns"
          :key="column.id"
          :column="column"
          :selected-task-id="selectedTaskId"
          @select="selectedTaskId = $event"
          @toggle="toggleTask"
          @update-tasks="updateColumnTasks"
          @task-drop="handleTaskDrop"
          @drag-start="beginTaskDrag(column.id, $event)"
        />
        <div
          class="drag-trash"
          :class="{ 'drag-trash--visible': draggingTask, 'drag-trash--active': trashActive }"
          data-drag-trash
          :aria-hidden="!draggingTask"
          aria-label="拖到这里删除任务"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M3.5 5.5h13M8 3.5h4M6 5.5l.6 11h6.8l.6-11M8.2 8.2v5.5M11.8 8.2v5.5" />
          </svg>
          <span>拖到这里删除</span>
        </div>
      </div>
      </section>
      <TaskInspector
        :task="selectedTask"
        :columns="columns"
        :projects="projects"
        :tags="tags"
        :saving="saving"
        @save="saveChanges"
        @delete="removeTask"
        @close="selectedTaskId = null"
      />
    </main>

    <ProjectEditor
      :open="projectEditorOpen"
      :project="editingProject"
      :saving="saving"
      @close="projectEditorOpen = false"
      @save="persistProject"
    />

    <div class="sr-status" role="status" aria-live="polite">{{ statusMessage }}</div>
    <Transition name="toast">
      <div v-if="statusMessage" class="toast-message">{{ statusMessage }}</div>
    </Transition>
  </div>
</template>
