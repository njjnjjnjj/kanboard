<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import type { Tag } from "../types";

const props = defineProps<{
  tag: Tag;
  usageCount: number;
}>();

const emit = defineEmits<{
  delete: [tag: Tag];
}>();

const trigger = ref<HTMLButtonElement | null>(null);
const open = ref(false);
const confirming = ref(false);
const menuStyle = ref<Record<string, string>>({});
const menuId = `tag-actions-${Math.random().toString(36).slice(2)}`;

function positionMenu() {
  if (!trigger.value) return;
  const rect = trigger.value.getBoundingClientRect();
  const width = 232;
  const height = confirming.value ? 142 : 76;
  const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
  const opensAbove = window.innerHeight - rect.bottom < height + 12;
  menuStyle.value = {
    left: `${left}px`,
    top: `${opensAbove ? rect.top - height - 5 : rect.bottom + 5}px`,
    width: `${width}px`,
    transformOrigin: opensAbove ? "bottom right" : "top right",
  };
}

async function showMenu() {
  confirming.value = false;
  open.value = true;
  await nextTick();
  positionMenu();
}

function closeMenu() {
  open.value = false;
  confirming.value = false;
}

async function askForConfirmation() {
  confirming.value = true;
  await nextTick();
  positionMenu();
}

function confirmDelete() {
  emit("delete", props.tag);
  closeMenu();
}

function handleEscape(event: KeyboardEvent) {
  if (!open.value) return;
  event.preventDefault();
  event.stopPropagation();
  closeMenu();
  trigger.value?.focus();
}

function handleDocumentPointer(event: PointerEvent) {
  if (!open.value) return;
  const target = event.target as Node;
  const menu = document.getElementById(menuId);
  if (!trigger.value?.contains(target) && !menu?.contains(target)) closeMenu();
}

onMounted(() => {
  document.addEventListener("pointerdown", handleDocumentPointer);
  window.addEventListener("resize", closeMenu);
  window.addEventListener("scroll", closeMenu, true);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", handleDocumentPointer);
  window.removeEventListener("resize", closeMenu);
  window.removeEventListener("scroll", closeMenu, true);
});
</script>

<template>
  <button
    ref="trigger"
    class="workspace-nav__edit tag-actions__trigger"
    type="button"
    :aria-label="`标签操作：${tag.name}`"
    aria-haspopup="menu"
    :aria-expanded="open"
    :aria-controls="menuId"
    @click="open ? closeMenu() : showMenu()"
    @keydown.esc="handleEscape"
  >
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="3.25" cy="8" r="1" />
      <circle cx="8" cy="8" r="1" />
      <circle cx="12.75" cy="8" r="1" />
    </svg>
  </button>

  <Teleport to="body">
    <Transition name="tag-menu">
      <div
        v-if="open"
        :id="menuId"
        class="tag-actions__menu"
        :class="{ 'tag-actions__menu--confirming': confirming }"
        :style="menuStyle"
        role="menu"
        @keydown.esc="handleEscape"
      >
        <button v-if="!confirming" class="tag-actions__delete" type="button" role="menuitem" @click="askForConfirmation">
          <svg viewBox="0 0 18 18" aria-hidden="true">
            <path d="M3.5 5h11M7 3.5h4M5.7 5l.5 9.5h5.6l.5-9.5M7.6 7.5v4.3M10.4 7.5v4.3" />
          </svg>
          <span>
            <strong>删除标签</strong>
            <small>{{ usageCount ? `已用于 ${usageCount} 项任务` : "尚未用于任务" }}</small>
          </span>
        </button>
        <template v-else>
          <div class="tag-actions__confirmation">
            <strong>删除 #{{ tag.name }}？</strong>
            <p>{{ usageCount ? `将从 ${usageCount} 项任务中移除，任务本身不会删除。` : "标签会被永久删除。" }}</p>
          </div>
          <div class="tag-actions__buttons">
            <button type="button" @click="confirming = false; positionMenu()">取消</button>
            <button type="button" @click="confirmDelete">删除标签</button>
          </div>
        </template>
      </div>
    </Transition>
  </Teleport>
</template>
