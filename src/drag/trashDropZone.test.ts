import { afterEach, describe, expect, it } from "vitest";
import { dragPointFrom, isPointInDragTrash } from "./trashDropZone";

function mountTrashZone(rect: { top: number; bottom: number; left: number; right: number }) {
  const zone = document.createElement("div");
  zone.dataset.dragTrash = "";
  zone.getBoundingClientRect = () => ({
    ...rect,
    x: rect.left,
    y: rect.top,
    width: rect.right - rect.left,
    height: rect.bottom - rect.top,
    toJSON: () => ({}),
  }) as DOMRect;
  document.body.appendChild(zone);
  return zone;
}

afterEach(() => {
  document.querySelectorAll("[data-drag-trash]").forEach((zone) => zone.remove());
});

describe("drag trash drop zone", () => {
  it("reads a client point from mouse and touch sources", () => {
    expect(dragPointFrom({ clientX: 12, clientY: 34 })).toEqual({ x: 12, y: 34 });
    expect(dragPointFrom({ changedTouches: [{ clientX: 5, clientY: 6 }] })).toEqual({ x: 5, y: 6 });
    expect(dragPointFrom(undefined)).toBeNull();
    expect(dragPointFrom({})).toBeNull();
  });

  it("only matches points inside the painted zone", () => {
    mountTrashZone({ top: 400, bottom: 496, left: 18, right: 782 });

    expect(isPointInDragTrash({ x: 400, y: 448 })).toBe(true);
    expect(isPointInDragTrash({ x: 400, y: 399 })).toBe(false);
    expect(isPointInDragTrash({ x: 8, y: 448 })).toBe(false);
    expect(isPointInDragTrash(null)).toBe(false);
  });

  it("ignores an unrendered or collapsed zone", () => {
    expect(isPointInDragTrash({ x: 400, y: 448 })).toBe(false);
    mountTrashZone({ top: 0, bottom: 0, left: 0, right: 0 });
    expect(isPointInDragTrash({ x: 400, y: 448 })).toBe(false);
  });
});
