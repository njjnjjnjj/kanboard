export type Priority = "none" | "high";

export interface Task {
  id: string;
  columnId: string;
  title: string;
  description: string;
  dueDate: string | null;
  priority: Priority;
  position: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskColumn {
  id: string;
  title: string;
  position: number;
  tasks: Task[];
}

export interface TaskChanges {
  title: string;
  description: string;
  dueDate: string | null;
  priority: Priority;
  columnId: string;
}
