import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import type {
  DeletedTask,
  Project,
  ProjectChanges,
  Tag,
  Task,
  TaskChanges,
  TaskColumn,
  TaskEvent,
} from "../types";

let databasePromise: Promise<Database> | undefined;

function database(): Promise<Database> {
  databasePromise ??= invoke<string>("get_database_url").then((url) => Database.load(url));
  return databasePromise;
}

interface ColumnRow {
  id: string;
  title: string;
  position: number;
  wipLimit: number | null;
}

interface TaskRow {
  id: string;
  columnId: string;
  projectId: string | null;
  projectName: string | null;
  projectColor: string | null;
  projectPath: string | null;
  title: string;
  description: string;
  dueDate: string | null;
  priority: "none" | "high";
  position: number;
  completedAt: string | null;
  startedAt: string | null;
  blockedReason: Task["blockedReason"];
  blockedSince: string | null;
  recurrenceRule: Task["recurrenceRule"];
  reviewNotes: string;
  createdAt: string;
  updatedAt: string;
}

interface TaskTagRow extends Tag {
  taskId: string;
}

interface DeletedTaskRow extends TaskRow {
  deletedAt: string;
}

interface ChecklistRow {
  id: string;
  taskId: string;
  text: string;
  completed: number;
  position: number;
}

export async function loadTaskWall(): Promise<TaskColumn[]> {
  const db = await database();
  const [columns, taskRows, taskTags, checklistRows] = await Promise.all([
    db.select<ColumnRow[]>(
      "SELECT id, title, position, wip_limit AS wipLimit FROM task_columns ORDER BY position",
    ),
    db.select<TaskRow[]>(
      `SELECT t.id,
              t.column_id AS columnId,
              t.project_id AS projectId,
              p.name AS projectName,
              p.color AS projectColor,
              p.path AS projectPath,
              t.title,
              t.description,
              t.due_date AS dueDate,
              t.priority,
              t.position,
              t.completed_at AS completedAt,
              t.started_at AS startedAt,
              t.blocked_reason AS blockedReason,
              t.blocked_since AS blockedSince,
              t.recurrence_rule AS recurrenceRule,
              t.review_notes AS reviewNotes,
              t.created_at AS createdAt,
              t.updated_at AS updatedAt
         FROM tasks t
         LEFT JOIN projects p ON p.id = t.project_id
        WHERE t.deleted_at IS NULL
        ORDER BY t.position`,
    ),
    db.select<TaskTagRow[]>(
      `SELECT tt.task_id AS taskId, tags.id, tags.name
         FROM task_tags tt
         JOIN tags ON tags.id = tt.tag_id
        ORDER BY tags.name COLLATE NOCASE`,
    ),
    db.select<ChecklistRow[]>(
      `SELECT id, task_id AS taskId, text, completed, position
         FROM task_checklist_items
        ORDER BY position`,
    ),
  ]);

  const tasks: Task[] = taskRows.map((task) => ({
    ...task,
    project: task.projectId && task.projectName && task.projectColor
      ? { id: task.projectId, name: task.projectName, color: task.projectColor, path: task.projectPath ?? "" }
      : null,
    tags: taskTags
      .filter((tag) => tag.taskId === task.id)
      .map(({ id, name }) => ({ id, name })),
    checklist: checklistRows
      .filter((item) => item.taskId === task.id)
      .map((item) => ({ ...item, completed: Boolean(item.completed) })),
  }));

  return columns.map((column) => ({
    ...column,
    tasks: tasks.filter((task) => task.columnId === column.id),
  }));
}

export async function loadDeletedTasks(): Promise<DeletedTask[]> {
  const db = await database();
  const [taskRows, taskTags, checklistRows] = await Promise.all([
    db.select<DeletedTaskRow[]>(
      `SELECT t.id,
              t.column_id AS columnId,
              t.project_id AS projectId,
              p.name AS projectName,
              p.color AS projectColor,
              p.path AS projectPath,
              t.title,
              t.description,
              t.due_date AS dueDate,
              t.priority,
              t.position,
              t.completed_at AS completedAt,
              t.started_at AS startedAt,
              t.blocked_reason AS blockedReason,
              t.blocked_since AS blockedSince,
              t.recurrence_rule AS recurrenceRule,
              t.review_notes AS reviewNotes,
              t.created_at AS createdAt,
              t.updated_at AS updatedAt,
              t.deleted_at AS deletedAt
         FROM tasks t
         LEFT JOIN projects p ON p.id = t.project_id
        WHERE t.deleted_at IS NOT NULL
        ORDER BY t.deleted_at DESC`,
    ),
    db.select<TaskTagRow[]>(
      `SELECT tt.task_id AS taskId, tags.id, tags.name
         FROM task_tags tt
         JOIN tags ON tags.id = tt.tag_id
         JOIN tasks t ON t.id = tt.task_id
        WHERE t.deleted_at IS NOT NULL
        ORDER BY tags.name COLLATE NOCASE`,
    ),
    db.select<ChecklistRow[]>(
      `SELECT items.id, items.task_id AS taskId, items.text, items.completed, items.position
         FROM task_checklist_items items
         JOIN tasks t ON t.id = items.task_id
        WHERE t.deleted_at IS NOT NULL
        ORDER BY items.position`,
    ),
  ]);

  return taskRows.map((task) => ({
    ...task,
    project: task.projectId && task.projectName && task.projectColor
      ? { id: task.projectId, name: task.projectName, color: task.projectColor, path: task.projectPath ?? "" }
      : null,
    tags: taskTags
      .filter((tag) => tag.taskId === task.id)
      .map(({ id, name }) => ({ id, name })),
    checklist: checklistRows
      .filter((item) => item.taskId === task.id)
      .map((item) => ({ ...item, completed: Boolean(item.completed) })),
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
       position, completed_at, started_at, blocked_reason, blocked_since, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, '', NULL, 'none', $5, NULL, NULL, NULL, NULL, $6, $6)`,
    [id, columnId, projectId, title, position, now],
  );
  await db.execute(
    "INSERT INTO task_events (task_id, from_status, to_status, created_at) VALUES ($1, NULL, $2, $3)",
    [id, columnId, now],
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
    startedAt: null,
    blockedReason: null,
    blockedSince: null,
    checklist: [],
    recurrenceRule: "none",
    reviewNotes: "",
    createdAt: now,
    updatedAt: now,
  };
}

export async function updateTask(id: string, changes: TaskChanges): Promise<Tag[]> {
  const db = await database();
  const now = new Date().toISOString();
  const completedAt = changes.columnId === "done" ? now : null;
  await db.execute(
    `INSERT INTO task_events (task_id, from_status, to_status, created_at)
     SELECT id, column_id, $1, $2 FROM tasks WHERE id = $3 AND column_id <> $1`,
    [changes.columnId, now, id],
  );

  await db.execute(
    `UPDATE tasks
        SET column_id = $1,
            project_id = $2,
            title = $3,
            description = $4,
            due_date = $5,
            priority = $6,
            completed_at = $7,
            started_at = CASE
              WHEN $1 = 'doing' AND column_id <> 'doing' THEN $8
              WHEN $1 <> 'doing' THEN NULL
              ELSE started_at
            END,
            blocked_reason = CASE WHEN $1 = 'blocked' THEN $9 ELSE NULL END,
            blocked_since = CASE
              WHEN $1 = 'blocked' AND column_id <> 'blocked' THEN $8
              WHEN $1 <> 'blocked' THEN NULL
              ELSE blocked_since
            END,
            recurrence_rule = $10,
            review_notes = $11,
            updated_at = $8
      WHERE id = $12`,
    [
      changes.columnId,
      changes.projectId,
      changes.title,
      changes.description,
      changes.dueDate,
      changes.priority,
      completedAt,
      now,
      changes.blockedReason,
      changes.recurrenceRule,
      changes.reviewNotes,
      id,
    ],
  );

  await db.execute("DELETE FROM task_checklist_items WHERE task_id = $1", [id]);
  for (const [index, item] of changes.checklist.entries()) {
    const text = item.text.trim();
    if (!text) continue;
    await db.execute(
      `INSERT INTO task_checklist_items (id, task_id, text, completed, position)
       VALUES ($1, $2, $3, $4, $5)`,
      [item.id || crypto.randomUUID(), id, text, item.completed ? 1 : 0, (index + 1) * 1000],
    );
  }

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
    `SELECT id, name, color, description, path, target_date AS targetDate,
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
          SET name = $1, color = $2, description = $3, path = $4, target_date = $5,
              status = $6, updated_at = $7
        WHERE id = $8`,
      [changes.name, changes.color, changes.description, changes.path, changes.targetDate, changes.status, now, id],
    );
  } else {
    await db.execute(
      `INSERT INTO projects (
         id, name, color, description, path, target_date, status, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
      [projectId, changes.name, changes.color, changes.description, changes.path, changes.targetDate, changes.status, now],
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
        `INSERT INTO task_events (task_id, from_status, to_status, created_at)
         SELECT id, column_id, $1, $2 FROM tasks WHERE id = $3 AND column_id <> $1`,
        [column.id, updatedAt, task.id],
      );
      await db.execute(
        `UPDATE tasks
            SET column_id = $1,
                position = $2,
                completed_at = $3,
                started_at = CASE
                  WHEN $1 = 'doing' AND column_id <> 'doing' THEN $4
                  WHEN $1 <> 'doing' THEN NULL
                  ELSE started_at
                END,
                blocked_reason = CASE
                  WHEN $1 = 'blocked' THEN COALESCE(blocked_reason, 'other')
                  ELSE NULL
                END,
                blocked_since = CASE
                  WHEN $1 = 'blocked' AND column_id <> 'blocked' THEN $4
                  WHEN $1 <> 'blocked' THEN NULL
                  ELSE blocked_since
                END,
                updated_at = $4
          WHERE id = $5`,
        [column.id, position, completedAt, updatedAt, task.id],
      );
      const previousColumnId = task.columnId;
      task.columnId = column.id;
      task.position = position;
      task.completedAt = completedAt;
      task.startedAt = column.id === "doing"
        ? previousColumnId === "doing" ? task.startedAt : updatedAt
        : null;
      task.blockedReason = column.id === "blocked" ? task.blockedReason ?? "other" : null;
      task.blockedSince = column.id === "blocked"
        ? previousColumnId === "blocked" ? task.blockedSince : updatedAt
        : null;
      task.updatedAt = updatedAt;
    }
  }
}

export async function deleteTask(id: string): Promise<void> {
  const db = await database();
  await db.execute("DELETE FROM tasks WHERE id = $1", [id]);
}

export async function trashTask(id: string): Promise<string> {
  const db = await database();
  const deletedAt = new Date().toISOString();
  await db.execute(
    `UPDATE tasks SET deleted_at = $1, updated_at = $1 WHERE id = $2`,
    [deletedAt, id],
  );
  return deletedAt;
}

export async function restoreTask(id: string): Promise<void> {
  const db = await database();
  await db.execute(
    "UPDATE tasks SET deleted_at = NULL, updated_at = $1 WHERE id = $2",
    [new Date().toISOString(), id],
  );
}

export async function loadTaskEvents(): Promise<TaskEvent[]> {
  const db = await database();
  return db.select<TaskEvent[]>(
    `SELECT events.task_id AS taskId, events.from_status AS fromStatus,
            events.to_status AS toStatus, events.created_at AS createdAt
       FROM task_events events
       JOIN tasks ON tasks.id = events.task_id
      WHERE tasks.deleted_at IS NULL
       ORDER BY events.created_at`,
  );
}

function nextDueDate(value: string | null, rule: Task["recurrenceRule"]): string | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (rule === "daily") date.setDate(date.getDate() + 1);
  if (rule === "weekly") date.setDate(date.getDate() + 7);
  if (rule === "monthly") date.setMonth(date.getMonth() + 1);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export async function createRecurringSuccessor(task: Task): Promise<boolean> {
  if (task.recurrenceRule === "none") return false;
  const db = await database();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const rows = await db.select<Array<{ nextPosition: number }>>(
    "SELECT COALESCE(MAX(position), 0) + 1000 AS nextPosition FROM tasks WHERE column_id = 'ready'",
  );
  await db.execute(
    `INSERT INTO tasks (
       id, column_id, project_id, title, description, due_date, priority, position,
       completed_at, started_at, blocked_reason, blocked_since, recurrence_rule,
       created_at, updated_at
     ) VALUES ($1, 'ready', $2, $3, $4, $5, $6, $7,
               NULL, NULL, NULL, NULL, $8, $9, $9)`,
    [id, task.projectId, task.title, task.description, nextDueDate(task.dueDate, task.recurrenceRule), task.priority, rows[0]?.nextPosition ?? 1000, task.recurrenceRule, now],
  );
  await db.execute(
    "INSERT INTO task_events (task_id, from_status, to_status, created_at) VALUES ($1, NULL, 'ready', $2)",
    [id, now],
  );
  for (const [index, item] of task.checklist.entries()) {
    await db.execute(
      `INSERT INTO task_checklist_items (id, task_id, text, completed, position)
       VALUES ($1, $2, $3, 0, $4)`,
      [crypto.randomUUID(), id, item.text, (index + 1) * 1000],
    );
  }
  for (const tag of task.tags) {
    await db.execute("INSERT INTO task_tags (task_id, tag_id) VALUES ($1, $2)", [id, tag.id]);
  }
  return true;
}
