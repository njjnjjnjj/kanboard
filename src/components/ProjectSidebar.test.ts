import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ProjectSidebar from "./ProjectSidebar.vue";
import type { Project, Tag, Task, TaskScope } from "../types";

describe("ProjectSidebar", () => {
  it("renders Lucide icons for all tasks, unassigned, trash, and action buttons", () => {
    const projects: Project[] = [
      {
        id: "p1",
        name: "看板改造",
        color: "#285a78",
        description: "",
        path: "",
        targetDate: null,
        status: "active",
        createdAt: "2026-10-28T00:00:00.000Z",
        updatedAt: "2026-10-28T00:00:00.000Z",
      },
    ];
    const tags: Tag[] = [{ id: "t1", name: "UI" }];
    const tasks: Task[] = [];
    const scope: TaskScope = { kind: "all" };

    const wrapper = mount(ProjectSidebar, {
      props: {
        projects,
        tags,
        tasks,
        scope,
        trashCount: 2,
      },
    });

    // Check Lucide icon elements render as svgs
    const allTasksRow = wrapper.findAll(".workspace-nav__row")[0];
    expect(allTasksRow.text()).toContain("全部任务");
    expect(allTasksRow.find(".lucide-list-todo").exists()).toBe(true);

    const unassignedRow = wrapper.findAll(".workspace-nav__row")[1];
    expect(unassignedRow.text()).toContain("无项目");
    expect(unassignedRow.find(".lucide-circle-dashed").exists()).toBe(true);

    const trashRow = wrapper.find(".workspace-nav__trash");
    expect(trashRow.text()).toContain("回收站");
    expect(trashRow.find(".lucide-trash-2").exists()).toBe(true);

    const createProjectBtn = wrapper.find("button[aria-label='新建项目']");
    expect(createProjectBtn.find(".lucide-plus").exists()).toBe(true);

    const editProjectBtn = wrapper.find("button[aria-label='编辑项目：看板改造']");
    expect(editProjectBtn.find(".lucide-ellipsis").exists()).toBe(true);

    const tagRow = wrapper.find(".workspace-nav__tag-item .workspace-nav__row");
    expect(tagRow.text()).toContain("UI");
    expect(tagRow.find(".lucide-hash").exists()).toBe(true);
  });
});
