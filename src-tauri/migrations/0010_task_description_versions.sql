ALTER TABLE tasks ADD COLUMN description_summary TEXT NOT NULL DEFAULT '编辑任务说明';
ALTER TABLE tasks ADD COLUMN description_source TEXT NOT NULL DEFAULT 'user';

CREATE TABLE task_description_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  description TEXT NOT NULL,
  summary TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(task_id, version)
);

INSERT INTO task_description_versions (task_id, version, description, summary, source, created_at)
SELECT id, 1, description, '迁移前任务说明', 'migration', updated_at FROM tasks;

CREATE TRIGGER task_description_initial AFTER INSERT ON tasks
BEGIN
  INSERT INTO task_description_versions (task_id, version, description, summary, source, created_at)
  VALUES (NEW.id, 1, NEW.description, '初始版本', 'user', NEW.created_at);
END;

CREATE TRIGGER task_description_changed AFTER UPDATE OF description ON tasks
WHEN NEW.description IS NOT OLD.description
BEGIN
  INSERT INTO task_description_versions (task_id, version, description, summary, source, created_at)
  VALUES (NEW.id, (SELECT COALESCE(MAX(version), 0) + 1 FROM task_description_versions WHERE task_id = NEW.id),
    NEW.description, NEW.description_summary, NEW.description_source, NEW.updated_at);
END;

CREATE TABLE task_activity_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_task_activity_notes ON task_activity_notes(task_id, id);
