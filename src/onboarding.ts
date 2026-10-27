import { driver, type Driver } from "driver.js";

export const ONBOARDING_KEY = "kanboard.flow-onboarding.v4";

export interface OnboardingOptions {
  markSeen?: boolean;
  onExit?: () => void;
  onStepChange?: (stepIndex: number) => void;
}

let activeTour: Driver | null = null;
let activeOptions: OnboardingOptions | null = null;
let dragListenersAttached = false;

function handleGlobalDragStart() {
  document.body.classList.add("kanboard-dragging");
}

function handleGlobalDragEnd() {
  document.body.classList.remove("kanboard-dragging");
}

function attachDragListeners() {
  if (dragListenersAttached) return;
  window.addEventListener("dragstart", handleGlobalDragStart, true);
  window.addEventListener("dragend", handleGlobalDragEnd, true);
  dragListenersAttached = true;
}

function detachDragListeners() {
  if (!dragListenersAttached) return;
  window.removeEventListener("dragstart", handleGlobalDragStart, true);
  window.removeEventListener("dragend", handleGlobalDragEnd, true);
  document.body.classList.remove("kanboard-dragging");
  dragListenersAttached = false;
}

export function notifyOnboardingTaskDropped(result: { taskId: string; intoTrash: boolean; toColumnId?: string }) {
  if (!activeTour?.isActive()) return;
  const currentIndex = activeTour.getActiveIndex();
  // Step 5 is the interactive drag operation step
  if (currentIndex === 5 && result.toColumnId === "doing") {
    const descriptionEl = document.querySelector<HTMLElement>(".driver-popover-description");
    if (descriptionEl) {
      descriptionEl.innerHTML = `
        <div class="onboarding-action-card onboarding-action-card--success">
          <div class="onboarding-action-badge onboarding-action-badge--success">操作完成</div>
          <p><strong>太棒了！卡片已成功流转至「进行中」！</strong></p>
          <p class="onboarding-action-sub">观察 Doing 列的 WIP 在制品计数已变为 2/2。即将进入下一步…</p>
        </div>
      `;
    }
    window.setTimeout(() => {
      if (activeTour?.isActive() && activeTour.getActiveIndex() === 5) {
        activeTour.moveNext();
      }
    }, 1100);
  }
}

export function isOnboardingActive(): boolean {
  return Boolean(activeTour?.isActive());
}

export function stopOnboarding() {
  if (activeTour?.isActive()) {
    activeTour.destroy();
  }
}

export function startOnboarding(options?: OnboardingOptions) {
  if (activeTour?.isActive()) {
    activeTour.destroy();
  }

  activeOptions = options ?? null;
  attachDragListeners();

  const tour = driver({
    animate: true,
    showProgress: true,
    allowClose: true,
    overlayOpacity: 0.65,
    stagePadding: 6,
    stageRadius: 6,
    skipMissingElement: true,
    nextBtnText: "下一步",
    prevBtnText: "上一步",
    doneBtnText: "开始使用",
    progressText: "{{current}} / {{total}}",
    popoverClass: "flow-onboarding",
    onHighlightStarted: (_el, _step, opts) => {
      if (typeof opts.index === "number") {
        activeOptions?.onStepChange?.(opts.index);
      }
    },
    onDestroyed: () => {
      detachDragListeners();
      if (activeOptions?.markSeen !== false) {
        localStorage.setItem(ONBOARDING_KEY, "seen");
      }
      const exitCallback = activeOptions?.onExit;
      activeTour = null;
      activeOptions = null;
      exitCallback?.();
    },
    steps: [
      {
        element: "[data-tour='quick-capture']",
        popover: {
          title: "先把想法收进来",
          description: "输入标题并回车，任务会进入收集箱。窗口内按 <kbd>Ctrl + K</kbd> 聚焦这里；在任何程序中按 <kbd>Ctrl + Shift + K</kbd>，只打开快速记录面板。面板内按 <kbd>Ctrl + Enter</kbd> 可保存任务、打开主看板并展开新任务详情。",
          side: "bottom",
          align: "center",
        },
      },
      {
        element: "[data-tour='project-filter']",
        popover: {
          title: "一个工作流，多个项目",
          description: "用项目和标签筛选任务，同时保留跨项目的全局视角。任务删除后可在底部区域撤回 3 秒，之后仍可从这里的回收站恢复。",
          side: "right",
          align: "start",
        },
      },
      {
        element: "[data-tour='search-filter']",
        popover: {
          title: "快速找到当前要处理的事",
          description: "搜索会同时匹配任务标题、说明、项目和标签。按 <kbd>/</kbd> 可以直接聚焦搜索框。",
          side: "bottom",
          align: "center",
        },
      },
      {
        element: "[data-tour='flow-filters']",
        popover: {
          title: "只看需要关注的任务",
          description: "可以快速查看有期限、高优先级和已进行超过 3 天的长期 WIP。",
          side: "bottom",
          align: "center",
        },
      },
      {
        element: "[data-tour='board-columns']",
        popover: {
          title: "价值流动与在制品限制（WIP）",
          description: "任务从左至右代表流动阶段。Doing 默认最多 2 项（WIP=2），通过限制在制品消除多任务并行浪费；超限时会给出醒目的超限提示。",
          side: "top",
          align: "center",
        },
      },
      {
        element: "[data-tour='board-columns']",
        popover: {
          title: "动手试一试：卡片拖拽流转",
          description: `
            <div class="onboarding-action-card">
              <div class="onboarding-action-badge">操作引导</div>
              <p><strong>试试按住下方 Ready 列中的【拖拽我到「进行中」体验流动】卡片，将其拖拽到 Doing（进行中）列！</strong></p>
              <p class="onboarding-action-sub">拖拽完成后将实时流转并刷新 WIP 计数。<span class="onboarding-action-hint">（也可点击“下一步”继续）</span></p>
            </div>
          `,
          side: "top",
          align: "center",
        },
      },
      {
        element: () =>
          document.querySelector("[data-task-id='mock-task-agent-prompt']") ??
          document.querySelector("[data-column='ready']") ??
          document.body,
        popover: {
          title: "卡片拖拽与 AI 协同派发",
          description: "按住卡片可在不同列之间自由拖拽流转，或拖到底部删除区移入回收站。更支持直接将卡片拖出窗口投递至外部平台；点击卡片右下角的小图标即可一键复制标准 Prompt，直接粘贴派发给 AI 执行。",
          side: "right",
          align: "start",
        },
      },
      {
        element: "[data-column='blocked']",
        popover: {
          title: "让阻塞浮出来",
          description: "移入阻塞后，在任务详情中记录原因；卡片会持续显示阻塞时长，直观暴露出价值交付路径上的瓶颈点。",
          side: "left",
          align: "start",
        },
      },
      {
        element: "[data-tour='swimlane']",
        popover: {
          title: "按项目切换泳道",
          description: "泳道会在同一套工作流中按项目分组，便于比较每个项目的任务流动，而不必建立多个看板。",
          side: "bottom",
          align: "end",
        },
      },
      {
        element: () =>
          document.querySelector("[data-task-id='mock-task-verify-1']") ??
          document.querySelector("[data-column='verify']") ??
          document.body,
        popover: {
          title: "任务详情、Checklist 与验证方案",
          description: `
            <div class="onboarding-action-card">
              <div class="onboarding-action-badge">支持点击</div>
              <p>打开任意任务可以添加 Checklist 并设置循环周期；待验证状态下可在<strong>「验证方案」Tab</strong> 中查看或编辑 Agent 提交的交付说明与测试验收指南。</p>
            </div>
          `,
          side: "left",
          align: "start",
        },
      },
      {
        element: "[data-tour='flow-dashboard']",
        popover: {
          title: "用流动指标发现问题",
          description: "统计面板展示 Throughput、周期中位数、P85 Cycle Time、阻塞时间、Aging WIP 和最近 14 天 CFD 累积流。按 <kbd>D</kbd> 也可以打开。",
          side: "bottom",
          align: "end",
        },
      },
      {
        element: "[data-tour='guide-help']",
        popover: {
          title: "需要时再看一遍",
          description: "随时点击“使用引导”重新查看。关闭主窗口只会隐藏到系统托盘；需要彻底退出时，请右击托盘图标并选择“退出”。<br/>点击<strong>「开始使用」</strong>即刻切回真实任务！",
          side: "bottom",
          align: "end",
        },
      },
    ],
  });

  activeTour = tour;
  tour.drive();
  return tour;
}

export function startFirstOnboarding(startFn?: () => void) {
  if (import.meta.env.MODE === "test" || localStorage.getItem(ONBOARDING_KEY)) return;
  if (startFn) {
    startFn();
  } else {
    startOnboarding();
  }
}
