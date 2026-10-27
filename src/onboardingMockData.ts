import type { Project, Tag, Task, TaskColumn, TaskEvent } from "./types";

export const MOCK_PROJECT_KANBOARD: Project = {
  id: "mock-proj-kanboard",
  name: "Kanboard 桌面端",
  color: "#4f46e5",
  description: "极速响应的个人与团队本地任务看板",
  path: "d:/MyWorkspace/kanboard",
  targetDate: "2026-11-30",
  status: "active",
  createdAt: "2026-10-01T08:00:00.000Z",
  updatedAt: "2026-10-20T08:00:00.000Z",
};

export const MOCK_PROJECT_DOCS: Project = {
  id: "mock-proj-docs",
  name: "标准与规范",
  color: "#059669",
  description: "SOP 作业规程与工程效能交付规范",
  path: "",
  targetDate: null,
  status: "active",
  createdAt: "2026-10-01T08:00:00.000Z",
  updatedAt: "2026-10-20T08:00:00.000Z",
};

export const MOCK_TAG_AI: Tag = { id: "mock-tag-ai", name: "AI协同" };
export const MOCK_TAG_FLOW: Tag = { id: "mock-tag-flow", name: "流动效率" };
export const MOCK_TAG_SOP: Tag = { id: "mock-tag-sop", name: "SOP规范" };

export function createMockProjects(): Project[] {
  return [
    { ...MOCK_PROJECT_KANBOARD },
    { ...MOCK_PROJECT_DOCS },
  ];
}

export function createMockTags(): Tag[] {
  return [
    { ...MOCK_TAG_AI },
    { ...MOCK_TAG_FLOW },
    { ...MOCK_TAG_SOP },
  ];
}

export function createMockTasks(): Record<string, Task[]> {
  const now = Date.now();
  const isoHoursAgo = (hours: number) => new Date(now - hours * 3600 * 1000).toISOString();
  const isoDaysAgo = (days: number) => new Date(now - days * 24 * 3600 * 1000).toISOString();

  return {
    todo: [
      {
        id: "mock-task-quick-add",
        columnId: "todo",
        projectId: MOCK_PROJECT_KANBOARD.id,
        project: {
          id: MOCK_PROJECT_KANBOARD.id,
          name: MOCK_PROJECT_KANBOARD.name,
          color: MOCK_PROJECT_KANBOARD.color,
          path: MOCK_PROJECT_KANBOARD.path,
        },
        tags: [{ ...MOCK_TAG_FLOW }],
        title: "想法收集：调研全局托盘快速呼出快捷键",
        description: "在系统任意程序中按 Ctrl + Shift + K 呼出独立快捷记录面板，输入后回车即可无感保存至收集箱。",
        dueDate: null,
        priority: "none",
        position: 1000,
        completedAt: null,
        startedAt: null,
        blockedReason: null,
        blockedSince: null,
        checklist: [],
        recurrenceRule: "none",
        reviewNotes: "",
        inAgentSop: false,
        createdAt: isoHoursAgo(12),
        updatedAt: isoHoursAgo(12),
      },
    ],
    backlog: [
      {
        id: "mock-task-backlog-1",
        columnId: "backlog",
        projectId: MOCK_PROJECT_KANBOARD.id,
        project: {
          id: MOCK_PROJECT_KANBOARD.id,
          name: MOCK_PROJECT_KANBOARD.name,
          color: MOCK_PROJECT_KANBOARD.color,
          path: MOCK_PROJECT_KANBOARD.path,
        },
        tags: [{ ...MOCK_TAG_FLOW }],
        title: "优化 CFD 累积流图采样精度与周期交付计算",
        description: "对最近 14 天流动数据增加工序交付速率和前置时间拟合曲线，支持直观对比 WIP 膨胀趋势。",
        dueDate: isoDaysAgo(-7), // 7 days from now
        priority: "none",
        position: 1000,
        completedAt: null,
        startedAt: null,
        blockedReason: null,
        blockedSince: null,
        checklist: [],
        recurrenceRule: "none",
        reviewNotes: "",
        inAgentSop: false,
        createdAt: isoDaysAgo(3),
        updatedAt: isoDaysAgo(1),
      },
    ],
    ready: [
      {
        id: "mock-task-drag-demo",
        columnId: "ready",
        projectId: MOCK_PROJECT_KANBOARD.id,
        project: {
          id: MOCK_PROJECT_KANBOARD.id,
          name: MOCK_PROJECT_KANBOARD.name,
          color: MOCK_PROJECT_KANBOARD.color,
          path: MOCK_PROJECT_KANBOARD.path,
        },
        tags: [{ ...MOCK_TAG_FLOW }],
        title: "拖拽我到「进行中」体验流动",
        description: "按住当前卡片，拖入右侧的「进行中」列，观察看板 WIP 限制变化与即时状态流转提示。",
        dueDate: null,
        priority: "high",
        position: 1000,
        completedAt: null,
        startedAt: null,
        blockedReason: null,
        blockedSince: null,
        checklist: [],
        recurrenceRule: "none",
        reviewNotes: "",
        inAgentSop: false,
        createdAt: isoDaysAgo(2),
        updatedAt: isoDaysAgo(1),
      },
      {
        id: "mock-task-agent-prompt",
        columnId: "ready",
        projectId: MOCK_PROJECT_KANBOARD.id,
        project: {
          id: MOCK_PROJECT_KANBOARD.id,
          name: MOCK_PROJECT_KANBOARD.name,
          color: MOCK_PROJECT_KANBOARD.color,
          path: MOCK_PROJECT_KANBOARD.path,
        },
        tags: [{ ...MOCK_TAG_AI }],
        title: "复制卡片 Prompt 一键派发 AI 助手",
        description: "卡片右下角的小图标可一键复制标准 Prompt，内含任务上下文、工作区路径与 SOP 规范，可直接粘贴派发给 AI 助手执行。",
        dueDate: null,
        priority: "none",
        position: 2000,
        completedAt: null,
        startedAt: null,
        blockedReason: null,
        blockedSince: null,
        checklist: [],
        recurrenceRule: "none",
        reviewNotes: "",
        inAgentSop: false,
        createdAt: isoDaysAgo(1),
        updatedAt: isoHoursAgo(6),
      },
    ],
    doing: [
      {
        id: "mock-task-doing-1",
        columnId: "doing",
        projectId: MOCK_PROJECT_KANBOARD.id,
        project: {
          id: MOCK_PROJECT_KANBOARD.id,
          name: MOCK_PROJECT_KANBOARD.name,
          color: MOCK_PROJECT_KANBOARD.color,
          path: MOCK_PROJECT_KANBOARD.path,
        },
        tags: [{ ...MOCK_TAG_SOP }],
        title: "细化引导程序与交互体验",
        description: "支持 Mock 数据无缝切换、引导交互拖拽与平滑退出恢复，操作不污染真实 SQLite 数据库。",
        dueDate: null,
        priority: "none",
        position: 1000,
        completedAt: null,
        startedAt: isoHoursAgo(4),
        blockedReason: null,
        blockedSince: null,
        checklist: [],
        recurrenceRule: "none",
        reviewNotes: "",
        inAgentSop: false,
        createdAt: isoDaysAgo(1),
        updatedAt: isoHoursAgo(4),
      },
    ],
    verify: [
      {
        id: "mock-task-verify-1",
        columnId: "verify",
        projectId: MOCK_PROJECT_DOCS.id,
        project: {
          id: MOCK_PROJECT_DOCS.id,
          name: MOCK_PROJECT_DOCS.name,
          color: MOCK_PROJECT_DOCS.color,
          path: MOCK_PROJECT_DOCS.path,
        },
        tags: [{ ...MOCK_TAG_SOP }],
        title: "按 SOP 规程执行交付验证",
        description: "完成改动后提供清晰的测试验收指南。点击本卡片可查看 Checklist 与「验证方案」Tab。",
        dueDate: null,
        priority: "none",
        position: 1000,
        completedAt: null,
        startedAt: isoDaysAgo(2),
        blockedReason: null,
        blockedSince: null,
        checklist: [
          { id: "mock-chk-1", text: "无缝加载 Kanboard Mock 数据且不刷新全屏", completed: true, position: 1000 },
          { id: "mock-chk-2", text: "支持卡片真实拖拽与操作指引", completed: true, position: 2000 },
          { id: "mock-chk-3", text: "退出引导后无感还原用户真实数据", completed: true, position: 3000 },
        ],
        recurrenceRule: "none",
        reviewNotes: `### 核心实现方案

| 模块 / 文件 | 改动类型 | 核心逻辑说明 |
| :--- | :--- | :--- |
| \`src/onboardingMockData.ts\` | 新增 | 提供 Kanboard 原生业务高还原度演示数据与事件流 |
| \`src/onboarding.ts\` | 重构 | 升级为支持拖拽与操作指引的交互式引导体系 |
| \`src/App.vue\` | 优化 | 实现内存无感平滑切换与真实数据还原机制 |

### 验证说明

用户可直接在看板各列体验拖拽与详情查看，随时点击右上角退出引导恢复真实数据。`,
        inAgentSop: true,
        createdAt: isoDaysAgo(2),
        updatedAt: isoHoursAgo(2),
      },
    ],
    blocked: [
      {
        id: "mock-task-blocked-1",
        columnId: "blocked",
        projectId: MOCK_PROJECT_KANBOARD.id,
        project: {
          id: MOCK_PROJECT_KANBOARD.id,
          name: MOCK_PROJECT_KANBOARD.name,
          color: MOCK_PROJECT_KANBOARD.color,
          path: MOCK_PROJECT_KANBOARD.path,
        },
        tags: [{ ...MOCK_TAG_SOP }],
        title: "跨平台通知权限与系统事件响应",
        description: "移动至阻塞列，并在任务详情记录原因，卡片将直观显示已阻塞时长。",
        dueDate: null,
        priority: "none",
        position: 1000,
        completedAt: null,
        startedAt: isoDaysAgo(3),
        blockedReason: "dependency",
        blockedSince: isoHoursAgo(36),
        checklist: [],
        recurrenceRule: "none",
        reviewNotes: "",
        inAgentSop: false,
        createdAt: isoDaysAgo(3),
        updatedAt: isoHoursAgo(36),
      },
    ],
    done: [
      {
        id: "mock-task-done-1",
        columnId: "done",
        projectId: MOCK_PROJECT_KANBOARD.id,
        project: {
          id: MOCK_PROJECT_KANBOARD.id,
          name: MOCK_PROJECT_KANBOARD.name,
          color: MOCK_PROJECT_KANBOARD.color,
          path: MOCK_PROJECT_KANBOARD.path,
        },
        tags: [{ ...MOCK_TAG_FLOW }],
        title: "SQLite 本地任务与事件流持久化",
        description: "支持单机数据持久存储，保障完全本地离线可用与极速响应。",
        dueDate: null,
        priority: "none",
        position: 1000,
        completedAt: isoHoursAgo(48),
        startedAt: isoDaysAgo(4),
        blockedReason: null,
        blockedSince: null,
        checklist: [],
        recurrenceRule: "none",
        reviewNotes: "",
        inAgentSop: false,
        createdAt: isoDaysAgo(5),
        updatedAt: isoHoursAgo(48),
      },
    ],
  };
}

export function createMockColumns(): TaskColumn[] {
  const taskMap = createMockTasks();
  return [
    { id: "todo", title: "收集箱", position: 1000, wipLimit: null, tasks: taskMap.todo ?? [] },
    { id: "backlog", title: "待办池", position: 2000, wipLimit: null, tasks: taskMap.backlog ?? [] },
    { id: "ready", title: "就绪", position: 3000, wipLimit: null, tasks: taskMap.ready ?? [] },
    { id: "doing", title: "进行中", position: 4000, wipLimit: 2, tasks: taskMap.doing ?? [] },
    { id: "verify", title: "待验证", position: 5000, wipLimit: 2, tasks: taskMap.verify ?? [] },
    { id: "blocked", title: "阻塞", position: 6000, wipLimit: null, tasks: taskMap.blocked ?? [] },
    { id: "done", title: "已完成", position: 7000, wipLimit: null, tasks: taskMap.done ?? [] },
  ];
}

export function createMockTaskEvents(): TaskEvent[] {
  const now = Date.now();
  const isoDaysAgo = (days: number) => new Date(now - days * 24 * 3600 * 1000).toISOString();

  return [
    // Done task historical flow
    { taskId: "mock-task-done-1", fromStatus: null, toStatus: "todo", createdAt: isoDaysAgo(5) },
    { taskId: "mock-task-done-1", fromStatus: "todo", toStatus: "ready", createdAt: isoDaysAgo(4) },
    { taskId: "mock-task-done-1", fromStatus: "ready", toStatus: "doing", createdAt: isoDaysAgo(3) },
    { taskId: "mock-task-done-1", fromStatus: "doing", toStatus: "done", createdAt: isoDaysAgo(2) },

    // Verify task
    { taskId: "mock-task-verify-1", fromStatus: null, toStatus: "todo", createdAt: isoDaysAgo(4) },
    { taskId: "mock-task-verify-1", fromStatus: "todo", toStatus: "ready", createdAt: isoDaysAgo(3) },
    { taskId: "mock-task-verify-1", fromStatus: "ready", toStatus: "doing", createdAt: isoDaysAgo(2) },
    { taskId: "mock-task-verify-1", fromStatus: "doing", toStatus: "verify", createdAt: isoDaysAgo(1) },

    // Blocked task
    { taskId: "mock-task-blocked-1", fromStatus: null, toStatus: "todo", createdAt: isoDaysAgo(4) },
    { taskId: "mock-task-blocked-1", fromStatus: "todo", toStatus: "ready", createdAt: isoDaysAgo(3) },
    { taskId: "mock-task-blocked-1", fromStatus: "ready", toStatus: "doing", createdAt: isoDaysAgo(2) },
    { taskId: "mock-task-blocked-1", fromStatus: "doing", toStatus: "blocked", createdAt: isoDaysAgo(1.5) },

    // Doing task
    { taskId: "mock-task-doing-1", fromStatus: null, toStatus: "todo", createdAt: isoDaysAgo(2) },
    { taskId: "mock-task-doing-1", fromStatus: "todo", toStatus: "ready", createdAt: isoDaysAgo(1) },
    { taskId: "mock-task-doing-1", fromStatus: "ready", toStatus: "doing", createdAt: isoDaysAgo(0.3) },

    // Ready tasks
    { taskId: "mock-task-drag-demo", fromStatus: null, toStatus: "todo", createdAt: isoDaysAgo(2) },
    { taskId: "mock-task-drag-demo", fromStatus: "todo", toStatus: "ready", createdAt: isoDaysAgo(1) },
    { taskId: "mock-task-agent-prompt", fromStatus: null, toStatus: "ready", createdAt: isoDaysAgo(1) },
  ];
}
