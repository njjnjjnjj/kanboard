import type { FlowMetrics, Task, TaskEvent } from "./types";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function percentile(values: number[], ratio: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * ratio) - 1] ?? null;
}

function dateKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function calculateFlowMetrics(
  tasks: Task[],
  events: TaskEvent[],
  now = new Date(),
): FlowMetrics {
  const nowMs = now.getTime();
  const byTask = new Map<string, TaskEvent[]>();
  for (const event of events) {
    const list = byTask.get(event.taskId) ?? [];
    list.push(event);
    byTask.set(event.taskId, list);
  }

  const cycleHours: number[] = [];
  for (const taskEvents of byTask.values()) {
    const started = taskEvents.find((event) => event.toStatus === "doing");
    const done = started && taskEvents.find((event) =>
      event.toStatus === "done" && new Date(event.createdAt) >= new Date(started.createdAt),
    );
    if (started && done) {
      cycleHours.push((Date.parse(done.createdAt) - Date.parse(started.createdAt)) / HOUR);
    }
  }

  const sevenDaysAgo = nowMs - 7 * DAY;
  const throughput7d = new Set(
    events
      .filter((event) => event.toStatus === "done" && Date.parse(event.createdAt) >= sevenDaysAgo)
      .map((event) => event.taskId),
  ).size;

  const thirtyDaysAgo = nowMs - 30 * DAY;
  let blockedMs = 0;
  for (const taskEvents of byTask.values()) {
    for (const [index, event] of taskEvents.entries()) {
      if (event.toStatus !== "blocked") continue;
      const start = Math.max(Date.parse(event.createdAt), thirtyDaysAgo);
      const end = Math.min(
        taskEvents.slice(index + 1).find((item) => item.toStatus !== "blocked")
          ? Date.parse(taskEvents.slice(index + 1).find((item) => item.toStatus !== "blocked")!.createdAt)
          : nowMs,
        nowMs,
      );
      if (end > start) blockedMs += end - start;
    }
  }

  const doingTasks = tasks.filter((task) => task.columnId === "doing");
  const ages = doingTasks.map((task) => task.startedAt ? nowMs - Date.parse(task.startedAt) : 0);
  const longWipTasks = doingTasks.filter((task) =>
    Boolean(task.startedAt) && nowMs - Date.parse(task.startedAt!) >= 3 * DAY,
  );
  const agingBuckets = [
    { label: "0~1 天", count: ages.filter((age) => age < DAY).length },
    { label: "1~3 天", count: ages.filter((age) => age >= DAY && age < 3 * DAY).length },
    { label: "3~7 天", count: ages.filter((age) => age >= 3 * DAY && age < 7 * DAY).length },
    { label: ">7 天", count: ages.filter((age) => age >= 7 * DAY).length },
  ];

  const cfd = Array.from({ length: 14 }, (_, offset) => {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (13 - offset), 23, 59, 59, 999);
    const counts: Record<string, number> = {};
    for (const taskEvents of byTask.values()) {
      const latest = taskEvents.filter((event) => Date.parse(event.createdAt) <= day.getTime()).at(-1);
      if (latest) counts[latest.toStatus] = (counts[latest.toStatus] ?? 0) + 1;
    }
    return { date: dateKey(day), counts };
  });

  const median = percentile(cycleHours, 0.5);
  const p85 = percentile(cycleHours, 0.85);
  return {
    throughput7d,
    medianCycleHours: median,
    p85CycleHours: p85,
    blockedHours30d: blockedMs / HOUR,
    longWipTasks,
    agingBuckets,
    cfd,
  };
}
