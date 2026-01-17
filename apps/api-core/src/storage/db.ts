import postgres from "postgres";

export type DbClient = ReturnType<typeof postgres>;

export function connect_db(): DbClient {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required for database store");
  }
  return postgres(url, { max: 5 });
}
