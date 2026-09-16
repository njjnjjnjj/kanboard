<script setup lang="ts">
import { reactive, watch } from "vue";
import type { Project, ProjectChanges } from "../types";

const props = defineProps<{
  open: boolean;
  project: Project | null;
  saving: boolean;
}>();

const emit = defineEmits<{
  close: [];
  save: [changes: ProjectChanges];
}>();

const colors = ["#285a78", "#8b4b3d", "#8a651f", "#4f6b51", "#65527c", "#426e70"];
const draft = reactive<ProjectChanges>({
  name: "",
  color: colors[0],
  description: "",
  targetDate: null,
  status: "active",
});

watch(
  () => [props.open, props.project] as const,
  () => {
    draft.name = props.project?.name ?? "";
    draft.color = props.project?.color ?? colors[0];
    draft.description = props.project?.description ?? "";
    draft.targetDate = props.project?.targetDate ?? null;
    draft.status = props.project?.status ?? "active";
  },
  { immediate: true },
);

function submit() {
  const name = draft.name.trim();
  if (!name) return;
  emit("save", { ...draft, name, description: draft.description.trim(), targetDate: draft.targetDate || null });
}
</script>

<template>
  <div v-if="open" class="project-editor-backdrop" @mousedown.self="emit('close')">
    <form
      class="project-editor"
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-editor-title"
      @submit.prevent="submit"
      @keydown.esc.stop="emit('close')"
    >
      <header>
        <div>
          <h2 id="project-editor-title">{{ project ? "编辑项目" : "新建项目" }}</h2>
          <p>项目保存共同背景，任务只记录具体行动。</p>
        </div>
        <button class="icon-button" type="button" aria-label="关闭项目编辑" @click="emit('close')">×</button>
      </header>

      <label class="field">
        <span>项目名称</span>
        <input v-model="draft.name" maxlength="80" autocomplete="off" autofocus />
      </label>

      <fieldset class="project-color-field">
        <legend>识别色</legend>
        <label v-for="color in colors" :key="color" :style="{ '--project-color': color }">
          <input v-model="draft.color" type="radio" name="project-color" :value="color" />
          <span :aria-label="color" />
        </label>
      </fieldset>

      <label class="field">
        <span>项目说明</span>
        <textarea v-model="draft.description" rows="5" placeholder="记录目标、背景、资料位置或完成标准" />
      </label>

      <label class="field">
        <span>目标日期</span>
        <input v-model="draft.targetDate" type="date" />
      </label>

      <footer>
        <button
          v-if="project"
          class="text-button"
          type="button"
          @click="draft.status = draft.status === 'active' ? 'archived' : 'active'; submit()"
        >
          {{ draft.status === "active" ? "归档项目" : "恢复项目" }}
        </button>
        <span v-else />
        <div>
          <button class="secondary-button" type="button" @click="emit('close')">取消</button>
          <button class="primary-button" type="submit" :disabled="saving || !draft.name.trim()">
            {{ saving ? "保存中…" : "保存项目" }}
          </button>
        </div>
      </footer>
    </form>
  </div>
</template>
