<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";

const props = withDefaults(defineProps<{
  label: string;
  quick?: boolean;
}>(), {
  quick: false,
});

const model = defineModel<string | null>({ required: true });
const control = ref<HTMLElement | null>(null);
const open = ref(false);
const visibleMonth = ref(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
const focusedDate = ref("");
const menuStyle = ref<Record<string, string>>({});
const menuId = `date-picker-${Math.random().toString(36).slice(2)}`;

function keyFromDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function dateFromKey(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year!, month! - 1, day);
  return keyFromDate(date) === value ? date : null;
}

function dateKey(offset: number) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return keyFromDate(date);
}

const todayKey = computed(() => dateKey(0));
const shortcuts = computed(() => [
  { label: "今天", value: dateKey(0) },
  { label: "明天", value: dateKey(1) },
  { label: "后天", value: dateKey(2) },
]);
const monthLabel = computed(() => new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long",
}).format(visibleMonth.value));
const calendarDays = computed(() => {
  const first = visibleMonth.value;
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    const key = keyFromDate(date);
    return {
      key,
      label: date.getDate(),
      currentMonth: date.getMonth() === first.getMonth(),
      today: key === todayKey.value,
      selected: key === model.value,
    };
  });
});

function update(event: Event) {
  model.value = (event.target as HTMLInputElement).value || null;
}

function positionMenu() {
  const rect = control.value?.getBoundingClientRect();
  if (!rect) return;
  const width = Math.min(292, window.innerWidth - 16);
  const height = props.quick ? 370 : 326;
  const opensAbove = window.innerHeight - rect.bottom < height + 8 && rect.top > height;
  menuStyle.value = {
    left: `${Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))}px`,
    top: `${opensAbove ? Math.max(8, rect.top - height - 6) : rect.bottom + 6}px`,
    width: `${width}px`,
    transformOrigin: opensAbove ? "right bottom" : "right top",
  };
}

async function focusDay(key: string) {
  focusedDate.value = key;
  await nextTick();
  document.querySelector<HTMLButtonElement>(`#${menuId} [data-date="${key}"]`)?.focus();
}

async function showCalendar() {
  if (open.value) {
    closeCalendar();
    return;
  }
  const initial = dateFromKey(model.value) ?? new Date();
  visibleMonth.value = new Date(initial.getFullYear(), initial.getMonth(), 1);
  focusedDate.value = keyFromDate(initial);
  open.value = true;
  await nextTick();
  positionMenu();
  await focusDay(focusedDate.value);
}

function closeCalendar() {
  open.value = false;
}

function chooseDate(key: string) {
  model.value = key;
  closeCalendar();
  control.value?.querySelector<HTMLButtonElement>("[aria-haspopup='dialog']")?.focus();
}

async function changeMonth(offset: number) {
  const current = visibleMonth.value;
  const next = new Date(current.getFullYear(), current.getMonth() + offset, 1);
  visibleMonth.value = next;
  await focusDay(keyFromDate(next));
}

function handleCalendarKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    closeCalendar();
    control.value?.querySelector<HTMLButtonElement>("[aria-haspopup='dialog']")?.focus();
    return;
  }
  const offsets: Record<string, number> = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -7,
    ArrowDown: 7,
  };
  const offset = offsets[event.key];
  if (!offset) return;
  event.preventDefault();
  const current = dateFromKey(focusedDate.value) ?? new Date();
  current.setDate(current.getDate() + offset);
  if (
    current.getMonth() !== visibleMonth.value.getMonth() ||
    current.getFullYear() !== visibleMonth.value.getFullYear()
  ) {
    visibleMonth.value = new Date(current.getFullYear(), current.getMonth(), 1);
  }
  focusDay(keyFromDate(current));
}

function handleDocumentPointer(event: PointerEvent) {
  if (!open.value) return;
  const target = event.target as Node;
  const menu = document.getElementById(menuId);
  if (!control.value?.contains(target) && !menu?.contains(target)) closeCalendar();
}

onMounted(() => {
  document.addEventListener("pointerdown", handleDocumentPointer);
  window.addEventListener("resize", closeCalendar);
  window.addEventListener("scroll", closeCalendar, true);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", handleDocumentPointer);
  window.removeEventListener("resize", closeCalendar);
  window.removeEventListener("scroll", closeCalendar, true);
});
</script>

<template>
  <div class="date-input">
    <div ref="control" class="date-input__control">
      <input
        class="date-input__text"
        :value="model ?? ''"
        type="text"
        inputmode="numeric"
        maxlength="10"
        pattern="\d{4}-\d{2}-\d{2}"
        placeholder="YYYY-MM-DD"
        autocomplete="off"
        :aria-label="label"
        title="请使用 YYYY-MM-DD 格式"
        @input="update"
      />
      <div class="date-input__actions">
        <button
          type="button"
          aria-haspopup="dialog"
          :aria-expanded="open"
          :aria-controls="menuId"
          :aria-label="`打开${label}选择器`"
          @click="showCalendar"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M5.5 2.8v2.5M14.5 2.8v2.5M3.2 7.2h13.6M4.2 4.3h11.6c.6 0 1 .4 1 1v10.2c0 .6-.4 1-1 1H4.2c-.6 0-1-.4-1-1V5.3c0-.6.4-1 1-1Z" />
          </svg>
        </button>
        <button v-if="model" type="button" aria-label="清除日期" @click="model = null">×</button>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="open"
        :id="menuId"
        class="date-picker"
        role="dialog"
        :aria-label="`${label}日历`"
        :style="menuStyle"
        @keydown="handleCalendarKeydown"
      >
        <header class="date-picker__header">
          <button type="button" aria-label="上个月" @click="changeMonth(-1)">‹</button>
          <strong aria-live="polite">{{ monthLabel }}</strong>
          <button type="button" aria-label="下个月" @click="changeMonth(1)">›</button>
        </header>
        <div v-if="props.quick" class="date-picker__shortcuts" :aria-label="`快速选择${label}`">
          <button
            v-for="shortcut in shortcuts"
            :key="shortcut.value"
            type="button"
            :aria-pressed="model === shortcut.value"
            @click="chooseDate(shortcut.value)"
          >{{ shortcut.label }}</button>
        </div>
        <div class="date-picker__weekdays" aria-hidden="true">
          <span v-for="weekday in ['一', '二', '三', '四', '五', '六', '日']" :key="weekday">{{ weekday }}</span>
        </div>
        <div class="date-picker__days">
          <button
            v-for="day in calendarDays"
            :key="day.key"
            type="button"
            :data-date="day.key"
            :tabindex="focusedDate === day.key ? 0 : -1"
            :class="{
              'date-picker__day--outside': !day.currentMonth,
              'date-picker__day--today': day.today,
              'date-picker__day--selected': day.selected,
            }"
            :aria-label="day.key"
            :aria-current="day.today ? 'date' : undefined"
            :aria-pressed="day.selected"
            @focus="focusedDate = day.key"
            @click="chooseDate(day.key)"
          >
            {{ day.label }}
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>
