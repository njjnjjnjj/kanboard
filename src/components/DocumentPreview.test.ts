import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import DocumentPreview from "./DocumentPreview.vue";

const close = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ close }) }));
vi.mock("./MarkdownEditor.vue", () => ({ default: { props: { modelValue: String, readonly: Boolean, fullscreen: Boolean, documentPreview: Boolean }, template: '<article data-document-content>{{ modelValue }}</article>' } }));

describe("独立文档预览", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoke).mockResolvedValue({ title: "验证说明.md", path: "D:/project/doc/验证说明.md", content: "# 验证说明" });
  });

  it("复用全屏预览样式并以只读模式显示文档", async () => {
    const wrapper = mount(DocumentPreview);
    await flushPromises();
    expect(invoke).toHaveBeenCalledWith("get_preview_document");
    expect(wrapper.get(".markdown-fullscreen-modal").text()).toContain("验证说明.md");
    expect(wrapper.get("[data-document-content]").text()).toBe("# 验证说明");
    expect(wrapper.getComponent({ name: "MarkdownEditor" }).props()).toMatchObject({ readonly: true, fullscreen: true, documentPreview: true });
    expect(wrapper.find("textarea").exists()).toBe(false);
    const body = wrapper.get("[data-document-content]").element;
    body.addEventListener("keydown", (event) => event.stopPropagation());
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    document.body.appendChild(wrapper.element);
    body.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(close).toHaveBeenCalledTimes(1);
    wrapper.unmount();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("读取失败时展示错误，并且仍可关闭窗口", async () => {
    vi.mocked(invoke).mockRejectedValue("文件不存在");
    const wrapper = mount(DocumentPreview);
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("文件不存在");
    await wrapper.get("button").trigger("click");
    expect(close).toHaveBeenCalled();
    wrapper.unmount();
  });
});
