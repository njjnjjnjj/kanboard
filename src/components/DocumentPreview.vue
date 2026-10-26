<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import MarkdownEditor from "./MarkdownEditor.vue";

const document = ref<{ title: string; path: string; content: string } | null>(null);
const error = ref("");
const close = () => getCurrentWindow().close();
function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); void close(); }
}
onMounted(async () => {
  window.addEventListener("keydown", onKeydown, true);
  try { document.value = await invoke("get_preview_document"); }
  catch (err) { error.value = `无法加载文档：${String(err)}`; }
});
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown, true));
</script>

<template>
  <section class="markdown-fullscreen-modal document-preview" aria-label="文档预览">
    <header class="markdown-fullscreen-modal__header">
      <div class="markdown-fullscreen-modal__title">
        <strong>文档预览 · 只读</strong>
        <span class="markdown-fullscreen-modal__task" :title="document?.path">{{ document?.title }}</span>
      </div>
      <div class="markdown-fullscreen-modal__info">
        <span v-if="document" class="info-stat">{{ document.content.length }} 字符</span>
        <button type="button" class="info-esc-btn" title="关闭文档预览窗口" @click="close">按 <kbd>Esc</kbd> 关闭</button>
      </div>
    </header>
    <main class="markdown-fullscreen-modal__body">
      <p v-if="error" role="alert">{{ error }}</p>
      <MarkdownEditor v-else-if="document" :model-value="document.content" readonly fullscreen document-preview height="100%" label="文档预览" @toggle-fullscreen="close" />
      <p v-else role="status">正在加载文档…</p>
    </main>
  </section>
</template>
