ALTER TABLE task_description_versions ADD COLUMN previous_description TEXT NOT NULL DEFAULT '';

-- Preserve the real pre-edit body before hiding older non-Agent records.
UPDATE task_description_versions AS revision
SET previous_description = COALESCE((
  SELECT previous.description FROM task_description_versions AS previous
  WHERE previous.task_id = revision.task_id AND previous.version < revision.version
  ORDER BY previous.version DESC LIMIT 1
), '');

DROP TRIGGER task_description_initial;
DROP TRIGGER task_description_changed;

CREATE TRIGGER task_description_changed AFTER UPDATE OF description ON tasks
WHEN NEW.description IS NOT OLD.description AND NEW.description_source = 'agent'
BEGIN
  INSERT INTO task_description_versions (
    task_id, version, description, previous_description, summary, source, created_at
  ) VALUES (
    NEW.id,
    (SELECT COALESCE(MAX(version), 0) + 1 FROM task_description_versions WHERE task_id = NEW.id),
    NEW.description, OLD.description, NEW.description_summary, 'agent', NEW.updated_at
  );
END;
