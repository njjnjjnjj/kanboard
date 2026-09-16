UPDATE task_columns SET position = position + 10000;
UPDATE task_columns SET title = '收集箱', position = 1000 WHERE id = 'todo';
UPDATE task_columns SET title = '进行中', position = 4000 WHERE id = 'doing';
UPDATE task_columns SET title = '已完成', position = 7000 WHERE id = 'done';

INSERT OR IGNORE INTO task_columns (id, title, position) VALUES
  ('backlog', '待办池', 2000),
  ('ready', '就绪', 3000),
  ('verify', '待验证', 5000),
  ('blocked', '阻塞', 6000);

UPDATE tasks SET column_id = 'blocked' WHERE column_id = 'waiting';
DELETE FROM task_columns WHERE id = 'waiting';

ALTER TABLE task_columns ADD COLUMN wip_limit INTEGER;
UPDATE task_columns SET wip_limit = 2 WHERE id IN ('doing', 'verify');

ALTER TABLE tasks ADD COLUMN started_at TEXT;
ALTER TABLE tasks ADD COLUMN blocked_reason TEXT;
ALTER TABLE tasks ADD COLUMN blocked_since TEXT;

UPDATE tasks SET started_at = updated_at WHERE column_id = 'doing';
UPDATE tasks
   SET blocked_reason = 'other', blocked_since = updated_at
 WHERE column_id = 'blocked';

CREATE TABLE IF NOT EXISTS task_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_events_task_created
  ON task_events (task_id, created_at);

INSERT INTO task_events (task_id, from_status, to_status, created_at)
SELECT id, NULL, column_id, created_at FROM tasks;
