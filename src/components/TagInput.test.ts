import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import TagInput from "./TagInput.vue";

describe("TagInput", () => {
  it("reuses a suggested tag and creates a new tag name", async () => {
    const wrapper = mount(TagInput, {
      props: {
        modelValue: [],
        suggestions: [{ id: "tag-1", name: "开发" }],
      },
    });

    const input = wrapper.get("input");
    await input.setValue("开");
    await input.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual([["开发"]]);

    await wrapper.setProps({ modelValue: ["开发"] });
    await input.setValue("十五分钟");
    await input.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("update:modelValue")?.[1]).toEqual([["开发", "十五分钟"]]);
  });
});
