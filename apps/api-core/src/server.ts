import { Hono } from "hono";
import { cors } from "hono/cors";
import { validate_kitchen_state } from "./validation/schemas";
import { create_store } from "./store/store";
import { apply_patch, derive_render_model, validate_layout } from "./wasm/core_wasm";
import type { proposed_patch, violation } from "@planforge/plugin-sdk";

const store = create_store();

type ErrorResponse = { error: { code: string; message: string; details?: Record<string, unknown> } };

function error_response(code: string, message: string, details?: Record<string, unknown>): ErrorResponse {
  return { error: { code, message, details } };
}

function has_error_violations(violations: violation[]): boolean {
  return violations.some((v) => v.severity === "error");
}

function extract_violations(payload: unknown): violation[] {
  if (payload && typeof payload === "object" && "violations" in payload) {
    const list = (payload as { violations?: violation[] }).violations;
    if (Array.isArray(list)) return list;
  }
  return [];
}

export function create_app(): Hono {
  const app = new Hono();

  app.use("*", cors({ origin: "*" }));
  app.use("*", async (c, next) => {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    console.log(`${c.req.method} ${c.req.path} ${c.res.status} ${ms}ms`);
  });

  app.get("/health", (c) => c.json({ ok: true, version: "0.1.0" }));

  app.post("/projects", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch (error) {
      return c.json(error_response("json.invalid", "Invalid JSON body"), 400);
    }

    const schema = validate_kitchen_state(body);
    if (!schema.ok) {
      return c.json(error_response("schema.invalid", "KitchenState schema invalid", { errors: schema.errors }), 400);
    }

    const validation = (await validate_layout(body)) as { violations: violation[] };
    if (has_error_violations(validation.violations)) {
      return c.json({ violations: validation.violations }, 422);
    }

    const { project, revision } = store.create_project(body, { source: "user" });
    return c.json({ project_id: project.project_id, revision_id: revision.revision_id, violations: [] });
  });

  app.get("/projects/:project_id", (c) => {
    const project = store.get_project(c.req.param("project_id"));
    if (!project) {
      return c.json(error_response("project.not_found", "Project not found"), 404);
    }
    return c.json({
      project_id: project.project_id,
      latest_revision_id: project.latest_revision_id,
      created_at: project.created_at
    });
  });

  app.get("/projects/:project_id/revisions", (c) => {
    const project_id = c.req.param("project_id");
    const project = store.get_project(project_id);
    if (!project) {
      return c.json(error_response("project.not_found", "Project not found"), 404);
    }
    const revisions = store.list_revisions(project_id).map((rev) => ({
      revision_id: rev.revision_id,
      created_at: rev.created_at,
      parent_revision_id: rev.parent_revision_id ?? null
    }));
    return c.json(revisions);
  });

  app.get("/projects/:project_id/revisions/:revision_id", (c) => {
    const { project_id, revision_id } = c.req.param();
    const revision = store.get_revision(project_id, revision_id);
    if (!revision) {
      return c.json(error_response("revision.not_found", "Revision not found"), 404);
    }
    return c.json({ project_id, revision_id, kitchen_state: revision.kitchen_state });
  });

  app.post("/projects/:project_id/revisions/:revision_id/patch", async (c) => {
    const { project_id, revision_id } = c.req.param();
    const revision = store.get_revision(project_id, revision_id);
    if (!revision) {
      return c.json(error_response("revision.not_found", "Revision not found"), 404);
    }

    let patch: proposed_patch;
    try {
      patch = (await c.req.json()) as proposed_patch;
    } catch (error) {
      return c.json(error_response("json.invalid", "Invalid patch JSON"), 400);
    }

    const patched = await apply_patch(revision.kitchen_state, patch);
    const patch_violations = extract_violations(patched as unknown);
    if (patch_violations.length > 0) {
      return c.json({ violations: patch_violations }, 422);
    }

    const schema = validate_kitchen_state(patched);
    if (!schema.ok) {
      return c.json(error_response("schema.invalid", "KitchenState schema invalid", { errors: schema.errors }), 400);
    }

    const validation = (await validate_layout(patched)) as { violations: violation[] };
    if (has_error_violations(validation.violations)) {
      return c.json({ violations: validation.violations }, 422);
    }

    const new_revision = store.create_revision(project_id, patched, revision_id, { source: patch.source ?? "user" });
    if (!new_revision) {
      return c.json(error_response("project.not_found", "Project not found"), 404);
    }

    return c.json({ new_revision_id: new_revision.revision_id, violations: [] });
  });

  app.post("/projects/:project_id/revisions/:revision_id/render", async (c) => {
    const { project_id, revision_id } = c.req.param();
    const revision = store.get_revision(project_id, revision_id);
    if (!revision) {
      return c.json(error_response("revision.not_found", "Revision not found"), 404);
    }

    let body: { quality?: "draft" | "quality" } = {};
    try {
      body = (await c.req.json()) as { quality?: "draft" | "quality" };
    } catch {
      body = {};
    }

    const quality = body.quality ?? "draft";
    const render_model = await derive_render_model(revision.kitchen_state, quality);
    const violations = extract_violations(render_model as unknown);
    if (violations.length > 0) {
      return c.json({ violations }, 422);
    }

    return c.json(render_model);
  });

  app.post("/projects/:project_id/revisions/:revision_id/quote", (c) => {
    const { project_id, revision_id } = c.req.param();
    const revision = store.get_revision(project_id, revision_id);
    if (!revision) {
      return c.json(error_response("revision.not_found", "Revision not found"), 404);
    }

    const state = revision.kitchen_state as any;
    const objects = state?.layout?.objects ?? [];
    const unit_price = 100;
    const qty = Array.isArray(objects) ? objects.length : 0;
    const total = qty * unit_price;
    const ruleset_version = state?.project?.ruleset_version ?? "pricing_ruleset_0.1.0";

    return c.json({
      ruleset_version,
      currency: "USD",
      total,
      items: [
        {
          code: "module.base",
          qty,
          unit_price,
          amount: total
        }
      ]
    });
  });

  return app;
}
