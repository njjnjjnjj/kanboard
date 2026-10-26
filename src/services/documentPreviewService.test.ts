import { describe, expect, it } from "vitest";
import { isLocalDocumentLink } from "./documentPreviewService";

describe("本地文档链接", () => {
  it("识别现有 Windows 和文件链接，预览内支持相对文档", () => {
    for (const href of ["/D:/项目/doc/验证.md", "D:\\项目\\验证.md", "file:///D:/项目/验证.md"]) expect(isLocalDocumentLink(href)).toBe(true);
    expect(isLocalDocumentLink("next.md", true)).toBe(true);
    expect(isLocalDocumentLink("next.md")).toBe(false);
    for (const href of ["https://example.com/doc", "#heading", "javascript:alert(1)", "//example.com/doc"]) expect(isLocalDocumentLink(href, true)).toBe(false);
  });
});
