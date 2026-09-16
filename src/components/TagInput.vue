<script setup lang="ts">
import { computed, ref } from "vue";
import type { Tag } from "../types";

const props = defineProps<{
  modelValue: string[];
  suggestions: Tag[];
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string[]];
}>();

const inputValue = ref("");
const input = ref<HTMLInputElement | null>(null);
const open = ref(false);
let blurTimer: number | undefined;
const filtered = computed(() => {
  const query = inputValue.value.trim().toLocaleLowerCase();
  return props.suggestions
    .filter((tag) => !props.modelValue.some((name) => name.toLocaleLowerCase() === tag.name.toLocaleLowerCase()))
    .filter((tag) => !query || tag.name.toLocaleLowerCase().includes(query))
    .slice(0, 6);
});

function add(name: string) {
  const normalized = name.trim();
  if (!normalized) return;
  if (!props.modelValue.some((item) => item.toLocaleLowerCase() === normalized.toLocaleLowerCase())) {
    emit("update:modelValue", [...props.modelValue, normalized]);
  }
  inputValue.value = "";
  open.value = false;
}

function remove(name: string) {
  emit("update:modelValue", props.modelValue.filter((item) => item !== name));
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Enter" || event.key === ",") {
    if (!inputValue.value.trim()) return;
    event.preventDefault();
    add(filtered.value[0]?.name ?? inputValue.value);
  } else if (event.key === "Backspace" && !inputValue.value && props.modelValue.length) {
    remove(props.modelValue[props.modelValue.length - 1]);
  } else if (event.key === "Escape") {
    event.stopPropagation();
    open.value = false;
  }
}

function focusInput() {
  input.value?.focus();
}

function closeAfterBlur() {
  window.clearTimeout(blurTimer);
  blurTimer = window.setTimeout(() => {
    open.value = false;
  }, 120);
}
</script>

<template>
  <div class="tag-input" :class="{ 'tag-input--open': open }">
    <div class="tag-input__control" @click="focusInput">
      <button
        v-for="name in modelValue"
        :key="name"
        class="tag-chip"
        type="button"
        :aria-label="`移除标签：${name}`"
        @click.stop="remove(name)"
      >
        <span>#{{ name }}</span><span aria-hidden="true">×</span>
      </button>
      <input
        ref="input"
        v-model="inputValue"
        type="text"
        maxlength="40"
        autocomplete="off"
        aria-label="添加标签"
        placeholder="输入标签后回车"
        @focus="open = true"
        @input="open = true"
        @keydown="handleKeydown"
        @blur="closeAfterBlur"
      />
    </div>
    <div v-if="open && (filtered.length || inputValue.trim())" class="tag-input__menu" role="listbox">
      <button v-for="tag in filtered" :key="tag.id" type="button" role="option" @mousedown.prevent="add(tag.name)">
        #{{ tag.name }}
      </button>
      <button
        v-if="inputValue.trim() && !filtered.some((tag) => tag.name.toLocaleLowerCase() === inputValue.trim().toLocaleLowerCase())"
        type="button"
        role="option"
        @mousedown.prevent="add(inputValue)"
      >
        新建“{{ inputValue.trim() }}”
      </button>
    </div>
  </div>
</template>
