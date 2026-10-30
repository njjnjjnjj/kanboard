/** Commit layout once; animate presentation without scaling text or changing Sortable nodes. */
export function createBoardMotion() {
  let animations: Animation[] = [];
  let overlay: HTMLElement | undefined;
  let revision = 0;
  let lastStarted = -Infinity;
  let preparationCost = 0;
  function cancel() {
    revision++;
    animations.forEach((animation) => animation.cancel());
    animations = [];
    overlay?.remove();
    overlay = undefined;
  }
  function capture(root: HTMLElement, changedColumns?: Set<string>) {
    const started = performance.now();
    const rapid = started - lastStarted < 200;
    lastStarted = started;
    // Reserve half a 60 Hz frame for painting. On a costly board, repeated commands
    // take priority over visual bookkeeping until the user pauses briefly.
    if ((rapid && preparationCost > 8) || typeof root.animate !== "function") {
      cancel();
      return () => {};
    }
    // Measure presented positions before cancellation, including a transition being reversed.
    const viewport = root.getBoundingClientRect();
    const frames = [...root.querySelectorAll<HTMLElement>(".board-columns > .board-column, .swimlane-columns > .board-column")].map((element) => {
      const rect = element.getBoundingClientRect();
      let snapshot: HTMLElement | undefined;
      const changesContent = !changedColumns || changedColumns.has(element.dataset.column ?? "");
      if (changesContent && rect.right > viewport.left && rect.left < viewport.right && rect.bottom > viewport.top && rect.top < viewport.bottom) {
        snapshot = element.cloneNode(false) as HTMLElement;
        const header = element.querySelector(".board-column__header");
        if (header) {
          const copy = header.cloneNode(true) as HTMLElement;
          copy.style.opacity = getComputedStyle(header).opacity;
          snapshot.append(copy);
        }
        const list = element.querySelector<HTMLElement>(".board-column__tasks");
        if (list && list.style.display !== "none") {
          const listRect = list.getBoundingClientRect();
          const copy = list.cloneNode(false) as HTMLElement;
          Object.assign(copy.style, { position: "absolute", top: `${listRect.top - rect.top}px`, left: `${listRect.left - rect.left}px`, width: `${listRect.width}px`, height: `${listRect.height}px`, padding: "0", overflow: "hidden", opacity: getComputedStyle(list).opacity });
          // Copy only visible cards, not the full potentially long task list.
          for (const card of list.children) {
            const bounds = card.getBoundingClientRect();
            if (bounds.bottom <= Math.max(listRect.top, viewport.top)) continue;
            if (bounds.top >= Math.min(listRect.bottom, viewport.bottom)) break;
            const clone = card.cloneNode(true) as HTMLElement;
            Object.assign(clone.style, { position: "absolute", top: `${bounds.top - listRect.top}px`, left: `${bounds.left - listRect.left}px`, width: `${bounds.width}px`, margin: "0", contentVisibility: "visible", opacity: getComputedStyle(card).opacity });
            copy.append(clone);
          }
          snapshot.append(copy);
        }
        snapshot.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
        snapshot.querySelectorAll("[data-task-id]").forEach((node) => node.removeAttribute("data-task-id"));
        snapshot.removeAttribute("aria-labelledby");
        snapshot.removeAttribute("data-column");
        snapshot.setAttribute("aria-hidden", "true");
        snapshot.setAttribute("inert", "");
      }
      return { element, rect, snapshot, changesContent };
    });
    cancel();
    const current = revision;
    return () => {
      if (current !== revision || !root.isConnected || typeof root.animate !== "function") return;
      const origin = root.getBoundingClientRect();
      const changes = frames.map((frame) => {
        const content: HTMLElement[] = [];
        if (frame.changesContent) {
          const header = frame.element.querySelector<HTMLElement>(".board-column__header");
          if (header) content.push(header);
          const list = frame.element.querySelector<HTMLElement>(".board-column__tasks");
          if (list && list.style.display !== "none") {
            const bounds = list.getBoundingClientRect();
            for (const card of list.children) {
              const rect = card.getBoundingClientRect();
              if (rect.bottom <= Math.max(bounds.top, origin.top)) continue;
              if (rect.top >= Math.min(bounds.bottom, origin.bottom)) break;
              content.push(card as HTMLElement);
            }
          }
        }
        return { ...frame, next: frame.element.getBoundingClientRect(), content };
      });
      overlay = document.createElement("div");
      overlay.className = "board-motion-layer";
      const board = root.querySelector(".board-columns, .swimlane-board");
      overlay.style.clipPath = `inset(${Math.max(0, (board?.getBoundingClientRect().top ?? origin.top) - origin.top)}px 0 0)`;
      overlay.setAttribute("aria-hidden", "true");
      overlay.setAttribute("inert", "");
      root.append(overlay);
      const duration = Number.parseFloat(getComputedStyle(root).getPropertyValue("--motion-layout")) || 200;
      const options = { duration, easing: "cubic-bezier(0.23, 1, 0.32, 1)", fill: "both" as const };
      for (const { element, rect, next, snapshot, changesContent, content } of changes) {
        if (!element.isConnected) continue;
        const dx = rect.left - next.left;
        const dy = rect.top - next.top;
        const resized = Math.abs(rect.width - next.width) > 1;
        if (!resized && Math.abs(dx) + Math.abs(dy) < .5) continue;
        animations.push(element.animate([
          { transform: `translate(${dx}px, ${dy}px)` },
          { transform: "translate(0px, 0px)" },
        ], options));
        if (resized && changesContent) {
          for (const item of content) {
            animations.push(item.animate([{ opacity: 0 }, { opacity: 1 }], options));
          }
        }
        if (resized && snapshot) {
          Object.assign(snapshot.style, { position: "absolute", left: `${rect.left - origin.left}px`, top: `${rect.top - origin.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, margin: "0", pointerEvents: "none" });
          overlay.append(snapshot);
          animations.push(snapshot.animate([
            { transform: "translate(0px, 0px)", opacity: 1 },
            { transform: `translate(${-dx}px, ${-dy}px)`, opacity: 0 },
          ], { ...options, duration: Math.min(duration, 120) }));
        }
      }
      preparationCost = performance.now() - started;
      void Promise.all(animations.map((animation) => animation.finished.catch(() => {}))).then(() => {
        if (current === revision) cancel();
      });
    };
  }
  return { capture, cancel };
}
