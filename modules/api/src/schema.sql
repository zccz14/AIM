CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  project_path TEXT NOT NULL UNIQUE,
  global_provider_id TEXT NOT NULL,
  global_model_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  task_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  task_spec TEXT NOT NULL,
  project_id TEXT NOT NULL,
  project_path TEXT NOT NULL,
  developer_provider_id TEXT NOT NULL,
  developer_model_id TEXT NOT NULL,
  session_id TEXT,
  worktree_path TEXT,
  pull_request_url TEXT,
  dependencies TEXT NOT NULL,
  result TEXT NOT NULL DEFAULT '',
  done INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS tasks_unfinished_session_id_unique
ON tasks (session_id)
WHERE done = 0 AND session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS dimensions (
  id TEXT NOT NULL PRIMARY KEY,
  project_path TEXT NOT NULL,
  name TEXT NOT NULL,
  goal TEXT NOT NULL,
  evaluation_method TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dimension_evaluations (
  id TEXT NOT NULL PRIMARY KEY,
  dimension_id TEXT NOT NULL,
  project_path TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  evaluator_model TEXT NOT NULL,
  score INTEGER NOT NULL,
  evaluation TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (dimension_id) REFERENCES dimensions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS manager_reports (
  project_path TEXT NOT NULL,
  report_id TEXT NOT NULL,
  content_markdown TEXT NOT NULL,
  baseline_ref TEXT,
  source_metadata TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_path, report_id)
);

CREATE TABLE IF NOT EXISTS task_write_bulks (
  project_path TEXT NOT NULL,
  bulk_id TEXT NOT NULL,
  content_markdown TEXT NOT NULL,
  entries TEXT NOT NULL,
  baseline_ref TEXT,
  source_metadata TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_path, bulk_id)
);
