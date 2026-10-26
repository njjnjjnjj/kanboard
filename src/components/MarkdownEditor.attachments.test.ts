import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isTauri, invoke } from "@tauri-apps/api/core";
import MarkdownEditor from "./MarkdownEditor.vue";

const editor = vi.hoisted(() => ({ options: null as any, value: "" }));
vi.mock("vditor", () => ({
  default: class {
    vditor = { currentMode: "ir" };
    constructor(_el: HTMLElement, options: any) {
      editor.options = options;
      editor.value = options.value;
      queueMicrotask(options.after);
    }
    getValue() { return editor.value; }
    setValue(value: string) { editor.value = value; }
    destroy() {}
  },
}));
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: vi.fn(() => true),
  invoke: vi.fn(),
  convertFileSrc: (path: string, protocol: string) => `http://${protocol}.localhost/${encodeURIComponent(path)}`,
}));

describe("MarkdownEditor attachment rendering", () => {
  beforeEach(() => { editor.options = null; vi.mocked(isTauri).mockReturnValue(true); });

  it("does not repeatedly mutate relative images in a web preview", async () => {
    vi.mocked(isTauri).mockReturnValue(false);
    const wrapper = mount(MarkdownEditor, { props: { modelValue: "" } });
    await flushPromises();
    const img = document.createElement("img");
    img.setAttribute("src", "attachments/test.png");
    const setAttribute = vi.spyOn(img, "setAttribute");
    wrapper.get(".kanboard-vditor-instance").element.appendChild(img);
    await flushPromises();
    expect(setAttribute).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it.each([false, true])("loads late-rendered images and persists relative Markdown (fullscreen: %s)", async (fullscreen) => {
    const path = "attachments/2026/10/screenshot.png";
    const markdown = `![截图](${path})`;
    const wrapper = mount(MarkdownEditor, { props: { modelValue: markdown, fullscreen } });
    await flushPromises();
    const img = document.createElement("img");
    img.setAttribute("src", path);
    wrapper.get(".kanboard-vditor-instance").element.appendChild(img);
    await flushPromises();
    expect(img.src).toBe(`http://kanboard-image.localhost/${encodeURIComponent(path)}`);
    editor.options.input(`![截图](${img.src})`);
    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual([markdown]);
    wrapper.unmount();
  });

  it.each([false, true])("opens local links through Rust in normal and fullscreen views (fullscreen: %s)", async (fullscreen) => {
    const wrapper = mount(MarkdownEditor, { props: { modelValue: "", fullscreen } });
    await flushPromises();
    const link = document.createElement("span");
    link.dataset.type = "a";
    link.innerHTML = '<span class="vditor-ir__link">验证说明</span><span class="vditor-ir__marker--link">/D:/项目/doc/验证说明.md</span>';
    wrapper.get(".kanboard-vditor-instance").element.appendChild(link);
    link.firstElementChild!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await flushPromises();
    expect(invoke).toHaveBeenCalledWith("open_document_preview", { href: "/D:/项目/doc/验证说明.md" });
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    wrapper.unmount();
  });

  it("shows preview errors and resolves document images through Rust", async () => {
    vi.mocked(invoke).mockRejectedValueOnce("找不到文件");
    const wrapper = mount(MarkdownEditor, { props: { modelValue: "", readonly: true, documentPreview: true } });
    await flushPromises();
    const root = wrapper.get(".kanboard-vditor-instance").element;
    root.innerHTML = '<a href="next.md">下一篇</a><img src="images/volume.png">';
    root.querySelector("a")!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("找不到文件");
    expect(root.querySelector("img")!.src).toBe("http://kanboard-document-image.localhost/images%2Fvolume.png");
    wrapper.unmount();
  });
});
