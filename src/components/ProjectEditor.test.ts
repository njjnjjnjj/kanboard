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

    await wrapper.get("input[autocomplete='off']").setValue("新项目");
    await wrapper.get("input[type='color']").setValue("#12abcf");
    expect(wrapper.get(".project-color-field__custom").classes()).toContain("project-color-field__custom--active");
    await wrapper.get("form").trigger("submit");

    expect(wrapper.emitted("save")?.[0]?.[0]).toMatchObject({ name: "新项目", color: "#12abcf" });
  });
});
