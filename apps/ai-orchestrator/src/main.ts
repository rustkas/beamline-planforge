import { Hono } from "hono";
import { cors } from "hono/cors";
import { create_api_client } from "./api_core_client";
import { run_turn } from "./agent/run_turn";
import fixture from "./assets/kitchen_state.fixture.json";
import { build_variants } from "./agent/proposals";
import type { violation } from "@planforge/plugin-sdk";
import { plan_patch } from "./agent/planner";
import { build_explanations, summarize_violations } from "./agent/refine";

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
  const api = create_api_client(api_base_url);
  const created = await api.create_session(body.project_id, body.revision_id);
  if (!created.ok) {
    return c.json({ error: created.error }, 502);
  }
  return c.json(created.data);
});

app.post("/sessions/:session_id/turn", async (c) => {
  const session_id = c.req.param("session_id");
  const body = (await c.req.json()) as { command?: string };
  if (!body.command) {
    return c.json({ error: { code: "command.missing", message: "command required" } }, 400);
  }

  const api = create_api_client(api_base_url);
  const session_res = await api.get_session(session_id);
  if (!session_res.ok) {
    return c.json({ error: session_res.error }, 404);
  }
  const session = session_res.data.session;
  const result = await run_turn(
    api,
    { session_id: session.session_id, project_id: session.project_id, last_revision_id: session.last_revision_id },
    body.command
  );
  return c.json(result);
});

app.post("/sessions/:session_id/proposals", async (c) => {
  const session_id = c.req.param("session_id");
  const api = create_api_client(api_base_url);
  const session_res = await api.get_session(session_id);
  if (!session_res.ok) {
    return c.json({ error: session_res.error }, 404);
  }
  const session = session_res.data.session;
  const revision = await api.get_revision(session.project_id, session.last_revision_id);
  if (!revision.ok) {
    return c.json({ error: revision.error }, 502);
  }

  const kitchen_state = revision.data.kitchen_state as any;
  const variants = build_variants(kitchen_state);
  const proposals = [];

  for (const variant of variants) {
    const preview = await api.preview_patch(session.project_id, session.last_revision_id, variant.patch);
    const violations = preview.ok ? (preview.data.violations as violation[]) : [];
    const codes = violations.map((v) => v.code).join(", ");
    const explanation_text =
      violations.length === 0 ? "Validated with no blocking violations." : `Violations: ${codes}`;
    proposals.push({
      variant_index: variant.variant_index,
      patch: variant.patch as unknown as Record<string, unknown>,
      rationale: { ...variant.rationale, violations: violations.map((v) => v.code) },
      metrics: { ...variant.metrics, violation_count: violations.length },
      explanation_text
    });
  }

  const stored = await api.add_proposals(session_id, session.last_revision_id, proposals);
  if (!stored.ok) {
    return c.json({ error: stored.error }, 502);
  }
  return c.json(stored.data);
});

app.post("/sessions/:session_id/refine/preview", async (c) => {
  const session_id = c.req.param("session_id");
  const body = (await c.req.json()) as { command?: string };
  if (!body.command) {
    return c.json({ error: { code: "command.missing", message: "command required" } }, 400);
  }

  const api = create_api_client(api_base_url);
  const session_res = await api.get_session(session_id);
  if (!session_res.ok) {
    return c.json({ error: session_res.error }, 404);
  }
  const session = session_res.data.session;
  const revision = await api.get_revision(session.project_id, session.last_revision_id);
  if (!revision.ok) {
    return c.json({ error: revision.error }, 502);
  }

  const plan = plan_patch(body.command, revision.data.kitchen_state);
  if (!plan.ok) {
    return c.json({ ok: false, message: plan.error }, 200);
  }

  const preview = await api.preview_patch(session.project_id, session.last_revision_id, plan.patch);
  if (!preview.ok) {
    return c.json({ ok: false, message: preview.error.message }, 200);
  }
  const violations = preview.data.violations as violation[];
  const summary = summarize_violations(violations);
  const explanations = build_explanations(body.command);

  return c.json({
    ok: true,
    proposed_patch: plan.patch,
    explanations,
    violations,
    violations_summary: summary,
    message: plan.message
  });
});

app.post("/sessions/:session_id/refine/apply", async (c) => {
  const session_id = c.req.param("session_id");
  const body = (await c.req.json()) as { command?: string };
  if (!body.command) {
    return c.json({ error: { code: "command.missing", message: "command required" } }, 400);
  }

  const api = create_api_client(api_base_url);
  const session_res = await api.get_session(session_id);
  if (!session_res.ok) {
    return c.json({ error: session_res.error }, 404);
  }
  const session = session_res.data.session;
  const result = await run_turn(
    api,
    { session_id: session.session_id, project_id: session.project_id, last_revision_id: session.last_revision_id },
    body.command
  );
  return c.json(result);
});

app.post("/demo/session", async (c) => {
  const api = create_api_client(api_base_url);
  const created = await api.create_project(fixture);
  if (!created.ok) {
    return c.json({ error: created.error }, 500);
  }
  const session = await api.create_session(created.data.project_id, created.data.revision_id);
  if (!session.ok) {
    return c.json({ error: session.error }, 502);
  }
  return c.json({
    session_id: session.data.session_id,
    project_id: created.data.project_id,
    revision_id: created.data.revision_id
  });
});

Bun.serve({
  port,
  fetch: app.fetch
});

console.log(`ai-orchestrator listening on http://localhost:${port}`);
