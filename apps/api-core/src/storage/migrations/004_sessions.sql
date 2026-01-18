CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL,
  last_revision_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session_messages (
  message_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  ts BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS session_messages_session_idx ON session_messages(session_id);

CREATE TABLE IF NOT EXISTS session_proposals (
  proposal_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  revision_id TEXT NOT NULL,
  variant_index INTEGER NOT NULL,
  patch JSONB NOT NULL,
  rationale JSONB NOT NULL,
  metrics JSONB,
  explanation_text TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS session_proposals_session_idx ON session_proposals(session_id);
