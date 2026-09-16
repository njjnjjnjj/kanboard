import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import TagActions from "./TagActions.vue";

describe("TagActions", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("explains the impact before confirming a global tag deletion", async () => {
    const tag = { id: "tag-1", name: "开发" };
    const wrapper = mount(TagActions, {
      attachTo: document.body,
      props: { tag, usageCount: 3 },
    });

    await wrapper.get("[aria-label='标签操作：开发']").trigger("click");
    const deleteOption = document.querySelector<HTMLButtonElement>(".tag-actions__delete");
    expect(deleteOption?.textContent).toContain("已用于 3 项任务");
    deleteOption?.click();
    await wrapper.vm.$nextTick();

    expect(document.body.textContent).toContain("任务本身不会删除");
    const confirmButton = Array.from(document.querySelectorAll<HTMLButtonElement>(".tag-actions__buttons button"))
      .find((button) => button.textContent === "删除标签");
    confirmButton?.click();

    expect(wrapper.emitted("delete")?.[0]).toEqual([tag]);
    wrapper.unmount();
  });
});
