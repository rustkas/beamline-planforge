import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { DbClient } from "./db";

type Migration = {
  version: string;
  sql: string;
};

async function load_migrations(): Promise<Migration[]> {
  const dir = path.resolve(process.cwd(), "src", "storage", "migrations");
  const entries = await readdir(dir);
  const migrations: Migration[] = [];

  for (const name of entries) {
    if (!name.endsWith(".sql")) continue;
    const version = name.split("_")[0];
    const sql = await readFile(path.join(dir, name), "utf8");
    migrations.push({ version, sql });
  }

  return migrations.sort((a, b) => a.version.localeCompare(b.version));
}

export async function run_migrations(db: DbClient): Promise<void> {
  const migrations = await load_migrations();
  if (migrations.length === 0) return;

  await db`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  const applied = await db<{ version: string }[]>`SELECT version FROM schema_migrations`;
  const applied_set = new Set(applied.map((m) => m.version));

  for (const migration of migrations) {
    if (applied_set.has(migration.version)) continue;
    await db.unsafe(migration.sql);
    await db`INSERT INTO schema_migrations (version) VALUES (${migration.version})`;
  }
}
