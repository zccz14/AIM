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
  session_id TEXT,
  worktree_path TEXT,
  pull_request_url TEXT,
  dependencies TEXT NOT NULL,
  result TEXT NOT NULL DEFAULT '',
  source_metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES opencode_sessions(session_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS tasks_project_id_index
ON tasks (project_id);

CREATE UNIQUE INDEX IF NOT EXISTS tasks_session_id_unique
ON tasks (session_id)
WHERE session_id IS NOT NULL;

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

CREATE TABLE IF NOT EXISTS director_clarifications (
  id TEXT NOT NULL PRIMARY KEY,
  project_id TEXT NOT NULL,
  dimension_id TEXT,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (dimension_id) REFERENCES dimensions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS director_clarifications_project_id_index
ON director_clarifications (project_id);

CREATE TABLE IF NOT EXISTS manager_states (
  project_id TEXT PRIMARY KEY,
  commit_sha TEXT NOT NULL,
  dimension_ids_json TEXT NOT NULL,
  session_id TEXT,
  state TEXT NOT NULL,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES opencode_sessions(session_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS opencode_sessions (
  session_id TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  value TEXT,
  reason TEXT,
  continue_prompt TEXT,
  provider_id TEXT,
  model_id TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  cached_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  reasoning_tokens INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS coordinator_states (
  project_id TEXT PRIMARY KEY,
  commit_sha TEXT NOT NULL,
  active_task_count INTEGER NOT NULL,
  threshold INTEGER NOT NULL,
  planning_input_hash TEXT NOT NULL,
  session_id TEXT,
  state TEXT NOT NULL,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES opencode_sessions(session_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS optimizer_lane_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  lane_name TEXT NOT NULL,
  event TEXT NOT NULL,
  summary TEXT NOT NULL,
  session_id TEXT,
  task_id TEXT,
  timestamp TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS optimizer_lane_events_project_lane_timestamp_index
ON optimizer_lane_events (project_id, lane_name, timestamp);

CREATE INDEX IF NOT EXISTS optimizer_lane_events_project_timestamp_index
ON optimizer_lane_events (project_id, timestamp);
