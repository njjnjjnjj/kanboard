<script setup lang="ts">
import { inject, nextTick, onBeforeUnmount, ref, watch, type Ref } from "vue";

const props = withDefaults(defineProps<{ kind?: "drawer" | "dialog" | "menu" | "toast"; panel?: string }>(), { kind: "dialog" });
const enabled = inject<Ref<boolean>>("motionEnabled", ref(!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches));
const reduced = inject<Ref<boolean>>("motionReduced", ref(false));
type Run = { animations: Animation[]; finish: () => void };
const runs = new Map<HTMLElement, Run>();
const interrupted = new WeakMap<HTMLElement, { opacity: string; transform: string }>();
const returnFocus = new WeakMap<Element, HTMLElement>();
let handoff: { opacity: string; transform: string } | undefined;
function beforeEnter(element: Element) {
  if (handoff) { interrupted.set(element as HTMLElement, handoff); handoff = undefined; }
  if (props.kind !== "toast" && document.activeElement instanceof HTMLElement && !element.contains(document.activeElement)) returnFocus.set(element, document.activeElement);
}
function afterLeave(element: Element) {
  // Vue v-if may replace a leaving node, while v-show cancels the same node.
  // Hand the presented state to the replacement before disposing its old animation.
  if (runs.has(element as HTMLElement)) {
    cancel(element);
    handoff = interrupted.get(element as HTMLElement);
  }
  const target = returnFocus.get(element);
  if (target?.isConnected && (document.activeElement === document.body || element.contains(document.activeElement))) target.focus({ preventScroll: true });
  returnFocus.delete(element);
}

function cancel(element: Element) {
  const root = element as HTMLElement;
  const panel = props.panel ? root.querySelector<HTMLElement>(props.panel) ?? root : root;
  interrupted.set(root, { opacity: getComputedStyle(root).opacity, transform: getComputedStyle(panel).transform });
  const run = runs.get(root);
  runs.delete(root);
  run?.animations.forEach((animation) => animation.cancel());
}
function transition(element: Element, done: () => void, entering: boolean) {
  const root = element as HTMLElement;
  const panel = props.panel ? root.querySelector<HTMLElement>(props.panel) ?? root : root;
  const from = interrupted.get(root);
  interrupted.delete(root);
  root.toggleAttribute("inert", !entering);
  if (entering) root.removeAttribute("aria-hidden");
  else root.setAttribute("aria-hidden", "true");
  // Capture policy per action: typing must not truncate an unrelated transition.
  const animate = enabled.value && typeof root.animate === "function";
  const run: Run = { animations: [], finish: () => {
    if (runs.get(root) !== run) return;
    runs.delete(root);
    run.animations.forEach((animation) => animation.cancel());
    done();
  } };
  runs.set(root, run);
  void nextTick(() => {
    if (runs.get(root) !== run) return;
    if (entering && props.kind === "dialog" && !root.contains(document.activeElement)) {
      const focus = root.querySelector<HTMLElement>("[autofocus]")
        ?? root.querySelector<HTMLElement>("[role=dialog][tabindex], button, input, [tabindex='0']");
      focus?.focus({ preventScroll: true });
    }
    if (!animate || reduced.value) { run.finish(); return; }
    const timings = { drawer: [200, 160], dialog: [180, 140], menu: [140, 100], toast: [160, 100] };
    const style = getComputedStyle(root);
    const distance = root.classList.contains("markdown-fullscreen-modal") ? "none"
      : props.kind === "drawer" ? "translateX(24px)"
      : `translateY(${props.kind === "menu" ? style.getPropertyValue("--surface-offset").trim() || "4px" : "8px"})`;
    const duration = Number.parseFloat(style.getPropertyValue(`--motion-${props.kind}-${entering ? "enter" : "exit"}`)) || timings[props.kind][entering ? 0 : 1];
    const options = { duration, easing: style.getPropertyValue("--ease-out").trim() || "cubic-bezier(0.23, 1, 0.32, 1)", fill: "both" as const };
    if (panel === root) {
      run.animations.push(root.animate([
        { opacity: from?.opacity || (entering ? 0 : 1), transform: from?.transform || (entering ? distance : "none") },
        { opacity: entering ? 1 : 0, transform: entering ? "none" : distance },
      ], options));
    } else {
      run.animations.push(root.animate([{ opacity: from?.opacity || (entering ? 0 : 1) }, { opacity: entering ? 1 : 0 }], options));
      run.animations.push(panel.animate([{ transform: from?.transform || (entering ? distance : "none") }, { transform: entering ? "none" : distance }], options));
    }
    void Promise.all(run.animations.map((animation) => animation.finished.catch(() => {}))).then(run.finish);
  });
}
watch(reduced, (value) => { if (value) [...runs.values()].forEach((run) => run.finish()); });
onBeforeUnmount(() => { runs.forEach((run) => run.animations.forEach((animation) => animation.cancel())); runs.clear(); });
</script>

<template>
  <Transition appear :css="false" @before-enter="beforeEnter" @after-leave="afterLeave" @enter="(el, done) => transition(el, done, true)" @leave="(el, done) => transition(el, done, false)" @enter-cancelled="cancel" @leave-cancelled="cancel">
    <slot />
  </Transition>
</template>
