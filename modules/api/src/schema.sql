DROP TABLE IF EXISTS task_write_bulks;

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  git_origin_url TEXT NOT NULL UNIQUE,
  global_provider_id TEXT NOT NULL,
  global_model_id TEXT NOT NULL,
  optimizer_enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  task_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  task_spec TEXT NOT NULL,
  project_id TEXT NOT NULL,
  developer_provider_id TEXT NOT NULL,
  developer_model_id TEXT NOT NULL,
  session_id TEXT,
  worktree_path TEXT,
  pull_request_url TEXT,
  dependencies TEXT NOT NULL,
  result TEXT NOT NULL DEFAULT '',
  source_metadata TEXT NOT NULL DEFAULT '{}',
  done INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS tasks_project_id_index
ON tasks (project_id);

CREATE UNIQUE INDEX IF NOT EXISTS tasks_unfinished_session_id_unique
ON tasks (session_id)
WHERE done = 0 AND session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS dimensions (
  id TEXT NOT NULL PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  goal TEXT NOT NULL,
  evaluation_method TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS dimensions_project_id_index
ON dimensions (project_id);

CREATE TABLE IF NOT EXISTS dimension_evaluations (
  id TEXT NOT NULL PRIMARY KEY,
  dimension_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  evaluator_model TEXT NOT NULL,
  score INTEGER NOT NULL,
  evaluation TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (dimension_id) REFERENCES dimensions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS dimension_evaluations_project_id_index
ON dimension_evaluations (project_id);

CREATE UNIQUE INDEX IF NOT EXISTS dimension_evaluations_project_commit_dimension_unique
ON dimension_evaluations (project_id, commit_sha, dimension_id);

CREATE TABLE IF NOT EXISTS manager_states (
  project_id TEXT PRIMARY KEY,
  commit_sha TEXT NOT NULL,
  dimension_ids_json TEXT NOT NULL,
  session_id TEXT,
  state TEXT NOT NULL,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS opencode_sessions (
  session_id TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  value TEXT,
  reason TEXT,
  continue_prompt TEXT,
  provider_id TEXT,
  model_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS optimizer_lane_states (
  project_id TEXT NOT NULL,
  lane_name TEXT NOT NULL,
  session_id TEXT,
  last_error TEXT,
  last_scan_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_id, lane_name),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
