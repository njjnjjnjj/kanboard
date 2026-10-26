<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from "vue";
import Vditor from "vditor";
import "vditor/dist/index.css";
import { createElement, Maximize2, Minimize2 } from "lucide";
import { saveImageAttachment, resolveImageSrc, normalizeAttachmentMarkdown } from "../services/attachmentService";
import { isLocalDocumentLink, openDocumentPreview, resolveDocumentImageSrc } from "../services/documentPreviewService";

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
    readonly?: boolean;
    documentPreview?: boolean;
  }>(),
  {
    label: "",
    placeholder: "支持所见即所得 Markdown 编写与截图粘贴…",
    taskTitle: "",
    dataInspectorDescription: false,
    dataInspectorReviewNotes: false,
    height: "100%",
    minHeight: 180,
    fullscreen: false,
    readonly: false,
    documentPreview: false,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
  "toggleFullscreen": [];
}>();

const editorEl = ref<HTMLDivElement | null>(null);
let vditor: Vditor | null = null;
const isReady = ref(false);
let isInternalChange = false;
let imageObserver: MutationObserver | null = null;
const uploadError = ref("");
const linkError = ref("");

async function handleDocumentLink(event: MouseEvent) {
  const target = event.target instanceof Element ? event.target : null;
  const link = target?.closest('a[href], [data-type="a"]');
  const href = link?.getAttribute("href") || link?.querySelector(":scope > .vditor-ir__marker--link")?.textContent || "";
  if (!isLocalDocumentLink(href, props.documentPreview)) return;
  event.preventDefault();
  event.stopPropagation();
  linkError.value = "";
  try {
    await openDocumentPreview(href);
  } catch (error) {
    linkError.value = `文档预览失败：${String(error)}`;
  }
}

function resolveLocalImages() {
  if (!editorEl.value) return;
  const images = editorEl.value.querySelectorAll<HTMLImageElement>("img");
  images.forEach((img) => {
    const src = img.getAttribute("src") || "";
    if (props.documentPreview || src.startsWith("attachments/")) {
      const resolved = props.documentPreview ? resolveDocumentImageSrc(src) : resolveImageSrc(src);
      if (resolved !== src) img.setAttribute("src", resolved);
    }
  });
}

function safeGetValue(): string | null {
  if (!vditor || !isReady.value) return null;
  try {
    const internal = (vditor as any).vditor;
    if (!internal || !internal.currentMode) return null;
    return normalizeAttachmentMarkdown(vditor.getValue());
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
  uploadError.value = "";
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
    uploadError.value = `图片保存失败：${String(err)}`;
    console.error("Failed to upload image", err);
    return [];
  }
}

function getLucideIconHtml(iconDef: any): string {
  if (typeof document !== "undefined") {
    try {
      const el = createElement(iconDef, {
        width: 15,
        height: 15,
        "stroke-width": 1.8,
      });
      return el.outerHTML;
    } catch {
      // fallback to empty string
    }
  }
  return "";
}

defineExpose({
  handleUpload,
  getVditor: () => vditor,
});

onMounted(() => {
  if (!editorEl.value) return;
  imageObserver = new MutationObserver(resolveLocalImages);
  imageObserver.observe(editorEl.value, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });

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
        hide: false,
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
        ...(props.fullscreen
          ? []
          : [
              {
                name: "fullscreen-custom",
                tip: "全屏编辑 (Esc 退出)",
                tipPosition: "s",
                className: "vditor-toolbar__item--fullscreen-btn",
                icon: getLucideIconHtml(Maximize2),
                click() {
                  emit("toggleFullscreen");
                },
              },
            ]),
      ],
      upload: props.readonly
        // Vditor 会直接读取 upload.url，不能用 undefined 覆盖默认配置。
        ? {}
        : {
            accept: "image/*",
            multiple: true,
            async handler(files) {
              await handleUpload(files);
              return null;
            },
          },
      input(val) {
        if (props.readonly) return;
        isInternalChange = true;
        emit("update:modelValue", normalizeAttachmentMarkdown(val));
        nextTick(resolveLocalImages);
        setTimeout(() => {
          isInternalChange = false;
        }, 0);
      },
      after() {
        isReady.value = true;
        if (props.modelValue && safeGetValue() !== props.modelValue) {
          safeSetValue(props.modelValue);
        }
        if (props.readonly && vditor) {
          try {
            (vditor as any).disabled?.();
          } catch {
            // ignore
          }
        }
        nextTick(resolveLocalImages);
        if (editorEl.value) {
          const fsContainer = editorEl.value.querySelector(".vditor-toolbar__item--fullscreen-btn");
          const fsBtn = fsContainer?.querySelector("button");
          if (fsContainer && fsBtn) {
            fsContainer.addEventListener("click", (e) => {
              if (e.target !== fsBtn && !fsBtn.contains(e.target as Node)) {
                fsBtn.click();
              }
            });
          }
        }
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

watch(
  () => props.fullscreen,
  (isFs) => {
    if (editorEl.value) {
      const fsBtn = editorEl.value.querySelector(".vditor-toolbar__item--fullscreen-btn button");
      if (fsBtn) {
        fsBtn.innerHTML = getLucideIconHtml(isFs ? Minimize2 : Maximize2);
        fsBtn.setAttribute("aria-label", isFs ? "退出全屏 (Esc)" : "全屏编辑 (Esc 退出)");
      }
    }
  },
);

watch(
  () => props.readonly,
  (isRo) => {
    if (vditor && isReady.value) {
      try {
        if (isRo) {
          (vditor as any).disabled?.();
        } else {
          (vditor as any).enable?.();
        }
      } catch {
        // ignore
      }
    }
  },
);

onBeforeUnmount(() => {
  imageObserver?.disconnect();
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
  <div
    class="kanboard-markdown-editor"
    @click.capture="handleDocumentLink"
    :class="{
      'kanboard-markdown-editor--fullscreen': fullscreen,
      'kanboard-markdown-editor--readonly': readonly,
    }"
  >
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
    <button
      type="button"
      class="sr-only-sync-btn fullscreen-toggle-btn"
      tabindex="-1"
      aria-label="全屏切换"
      @click="emit('toggleFullscreen')"
    />

    <p v-if="uploadError" role="alert">{{ uploadError }}</p>
    <p v-if="linkError" role="alert">{{ linkError }}</p>
    <div ref="editorEl" class="kanboard-vditor-instance" />
  </div>
</template>
