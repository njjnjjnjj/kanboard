import { mount } from "@vue/test-utils";
import { describe, expect, it, vi, afterEach } from "vitest";
import MarkdownEditor from "./MarkdownEditor.vue";
import * as attachmentService from "../services/attachmentService";

describe("MarkdownEditor", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("mounts and renders properly with open-source vditor in instant rendering mode", () => {
    const wrapper = mount(MarkdownEditor, {
      props: {
        modelValue: "## 需求说明\n\n这是一段 Markdown 说明",
        dataInspectorDescription: true,
      },
    });

    expect(wrapper.exists()).toBe(true);
    expect(wrapper.find(".kanboard-vditor-instance").exists()).toBe(true);
    const syncTextarea = wrapper.find("textarea[data-inspector-description]");
    expect(syncTextarea.exists()).toBe(true);
    expect((syncTextarea.element as HTMLTextAreaElement).value).toContain("## 需求说明");
  });

  it("emits update:modelValue when text changes", async () => {
    const wrapper = mount(MarkdownEditor, {
      props: {
        modelValue: "初始文本",
        dataInspectorReviewNotes: true,
      },
    });

    const textarea = wrapper.find("textarea[data-inspector-review-notes]");
    await textarea.setValue("更新后的内容");
    expect(wrapper.emitted("update:modelValue")).toBeTruthy();
    expect(wrapper.emitted("update:modelValue")?.[0]?.[0]).toBe("更新后的内容");
  });

  it("handles image upload via saveImageAttachment and generates markdown image syntax", async () => {
    const spy = vi.spyOn(attachmentService, "saveImageAttachment").mockResolvedValue({
      relativePath: "attachments/2026/10/img_test.png",
      absolutePath: "D:/storage/attachments/2026/10/img_test.png",
      fileName: "img_test.png",
      fileSize: 1024,
    });

    const wrapper = mount(MarkdownEditor, {
      props: {
        modelValue: "正文内容",
      },
    });

    const mockFile = new File(["dummy content"], "test.png", { type: "image/png" });
    const vm = wrapper.vm as unknown as { handleUpload: (files: File[]) => Promise<string[]> };
    const inserted = await vm.handleUpload([mockFile]);

    expect(spy).toHaveBeenCalledWith(mockFile);
    expect(inserted).toEqual(["![img_test](attachments/2026/10/img_test.png)"]);
  });
});
