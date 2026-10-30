import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import SurfaceMotion from "./SurfaceMotion.vue";

const originalAnimate = Element.prototype.animate;
afterEach(() => {
  vi.restoreAllMocks();
  if (originalAnimate) Element.prototype.animate = originalAnimate;
  else Reflect.deleteProperty(Element.prototype, "animate");
  document.body.innerHTML = "";
});

function setup(kind: "dialog" | "toast" = "dialog") {
  const records: { target: Element; frames: Keyframe[]; cancel: ReturnType<typeof vi.fn>; finish: () => void }[] = [];
  Object.defineProperty(Element.prototype, "animate", { configurable: true, writable: true, value: vi.fn(function (this: Element, frames: Keyframe[]) {
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => { finish = resolve; });
    const cancel = vi.fn(finish);
    records.push({ target: this, frames: frames as Keyframe[], cancel, finish });
    return { finished, cancel } as unknown as Animation;
  }) });
  const open = ref(false);
  const enabled = ref(true);
  const reduced = ref(false);
  const wrapper = mount(defineComponent({
    components: { SurfaceMotion }, setup: () => ({ open, kind }),
    template: '<SurfaceMotion :kind="kind" panel=".panel"><div v-if="open" class="layer"><section class="panel" role="dialog"><button>关闭</button></section></div></SurfaceMotion>',
  }), { attachTo: document.body, global: { provide: { motionEnabled: enabled, motionReduced: reduced }, stubs: { transition: false } } });
  return { wrapper, open, enabled, reduced, records };
}

describe("surface motion lifecycle", () => {
  it("never restores focus on behalf of a transient toast", async () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const { wrapper, open, enabled } = setup("toast");
    enabled.value = false;
    open.value = true;
    await flushPromises();
    expect(document.activeElement).toBe(trigger);
    trigger.blur();
    open.value = false;
    await flushPromises();
    expect(document.activeElement).toBe(document.body);
    wrapper.unmount();
  });
  it("keeps an ongoing pointer action intact when typing switches the next action to instant", async () => {
    const { wrapper, open, enabled, records } = setup();
    open.value = true;
    await flushPromises();
    expect(records).toHaveLength(2);
    enabled.value = false;
    await flushPromises();
    expect(records.every((record) => record.cancel.mock.calls.length === 0)).toBe(true);
    records.forEach((record) => record.finish());
    await flushPromises();
    open.value = false;
    await flushPromises();
    expect(wrapper.find(".layer").exists()).toBe(false);
    expect(records).toHaveLength(2);
    wrapper.unmount();
  });

  it("makes exiting content inert, resumes a cancelled close and cleans all layers", async () => {
    const { wrapper, open, records } = setup();
    open.value = true;
    await flushPromises();
    const layer = wrapper.get(".layer").element;
    records.forEach((record) => record.finish());
    await flushPromises();
    open.value = false;
    await flushPromises();
    expect(layer.hasAttribute("inert")).toBe(true);
    expect(layer.getAttribute("aria-hidden")).toBe("true");
    (layer as HTMLElement).style.opacity = ".4";
    open.value = true;
    await flushPromises();
    const replacement = wrapper.get(".layer").element;
    expect(replacement.hasAttribute("inert")).toBe(false);
    expect(replacement.hasAttribute("aria-hidden")).toBe(false);
    expect(records.at(-2)?.frames[0]?.opacity).toBe("0.4");
    expect(records.slice(2, 4).every((record) => record.cancel.mock.calls.length > 0)).toBe(true);
    wrapper.unmount();
    expect(records.every((record) => record.cancel.mock.calls.length > 0)).toBe(true);
  });

  it("focuses on entry without waiting and returns focus after exit, including live reduced motion", async () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const { wrapper, open, reduced, records } = setup();
    open.value = true;
    await flushPromises();
    expect(document.activeElement).toBe(wrapper.get("button").element);
    reduced.value = true;
    await flushPromises();
    expect(records.every((record) => record.cancel.mock.calls.length > 0)).toBe(true);
    open.value = false;
    await flushPromises();
    expect(wrapper.find(".layer").exists()).toBe(false);
    expect(document.activeElement).toBe(trigger);
    wrapper.unmount();
  });

  it("still completes state changes if the browser has no Web Animations API", async () => {
    const { wrapper, open, records } = setup();
    Object.defineProperty(Element.prototype, "animate", { configurable: true, value: undefined });
    open.value = true;
    await flushPromises();
    expect(wrapper.find(".layer").exists()).toBe(true);
    open.value = false;
    await flushPromises();
    expect(wrapper.find(".layer").exists()).toBe(false);
    expect(records).toHaveLength(0);
    wrapper.unmount();
  });
});
