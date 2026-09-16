<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import type { Project, Tag, Task, TaskChanges, TaskColumn } from "../types";
import TagInput from "./TagInput.vue";
import TaskSelect from "./TaskSelect.vue";

const props = defineProps<{
  task: Task | null;
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

const confirmingDelete = ref(false);
const statusOptions = computed(() =>
  props.columns.map((column) => ({ value: column.id, label: column.title })),
);
const priorityOptions = [
  { value: "none", label: "普通" },
  { value: "high", label: "高" },
];
const projectOptions = computed(() => [
  { value: "", label: "无项目" },
  ...props.projects
    .filter((project) => project.status === "active" || project.id === props.task?.projectId)
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
});

watch(
  () => props.task,
  (task) => {
    confirmingDelete.value = false;
    draft.title = task?.title ?? "";
    draft.description = task?.description ?? "";
    draft.dueDate = task?.dueDate ?? null;
    draft.priority = task?.priority ?? "none";
    draft.columnId = task?.columnId ?? "todo";
    draft.projectId = task?.projectId ?? null;
    draft.tagNames = task?.tags.map((tag) => tag.name) ?? [];
  },
  { immediate: true, deep: true },
);

function submit() {
  if (!props.task || !draft.title.trim()) return;
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

function submitWithShortcut(event: KeyboardEvent) {
  if (event.ctrlKey && event.key === "Enter") {
    event.preventDefault();
    submit();
  }
}
</script>

<template>
  <aside class="task-inspector" aria-label="任务详情" @keydown="submitWithShortcut">
    <div v-if="!task" class="task-inspector__empty">
      <span aria-hidden="true">—</span>
      <h2>未选择任务</h2>
    </div>

    <form v-else class="task-inspector__form" @submit.prevent="submit">
      <header class="task-inspector__header">
        <div>
          <strong>任务详情</strong>
          <span>{{ columns.find((column) => column.id === draft.columnId)?.title }}</span>
        </div>
        <button class="icon-button" type="button" aria-label="关闭任务详情" @click="emit('close')">×</button>
      </header>

      <label class="field field--title">
        <span>任务标题</span>
        <textarea data-inspector-title v-model="draft.title" rows="3" maxlength="160" />
      </label>

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
        <label class="field field--due">
          <span>截止时间</span>
          <input v-model="draft.dueDate" type="date" />
        </label>
      </div>

      <div class="field field--tags">
        <span>标签</span>
        <TagInput v-model="draft.tagNames" :suggestions="tags" />
      </div>

      <label class="field field--description">
        <span>任务说明</span>
        <textarea
          data-inspector-description
          v-model="draft.description"
          rows="8"
          placeholder="记录背景、下一步或需要注意的信息"
        />
      </label>

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
  </aside>
</template>
