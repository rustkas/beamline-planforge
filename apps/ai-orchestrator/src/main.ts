import { Hono } from "hono";
import { cors } from "hono/cors";
import { create_api_client } from "./api_core_client";
import { create_session, get_session } from "./session_store";
import { run_turn } from "./agent/run_turn";
import fixture from "./assets/kitchen_state.fixture.json";

const port = Number(process.env.ORCHESTRATOR_PORT ?? 3002);
const api_base_url = process.env.API_CORE_BASE_URL ?? "http://localhost:3001";

const app = new Hono();
app.use("*", cors({ origin: "*" }));

app.get("/health", (c) => c.json({ ok: true, version: "0.1.0" }));

app.post("/sessions", async (c) => {
  const body = (await c.req.json()) as { project_id?: string; revision_id?: string };
  if (!body.project_id || !body.revision_id) {
    return c.json({ error: { code: "session.missing_fields", message: "project_id and revision_id required" } }, 400);
  }
  const session = create_session(body.project_id, body.revision_id);
  return c.json({ session_id: session.session_id });
});

app.post("/sessions/:session_id/turn", async (c) => {
  const session_id = c.req.param("session_id");
  const session = get_session(session_id);
  if (!session) {
    return c.json({ error: { code: "session.not_found", message: "Session not found" } }, 404);
  }
  const body = (await c.req.json()) as { command?: string };
  if (!body.command) {
    return c.json({ error: { code: "command.missing", message: "command required" } }, 400);
  }

  const api = create_api_client(api_base_url);
  const result = await run_turn(api, session_id, body.command);
  return c.json(result);
});

app.post("/demo/session", async (c) => {
  const api = create_api_client(api_base_url);
  const created = await api.create_project(fixture);
  if (!created.ok) {
    return c.json({ error: created.error }, 500);
  }
  const session = create_session(created.data.project_id, created.data.revision_id);
  return c.json({
    session_id: session.session_id,
    project_id: created.data.project_id,
    revision_id: created.data.revision_id
  });
});

Bun.serve({
  port,
  fetch: app.fetch
});

console.log(`ai-orchestrator listening on http://localhost:${port}`);
