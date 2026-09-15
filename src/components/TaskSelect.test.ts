import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import TaskSelect from "./TaskSelect.vue";

const options = [
  { value: "todo", label: "待处理" },
  { value: "doing", label: "进行中" },
];

describe("TaskSelect", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders a custom listbox and selects an option", async () => {
    const wrapper = mount(TaskSelect, {
      attachTo: document.body,
      props: { modelValue: "todo", options, label: "状态" },
    });

    await wrapper.get(".task-select__trigger").trigger("click");
    const listbox = document.querySelector<HTMLElement>("[role='listbox']");
    expect(listbox).not.toBeNull();

    const option = Array.from(document.querySelectorAll<HTMLButtonElement>("[role='option']"))
      .find((item) => item.textContent?.includes("进行中"));
    option?.click();
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted("update:modelValue")).toEqual([["doing"]]);
    wrapper.unmount();
  });

  it("supports arrow and enter keyboard selection", async () => {
    const wrapper = mount(TaskSelect, {
      attachTo: document.body,
      props: { modelValue: "todo", options, label: "状态" },
    });
    const trigger = wrapper.get(".task-select__trigger");

    await trigger.trigger("keydown", { key: "ArrowDown" });
    await trigger.trigger("keydown", { key: "Enter" });

    expect(wrapper.emitted("update:modelValue")).toEqual([["doing"]]);
    wrapper.unmount();
  });
});
