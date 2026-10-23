<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from "vue";
import Vditor from "vditor";
import "vditor/dist/index.css";
import { saveImageAttachment, resolveImageSrc } from "../services/attachmentService";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    label?: string;
    placeholder?: string;
    taskTitle?: string;
    dataInspectorDescription?: boolean;
    dataInspectorReviewNotes?: boolean;
    height?: number | string;
    minHeight?: number;
    fullscreen?: boolean;
  }>(),
  {
    label: "",
    placeholder: "支持所见即所得 Markdown 编写与截图粘贴…",
    taskTitle: "",
    dataInspectorDescription: false,
    dataInspectorReviewNotes: false,
    height: 280,
    minHeight: 180,
    fullscreen: false,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const editorEl = ref<HTMLDivElement | null>(null);
let vditor: Vditor | null = null;
const isReady = ref(false);
let isInternalChange = false;

function resolveLocalImages() {
  if (!editorEl.value) return;
  const images = editorEl.value.querySelectorAll<HTMLImageElement>("img");
  images.forEach((img) => {
    const src = img.getAttribute("src") || "";
    if (src.startsWith("attachments/")) {
      img.src = resolveImageSrc(src);
    }
  });
}

function safeGetValue(): string | null {
  if (!vditor || !isReady.value) return null;
  try {
    const internal = (vditor as any).vditor;
    if (!internal || !internal.currentMode) return null;
    return vditor.getValue();
  } catch {
    return null;
  }
}

function safeSetValue(val: string) {
  if (!vditor || !isReady.value) return;
  try {
    const internal = (vditor as any).vditor;
    if (!internal || !internal.currentMode) return;
    vditor.setValue(val);
  } catch {
    // Ignore
  }
}

async function handleUpload(files: File[]) {
  try {
    const inserted: string[] = [];
    for (const file of files) {
      const res = await saveImageAttachment(file);
      const alt = res.fileName.replace(/\.[^/.]+$/, "");
      inserted.push(`![${alt}](${res.relativePath})`);
    }
    if (vditor && isReady.value) {
      try {
        const internal = (vditor as any).vditor;
        if (internal && internal.currentMode) {
          vditor.insertValue(inserted.join("\n"));
          nextTick(resolveLocalImages);
        }
      } catch (err) {
        console.warn("Failed to insert into vditor", err);
      }
    }
    return inserted;
  } catch (err) {
    console.error("Failed to upload image", err);
    return [];
  }
}

defineExpose({
  handleUpload,
  getVditor: () => vditor,
});

onMounted(() => {
  if (!editorEl.value) return;

  try {
    vditor = new Vditor(editorEl.value, {
      value: props.modelValue || "",
      mode: "ir", // 即时渲染 (所见即所得 Typora 体验)
      height: props.height,
      minHeight: props.minHeight,
      placeholder: props.placeholder,
      lang: "zh_CN",
      cdn: "/vditor",
      cache: {
        enable: false,
      },
      counter: {
        enable: false,
      },
      toolbarConfig: {
        pin: true,
      },
      toolbar: [
        "headings",
        "bold",
        "italic",
        "strike",
        "|",
        "line",
        "quote",
        "list",
        "ordered-list",
        "check",
        "|",
        "code",
        "inline-code",
        "link",
        "upload",
        "table",
        "|",
        "undo",
        "redo",
      ],
      upload: {
        accept: "image/*",
        multiple: true,
        async handler(files) {
          await handleUpload(files);
          return null;
        },
      },
      input(val) {
        isInternalChange = true;
        emit("update:modelValue", val);
        nextTick(resolveLocalImages);
        setTimeout(() => {
          isInternalChange = false;
        }, 0);
      },
      after() {
        isReady.value = true;
        nextTick(resolveLocalImages);
      },
    });
  } catch (err) {
    console.warn("Vditor initialization skipped or failed:", err);
  }
});

watch(
  () => props.modelValue,
  (newVal) => {
    if (!isInternalChange) {
      const current = safeGetValue();
      if (current !== null && current !== (newVal || "")) {
        safeSetValue(newVal || "");
        nextTick(resolveLocalImages);
      }
    }
  },
);

onBeforeUnmount(() => {
  isReady.value = false;
  if (vditor) {
    try {
      vditor.destroy();
    } catch {
      // Ignore
    }
    vditor = null;
  }
});
</script>

<template>
  <div class="kanboard-markdown-editor" :class="{ 'kanboard-markdown-editor--fullscreen': fullscreen }">
    <!-- 同步辅助元素（供自动化测试以及表单原生交互定位） -->
    <textarea
      v-if="dataInspectorDescription"
      data-inspector-description
      class="sr-only-sync-textarea"
      :value="modelValue"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    />
    <textarea
      v-if="dataInspectorReviewNotes"
      data-inspector-review-notes
      class="sr-only-sync-textarea"
      :value="modelValue"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    />

    <div ref="editorEl" class="kanboard-vditor-instance" />
  </div>
</template>
