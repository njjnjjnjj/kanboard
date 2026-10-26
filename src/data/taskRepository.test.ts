import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskColumn } from "../types";

const database = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-sql", () => ({
  default: {
    load: vi.fn().mockResolvedValue(database),
  },
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue("sqlite:kanboard.db"),
}));

import { deleteTag, restoreTask, saveTaskOrder, trashTask, updateTask, loadTaskWall, loadDeletedTasks } from "./taskRepository";

describe("task repository ordering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.execute.mockResolvedValue({ rowsAffected: 1 });
  });

  it("persists a dragged task in its destination column", async () => {
    const columns: TaskColumn[] = [
      { id: "todo", title: "收集箱", position: 1000, wipLimit: null, tasks: [] },
      {
        id: "doing",
        title: "进行中",
        position: 2000,
        wipLimit: 2,
        tasks: [
          {
            id: "task-1",
            columnId: "todo",
            projectId: null,
            project: null,
            tags: [],
            title: "整理个人任务",
            description: "",
            dueDate: null,
            priority: "none",
            position: 1000,
            completedAt: null,
            startedAt: null,
            blockedReason: null,
            blockedSince: null,
            checklist: [],
            recurrenceRule: "none",
            reviewNotes: "",
      inAgentSop: false,
            createdAt: "2026-09-15T00:00:00.000Z",
            updatedAt: "2026-09-15T00:00:00.000Z",
          },
        ],
      },
    ];

    await saveTaskOrder(columns);

    expect(database.execute).toHaveBeenCalledWith(
      expect.stringContaining("SET column_id = $1"),
      expect.arrayContaining(["doing", 1000, null, "task-1"]),
    );
    expect(columns[1]?.tasks[0]?.columnId).toBe("doing");
  });

  it.each(["verify", "done"])("clears the agent marker when moved to %s and keeps it off after moving back", async (destination) => {
    const columns = [{
      id: destination, title: destination, position: 1000, wipLimit: null,
      tasks: [{
        id: "task-1", columnId: "doing", inAgentSop: true, completedAt: null,
        startedAt: "2026-10-21T00:00:00Z", blockedReason: null, blockedSince: null,
      }],
    }] as TaskColumn[];
    await saveTaskOrder(columns);
    expect(columns[0]!.tasks[0]!.inAgentSop).toBe(false);
    columns[0]!.id = "doing";
    await saveTaskOrder(columns);
    expect(columns[0]!.tasks[0]!.inAgentSop).toBe(false);
  });

  it("orders done tasks by completedAt descending when saving task order", async () => {
    const columns: TaskColumn[] = [
      {
        id: "done",
        title: "已完成",
        position: 7000,
        wipLimit: null,
        tasks: [
          {
            id: "task-earlier",
            columnId: "done",
            projectId: null,
            project: null,
            tags: [],
            title: "先完成的任务",
            description: "",
            dueDate: null,
            priority: "none",
            position: 1000,
            completedAt: "2026-10-26T08:00:00.000Z",
            startedAt: null,
            blockedReason: null,
            blockedSince: null,
            checklist: [],
            recurrenceRule: "none",
            reviewNotes: "",
            inAgentSop: false,
            createdAt: "2026-10-26T07:00:00.000Z",
            updatedAt: "2026-10-26T08:00:00.000Z",
          },
          {
            id: "task-later",
            columnId: "done",
            projectId: null,
            project: null,
            tags: [],
            title: "后完成的任务",
            description: "",
            dueDate: null,
            priority: "none",
            position: 2000,
            completedAt: "2026-10-26T10:00:00.000Z",
            startedAt: null,
            blockedReason: null,
            blockedSince: null,
            checklist: [],
            recurrenceRule: "none",
            reviewNotes: "",
            inAgentSop: false,
            createdAt: "2026-10-26T07:00:00.000Z",
            updatedAt: "2026-10-26T10:00:00.000Z",
          },
        ],
      },
    ];

    await saveTaskOrder(columns);

    // Later completed task must be placed at the top (index 0, position 1000)
    expect(columns[0].tasks[0].id).toBe("task-later");
    expect(columns[0].tasks[0].position).toBe(1000);
    expect(columns[0].tasks[1].id).toBe("task-earlier");
    expect(columns[0].tasks[1].position).toBe(2000);
  });
});

describe("task wall loading and sorting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sorts completed tasks in descending order of completedAt", async () => {
    database.select
      .mockResolvedValueOnce([{ id: "done", title: "已完成", position: 7000, wipLimit: null }])
      .mockResolvedValueOnce([
        {
          id: "task-1",
          columnId: "done",
          projectId: null,
          projectName: null,
          projectColor: null,
          projectPath: null,
          title: "早上完成",
          description: "",
          dueDate: null,
          priority: "none",
          position: 1000,
          completedAt: "2026-10-26T08:00:00.000Z",
          startedAt: null,
          blockedReason: null,
          blockedSince: null,
          recurrenceRule: "none",
          reviewNotes: "",
          inAgentSop: 0,
          createdAt: "2026-10-26T07:00:00.000Z",
          updatedAt: "2026-10-26T08:00:00.000Z",
        },
        {
          id: "task-2",
          columnId: "done",
          projectId: null,
          projectName: null,
          projectColor: null,
          projectPath: null,
          title: "下午完成",
          description: "",
          dueDate: null,
          priority: "none",
          position: 2000,
          completedAt: "2026-10-26T14:00:00.000Z",
          startedAt: null,
          blockedReason: null,
          blockedSince: null,
          recurrenceRule: "none",
          reviewNotes: "",
          inAgentSop: 0,
          createdAt: "2026-10-26T07:00:00.000Z",
          updatedAt: "2026-10-26T14:00:00.000Z",
        },
        {
          id: "task-3",
          columnId: "done",
          projectId: null,
          projectName: null,
          projectColor: null,
          projectPath: null,
          title: "中午完成",
          description: "",
          dueDate: null,
          priority: "none",
          position: 3000,
          completedAt: "2026-10-26T12:00:00.000Z",
          startedAt: null,
          blockedReason: null,
          blockedSince: null,
          recurrenceRule: "none",
          reviewNotes: "",
          inAgentSop: 0,
          createdAt: "2026-10-26T07:00:00.000Z",
          updatedAt: "2026-10-26T12:00:00.000Z",
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const columns = await loadTaskWall();

    expect(columns[0].tasks.map((t) => t.id)).toEqual(["task-2", "task-3", "task-1"]);
    expect(columns[0].tasks[0].title).toBe("下午完成");
    expect(columns[0].tasks[1].title).toBe("中午完成");
    expect(columns[0].tasks[2].title).toBe("早上完成");
  });
});

describe("task project and tag persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.execute.mockResolvedValue({ rowsAffected: 1 });
  });

  it("hydrates project identity and tags when loading the wall", async () => {
    database.select
      .mockResolvedValueOnce([{ id: "todo", title: "收集箱", position: 1000, wipLimit: null }])
      .mockResolvedValueOnce([
        {
          id: "task-1",
          columnId: "todo",
          projectId: "project-1",
          projectName: "看板桌面版",
          projectColor: "#285a78",
          projectPath: null,
          title: "补充标签",
          description: "",
          dueDate: null,
          priority: "none",
          position: 1000,
          completedAt: null,
          startedAt: null,
          blockedReason: null,
          blockedSince: null,
          recurrenceRule: "none",
          reviewNotes: "",
      inAgentSop: false,
          createdAt: "2026-09-16T00:00:00.000Z",
          updatedAt: "2026-09-16T00:00:00.000Z",
        },
      ])
      .mockResolvedValueOnce([{ taskId: "task-1", id: "tag-1", name: "开发" }])
      .mockResolvedValueOnce([]);

    const columns = await loadTaskWall();

    expect(columns[0]?.tasks[0]?.project).toEqual({
      id: "project-1",
      name: "看板桌面版",
      color: "#285a78",
      path: "",
    });
    expect(columns[0]?.tasks[0]?.tags).toEqual([{ id: "tag-1", name: "开发" }]);
  });

  it("reuses existing tags and links them to the task", async () => {
    database.select.mockResolvedValueOnce([{ id: "tag-1", name: "开发" }]);

    const tags = await updateTask("task-1", {
      title: "补充标签",
      description: "",
      dueDate: null,
      priority: "none",
      columnId: "todo",
      projectId: "project-1",
      tagNames: ["开发"],
      blockedReason: null,
      checklist: [],
      recurrenceRule: "none",
      reviewNotes: "",
    });

    expect(tags).toEqual([{ id: "tag-1", name: "开发" }]);
    expect(database.execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO task_events"),
      expect.arrayContaining(["todo", "task-1"]),
    );
    expect(database.execute).toHaveBeenCalledWith(
      "INSERT INTO task_tags (task_id, tag_id) VALUES ($1, $2)",
      ["task-1", "tag-1"],
    );
  });

  it("removes task links before deleting a global tag", async () => {
    await deleteTag("tag-1");

    expect(database.execute).toHaveBeenNthCalledWith(
      1,
      "DELETE FROM task_tags WHERE tag_id = $1",
      ["tag-1"],
    );
    expect(database.execute).toHaveBeenNthCalledWith(
      2,
      "DELETE FROM tags WHERE id = $1",
      ["tag-1"],
    );
  });
});

describe("task trash persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.execute.mockResolvedValue({ rowsAffected: 1 });
  });

  it("soft deletes and restores a task without removing its record", async () => {
    const deletedAt = await trashTask("task-1");

    expect(deletedAt).toBeTruthy();
    expect(database.execute).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("SET deleted_at = $1"),
      [deletedAt, "task-1"],
    );

    await restoreTask("task-1");
    expect(database.execute).toHaveBeenNthCalledWith(
      2,
      "UPDATE tasks SET deleted_at = NULL, updated_at = $1 WHERE id = $2",
      [expect.any(String), "task-1"],
    );
  });

  it("keeps the MCP marker when loading a deleted task", async () => {
    database.select.mockResolvedValueOnce([{ id: "task-1", inAgentSop: 1 }])
      .mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    expect((await loadDeletedTasks())[0]?.inAgentSop).toBe(true);
    expect(database.select.mock.calls[0]?.[0]).toContain("t.in_agent_sop AS inAgentSop");
  });
});
