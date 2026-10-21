import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { DeletedTask } from "../types";
import TaskTrash from "./TaskTrash.vue";

const task = {
  id: "task-1",
  columnId: "todo",
  projectId: null,
  project: null,
  tags: [],
  title: "误删的任务",
  description: "需要找回来",
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
  createdAt: "2026-09-17T00:00:00.000Z",
  updatedAt: "2026-09-17T00:00:00.000Z",
  deletedAt: "2026-09-17T01:00:00.000Z",
} satisfies DeletedTask;

describe("task trash", () => {
  it("restores immediately but requires confirmation before permanent deletion", async () => {
    const wrapper = mount(TaskTrash, { props: { tasks: [task], busy: false } });

    await wrapper.get(".secondary-button").trigger("click");
    expect(wrapper.emitted("restore")?.[0]).toEqual([task]);

    const permanentDelete = wrapper.get(".text-button--danger");
    await permanentDelete.trigger("click");
    expect(wrapper.emitted("delete")).toBeUndefined();
    expect(permanentDelete.text()).toBe("确认永久删除");

    await permanentDelete.trigger("click");
    expect(wrapper.emitted("delete")?.[0]).toEqual([task]);
  });
});
