import Database from "@tauri-apps/plugin-sql";
import type {
  Project,
  ProjectChanges,
  Tag,
  Task,
  TaskChanges,
  TaskColumn,
} from "../types";

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
  projectId: string | null;
  projectName: string | null;
  projectColor: string | null;
  title: string;
  description: string;
  dueDate: string | null;
  priority: "none" | "high";
  position: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TaskTagRow extends Tag {
  taskId: string;
}

export async function loadTaskWall(): Promise<TaskColumn[]> {
  const db = await database();
  const [columns, taskRows, taskTags] = await Promise.all([
    db.select<ColumnRow[]>(
      "SELECT id, title, position FROM task_columns ORDER BY position",
    ),
    db.select<TaskRow[]>(
      `SELECT t.id,
              t.column_id AS columnId,
              t.project_id AS projectId,
              p.name AS projectName,
              p.color AS projectColor,
              t.title,
              t.description,
              t.due_date AS dueDate,
              t.priority,
              t.position,
              t.completed_at AS completedAt,
              t.created_at AS createdAt,
              t.updated_at AS updatedAt
         FROM tasks t
         LEFT JOIN projects p ON p.id = t.project_id
        ORDER BY t.position`,
    ),
    db.select<TaskTagRow[]>(
      `SELECT tt.task_id AS taskId, tags.id, tags.name
         FROM task_tags tt
         JOIN tags ON tags.id = tt.tag_id
        ORDER BY tags.name COLLATE NOCASE`,
    ),
  ]);

  const tasks: Task[] = taskRows.map((task) => ({
    ...task,
    project: task.projectId && task.projectName && task.projectColor
      ? { id: task.projectId, name: task.projectName, color: task.projectColor }
      : null,
    tags: taskTags
      .filter((tag) => tag.taskId === task.id)
      .map(({ id, name }) => ({ id, name })),
  }));

  return columns.map((column) => ({
    ...column,
    tasks: tasks.filter((task) => task.columnId === column.id),
  }));
}

export async function createTask(
  title: string,
  columnId: string,
  projectId: string | null = null,
): Promise<Task> {
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
       id, column_id, project_id, title, description, due_date, priority,
       position, completed_at, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, '', NULL, 'none', $5, NULL, $6, $6)`,
    [id, columnId, projectId, title, position, now],
  );

  return {
    id,
    columnId,
    projectId,
    project: null,
    tags: [],
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

export async function updateTask(id: string, changes: TaskChanges): Promise<Tag[]> {
  const db = await database();
  const completedAt = changes.columnId === "done" ? new Date().toISOString() : null;

  await db.execute(
    `UPDATE tasks
        SET column_id = $1,
            project_id = $2,
            title = $3,
            description = $4,
            due_date = $5,
            priority = $6,
            completed_at = $7,
            updated_at = $8
      WHERE id = $9`,
    [
      changes.columnId,
      changes.projectId,
      changes.title,
      changes.description,
      changes.dueDate,
      changes.priority,
      completedAt,
      new Date().toISOString(),
      id,
    ],
  );

  await db.execute("DELETE FROM task_tags WHERE task_id = $1", [id]);
  const tags: Tag[] = [];
  for (const rawName of changes.tagNames) {
    const name = rawName.trim();
    if (!name || tags.some((tag) => tag.name.toLocaleLowerCase() === name.toLocaleLowerCase())) continue;
    const existing = await db.select<Tag[]>(
      "SELECT id, name FROM tags WHERE name = $1 COLLATE NOCASE",
      [name],
    );
    const tag = existing[0] ?? { id: crypto.randomUUID(), name };
    if (!existing.length) {
      await db.execute(
        "INSERT INTO tags (id, name, created_at) VALUES ($1, $2, $3)",
        [tag.id, tag.name, new Date().toISOString()],
      );
    }
    await db.execute(
      "INSERT INTO task_tags (task_id, tag_id) VALUES ($1, $2)",
      [id, tag.id],
    );
    tags.push(tag);
  }
  return tags;
}

export async function loadProjects(): Promise<Project[]> {
  const db = await database();
  return db.select<Project[]>(
    `SELECT id, name, color, description, target_date AS targetDate,
            status, created_at AS createdAt, updated_at AS updatedAt
       FROM projects
      ORDER BY status, name COLLATE NOCASE`,
  );
}

export async function loadTags(): Promise<Tag[]> {
  const db = await database();
  return db.select<Tag[]>("SELECT id, name FROM tags ORDER BY name COLLATE NOCASE");
}

export async function deleteTag(id: string): Promise<void> {
  const db = await database();
  await db.execute("DELETE FROM task_tags WHERE tag_id = $1", [id]);
  await db.execute("DELETE FROM tags WHERE id = $1", [id]);
}

export async function saveProject(
  changes: ProjectChanges,
  id: string | null = null,
): Promise<Project> {
  const db = await database();
  const projectId = id ?? crypto.randomUUID();
  const now = new Date().toISOString();
  if (id) {
    await db.execute(
      `UPDATE projects
          SET name = $1, color = $2, description = $3, target_date = $4,
              status = $5, updated_at = $6
        WHERE id = $7`,
      [changes.name, changes.color, changes.description, changes.targetDate, changes.status, now, id],
    );
  } else {
    await db.execute(
      `INSERT INTO projects (
         id, name, color, description, target_date, status, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
      [projectId, changes.name, changes.color, changes.description, changes.targetDate, changes.status, now],
    );
  }
  return {
    id: projectId,
    ...changes,
    createdAt: now,
    updatedAt: now,
  };
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
