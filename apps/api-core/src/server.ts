import { Hono } from "hono";
import { cors } from "hono/cors";
import { validate_kitchen_state } from "./validation/schemas";
import { create_store, type Store } from "./store/store";
import { apply_patch, derive_render_model, validate_layout } from "./wasm/core_wasm";
import type { proposed_patch, violation } from "@planforge/plugin-sdk";
import { list_catalog_items, CATALOG_VERSION, MODULES_CATALOG_VERSION } from "./catalog/catalog";
import { apply_pricing_hooks } from "./pricing/pipeline";
import { compute_quote, PRICING_RULESET_VERSION } from "./pricing/ruleset";
import { list_rulesets } from "./pricing/ruleset_store";
import { resolve_wasi_plugin_path } from "./wasi/registry";
import { run_wasi_validate, type WasiError } from "./wasi/runner";

let store: Store;

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

export async function create_app(): Promise<Hono> {
  const app = new Hono();
  store = await create_store();

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

    const { project, revision } = await store.create_project(body, { source: "user" });
    return c.json({ project_id: project.project_id, revision_id: revision.revision_id, violations: [] });
  });

  app.get("/projects/:project_id", async (c) => {
    const project = await store.get_project(c.req.param("project_id"));
    if (!project) {
      return c.json(error_response("project.not_found", "Project not found"), 404);
    }
    return c.json({
      project_id: project.project_id,
      latest_revision_id: project.latest_revision_id,
      created_at: project.created_at
    });
  });

  app.get("/projects/:project_id/revisions", async (c) => {
    const project_id = c.req.param("project_id");
    const project = await store.get_project(project_id);
    if (!project) {
      return c.json(error_response("project.not_found", "Project not found"), 404);
    }
    const revisions = (await store.list_revisions(project_id)).map((rev) => ({
      revision_id: rev.revision_id,
      created_at: rev.created_at,
      parent_revision_id: rev.parent_revision_id ?? null,
      content_hash: rev.content_hash
    }));
    return c.json(revisions);
  });

  app.get("/projects/:project_id/revisions/:revision_id", async (c) => {
    const { project_id, revision_id } = c.req.param();
    const revision = await store.get_revision(project_id, revision_id);
    if (!revision) {
      return c.json(error_response("revision.not_found", "Revision not found"), 404);
    }
    return c.json({
      project_id,
      revision_id,
      content_hash: revision.content_hash,
      kitchen_state: revision.kitchen_state
    });
  });

  app.post("/projects/:project_id/revisions/:revision_id/patch", async (c) => {
    const { project_id, revision_id } = c.req.param();
    const revision = await store.get_revision(project_id, revision_id);
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

    const new_revision = await store.create_revision(project_id, patched, revision_id, { source: patch.source ?? "user" });
    if (!new_revision) {
      return c.json(error_response("project.not_found", "Project not found"), 404);
    }

    return c.json({ new_revision_id: new_revision.revision_id, violations: [] });
  });

  app.post("/projects/:project_id/revisions/:revision_id/render", async (c) => {
    const { project_id, revision_id } = c.req.param();
    const revision = await store.get_revision(project_id, revision_id);
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

  app.post("/quotes", async (c) => {
    let body: { project_id?: string; revision_id?: string; ruleset_version?: string; pricing_context?: Record<string, string> };
    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      return c.json(error_response("json.invalid", "Invalid JSON body"), 400);
    }

    if (!body?.project_id || !body?.revision_id) {
      return c.json(error_response("quote.invalid_request", "project_id and revision_id are required"), 400);
    }

    const { project_id, revision_id } = body;
    const revision = await store.get_revision(project_id, revision_id);
    if (!revision) {
      return c.json(error_response("revision.not_found", "Revision not found"), 404);
    }

    const state = revision.kitchen_state as any;
    const ruleset_version = body.ruleset_version ?? state?.project?.ruleset_version ?? PRICING_RULESET_VERSION;
    if (state?.project?.ruleset_version && ruleset_version !== state.project.ruleset_version) {
      return c.json(
        error_response("pricing.ruleset_mismatch", "Ruleset version mismatch", {
          ruleset_version,
          expected: state.project.ruleset_version
        }),
        400
      );
    }

    const quote_res = compute_quote(revision.kitchen_state, ruleset_version);
    if (!quote_res.ok) {
      return c.json(error_response(quote_res.error.code, quote_res.error.message, quote_res.error.details), 422);
    }

    const merged = await apply_pricing_hooks({
      project_id,
      revision_id,
      kitchen_state: revision.kitchen_state,
      base_quote: quote_res.quote,
      pricing_context: body.pricing_context
    });

    const stored = await store.create_quote(project_id, revision_id, {
      ...merged.quote,
      diagnostics: merged.diagnostics
    });
    if (!stored) {
      return c.json(error_response("project.not_found", "Project not found"), 404);
    }

    return c.json(stored);
  });

  app.get("/quotes/:quote_id", async (c) => {
    const quote_id = c.req.param("quote_id");
    const quote = await store.find_quote(quote_id);
    if (!quote) {
      return c.json(error_response("quote.not_found", "Quote not found"), 404);
    }
    return c.json(quote);
  });

  app.post("/projects/:project_id/revisions/:revision_id/quote", async (c) => {
    const { project_id, revision_id } = c.req.param();
    return app.fetch(
      new Request(new URL("/quotes", c.req.url), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ project_id, revision_id })
      })
    );
  });

  app.get("/catalog/modules", (c) =>
    c.json({ version: MODULES_CATALOG_VERSION, items: list_catalog_items("module") })
  );

  app.get("/catalog/items", (c) => {
    const kind = c.req.query("kind") as "module" | "material" | "appliance" | null;
    const items = list_catalog_items(kind ?? undefined);
    return c.json({ version: CATALOG_VERSION, items });
  });

  app.get("/catalog/versions", (c) =>
    c.json({ catalog_version: CATALOG_VERSION, modules_version: MODULES_CATALOG_VERSION })
  );

  app.get("/pricing/rulesets/:version", (c) => {
    const version = c.req.param("version");
    const ruleset = list_rulesets().find((r) => r.version === version);
    if (!ruleset) {
      return c.json(error_response("pricing.ruleset_not_found", "Ruleset not found"), 404);
    }
    return c.json(ruleset);
  });

  app.post("/wasi/validate", async (c) => {
    let body: { plugin_id?: string; kitchen_state?: unknown; mode?: "drag" | "full" };
    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      return c.json(error_response("json.invalid", "Invalid JSON body"), 400);
    }

    if (!body?.plugin_id || !body.kitchen_state) {
      return c.json(error_response("wasi.invalid_request", "plugin_id and kitchen_state required"), 400);
    }

    const schema = validate_kitchen_state(body.kitchen_state);
    if (!schema.ok) {
      return c.json(error_response("schema.invalid", "KitchenState schema invalid", { errors: schema.errors }), 400);
    }

    const wasm_path = await resolve_wasi_plugin_path(body.plugin_id);
    if (!wasm_path) {
      return c.json(error_response("wasi.plugin_not_found", "WASI plugin not found"), 404);
    }

    try {
      const output = await run_wasi_validate({
        wasm_path,
        input: { kitchen_state: body.kitchen_state, mode: body.mode ?? "full" },
        timeout_ms: Number(process.env.WASI_TIMEOUT_MS ?? 2000)
      });
      return c.json(output);
    } catch (error) {
      const err = error as WasiError;
      return c.json(error_response(err.code ?? "wasi.error", err.message ?? "WASI error", err.details), 502);
    }
  });

  app.post("/projects/:project_id/revisions/:revision_id/orders", async (c) => {
    const { project_id, revision_id } = c.req.param();
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(error_response("json.invalid", "Invalid JSON body"), 400);
    }
    return app.fetch(
      new Request(new URL("/orders", c.req.url), {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": c.req.header("idempotency-key") ?? "" },
        body: JSON.stringify({ ...(body as Record<string, unknown>), project_id, revision_id })
      })
    );
  });

  app.get("/projects/:project_id/orders/:order_id", async (c) => {
    const { project_id, order_id } = c.req.param();
    const order = await store.get_order(project_id, order_id);
    if (!order) {
      return c.json(error_response("order.not_found", "Order not found"), 404);
    }
    return c.json(order);
  });

  app.post("/orders", async (c) => {
    let body: {
      project_id?: string;
      revision_id?: string;
      quote_id?: string;
      customer?: { name?: string; email?: string; phone?: string };
      delivery?: { line1?: string; city?: string; country?: string };
    };
    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      return c.json(error_response("json.invalid", "Invalid JSON body"), 400);
    }

    if (!body?.project_id || !body?.revision_id || !body?.quote_id) {
      return c.json(error_response("order.invalid_request", "project_id, revision_id, quote_id are required"), 400);
    }

    const project_id = body.project_id;
    const revision_id = body.revision_id;

    const revision = await store.get_revision(project_id, revision_id);
    if (!revision) {
      return c.json(error_response("revision.not_found", "Revision not found"), 404);
    }

    const quote = (await store.get_quote(project_id, body.quote_id)) ?? (await store.find_quote(body.quote_id));
    if (!quote) {
      return c.json(error_response("quote.not_found", "Quote not found"), 404);
    }
    if (quote.revision_id !== revision_id) {
      return c.json(
        error_response("quote.revision_mismatch", "Quote does not match revision", {
          quote_revision_id: quote.revision_id
        }),
        400
      );
    }
    if (!quote.ruleset_version) {
      return c.json(error_response("quote.invalid", "Quote missing ruleset_version"), 400);
    }

    const customer = body.customer;
    const delivery = body.delivery;
    if (!customer?.name || !customer?.email || !delivery?.line1 || !delivery?.city || !delivery?.country) {
      return c.json(error_response("order.invalid", "Missing customer or delivery fields"), 400);
    }

    const idempotency_key = c.req.header("idempotency-key") ?? undefined;
    const order = await store.create_order({
      project_id,
      revision_id,
      quote,
      customer: { name: customer.name, email: customer.email, phone: customer.phone },
      delivery: { line1: delivery.line1, city: delivery.city, country: delivery.country },
      idempotency_key: idempotency_key && idempotency_key.length > 0 ? idempotency_key : undefined
    });

    if (!order) {
      return c.json(error_response("order.create_failed", "Order could not be created"), 500);
    }

    return c.json({ order_id: order.order_id, status: order.status });
  });

  app.get("/orders/:order_id", async (c) => {
    const order = await store.find_order(c.req.param("order_id"));
    if (!order) {
      return c.json(error_response("order.not_found", "Order not found"), 404);
    }
    return c.json(order);
  });

  return app;
}
