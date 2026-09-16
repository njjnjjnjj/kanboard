/**
 * Delete-on-drag zone helpers.
 *
 * The zone is deliberately a plain element: it must never be a Sortable list.
 * Sortable decides where a card lands by polling the element under the pointer
 * (fallback mode, every 50ms) and by moving the real node into the last accepted
 * list, so a list backed delete zone lets the card bleed into the column that
 * happens to sit underneath the zone. Instead the zone is only hit tested from
 * real pointer coordinates, and the drop is resolved once, on drag end.
 */
export const DRAG_TRASH_SELECTOR = "[data-drag-trash]";

export interface DragPoint {
  x: number;
  y: number;
}

function readTouchPoint(source: object): DragPoint | null {
  interface TouchLike {
    clientX: number;
    clientY: number;
  }
  const list =
    (source as { changedTouches?: ArrayLike<TouchLike> }).changedTouches ??
    (source as { touches?: ArrayLike<TouchLike> }).touches;
  const touch = list?.[0];
  return touch ? { x: touch.clientX, y: touch.clientY } : null;
}

/** Reads a client point out of a mouse, pointer or touch event (or a plain event-like object). */
export function dragPointFrom(source: unknown): DragPoint | null {
  if (!source || typeof source !== "object") return null;
  const touch = readTouchPoint(source);
  if (touch) return touch;
  const { clientX, clientY } = source as { clientX?: unknown; clientY?: unknown };
  if (typeof clientX !== "number" || typeof clientY !== "number") return null;
  return { x: clientX, y: clientY };
}

export function dragTrashRect(): DOMRect | null {
  const zone = document.querySelector<HTMLElement>(DRAG_TRASH_SELECTOR);
  if (!zone) return null;
  const rect = zone.getBoundingClientRect();
  return rect.width || rect.height ? rect : null;
}

/** True when the point sits inside the delete zone as it is currently painted. */
export function isPointInDragTrash(point: DragPoint | null): boolean {
  if (!point) return false;
  const rect = dragTrashRect();
  if (!rect) return false;
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}
