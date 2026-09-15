CREATE TABLE IF NOT EXISTS task_columns (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  position INTEGER NOT NULL UNIQUE
);

INSERT OR IGNORE INTO task_columns (id, title, position) VALUES
  ('todo', '待处理', 1000),
  ('doing', '进行中', 2000),
  ('waiting', '等待', 3000),
  ('done', '已完成', 4000);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  column_id TEXT NOT NULL REFERENCES task_columns(id),
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  description TEXT NOT NULL DEFAULT '',
  due_date TEXT,
  priority TEXT NOT NULL DEFAULT 'none' CHECK (priority IN ('none', 'high')),
  position INTEGER NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_column_position
  ON tasks (column_id, position);
