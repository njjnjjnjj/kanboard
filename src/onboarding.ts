import { driver } from "driver.js";

const ONBOARDING_KEY = "kanboard.flow-onboarding.v3";

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
          description: "输入标题并回车，任务会进入收集箱。窗口内按 Ctrl + K 聚焦这里；在任何程序中按 Ctrl + Shift + K，只打开快速记录面板。面板内按 Ctrl + Enter 可保存任务、打开主看板并展开新任务详情。",
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
          description: "搜索会同时匹配任务标题、说明、项目和标签。按 / 可以直接聚焦搜索框。",
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
          title: "卡片拖拽与跨应用 AI 派发",
          description: "按住卡片可在不同列之间自由拖拽流转，或拖到底部删除区移入回收站。更支持直接将卡片拖出窗口，投递至 Codex、VS Code 等 AI 平台，自动注入包含任务详情、项目路径与 MCP 操作指令的标准 Prompt，由 AI 助手自主推进执行。",
          side: "top",
          align: "center",
        },
      },
      {
        element: "[data-column='ready']",
        popover: {
          title: "从就绪队列拉取",
          description: "Ready 从上到下即为优先顺序。拖动卡片至「进行中」开始工作，或拖出窗口派发给 AI。",
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
        element: "[data-tour='swimlane']",
        popover: {
          title: "按项目切换泳道",
          description: "泳道会在同一套工作流中按项目分组，便于比较每个项目的任务流动，而不必建立多个 Board。",
          side: "bottom",
          align: "end",
        },
      },
      {
        popover: {
          title: "在任务详情中定义完成与验证",
          description: "打开任意任务，可以添加 Checklist 并设置循环周期；待验证状态下可在「验证方案」Tab 中查看或编辑 Agent 提交的交付说明与测试验收指南。保存详情可按 Ctrl + Enter。",
        },
      },
      {
        element: "[data-tour='flow-dashboard']",
        popover: {
          title: "用流动指标发现问题",
          description: "统计面板展示 Throughput、周期中位数、P85 Cycle Time、阻塞时间、Aging WIP 和最近 14 天 CFD。按 D 也可以打开。",
          side: "bottom",
          align: "end",
        },
      },
      {
        element: "[data-tour='guide-help']",
        popover: {
          title: "需要时再看一遍",
          description: "随时点击“使用引导”重新查看。关闭主窗口只会隐藏到系统托盘；需要彻底退出时，请右击托盘图标并选择“退出”。",
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
