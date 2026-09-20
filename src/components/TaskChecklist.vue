<script setup lang="ts">
import { nextTick } from "vue";
import type { ChecklistItem } from "../types";

const props = defineProps<{ modelValue: ChecklistItem[] }>();
const emit = defineEmits<{ "update:modelValue": [items: ChecklistItem[]] }>();

async function addItem() {
  emit("update:modelValue", [
    ...props.modelValue,
    { id: crypto.randomUUID(), text: "", completed: false, position: (props.modelValue.length + 1) * 1000 },
  ]);
  await nextTick();
  document.querySelector<HTMLInputElement>(".task-checklist__item:last-child input[type='text']")?.focus();
}

function updateItem(index: number, changes: Partial<ChecklistItem>) {
  emit("update:modelValue", props.modelValue.map((item, itemIndex) =>
    itemIndex === index ? { ...item, ...changes } : item,
  ));
}

function removeItem(index: number) {
  emit("update:modelValue", props.modelValue.filter((_, itemIndex) => itemIndex !== index));
}
</script>

<template>
  <div class="task-checklist">
    <div class="task-checklist__items">
      <div v-for="(item, index) in modelValue" :key="item.id" class="task-checklist__item">
        <input
          type="checkbox"
          :checked="item.completed"
          :aria-label="`完成检查项 ${index + 1}`"
          @change="updateItem(index, { completed: ($event.target as HTMLInputElement).checked })"
        />
        <input
          :value="item.text"
          type="text"
          maxlength="160"
          :aria-label="`检查项 ${index + 1}`"
          placeholder="输入完成条件"
          @input="updateItem(index, { text: ($event.target as HTMLInputElement).value })"
          @keydown.enter.exact.prevent="addItem"
        />
        <button type="button" aria-label="删除检查项" @click="removeItem(index)">×</button>
      </div>
      <p v-if="!modelValue.length">还没有完成条件</p>
    </div>
    <button class="task-checklist__add" type="button" @click="addItem">＋ 添加检查项</button>
  </div>
</template>
