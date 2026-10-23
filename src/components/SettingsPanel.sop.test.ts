import { flushPromises, mount } from "@vue/test-utils";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import i18nSource from "../../node_modules/vditor/dist/js/i18n/zh_CN.js?raw";
import luteSource from "../../node_modules/vditor/dist/js/lute/lute.min.js?raw";
import iconSource from "../../node_modules/vditor/dist/js/icons/ant.js?raw";
import vditorStyles from "vditor/dist/index.css?raw";
import styles from "../styles.css?raw";
import { currentSop, createDefaultSopConfig } from "../data/sopRepository";
import SettingsPanel from "./SettingsPanel.vue";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string) => {
    if (command === "get_custom_sop") return createDefaultSopConfig();
    if (command === "get_storage_info") return { version: "0.4.0", path: "kanboard.db" };
    if (command === "get_mcp_status") return { enabled: false, running: false };
  }),
}));
vi.mock("@tauri-apps/plugin-autostart", () => ({
  isEnabled: vi.fn(async () => false), enable: vi.fn(), disable: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: vi.fn(), open: vi.fn(), save: vi.fn(),
}));

describe("SOP viewer with the real Vditor renderer", () => {
  const assets: HTMLElement[] = [];

  beforeAll(() => {
    // jsdom 不会下载动态脚本，预载本地真实依赖以执行完整初始化链路。
    window.eval(i18nSource);
    window.eval(luteSource);
    for (const id of ["vditorI18nScriptzh_CN", "vditorLuteScript"]) {
      const script = document.createElement("script");
      script.id = id;
      document.head.appendChild(script);
      assets.push(script);
    }
    const style = document.createElement("style");
    style.textContent = `${vditorStyles}\n${styles}`;
    document.head.appendChild(style);
    assets.push(style);
    Object.defineProperty(document, "execCommand", { configurable: true, value: vi.fn() });
    // Vditor 每次销毁时会移除图标脚本，重开时从本地资源重新加载。
    vi.spyOn(XMLHttpRequest.prototype, "open").mockImplementation((_method, url) => {
      expect(url).toBe("/vditor/dist/js/icons/ant.js");
    });
    vi.spyOn(XMLHttpRequest.prototype, "setRequestHeader").mockImplementation(() => {});
    vi.spyOn(XMLHttpRequest.prototype, "send").mockImplementation(() => {});
    vi.spyOn(XMLHttpRequest.prototype, "responseText", "get").mockReturnValue(iconSource);
    // jsdom 缺少浏览器的 innerText，Vditor 的代码块渲染依赖此属性。
    Object.defineProperty(HTMLElement.prototype, "innerText", {
      configurable: true,
      get() { return this.textContent; },
      set(value: string) { this.textContent = value; },
    });
  });

  afterAll(() => {
    assets.forEach((asset) => asset.remove());
    Reflect.deleteProperty(document, "execCommand");
    Reflect.deleteProperty(HTMLElement.prototype, "innerText");
    vi.restoreAllMocks();
  });

  it.each(["body", "window"])("closes the SOP viewer when Escape is delivered to %s outside the modal", async (target) => {
    const wrapper = mount(SettingsPanel, { props: { open: true }, attachTo: document.body });
    try {
      await flushPromises();
      await wrapper.findAll("button").find((button) => button.text() === "查看完整 SOP")!.trigger("click");
      await flushPromises();
      expect(document.querySelector(".markdown-fullscreen-modal")).not.toBeNull();

      // 只读正文不可聚焦，点击后按键可能发往 body / window，不经过弹窗。
      const eventTarget = target === "body" ? document.body : window;
      const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
      eventTarget.dispatchEvent(escape);
      await flushPromises();
      expect(document.querySelector(".markdown-fullscreen-modal")).toBeNull();
      expect(escape.defaultPrevented).toBe(true);
      expect(wrapper.emitted("close")).toBeUndefined();

      const afterClose = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
      window.dispatchEvent(afterClose);
      expect(afterClose.defaultPrevented).toBe(false);

      // 预览仍打开时卸载，也必须移除窗口监听。
      await wrapper.findAll("button").find((button) => button.text() === "查看完整 SOP")!.trigger("click");
      await flushPromises();
      expect(document.querySelector(".markdown-fullscreen-modal")).not.toBeNull();
    } finally {
      wrapper.unmount();
    }
    const afterUnmount = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
    window.dispatchEvent(afterUnmount);
    expect(afterUnmount.defaultPrevented).toBe(false);
  });

  it("renders full default and updated SOP content with a visible, disabled editing toolbar", async () => {
    const wrapper = mount(SettingsPanel, { props: { open: true }, attachTo: document.body });
    try {
      await flushPromises();
      const openViewer = () => wrapper.findAll("button").find((button) => button.text() === "查看完整 SOP")!.trigger("click");
      await openViewer();
      await flushPromises();

      const modal = () => document.querySelector(".markdown-fullscreen-modal")!;
      const content = () => modal().querySelector(".vditor-ir pre")!;
      expect(content().textContent).toContain("任务接单与自主执行 SOP");
      expect(content().textContent).toContain("验证方案标准参考模版");
      expect(content().textContent).toContain("界面交互验收");
      expect(content().getAttribute("contenteditable")).toBe("false");
      expect(getComputedStyle(content()).opacity).toBe("1");
      expect(getComputedStyle(content()).cursor).toBe("text");

      const toolbar = modal().querySelector<HTMLElement>(".vditor-toolbar")!;
      expect(toolbar).not.toBeNull();
      expect(getComputedStyle(toolbar).display).not.toBe("none");
      const bold = toolbar.querySelector('[data-type="bold"]')!;
      expect(bold).not.toBeNull();
      expect(bold.classList.contains("vditor-menu--disabled")).toBe(true);
      const before = content().innerHTML;
      (bold as HTMLButtonElement).click();
      expect(content().innerHTML).toBe(before);

      currentSop.value = {
        ...createDefaultSopConfig(), isCustom: true,
        content: "# 团队 SOP\n\n| 阶段 | 要求 |\n| --- | --- |\n| 提测 | 人工验收 |\n\n文档末尾。",
      };
      await flushPromises();
      expect(content().textContent).toContain("团队 SOP");
      expect(content().textContent).toContain("文档末尾。");
      expect(content().querySelector("td")?.textContent).toBe("提测");
      expect(content().getAttribute("contenteditable")).toBe("false");

      (modal().querySelector(".info-esc-btn") as HTMLButtonElement).click();
      await flushPromises();
      expect(document.querySelector(".markdown-fullscreen-modal")).toBeNull();
      await openViewer();
      await flushPromises();
      expect(content().textContent).toContain("文档末尾。");

      const editor = content() as HTMLElement;
      editor.setAttribute("tabindex", "0");
      editor.focus();
      expect(document.activeElement).toBe(editor);
      // 模拟编辑器内部拦截按键，弹窗应在捕获阶段先响应 Esc。
      editor.addEventListener("keydown", (event) => event.stopPropagation());
      const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
      editor.dispatchEvent(escape);
      await flushPromises();
      expect(escape.defaultPrevented).toBe(true);
      expect(document.querySelector(".markdown-fullscreen-modal")).toBeNull();
      expect(wrapper.find(".settings-panel").exists()).toBe(true);
      expect(wrapper.emitted("close")).toBeUndefined();
    } finally {
      wrapper.unmount();
      currentSop.value = createDefaultSopConfig();
    }
  });
});
