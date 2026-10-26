import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import type { Task } from "../types";
import TaskCard from "./TaskCard.vue";

const mockTask: Task = {
  id: "task-001",
  columnId: "todo",
  projectId: "p-1",
  project: {
    id: "p-1",
    name: "medchat-edge",
    color: "#8b4b3d",
    path: "D:/workspace/medchat-edge",
  },
  tags: [{ id: "tag-1", name: "优化" }],
  title: "优化APP启动速度",
  description: "冷启动耗时降低至500ms以内",
  dueDate: "2026-10-31",
  priority: "high",
  position: 1000,
  completedAt: null,
  startedAt: null,
  blockedReason: null,
  blockedSince: null,
  checklist: [{ id: "c-1", text: "测试子任务", completed: false, position: 1000 }],
  recurrenceRule: "none",
  reviewNotes: "",
  inAgentSop: false,
  createdAt: "2026-10-21T00:00:00Z",
  updatedAt: "2026-10-21T00:00:00Z",
};

describe("TaskCard native drag", () => {
  it("makes the whole card draggable natively without extra agent button", () => {
    const wrapper = mount(TaskCard, {
      props: { task: mockTask, selected: false },
    });

    const card = wrapper.get(".task-card");
    expect(card.attributes("draggable")).toBe("true");
    expect(wrapper.find(".task-card__agent-drag").exists()).toBe(false);
  });

  it("sets plain text prompt on card native dragstart", async () => {
    const wrapper = mount(TaskCard, {
      props: { task: mockTask, selected: false },
    });

    const card = wrapper.get(".task-card");
    const setData = vi.fn();
    const dataTransfer = {
      setData,
      effectAllowed: "none",
    };

    const dragEvent = new Event("dragstart", { bubbles: true, cancelable: true });
    Object.defineProperty(dragEvent, "dataTransfer", { value: dataTransfer });

    await card.element.dispatchEvent(dragEvent);

    expect(setData).toHaveBeenCalledWith(
      "text/plain",
      expect.stringContaining("【看板任务】优化APP启动速度"),
    );
    expect(setData).toHaveBeenCalledWith(
      "text/plain",
      expect.stringContaining("task-001"),
    );
    expect(setData).toHaveBeenCalledWith(
      "text/plain",
      expect.stringContaining("D:/workspace/medchat-edge"),
    );
    expect(setData).toHaveBeenCalledWith(
      "application/x-kanboard-task-id",
      "task-001",
    );
    expect(dataTransfer.effectAllowed).toBe("copyMove");
  });

  it("selects the card on click and preserves checkbox toggling", async () => {
    const wrapper = mount(TaskCard, {
      props: { task: mockTask, selected: false },
    });

    await wrapper.get(".task-card").trigger("click");
    expect(wrapper.emitted("select")).toEqual([["task-001"]]);

    await wrapper.get(".task-card__check").trigger("click");
    expect(wrapper.emitted("toggle")).toHaveLength(1);
  });

  it("renders copy prompt button at bottom right and copies prompt to clipboard without selecting card", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    const wrapper = mount(TaskCard, {
      props: { task: mockTask, selected: false },
    });

    const copyBtn = wrapper.get(".task-card__copy-btn");
    expect(copyBtn.attributes("title")).toBe("复制 AI 派发 Prompt");
    expect(copyBtn.attributes("type")).toBe("button");

    await copyBtn.trigger("click");

    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("【看板任务】优化APP启动速度"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("D:/workspace/medchat-edge"),
    );
    expect(wrapper.emitted("select")).toBeUndefined();
    expect(copyBtn.classes()).toContain("task-card__copy-btn--copied");
    expect(wrapper.emitted("dispatchAgent")).toBeUndefined();
    expect(wrapper.get(".task-card").classes()).not.toContain("task-card--agent-active");
  });

  it("applies task-card--agent-active when inAgentSop is true and column is not verify or done", () => {
    const doingWrapper = mount(TaskCard, {
      props: {
        task: { ...mockTask, columnId: "doing", inAgentSop: true },
        selected: false,
      },
    });
    expect(doingWrapper.get(".task-card").classes()).toContain("task-card--agent-active");

    const blockedWrapper = mount(TaskCard, {
      props: {
        task: { ...mockTask, columnId: "blocked", inAgentSop: true },
        selected: false,
      },
    });
    expect(blockedWrapper.get(".task-card").classes()).toContain("task-card--agent-active");

    const verifyWrapper = mount(TaskCard, {
      props: {
        task: { ...mockTask, columnId: "verify", inAgentSop: true },
        selected: false,
      },
    });
    expect(verifyWrapper.get(".task-card").classes()).not.toContain("task-card--agent-active");

    const doneWrapper = mount(TaskCard, {
      props: {
        task: { ...mockTask, columnId: "done", inAgentSop: true },
        selected: false,
      },
    });
    expect(doneWrapper.get(".task-card").classes()).not.toContain("task-card--agent-active");
  });

  it.each(["todo", "backlog", "ready", "doing", "blocked", "verify", "done"])("uses the MCP marker in %s", (columnId) => {
    for (const inAgentSop of [false, true]) {
      const wrapper = mount(TaskCard, { props: { task: { ...mockTask, columnId, inAgentSop }, selected: false } });
      expect(wrapper.classes().includes("task-card--agent-active")).toBe(inAgentSop && columnId !== "verify" && columnId !== "done");
      wrapper.unmount();
    }
  });

  it("does not activate the agent effect on dragstart", async () => {
    const wrapper = mount(TaskCard, {
      props: { task: mockTask, selected: false },
    });
    const setData = vi.fn();
    const event = {
      dataTransfer: {
        setData,
        effectAllowed: "",
      },
    } as unknown as DragEvent;

    await wrapper.get(".task-card").trigger("dragstart", event);
    expect(wrapper.emitted("dispatchAgent")).toBeUndefined();
    expect(wrapper.get(".task-card").classes()).not.toContain("task-card--agent-active");
  });
});
