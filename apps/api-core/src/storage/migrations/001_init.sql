CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
  project_id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL,
  latest_revision_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS revisions (
  revision_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL,
  kitchen_state JSONB NOT NULL,
  content_hash TEXT NOT NULL,
  parent_revision_id TEXT,
  meta JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS revisions_project_idx ON revisions(project_id);

CREATE TABLE IF NOT EXISTS quotes (
  quote_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  revision_id TEXT NOT NULL REFERENCES revisions(revision_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL,
  ruleset_version TEXT NOT NULL,
  currency TEXT NOT NULL,
  total JSONB NOT NULL,
  items JSONB NOT NULL,
  diagnostics JSONB,
  meta JSONB
);

CREATE INDEX IF NOT EXISTS quotes_project_idx ON quotes(project_id);

CREATE TABLE IF NOT EXISTS orders (
  order_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  revision_id TEXT NOT NULL REFERENCES revisions(revision_id) ON DELETE CASCADE,
  quote_id TEXT NOT NULL REFERENCES quotes(quote_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL,
  quote JSONB NOT NULL,
  idempotency_key TEXT UNIQUE,
  customer JSONB NOT NULL,
  delivery JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS orders_project_idx ON orders(project_id);

CREATE TABLE IF NOT EXISTS catalog_items (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  price JSONB NOT NULL,
  catalog_version TEXT NOT NULL
);
