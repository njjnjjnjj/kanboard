/**
 * Sortable parks the dragged node inside whatever list the pointer last hovered.
 * A card on its way to the delete zone therefore keeps showing a landing slot in
 * the column above the zone, even when the pointer already left that column.
 *
 * While the pointer is inside the delete zone the node is put back on the slot it
 * was dragged from, which leaves every column in its original shape.
 */
export interface DragOrigin {
  columnId: string;
  taskId: string;
  index: number;
}

interface SortableAnimationHost {
  captureAnimationState?: () => void;
  animateAll?: () => void;
}

/** Sortable keeps its instance on the list element under a private expando key. */
function sortableHost(list: HTMLElement): SortableAnimationHost | null {
  for (const key of Object.keys(list)) {
    const value = (list as unknown as Record<string, unknown>)[key] as SortableAnimationHost | null;
    if (
      value &&
      typeof value === "object" &&
      typeof value.captureAnimationState === "function" &&
      typeof value.animateAll === "function"
    ) {
      return value;
    }
  }
  return null;
}

function columnTaskList(columnId: string): HTMLElement | null {
  for (const column of document.querySelectorAll<HTMLElement>("[data-column]")) {
    if (column.dataset.column === columnId) {
      return column.querySelector<HTMLElement>(".board-column__tasks");
    }
  }
  return null;
}

/** Moves the card currently being dragged back to its original slot. */
export function restoreDraggedCardToOrigin(origin: DragOrigin | null): boolean {
  if (!origin || origin.index < 0) return false;

  const card = document.querySelector<HTMLElement>(".task-card--ghost");
  const list = columnTaskList(origin.columnId);
  if (!card || !list) return false;
  if (origin.taskId && card.dataset.taskId !== origin.taskId) return false;

  const siblings = Array.from(list.children).filter(
    (child): child is HTMLElement =>
      child !== card && child.classList.contains("task-card"),
  );
  const slot = siblings[origin.index] ?? null;
  if (card.parentElement === list && card.nextElementSibling === slot) return true;

  const host = sortableHost(list);

  host?.captureAnimationState?.();
  list.insertBefore(card, slot);
  host?.animateAll?.();
  return true;
}
