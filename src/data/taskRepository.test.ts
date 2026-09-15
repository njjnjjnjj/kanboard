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

import { saveTaskOrder } from "./taskRepository";

describe("task repository ordering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.execute.mockResolvedValue({ rowsAffected: 1 });
  });

  it("persists a dragged task in its destination column", async () => {
    const columns: TaskColumn[] = [
      { id: "todo", title: "待处理", position: 1000, tasks: [] },
      {
        id: "doing",
        title: "进行中",
        position: 2000,
        tasks: [
          {
            id: "task-1",
            columnId: "todo",
            title: "整理个人任务",
            description: "",
            dueDate: null,
            priority: "none",
            position: 1000,
            completedAt: null,
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

});
