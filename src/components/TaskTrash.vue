<script setup lang="ts">
import { ref } from "vue";
import type { DeletedTask } from "../types";

defineProps<{ tasks: DeletedTask[]; busy: boolean }>();

const emit = defineEmits<{
  restore: [task: DeletedTask];
  delete: [task: DeletedTask];
}>();

const confirmingId = ref<string | null>(null);

function deletedLabel(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
</script>

<template>
  <section class="task-trash-view" aria-labelledby="task-trash-title">
    <header>
      <div>
        <span>RECYCLE BIN</span>
        <h2 id="task-trash-title">回收站</h2>
      </div>
      <p>误删的任务可以从这里恢复；永久删除后无法找回。</p>
    </header>

    <div v-if="!tasks.length" class="task-trash-view__empty">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 7h14M9 4h6M7 7l.7 13h8.6L17 7M10 10v6M14 10v6" />
      </svg>
      <strong>回收站是空的</strong>
      <span>删除的任务会保留在这里。</span>
    </div>

    <div v-else class="task-trash-list">
      <article v-for="task in tasks" :key="task.id" class="task-trash-item">
        <div class="task-trash-item__content">
          <div>
            <span v-if="task.project" class="project-dot" :style="{ backgroundColor: task.project.color }" aria-hidden="true" />
            <strong>{{ task.title }}</strong>
          </div>
          <p v-if="task.description">{{ task.description }}</p>
          <small>删除于 {{ deletedLabel(task.deletedAt) }}</small>
        </div>
        <div class="task-trash-item__actions">
          <button class="secondary-button" type="button" :disabled="busy" @click="emit('restore', task)">恢复</button>
          <button
            class="text-button text-button--danger"
            type="button"
            :disabled="busy"
            @click="confirmingId === task.id ? emit('delete', task) : confirmingId = task.id"
          >{{ confirmingId === task.id ? "确认永久删除" : "永久删除" }}</button>
          <button v-if="confirmingId === task.id" class="text-button" type="button" @click="confirmingId = null">取消</button>
        </div>
      </article>
    </div>
  </section>
</template>
