<script setup lang="ts">
import SurfaceMotion from "./SurfaceMotion.vue";
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { Ellipsis, Trash2 } from "lucide-vue-next";
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
    "--surface-offset": opensAbove ? "-4px" : "4px",
    left: `${left}px`,
    top: `${opensAbove ? rect.top - height - 5 : rect.bottom + 5}px`,
    width: `${width}px`,
    transformOrigin: opensAbove ? "bottom right" : "top right",
  };
}

async function showMenu() {
  confirming.value = false;
  positionMenu();
  open.value = true;
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
    <Ellipsis :size="15" aria-hidden="true" />
  </button>

  <Teleport to="body">
    <SurfaceMotion kind="menu">
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
          <Trash2 :size="16" aria-hidden="true" />
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
    </SurfaceMotion>
  </Teleport>
</template>
