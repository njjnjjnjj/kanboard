import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import DateInput from "./DateInput.vue";

describe("DateInput", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });
  it("uses one stable date format instead of the native localized placeholder", async () => {
    const wrapper = mount(DateInput, {
      props: { modelValue: null, label: "截止日期", "onUpdate:modelValue": vi.fn() },
    });

    const input = wrapper.get("input");
    expect(input.attributes("type")).toBe("text");
    expect(input.attributes("placeholder")).toBe("YYYY-MM-DD");
    expect(input.attributes("pattern")).toBe(String.raw`\d{4}-\d{2}-\d{2}`);
  });

  it("offers today and the following two days as quick choices", async () => {
    const update = vi.fn();
    const wrapper = mount(DateInput, {
      props: { modelValue: null, label: "截止日期", quick: true, "onUpdate:modelValue": update },
    });

    expect(wrapper.find(".date-picker__shortcuts").exists()).toBe(false);
    await wrapper.get("[aria-label='打开截止日期选择器']").trigger("click");
    expect(Array.from(document.querySelectorAll(".date-picker__shortcuts button")).map((button) => button.textContent)).toEqual([
      "今天",
      "明天",
      "后天",
    ]);
    document.querySelectorAll<HTMLButtonElement>(".date-picker__shortcuts button")[1]!.click();
    await wrapper.vm.$nextTick();
    expect(update).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(document.querySelector(".date-picker")).toBeNull();
    wrapper.unmount();
  });

  it("opens the styled calendar and selects a date", async () => {
    const update = vi.fn();
    const wrapper = mount(DateInput, {
      attachTo: document.body,
      props: { modelValue: null, label: "截止日期", "onUpdate:modelValue": update },
    });

    await wrapper.get("[aria-label='打开截止日期选择器']").trigger("click");
    const calendar = document.querySelector<HTMLElement>("[role='dialog']");
    expect(calendar).not.toBeNull();
    expect(calendar?.textContent).toContain("一");

    document.querySelector<HTMLButtonElement>(".date-picker__day--today")?.click();
    await wrapper.vm.$nextTick();
    expect(update).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(document.querySelector("[role='dialog']")).toBeNull();
    wrapper.unmount();
  });
});
