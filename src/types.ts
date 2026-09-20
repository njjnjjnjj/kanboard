export type Priority = "none" | "high";
export type ProjectStatus = "active" | "archived";
export type BlockedReason = "people" | "hardware" | "environment" | "feedback" | "technical" | "dependency" | "other";
export type RecurrenceRule = "none" | "daily" | "weekly" | "monthly";

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
  position: number;
}

export interface Project {
  id: string;
  name: string;
  color: string;
  description: string;
  targetDate: string | null;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Tag {
  id: string;
  name: string;
}

export interface Task {
  id: string;
  columnId: string;
  projectId: string | null;
  project: Pick<Project, "id" | "name" | "color"> | null;
  tags: Tag[];
  title: string;
  description: string;
  dueDate: string | null;
  priority: Priority;
  position: number;
  completedAt: string | null;
  startedAt: string | null;
  blockedReason: BlockedReason | null;
  blockedSince: string | null;
  checklist: ChecklistItem[];
  recurrenceRule: RecurrenceRule;
  createdAt: string;
  updatedAt: string;
}

export interface DeletedTask extends Task {
  deletedAt: string;
}

export interface TaskColumn {
  id: string;
  title: string;
  position: number;
  wipLimit: number | null;
  totalTaskCount?: number;
  tasks: Task[];
}

export interface TaskChanges {
  title: string;
  description: string;
  dueDate: string | null;
  priority: Priority;
  columnId: string;
  projectId: string | null;
  tagNames: string[];
  blockedReason: BlockedReason | null;
  checklist: ChecklistItem[];
  recurrenceRule: RecurrenceRule;
}

export interface ProjectChanges {
  name: string;
  color: string;
  description: string;
  targetDate: string | null;
  status: ProjectStatus;
}

export type TaskScope =
  | { kind: "all" }
  | { kind: "unassigned" }
  | { kind: "project"; id: string }
  | { kind: "tag"; id: string }
  | { kind: "trash" };

export interface TaskEvent {
  taskId: string;
  fromStatus: string | null;
  toStatus: string;
  createdAt: string;
}

export interface FlowMetrics {
  throughput7d: number;
  medianCycleHours: number | null;
  p85CycleHours: number | null;
  blockedHours30d: number;
  longWipTasks: Task[];
  agingBuckets: Array<{ label: string; count: number }>;
  cfd: Array<{ date: string; counts: Record<string, number> }>;
}
