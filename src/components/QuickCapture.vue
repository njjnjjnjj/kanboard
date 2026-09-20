<script setup lang="ts">
import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { nextTick, onMounted, ref } from "vue";
import { createTask } from "../data/taskRepository";

const title = ref("");
const input = ref<HTMLInputElement | null>(null);
const saving = ref(false);
const errorMessage = ref("");

onMounted(async () => {
  await nextTick();
  input.value?.focus();
});

async function close() {
  await getCurrentWindow().close();
}

async function submit(openMainAfterSave = false) {
  const taskTitle = title.value.trim();
  if (!taskTitle || saving.value) return;
  saving.value = true;
  errorMessage.value = "";
  let taskId: string;
  try {
    taskId = (await createTask(taskTitle, "todo", null)).id;
  } catch (error) {
    console.error(error);
    errorMessage.value = "保存失败，请重试";
    saving.value = false;
    return;
  }

  try {
    await emit("task-created", openMainAfterSave ? taskId : null);
  } catch (error) {
    console.error("task saved but refresh notification failed", error);
  }

  if (openMainAfterSave) {
    try {
      await emit("open-main-window");
    } catch (error) {
      console.error("task saved but main window could not be opened", error);
    }
  }

  try {
    await close();
  } catch (error) {
    console.error(error);
    errorMessage.value = "任务已保存，但窗口未能自动关闭";
    saving.value = false;
  }
}
</script>

<template>
  <main class="quick-capture-panel" @keydown.esc="close" @keydown.ctrl.enter.prevent="submit(true)">
    <header>
      <div><span>QUICK CAPTURE</span><h1>快速记录</h1></div>
    </header>
    <form @submit.prevent="submit()">
      <label for="quick-capture-title">任务标题</label>
      <div>
        <input
          id="quick-capture-title"
          ref="input"
          v-model="title"
          type="text"
          maxlength="160"
          autocomplete="off"
          placeholder="记下一件事，回车加入收集箱"
        />
        <button class="primary-button" type="submit" :disabled="saving || !title.trim()">
          {{ saving ? "保存中…" : "加入收集箱" }}
        </button>
      </div>
      <p v-if="errorMessage" role="alert">{{ errorMessage }}</p>
      <small><kbd>Enter</kbd> 保存并关闭　<kbd>Ctrl Enter</kbd> 保存并打开主面板　<kbd>Esc</kbd> 取消</small>
    </form>
  </main>
</template>
