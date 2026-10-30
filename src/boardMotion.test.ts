import { afterEach, describe, expect, it, vi } from "vitest";
import { createBoardMotion } from "./boardMotion";

const originalAnimate = Element.prototype.animate;
afterEach(() => {
  vi.restoreAllMocks();
  if (originalAnimate) Element.prototype.animate = originalAnimate;
  else Reflect.deleteProperty(Element.prototype, "animate");
  document.body.innerHTML = "";
});

function rect(x: number, width: number, y = 40, height = 500) { return new DOMRect(x, y, width, height); }
function setup() {
  document.body.innerHTML = '<section class="board-workspace"><div class="board-columns"><section class="board-column" data-column="doing"><header class="board-column__header"><button id="unique">进行中</button></header><div class="board-column__tasks"><article class="task-card" data-task-id="one">可见</article><article class="task-card" data-task-id="two">屏外</article></div></section></div></section>';
  const root = document.querySelector<HTMLElement>(".board-workspace")!;
  const column = root.querySelector<HTMLElement>(".board-column")!;
  const list = column.querySelector<HTMLElement>(".board-column__tasks")!;
  vi.spyOn(root, "getBoundingClientRect").mockReturnValue(rect(0, 1000, 0, 600));
  vi.spyOn(root.querySelector(".board-columns")!, "getBoundingClientRect").mockReturnValue(rect(0, 1000));
  const geometry = vi.spyOn(column, "getBoundingClientRect").mockReturnValue(rect(200, 200));
  vi.spyOn(list, "getBoundingClientRect").mockReturnValue(rect(210, 180, 100, 400));
  vi.spyOn(list.children[0]!, "getBoundingClientRect").mockReturnValue(rect(210, 180, 120, 100));
  vi.spyOn(list.children[1]!, "getBoundingClientRect").mockReturnValue(rect(210, 180, 700, 100));
  const animations: { target: Element; frames: Keyframe[]; cancel: ReturnType<typeof vi.fn>; finish: () => void }[] = [];
  Object.defineProperty(Element.prototype, "animate", { configurable: true, writable: true, value: vi.fn(function (this: Element, frames: Keyframe[]) {
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => { finish = resolve; });
    const cancel = vi.fn(finish);
    animations.push({ target: this, frames, cancel, finish });
    return { finished, cancel } as unknown as Animation;
  }) });
  return { root, column, geometry, animations, motion: createBoardMotion() };
}

describe("board layout presentation", () => {
  it("prioritizes rapid commands after a costly preparation and resumes motion after a pause", () => {
    const { root, geometry, animations, motion } = setup();
    const clock = vi.spyOn(performance, "now").mockReturnValue(0);
    const first = motion.capture(root);
    geometry.mockReturnValue(rect(100, 64));
    clock.mockReturnValue(20);
    first();
    const count = animations.length;
    clock.mockReturnValue(45);
    motion.capture(root)();
    expect(animations).toHaveLength(count);
    expect(root.querySelector(".board-motion-layer")).toBeNull();
    clock.mockReturnValue(300);
    const afterPause = motion.capture(root);
    geometry.mockReturnValue(rect(200, 200));
    afterPause();
    expect(animations.length).toBeGreaterThan(count);
    motion.cancel();
  });
  it("moves neighbouring columns without fading or snapshotting their unchanged content", () => {
    const { root, geometry, animations, motion } = setup();
    const play = motion.capture(root, new Set(["verify"]));
    geometry.mockReturnValue(rect(100, 220));
    play();
    expect(root.querySelector(".board-motion-layer")?.children).toHaveLength(0);
    expect(animations).toHaveLength(1);
    expect(animations[0]?.frames.every((frame) => !("opacity" in frame))).toBe(true);
    motion.cancel();
  });
  it("preserves real node identity, copies only visible content and cancels every visual resource", () => {
    const { root, column, geometry, animations, motion } = setup();
    const play = motion.capture(root);
    geometry.mockReturnValue(rect(100, 64));
    play();
    expect(root.querySelector("[data-column='doing']")).toBe(column);
    const layer = root.querySelector(".board-motion-layer")!;
    expect(layer.querySelectorAll(".task-card")).toHaveLength(1);
    expect(layer.querySelector("[id], [data-task-id], [data-column]")).toBeNull();
    expect(layer.getAttribute("inert")).toBe("");
    expect(animations.flatMap((animation) => animation.frames).every((frame) => !('width' in frame) && !('height' in frame) && !('gridTemplateColumns' in frame))).toBe(true);
    expect(animations.find((animation) => animation.target === column)?.frames[0]?.transform).toBe("translate(100px, 0px)");
    motion.cancel();
    expect(root.querySelector(".board-motion-layer")).toBeNull();
    expect(animations.every((animation) => animation.cancel.mock.calls.length === 1)).toBe(true);
  });
  it("supersedes a pending action and resumes from the currently presented position", () => {
    vi.spyOn(performance, "now").mockReturnValue(0);
    const { root, column, geometry, animations, motion } = setup();
    const stale = motion.capture(root);
    geometry.mockReturnValue(rect(150, 200));
    const current = motion.capture(root);
    stale();
    expect(animations).toHaveLength(0);
    geometry.mockReturnValue(rect(100, 200));
    current();
    expect(animations[0]?.frames[0]?.transform).toBe("translate(50px, 0px)");
    geometry.mockReturnValue(rect(130, 200));
    const reverse = motion.capture(root);
    geometry.mockReturnValue(rect(200, 200));
    reverse();
    expect(animations.at(-1)?.target).toBe(column);
    expect(animations.at(-1)?.frames[0]?.transform).toBe("translate(-70px, 0px)");
    motion.cancel();
  });
  it("cleans up on completion and does nothing without browser animation support", async () => {
    const { root, geometry, animations, motion } = setup();
    const play = motion.capture(root);
    geometry.mockReturnValue(rect(100, 64));
    play();
    animations.forEach((animation) => animation.finish());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(root.querySelector(".board-motion-layer")).toBeNull();
    Object.defineProperty(Element.prototype, "animate", { configurable: true, value: undefined });
    motion.capture(root)();
    expect(root.querySelector(".board-motion-layer")).toBeNull();
  });
});
