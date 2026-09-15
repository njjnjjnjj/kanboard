<script setup lang="ts">
import { reactive, ref, watch } from "vue";
import type { Task, TaskChanges, TaskColumn } from "../types";

const props = defineProps<{
  task: Task | null;
  columns: TaskColumn[];
  saving: boolean;
}>();

const emit = defineEmits<{
  save: [taskId: string, changes: TaskChanges];
  delete: [taskId: string];
  close: [];
}>();

const confirmingDelete = ref(false);
const draft = reactive<TaskChanges>({
  title: "",
  description: "",
  dueDate: null,
  priority: "none",
  columnId: "todo",
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
      <span class="task-inspector__rule" aria-hidden="true"></span>
      <h2>选择一项任务</h2>
      <p>详情、截止时间和状态会显示在这里。</p>
    </div>

    <form v-else class="task-inspector__form" @submit.prevent="submit">
      <header class="task-inspector__header">
        <span>任务详情</span>
        <button class="icon-button" type="button" aria-label="关闭任务详情" @click="emit('close')">×</button>
      </header>

      <label class="field field--title">
        <span>标题</span>
        <textarea v-model="draft.title" rows="2" maxlength="160" autofocus />
      </label>

      <div class="field-grid">
        <label class="field">
          <span>状态</span>
          <select v-model="draft.columnId">
            <option v-for="column in columns" :key="column.id" :value="column.id">
              {{ column.title }}
            </option>
          </select>
        </label>
        <label class="field">
          <span>截止时间</span>
          <input v-model="draft.dueDate" type="date" />
        </label>
      </div>

      <label class="field">
        <span>优先级</span>
        <select v-model="draft.priority">
          <option value="none">普通</option>
          <option value="high">高</option>
        </select>
      </label>

      <label class="field field--description">
        <span>说明</span>
        <textarea v-model="draft.description" rows="8" placeholder="补充执行时需要的信息" />
      </label>

      <footer class="task-inspector__actions">
        <div v-if="confirmingDelete" class="delete-confirmation">
          <span>确定删除？</span>
          <button class="text-button text-button--danger" type="button" @click="emit('delete', task.id)">删除</button>
          <button class="text-button" type="button" @click="confirmingDelete = false">取消</button>
        </div>
        <button v-else class="text-button text-button--danger" type="button" @click="confirmingDelete = true">删除任务</button>

        <button class="primary-button" type="submit" :disabled="saving || !draft.title.trim()">
          {{ saving ? "保存中…" : "保存" }}
        </button>
      </footer>
      <p class="task-inspector__shortcut">Ctrl + Enter 保存</p>
    </form>
  </aside>
</template>
