import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ProjectEditor from "./ProjectEditor.vue";

describe("ProjectEditor", () => {
  it("activates the custom color circle when clicked and clears it after choosing a preset", async () => {
    const wrapper = mount(ProjectEditor, { props: { open: true, project: null, saving: false } });
    const custom = wrapper.get(".project-color-field__custom");
    const presets = wrapper.findAll("input[type='radio']");

    expect((presets[0].element as HTMLInputElement).checked).toBe(true);
    await custom.trigger("click");
    expect(custom.classes()).toContain("project-color-field__custom--active");
    expect((presets[0].element as HTMLInputElement).checked).toBe(false);

    await presets[1].setValue();
    expect(custom.classes()).not.toContain("project-color-field__custom--active");
    expect((presets[1].element as HTMLInputElement).checked).toBe(true);
  });

  it("saves a custom identification color", async () => {
    const wrapper = mount(ProjectEditor, { props: { open: true, project: null, saving: false } });

    await wrapper.findAll("input[autocomplete='off']")[0].setValue("新项目");
    await wrapper.get("input[type='color']").setValue("#12abcf");
    expect(wrapper.get(".project-color-field__custom").classes()).toContain("project-color-field__custom--active");
    await wrapper.get("form").trigger("submit");

    expect(wrapper.emitted("save")?.[0]?.[0]).toMatchObject({ name: "新项目", color: "#12abcf" });
  });

  it("edits and saves project local path", async () => {
    const project = {
      id: "project-1",
      name: "现有项目",
      color: "#285a78",
      description: "现有说明",
      path: "D:/MyWorkspace/old-path",
      targetDate: null,
      status: "active" as const,
      createdAt: "2026-09-01T00:00:00Z",
      updatedAt: "2026-09-01T00:00:00Z",
    };
    const wrapper = mount(ProjectEditor, { props: { open: true, project, saving: false } });
    const inputs = wrapper.findAll("input[autocomplete='off']");
    expect((inputs[1].element as HTMLInputElement).value).toBe("D:/MyWorkspace/old-path");

    await inputs[1].setValue("D:/MyWorkspace/new-path");
    await wrapper.get("form").trigger("submit");

    expect(wrapper.emitted("save")?.[0]?.[0]).toMatchObject({
      name: "现有项目",
      path: "D:/MyWorkspace/new-path",
    });
  });

  it("displays '项目备忘' label and edits project memo via Markdown editor", async () => {
    const project = {
      id: "project-1",
      name: "现有项目",
      color: "#285a78",
      description: "现有备忘内容",
      path: "",
      targetDate: null,
      status: "active" as const,
      createdAt: "2026-09-01T00:00:00Z",
      updatedAt: "2026-09-01T00:00:00Z",
    };
    const wrapper = mount(ProjectEditor, { props: { open: true, project, saving: false } });

    expect(wrapper.text()).toContain("项目备忘");
    expect(wrapper.text()).not.toContain("项目说明");

    const memoTextarea = wrapper.find("textarea[data-project-memo]");
    expect(memoTextarea.exists()).toBe(true);
    expect((memoTextarea.element as HTMLTextAreaElement).value).toBe("现有备忘内容");

    await memoTextarea.setValue("更新后的项目备忘进展与资料");
    await wrapper.get("form").trigger("submit");

    expect(wrapper.emitted("save")?.[0]?.[0]).toMatchObject({
      name: "现有项目",
      description: "更新后的项目备忘进展与资料",
    });
  });

  it("supports toggling fullscreen for project memo and closing it via Escape", async () => {
    const project = {
      id: "project-1",
      name: "现有项目",
      color: "#285a78",
      description: "备忘全屏测试",
      path: "",
      targetDate: null,
      status: "active" as const,
      createdAt: "2026-09-01T00:00:00Z",
      updatedAt: "2026-09-01T00:00:00Z",
    };
    const wrapper = mount(ProjectEditor, { props: { open: true, project, saving: false }, attachTo: document.body });

    expect(document.querySelector(".markdown-fullscreen-modal")).toBeNull();

    const toggleBtn = wrapper.find(".fullscreen-toggle-btn");
    await toggleBtn.trigger("click");
    expect(document.querySelector(".markdown-fullscreen-modal")).not.toBeNull();
    expect(document.querySelector(".markdown-fullscreen-modal")?.textContent).toContain("项目备忘 · 全屏");

    const escEvent = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    window.dispatchEvent(escEvent);
    await wrapper.vm.$nextTick();

    expect(document.querySelector(".markdown-fullscreen-modal")).toBeNull();
    expect(wrapper.emitted("close")).toBeFalsy();

    wrapper.unmount();
  });
});
