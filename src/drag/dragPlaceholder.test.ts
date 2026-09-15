import { afterEach, describe, expect, it } from "vitest";
import { restoreDraggedCardToOrigin } from "./dragPlaceholder";

function board() {
  document.body.innerHTML = `
    <div class="board-columns">
      <section data-column="todo">
        <div class="board-column__tasks">
          <article class="task-card" data-task-id="a"></article>
          <article class="task-card task-card--ghost" data-task-id="b"></article>
          <article class="task-card" data-task-id="c"></article>
        </div>
      </section>
      <section data-column="doing">
        <div class="board-column__tasks"></div>
      </section>
    </div>`;
}

function taskIds(columnId: string): string[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(`[data-column="${columnId}"] .task-card`),
  ).map((card) => card.dataset.taskId ?? "");
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("drag placeholder restore", () => {
  it("returns the dragged card to its original slot", () => {
    board();
    const list = document.querySelector<HTMLElement>('[data-column="todo"] .board-column__tasks')!;
    const card = document.querySelector<HTMLElement>(".task-card--ghost")!;
    // Sortable parked the card at the end of another column while dragging.
    document.querySelector<HTMLElement>('[data-column="doing"] .board-column__tasks')!.appendChild(card);
    expect(taskIds("todo")).toEqual(["a", "c"]);

    expect(restoreDraggedCardToOrigin({ columnId: "todo", taskId: "b", index: 1 })).toBe(true);
    expect(taskIds("todo")).toEqual(["a", "b", "c"]);
    expect(taskIds("doing")).toEqual([]);
    expect(list.children[1]).toBe(card);
  });

  it("runs the list animation so the card travels home instead of jumping", () => {
    board();
    const list = document.querySelector<HTMLElement>('[data-column="todo"] .board-column__tasks')!;
    const card = document.querySelector<HTMLElement>(".task-card--ghost")!;
    document.querySelector<HTMLElement>('[data-column="doing"] .board-column__tasks')!.appendChild(card);
    const calls: string[] = [];
    (list as unknown as Record<string, unknown>).Sortable1234567 = {
      captureAnimationState: () => calls.push("capture"),
      animateAll: () => calls.push("animate"),
    };

    expect(restoreDraggedCardToOrigin({ columnId: "todo", taskId: "b", index: 1 })).toBe(true);
    expect(calls).toEqual(["capture", "animate"]);
    expect(taskIds("todo")).toEqual(["a", "b", "c"]);
  });

  it("appends a card that was dragged from the end of its column", () => {
    board();
    const list = document.querySelector<HTMLElement>('[data-column="todo"] .board-column__tasks')!;
    const card = document.querySelector<HTMLElement>(".task-card--ghost")!;
    list.appendChild(card);
    expect(taskIds("todo")).toEqual(["a", "c", "b"]);

    expect(restoreDraggedCardToOrigin({ columnId: "todo", taskId: "b", index: 2 })).toBe(true);
    expect(taskIds("todo")).toEqual(["a", "c", "b"]);
  });

  it("stays put and stays quiet when the card is already home", () => {
    board();
    const list = document.querySelector<HTMLElement>('[data-column="todo"] .board-column__tasks')!;
    const calls: string[] = [];
    (list as unknown as Record<string, unknown>).Sortable1234567 = {
      captureAnimationState: () => calls.push("capture"),
      animateAll: () => calls.push("animate"),
    };

    expect(restoreDraggedCardToOrigin({ columnId: "todo", taskId: "b", index: 1 })).toBe(true);
    expect(restoreDraggedCardToOrigin({ columnId: "todo", taskId: "b", index: 1 })).toBe(true);
    expect(calls).toEqual([]);
    expect(taskIds("todo")).toEqual(["a", "b", "c"]);
  });

  it("does nothing without a drag origin or a known index", () => {
    board();
    const card = document.querySelector<HTMLElement>(".task-card--ghost")!;
    document.querySelector<HTMLElement>('[data-column="doing"] .board-column__tasks')!.appendChild(card);

    expect(restoreDraggedCardToOrigin(null)).toBe(false);
    expect(restoreDraggedCardToOrigin({ columnId: "todo", taskId: "b", index: -1 })).toBe(false);
    expect(restoreDraggedCardToOrigin({ columnId: "missing", taskId: "b", index: 0 })).toBe(false);
    expect(restoreDraggedCardToOrigin({ columnId: "todo", taskId: "other", index: 0 })).toBe(false);
    expect(taskIds("doing")).toEqual(["b"]);
  });
});
