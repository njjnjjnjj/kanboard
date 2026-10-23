<script setup lang="ts">
import { computed } from "vue";
import { config, MdEditor, type ToolbarNames } from "md-editor-v3";
import "md-editor-v3/lib/style.css";
import { saveImageAttachment, resolveImageSrc } from "../services/attachmentService";

config({
  markdownItConfig(md: any) {
    const defaultImageRule =
      md.renderer.rules.image ||
      function (tokens: any[], idx: number, options: any, _env: any, self: any) {
        return self.renderToken(tokens, idx, options);
      };

    md.renderer.rules.image = function (tokens: any[], idx: number, options: any, env: any, self: any) {
      const token = tokens[idx];
      const srcIndex = token.attrIndex("src");
      if (srcIndex >= 0 && token.attrs) {
        token.attrs[srcIndex][1] = resolveImageSrc(token.attrs[srcIndex][1]);
      }
      return defaultImageRule(tokens, idx, options, env, self);
    };
  },
});

const props = withDefaults(
  defineProps<{
    modelValue: string;
    label?: string;
    placeholder?: string;
    taskTitle?: string;
    dataInspectorDescription?: boolean;
    dataInspectorReviewNotes?: boolean;
    previewOnly?: boolean;
    height?: string;
  }>(),
  {
    label: "",
    placeholder: "支持 Markdown 格式与图片粘贴…",
    taskTitle: "",
    dataInspectorDescription: false,
    dataInspectorReviewNotes: false,
    previewOnly: false,
    height: "360px",
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const content = computed({
  get: () => props.modelValue || "",
  set: (val: string) => emit("update:modelValue", val),
});

const toolbars: ToolbarNames[] = [
  "bold",
  "underline",
  "italic",
  "strikeThrough",
  "-",
  "title",
  "quote",
  "unorderedList",
  "orderedList",
  "task",
  "-",
  "codeRow",
  "code",
  "link",
  "image",
  "table",
  "-",
  "revoke",
  "next",
  "=",
  "pageFullscreen",
  "fullscreen",
  "preview",
  "previewOnly",
];

async function handleUploadImg(
  files: Array<File>,
  callback: (urls: Array<{ url: string; alt: string; title: string }>) => void,
) {
  try {
    const uploaded = await Promise.all(
      files.map(async (file) => {
        const res = await saveImageAttachment(file);
        return {
          url: res.relativePath,
          alt: res.fileName.replace(/\.[^/.]+$/, ""),
          title: res.fileName,
        };
      }),
    );
    callback(uploaded);
  } catch (err) {
    console.error("Failed to upload image", err);
  }
}
</script>

<template>
  <div class="kanboard-markdown-editor">
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

    <MdEditor
      v-model="content"
      language="zh-CN"
      preview-theme="github"
      :placeholder="placeholder"
      :toolbars="toolbars"
      :preview-only="previewOnly"
      :style="{ height: height }"
      class="kanboard-md-editor-instance"
      :on-upload-img="handleUploadImg"
    />
  </div>
</template>
