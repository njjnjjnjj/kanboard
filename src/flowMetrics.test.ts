import { describe, expect, it } from "vitest";
import { calculateFlowMetrics } from "./flowMetrics";
import type { Task, TaskEvent } from "./types";

const task = (id: string, startedAt: string): Task => ({
  id, columnId: "doing", projectId: null, project: null, tags: [], title: id,
  description: "", dueDate: null, priority: "none", position: 1000,
  completedAt: null, startedAt, blockedReason: null, blockedSince: null,
  checklist: [], recurrenceRule: "none", reviewNotes: "", inAgentSop: false,
  createdAt: startedAt, updatedAt: startedAt,
});

describe("flow metrics", () => {
  it("calculates cycle percentiles, throughput and long WIP from events", () => {
    const events: TaskEvent[] = [
      { taskId: "one", fromStatus: "ready", toStatus: "doing", createdAt: "2026-09-10T00:00:00.000Z" },
      { taskId: "one", fromStatus: "doing", toStatus: "done", createdAt: "2026-09-11T00:00:00.000Z" },
      { taskId: "two", fromStatus: "ready", toStatus: "doing", createdAt: "2026-09-12T00:00:00.000Z" },
      { taskId: "two", fromStatus: "doing", toStatus: "done", createdAt: "2026-09-14T00:00:00.000Z" },
    ];
    const metrics = calculateFlowMetrics(
      [task("active", "2026-09-12T00:00:00.000Z")],
      events,
      new Date("2026-09-16T00:00:00.000Z"),
    );

    expect(metrics.throughput7d).toBe(2);
    expect(metrics.medianCycleHours).toBe(24);
    expect(metrics.p85CycleHours).toBe(48);
    expect(metrics.longWipTasks.map((item) => item.id)).toEqual(["active"]);
    expect(metrics.cfd).toHaveLength(14);
  });
});
