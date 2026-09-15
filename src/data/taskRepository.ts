import Database from "@tauri-apps/plugin-sql";
import type { Task, TaskChanges, TaskColumn } from "../types";

const DATABASE_URL = "sqlite:kanboard.db";

let databasePromise: Promise<Database> | undefined;

function database(): Promise<Database> {
  databasePromise ??= Database.load(DATABASE_URL);
  return databasePromise;
}

interface ColumnRow {
  id: string;
  title: string;
  position: number;
}

interface TaskRow {
  id: string;
  columnId: string;
  title: string;
  description: string;
  dueDate: string | null;
  priority: "none" | "high";
  position: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function loadTaskWall(): Promise<TaskColumn[]> {
  const db = await database();
  const [columns, tasks] = await Promise.all([
    db.select<ColumnRow[]>(
      "SELECT id, title, position FROM task_columns ORDER BY position",
    ),
    db.select<TaskRow[]>(
      `SELECT id,
              column_id AS columnId,
              title,
              description,
              due_date AS dueDate,
              priority,
              position,
              completed_at AS completedAt,
              created_at AS createdAt,
              updated_at AS updatedAt
         FROM tasks
        ORDER BY position`,
    ),
  ]);

  return columns.map((column) => ({
    ...column,
    tasks: tasks.filter((task) => task.columnId === column.id),
  }));
}

export async function createTask(title: string, columnId: string): Promise<Task> {
  const db = await database();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const rows = await db.select<Array<{ nextPosition: number }>>(
    "SELECT COALESCE(MAX(position), 0) + 1000 AS nextPosition FROM tasks WHERE column_id = $1",
    [columnId],
  );
  const position = rows[0]?.nextPosition ?? 1000;

  await db.execute(
    `INSERT INTO tasks (
       id, column_id, title, description, due_date, priority,
       position, completed_at, created_at, updated_at
     ) VALUES ($1, $2, $3, '', NULL, 'none', $4, NULL, $5, $5)`,
    [id, columnId, title, position, now],
  );

  return {
    id,
    columnId,
    title,
    description: "",
    dueDate: null,
    priority: "none",
    position,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function updateTask(id: string, changes: TaskChanges): Promise<void> {
  const db = await database();
  const completedAt = changes.columnId === "done" ? new Date().toISOString() : null;

  await db.execute(
    `UPDATE tasks
        SET column_id = $1,
            title = $2,
            description = $3,
            due_date = $4,
            priority = $5,
            completed_at = $6,
            updated_at = $7
      WHERE id = $8`,
    [
      changes.columnId,
      changes.title,
      changes.description,
      changes.dueDate,
      changes.priority,
      completedAt,
      new Date().toISOString(),
      id,
    ],
  );
}

export async function saveTaskOrder(columns: TaskColumn[]): Promise<void> {
  const updatedAt = new Date().toISOString();
  const db = await database();

  for (const column of columns) {
    for (const [index, task] of column.tasks.entries()) {
      const position = (index + 1) * 1000;
      const completedAt = column.id === "done"
        ? task.completedAt ?? updatedAt
        : null;
      await db.execute(
        `UPDATE tasks
            SET column_id = $1,
                position = $2,
                completed_at = $3,
                updated_at = $4
          WHERE id = $5`,
        [column.id, position, completedAt, updatedAt, task.id],
      );
      task.columnId = column.id;
      task.position = position;
      task.completedAt = completedAt;
      task.updatedAt = updatedAt;
    }
  }
}

export async function deleteTask(id: string): Promise<void> {
  const db = await database();
  await db.execute("DELETE FROM tasks WHERE id = $1", [id]);
}
