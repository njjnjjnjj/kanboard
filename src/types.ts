export type Priority = "none" | "high";
export type ProjectStatus = "active" | "archived";

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
  projectId: string | null;
  tagNames: string[];
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
  | { kind: "tag"; id: string };
