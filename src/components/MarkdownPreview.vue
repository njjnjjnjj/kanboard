<script setup lang="ts">
import { MdPreview } from "md-editor-v3";
import "md-editor-v3/lib/preview.css";
import "../utils/markdownConfig";

withDefaults(
  defineProps<{
    modelValue: string;
    previewTheme?: string;
  }>(),
  {
    previewTheme: "github",
  },
);
</script>

<template>
  <div class="kanboard-markdown-preview">
    <MdPreview
      :model-value="modelValue || ''"
      language="zh-CN"
      :preview-theme="previewTheme"
      class="kanboard-md-preview-instance"
    />
  </div>
</template>
