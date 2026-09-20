<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type { Task } from "../types";

const props = defineProps<{ task: Task | null }>();
const emit = defineEmits<{ pause: [task: Task]; done: [task: Task]; blocked: [task: Task] }>();
const now = ref(Date.now());
let timer: number | undefined;

onMounted(() => { timer = window.setInterval(() => { now.value = Date.now(); }, 1000); });
onBeforeUnmount(() => window.clearInterval(timer));

const elapsed = computed(() => {
  if (!props.task) return 0;
  return props.task.focusElapsedSeconds + (props.task.focusStartedAt
    ? Math.max(0, Math.floor((now.value - Date.parse(props.task.focusStartedAt)) / 1000))
    : 0);
});
const timeLabel = computed(() => {
  const hours = Math.floor(elapsed.value / 3600);
  const minutes = Math.floor((elapsed.value % 3600) / 60);
  const seconds = elapsed.value % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
});
</script>

<template>
  <section v-if="task" class="focus-bar" aria-label="当前专注任务">
    <span>NOW</span>
    <div>
      <strong>{{ task.title }}</strong>
      <time>{{ timeLabel }}</time>
    </div>
    <button type="button" @click="emit('pause', task)">暂停</button>
    <button type="button" @click="emit('done', task)">完成</button>
    <button type="button" @click="emit('blocked', task)">阻塞</button>
  </section>
</template>
