import { driver } from "driver.js";

const ONBOARDING_KEY = "kanboard.flow-onboarding.v1";

export function startOnboarding(markSeen = true) {
  const tour = driver({
    animate: true,
    showProgress: true,
    allowClose: true,
    nextBtnText: "下一步",
    prevBtnText: "上一步",
    doneBtnText: "开始使用",
    progressText: "{{current}} / {{total}}",
    popoverClass: "flow-onboarding",
    onDestroyed: () => {
      if (markSeen) localStorage.setItem(ONBOARDING_KEY, "seen");
    },
    steps: [
      {
        element: "[data-tour='quick-capture']",
        popover: {
          title: "先把想法收进来",
          description: "输入标题并回车，任务会进入收集箱。按 Ctrl + K 可以随时回到这里。",
          side: "bottom",
          align: "center",
        },
      },
      {
        element: "[data-tour='project-filter']",
        popover: {
          title: "一个工作流，多个项目",
          description: "用项目和标签筛选任务，同时保留跨项目的全局视角。",
          side: "right",
          align: "start",
        },
      },
      {
        element: "[data-column='ready']",
        popover: {
          title: "从就绪队列拉取",
          description: "Ready 从上到下就是优先顺序。完成手头工作后，再拉取下一项。",
          side: "right",
          align: "start",
        },
      },
      {
        element: "[data-column='doing']",
        popover: {
          title: "限制正在进行",
          description: "Doing 默认最多 2 项。超限不会阻止操作，但会明确提醒你先完成再开始。",
          side: "right",
          align: "start",
        },
      },
      {
        element: "[data-column='blocked']",
        popover: {
          title: "让阻塞浮出来",
          description: "移入阻塞后，在任务详情中记录原因；卡片会持续显示阻塞时长。",
          side: "left",
          align: "start",
        },
      },
      {
        element: "[data-tour='guide-help']",
        popover: {
          title: "需要时再看一遍",
          description: "随时点击“使用引导”重新查看这套工作方式。",
          side: "bottom",
          align: "end",
        },
      },
    ],
  });
  tour.drive();
}

export function startFirstOnboarding() {
  if (import.meta.env.MODE === "test" || localStorage.getItem(ONBOARDING_KEY)) return;
  startOnboarding();
}
