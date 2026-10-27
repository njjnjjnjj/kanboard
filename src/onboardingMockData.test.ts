import { describe, expect, it } from "vitest";
import {
  createMockColumns,
  createMockProjects,
  createMockTags,
  createMockTaskEvents,
  createMockTasks,
} from "./onboardingMockData";
import { calculateFlowMetrics } from "./flowMetrics";

describe("onboardingMockData", () => {
  it("creates valid projects, tags, and columns with all expected IDs", () => {
    const projects = createMockProjects();
    const tags = createMockTags();
    const columns = createMockColumns();

    expect(projects.length).toBeGreaterThanOrEqual(2);
    expect(tags.length).toBeGreaterThanOrEqual(3);
    expect(columns.map((c) => c.id)).toEqual([
      "todo",
      "backlog",
      "ready",
      "doing",
      "verify",
      "blocked",
      "done",
    ]);

    const readyCol = columns.find((c) => c.id === "ready")!;
    expect(readyCol.tasks.some((t) => t.id === "mock-task-drag-demo")).toBe(true);
    expect(readyCol.tasks.some((t) => t.id === "mock-task-agent-prompt")).toBe(true);

    const doingCol = columns.find((c) => c.id === "doing")!;
    expect(doingCol.tasks.length).toBe(1);
    expect(doingCol.wipLimit).toBe(2);

    const verifyCol = columns.find((c) => c.id === "verify")!;
    const verifyTask = verifyCol.tasks.find((t) => t.id === "mock-task-verify-1")!;
    expect(verifyTask.checklist.length).toBe(3);
    expect(verifyTask.reviewNotes).toContain("### 核心实现方案");
  });

  it("produces valid flow metrics from mock tasks and events", () => {
    const columns = createMockColumns();
    const tasks = columns.flatMap((c) => c.tasks);
    const events = createMockTaskEvents();

    const metrics = calculateFlowMetrics(tasks, events);
    expect(metrics.throughput7d).toBeGreaterThanOrEqual(1);
    expect(metrics.cfd.length).toBe(14);
  });

  it("returns fresh object instances to prevent cross-run mutation", () => {
    const columns1 = createMockColumns();
    const columns2 = createMockColumns();

    expect(columns1).not.toBe(columns2);
    expect(columns1[0]).not.toBe(columns2[0]);
    expect(columns1[0]?.tasks[0]).not.toBe(columns2[0]?.tasks[0]);
  });
});
