ALTER TABLE tasks ADD COLUMN recurrence_rule TEXT NOT NULL DEFAULT 'none'
  CHECK (recurrence_rule IN ('none', 'daily', 'weekly', 'monthly'));
ALTER TABLE tasks ADD COLUMN focus_started_at TEXT;
ALTER TABLE tasks ADD COLUMN focus_elapsed_seconds INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS task_checklist_items (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  text TEXT NOT NULL CHECK (length(trim(text)) > 0),
  completed INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_checklist_task_position
  ON task_checklist_items (task_id, position);
