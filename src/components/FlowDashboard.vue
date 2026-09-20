<script setup lang="ts">
import { computed } from "vue";
import type { FlowMetrics } from "../types";

const props = defineProps<{ open: boolean; metrics: FlowMetrics }>();
const emit = defineEmits<{ close: [] }>();

const statusSeries = [
  { id: "ready", label: "就绪", color: "#55766c" },
  { id: "doing", label: "进行中", color: "#285a78" },
  { id: "verify", label: "待验证", color: "#56717a" },
  { id: "done", label: "已完成", color: "#92968f" },
];
const maxCfd = computed(() => Math.max(1, ...props.metrics.cfd.map((point) =>
  statusSeries.reduce((total, status) => total + (point.counts[status.id] ?? 0), 0),
)));
function points(status: string) {
  const statusIndex = statusSeries.findIndex((item) => item.id === status);
  return props.metrics.cfd.map((point, index) => {
    const x = 12 + index * (276 / Math.max(1, props.metrics.cfd.length - 1));
    const cumulative = statusSeries.slice(0, statusIndex + 1)
      .reduce((total, item) => total + (point.counts[item.id] ?? 0), 0);
    const y = 118 - (cumulative / maxCfd.value) * 100;
    return `${x},${y}`;
  }).join(" ");
}
function hours(value: number | null) {
  if (value === null) return "暂无数据";
  if (value < 24) return `${value.toFixed(1)} 小时`;
  return `${(value / 24).toFixed(1)} 天`;
}
</script>

<template>
  <div v-if="open" class="dashboard-layer" @click.self="emit('close')">
    <section class="flow-dashboard" role="dialog" aria-modal="true" aria-label="流动统计">
      <header>
        <div><span>FLOW METRICS</span><h2>流动统计</h2></div>
        <button class="icon-button" type="button" aria-label="关闭统计" @click="emit('close')">×</button>
      </header>
      <div class="metric-grid">
        <article><span>过去 7 天完成</span><strong>{{ metrics.throughput7d }}</strong><small>项任务</small></article>
        <article><span>中位周期</span><strong>{{ hours(metrics.medianCycleHours) }}</strong><small>Doing → Done</small></article>
        <article><span>P85 周期</span><strong>{{ hours(metrics.p85CycleHours) }}</strong><small>85% 任务在此时间内完成</small></article>
        <article><span>30 天阻塞</span><strong>{{ hours(metrics.blockedHours30d) }}</strong><small>累计等待时间</small></article>
      </div>
      <div class="dashboard-grid">
        <article class="dashboard-card">
          <header><h3>累积流图</h3><span>最近 14 天</span></header>
          <svg class="cfd-chart" viewBox="0 0 300 130" role="img" aria-label="最近十四天各状态任务数量趋势">
            <path d="M12 18V118H288" />
            <polyline v-for="status in statusSeries" :key="status.id" :points="points(status.id)" :style="{ stroke: status.color }" />
          </svg>
          <div class="chart-legend"><span v-for="status in statusSeries" :key="status.id"><i :style="{ background: status.color }" />{{ status.label }}</span></div>
        </article>
        <article class="dashboard-card">
          <header><h3>Aging WIP</h3><span>当前进行中</span></header>
          <div class="aging-bars">
            <div v-for="bucket in metrics.agingBuckets" :key="bucket.label">
              <span>{{ bucket.label }}</span>
              <i :style="{ width: `${Math.max(bucket.count ? 12 : 0, bucket.count * 22)}px` }" />
              <strong>{{ bucket.count }}</strong>
            </div>
          </div>
          <p v-if="metrics.longWipTasks.length" class="long-wip-warning">
            {{ metrics.longWipTasks.length }} 项任务已进行超过 3 天：{{ metrics.longWipTasks.map((task) => task.title).join('、') }}
          </p>
          <p v-else class="dashboard-empty">当前没有长期停滞的进行中任务。</p>
        </article>
      </div>
    </section>
  </div>
</template>
