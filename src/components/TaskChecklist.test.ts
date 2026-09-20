import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import TaskChecklist from "./TaskChecklist.vue";

describe("TaskChecklist", () => {
  it("keeps a long checklist in its own scrollable area without another dialog", async () => {
    const items = Array.from({ length: 12 }, (_, index) => ({
      id: `item-${index}`, text: `条件 ${index + 1}`, completed: index < 3, position: index * 1000,
    }));
    const wrapper = mount(TaskChecklist, { attachTo: document.body, props: { modelValue: items } });

    expect(wrapper.findAll(".task-checklist__items input[type='text']")).toHaveLength(12);
    expect(wrapper.find("[role='dialog']").exists()).toBe(false);
    await wrapper.get(".task-checklist__add").trigger("click");
    expect(wrapper.emitted("update:modelValue")?.[0]?.[0]).toHaveLength(13);
    wrapper.unmount();
  });
});
