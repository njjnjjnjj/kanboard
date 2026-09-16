<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";

export interface SelectOption {
  value: string;
  label: string;
}

const props = defineProps<{
  modelValue: string;
  options: SelectOption[];
  label: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const trigger = ref<HTMLButtonElement | null>(null);
const open = ref(false);
const activeIndex = ref(0);
const menuStyle = ref<Record<string, string>>({});
const menuId = `task-select-${Math.random().toString(36).slice(2)}`;

const selectedOption = computed(() =>
  props.options.find((option) => option.value === props.modelValue) ?? props.options[0],
);

function positionMenu() {
  const element = trigger.value;
  if (!element) return;
  const rect = element.getBoundingClientRect();
  const desiredHeight = Math.min(props.options.length * 36 + 8, 220);
  const availableBelow = Math.max(0, window.innerHeight - rect.bottom - 12);
  const availableAbove = Math.max(0, rect.top - 12);
  const opensAbove = availableBelow < desiredHeight && availableAbove > availableBelow;
  const menuHeight = Math.max(96, Math.min(desiredHeight, opensAbove ? availableAbove : availableBelow));
  menuStyle.value = {
    left: `${rect.left}px`,
    top: `${opensAbove ? rect.top - menuHeight - 6 : rect.bottom + 6}px`,
    width: `${rect.width}px`,
    maxHeight: `${menuHeight}px`,
  };
}

async function showMenu(direction = 0) {
  const selectedIndex = props.options.findIndex((option) => option.value === props.modelValue);
  activeIndex.value = Math.max(0, selectedIndex);
  if (direction) {
    activeIndex.value = (activeIndex.value + direction + props.options.length) % props.options.length;
  }
  open.value = true;
  await nextTick();
  positionMenu();
}

function closeMenu() {
  open.value = false;
}

function choose(option: SelectOption) {
  emit("update:modelValue", option.value);
  closeMenu();
  trigger.value?.focus();
}

async function moveActive(direction: number) {
  activeIndex.value = (activeIndex.value + direction + props.options.length) % props.options.length;
  await nextTick();
  document.getElementById(`${menuId}-option-${activeIndex.value}`)?.scrollIntoView?.({ block: "nearest" });
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && open.value) {
    event.preventDefault();
    event.stopPropagation();
    closeMenu();
    return;
  }
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    event.stopPropagation();
    if (!open.value) {
      showMenu(event.key === "ArrowDown" ? 1 : -1);
    } else {
      moveActive(event.key === "ArrowDown" ? 1 : -1);
    }
    return;
  }
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    event.stopPropagation();
    if (!open.value) showMenu();
    else {
      const option = props.options[activeIndex.value];
      if (option) choose(option);
    }
  }
}

function handleDocumentPointer(event: PointerEvent) {
  if (!open.value) return;
  const target = event.target as Node;
  const menu = document.getElementById(menuId);
  if (!trigger.value?.contains(target) && !menu?.contains(target)) closeMenu();
}

function handleWindowScroll(event: Event) {
  const menu = document.getElementById(menuId);
  if (event.target instanceof Node && menu?.contains(event.target)) return;
  closeMenu();
}

onMounted(() => {
  document.addEventListener("pointerdown", handleDocumentPointer);
  window.addEventListener("resize", closeMenu);
  window.addEventListener("scroll", handleWindowScroll, true);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", handleDocumentPointer);
  window.removeEventListener("resize", closeMenu);
  window.removeEventListener("scroll", handleWindowScroll, true);
});
</script>

<template>
  <div class="task-select">
    <button
      ref="trigger"
      class="task-select__trigger"
      type="button"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-controls="menuId"
      :aria-activedescendant="open ? `${menuId}-option-${activeIndex}` : undefined"
      :aria-label="label"
      @click="open ? closeMenu() : showMenu()"
      @keydown="handleKeydown"
    >
      <span>{{ selectedOption?.label }}</span>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        :id="menuId"
        class="task-select__menu"
        role="listbox"
        :aria-label="label"
        :style="menuStyle"
      >
        <button
          v-for="(option, index) in options"
          :key="option.value"
          :id="`${menuId}-option-${index}`"
          class="task-select__option"
          :class="{ 'task-select__option--active': index === activeIndex }"
          type="button"
          role="option"
          :aria-selected="option.value === modelValue"
          @pointerenter="activeIndex = index"
          @click="choose(option)"
        >
          <span>{{ option.label }}</span>
          <svg v-if="option.value === modelValue" viewBox="0 0 16 16" aria-hidden="true">
            <path d="m3.5 8.2 2.7 2.7 6.3-6.3" />
          </svg>
        </button>
      </div>
    </Teleport>
  </div>
</template>
