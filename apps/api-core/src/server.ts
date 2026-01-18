import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  validate_kitchen_state,
  validate_wasi_export_input,
  validate_wasi_export_output,
  validate_wasi_pricing_input,
  validate_wasi_pricing_output,
  validate_wasi_validate_input,
  validate_wasi_validate_output
} from "./validation/schemas";
import { create_store, type Store } from "./store/store";
import { apply_patch, derive_render_model, validate_layout } from "./wasm/core_wasm";
import type { proposed_patch, violation } from "@planforge/plugin-sdk";
import { list_catalog_items, CATALOG_VERSION, MODULES_CATALOG_VERSION } from "./catalog/catalog";
import { apply_pricing_hooks } from "./pricing/pipeline";
import { compute_quote, PRICING_RULESET_VERSION } from "./pricing/ruleset";
import { list_rulesets } from "./pricing/ruleset_store";
import { get_wasi_plugin_info, load_wasi_manifest, resolve_wasi_plugin_path } from "./wasi/registry";
import { run_wasi_export, run_wasi_validate, type WasiError } from "./wasi/runner";
import { create_license_manager } from "./license/manager";
import { generate_exports } from "./exports/generate";
import { ExportStore } from "./exports/store";
import { read_asset } from "./assets/handler";

let store: Store;
let license_manager: Awaited<ReturnType<typeof create_license_manager>>;
let export_store: ExportStore;

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

function extract_token(authorization: string | undefined, fallback: string | null): string | null {
  if (authorization && authorization.startsWith("Bearer ")) {
    const token = authorization.slice("Bearer ".length).trim();
    return token.length > 0 ? token : fallback;
  }
  return fallback;
}

export async function create_app(): Promise<Hono> {
  const app = new Hono();
  store = await create_store();
  license_manager = await create_license_manager();
  export_store = new ExportStore();

  app.use("*", cors({ origin: "*" }));
  app.use("*", async (c, next) => {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    console.log(`${c.req.method} ${c.req.path} ${c.res.status} ${ms}ms`);
  });

  app.get("/health", (c) => c.json({ ok: true, version: "0.1.0" }));

  app.get("/assets/:asset_id", async (c) => {
    const asset_id = c.req.param("asset_id");
    const lod = Number(c.req.query("lod") ?? "0");
    const normalized_lod = Number.isFinite(lod) && lod >= 0 ? Math.floor(lod) : 0;
    const gltf_key = asset_id.startsWith("asset_") ? asset_id.slice("asset_".length) : asset_id;
    const rel = `models/${gltf_key}/lod${normalized_lod}.glb`;

    const result = await read_asset(rel, {
      if_none_match: c.req.header("if-none-match"),
      accept_encoding: c.req.header("accept-encoding")
    });
    if (!result.ok || !result.headers) {
      return c.json(error_response("asset.not_found", "Asset not found"), result.status);
    }
    if (result.status === 304) {
      return new Response(null, { status: 304, headers: result.headers });
    }
    if (!result.body) {
      return c.json(error_response("asset.not_found", "Asset not found"), 404);
    }
    return new Response(result.body, {
      status: 200,
      headers: result.headers
    });
  });

  app.get("/assets/*", async (c) => {
    const rel = c.req.path.replace(/^\/assets\//, "");
    const result = await read_asset(rel, {
      if_none_match: c.req.header("if-none-match"),
      accept_encoding: c.req.header("accept-encoding")
    });
    if (!result.ok || !result.headers) {
      return c.json(error_response("asset.not_found", "Asset not found"), result.status);
    }
    if (result.status === 304) {
      return new Response(null, { status: 304, headers: result.headers });
    }
    if (!result.body) {
      return c.json(error_response("asset.not_found", "Asset not found"), 404);
    }
    return new Response(result.body, {
      status: 200,
      headers: result.headers
    });
  });

  app.get("/license/status", async (c) => {
    const token = extract_token(c.req.header("authorization"), c.req.query("token"));
    const status = await license_manager.get_status(token);
    return c.json(status);
  });

  app.post("/license/refresh", async (c) => {
    let body: { token?: string } = {};
    try {
      body = (await c.req.json()) as { token?: string };
    } catch {
      body = {};
    }
    const token = body.token ?? extract_token(c.req.header("authorization"), null);
    const result = await license_manager.refresh(token ?? null);
    if (!result.ok) {
      return c.json(
        { ok: false, error: { code: result.error?.code ?? "license.refresh_failed", message: result.error?.message ?? "Refresh failed" } },
        502
      );
    }
    return c.json(result);
  });

  app.get("/license/trust-store", async (c) => {
    const store = await license_manager.get_trust_store();
    if (!store) {
      return c.json(error_response("license.trust_store_missing", "Trust store not available"), 404);
    }
    return c.json(store);
  });

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

  app.post("/projects/:project_id/revisions/:revision_id/preview", async (c) => {
    const { project_id, revision_id } = c.req.param();
    const revision = await store.get_revision(project_id, revision_id);
    if (!revision) {
      return c.json(error_response("revision.not_found", "Revision not found"), 404);
    }

    let patch: proposed_patch;
    try {
      patch = (await c.req.json()) as proposed_patch;
    } catch {
      return c.json(error_response("json.invalid", "Invalid patch JSON"), 400);
    }

    const patched = await apply_patch(revision.kitchen_state, patch);
    const patch_violations = extract_violations(patched as unknown);
    if (patch_violations.length > 0) {
      return c.json({ kitchen_state: null, violations: patch_violations }, 422);
    }

    const schema = validate_kitchen_state(patched);
    if (!schema.ok) {
      return c.json(error_response("schema.invalid", "KitchenState schema invalid", { errors: schema.errors }), 400);
    }

    const validation = (await validate_layout(patched)) as { violations: violation[] };
    return c.json({ kitchen_state: patched, violations: validation.violations ?? [] });
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

    const quote_res = compute_quote(revision.kitchen_state, ruleset_version, {
      region: body.pricing_context?.region
    });
    if (!quote_res.ok) {
      return c.json(error_response(quote_res.error.code, quote_res.error.message, quote_res.error.details), 422);
    }

    const pricing_plugin_id = process.env.WASI_PRICING_PLUGIN_ID ?? "";
    let wasi_pricing: { plugin_id: string; wasm_path: string; timeout_ms?: number } | undefined;
    if (pricing_plugin_id.length > 0) {
      const info = await get_wasi_plugin_info(pricing_plugin_id);
      if (!info || !info.allowed_hooks.includes("pricing")) {
        return c.json(error_response("wasi.plugin_not_found", "Pricing WASI plugin not available"), 404);
      }
      const wasm_path = await resolve_wasi_plugin_path(pricing_plugin_id);
      if (!wasm_path) {
        return c.json(error_response("wasi.plugin_not_found", "Pricing WASI plugin not found"), 404);
      }
      if (info.manifest.integrity.channel === "paid") {
        const token = extract_token(c.req.header("authorization"), null);
        const status = await license_manager.get_status(token);
        if (!status.allowed) {
          return c.json(
            error_response("license.denied", "License denied", {
              revoked: status.revoked,
              exp: status.exp,
              last_good_refresh_at: status.last_good_refresh_at
            }),
            403
          );
        }
      }
      wasi_pricing = {
        plugin_id: pricing_plugin_id,
        wasm_path,
        timeout_ms: Number(process.env.WASI_TIMEOUT_MS ?? 2000)
      };
    }

    const merged = await apply_pricing_hooks({
      project_id,
      revision_id,
      kitchen_state: revision.kitchen_state,
      base_quote: quote_res.quote,
      pricing_context: body.pricing_context,
      wasi_pricing
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

    const manifest = await load_wasi_manifest(body.plugin_id);
    if (!manifest) {
      return c.json(error_response("wasi.plugin_not_found", "WASI plugin manifest not found"), 404);
    }
    if (manifest.integrity.channel === "paid") {
      const token = extract_token(c.req.header("authorization"), c.req.query("token"));
      const status = await license_manager.get_status(token);
      if (!status.allowed) {
        return c.json(
          error_response("license.denied", "License denied", {
            revoked: status.revoked,
            exp: status.exp,
            last_good_refresh_at: status.last_good_refresh_at
          }),
          403
        );
      }
    }

    const input_validation = validate_wasi_validate_input({
      kitchen_state: body.kitchen_state,
      mode: body.mode ?? "full"
    });
    if (!input_validation.ok) {
      return c.json(error_response("schema.invalid", "WASI validate input invalid", { errors: input_validation.errors }), 400);
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
      const output_validation = validate_wasi_validate_output(output);
      if (!output_validation.ok) {
        return c.json(
          error_response("schema.invalid", "WASI validate output invalid", { errors: output_validation.errors }),
          502
        );
      }
      return c.json(output);
    } catch (error) {
      const err = error as WasiError;
      return c.json(error_response(err.code ?? "wasi.error", err.message ?? "WASI error", err.details), 502);
    }
  });

  app.post("/exports", async (c) => {
    let body: { project_id?: string; revision_id?: string; format?: "json" | "pdf" };
    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      return c.json(error_response("json.invalid", "Invalid JSON body"), 400);
    }

    if (!body?.project_id || !body?.revision_id) {
      return c.json(error_response("export.invalid_request", "project_id and revision_id are required"), 400);
    }

    const revision = await store.get_revision(body.project_id, body.revision_id);
    if (!revision) {
      return c.json(error_response("revision.not_found", "Revision not found"), 404);
    }

    const artifacts = await generate_exports({ kitchen_state: revision.kitchen_state });

    const export_plugin_id = process.env.WASI_EXPORT_PLUGIN_ID ?? "";
    if (export_plugin_id.length > 0) {
      const info = await get_wasi_plugin_info(export_plugin_id);
      if (!info || !info.allowed_hooks.includes("export")) {
        return c.json(error_response("wasi.plugin_not_found", "Export WASI plugin not available"), 404);
      }
      const wasm_path = await resolve_wasi_plugin_path(export_plugin_id);
      if (!wasm_path) {
        return c.json(error_response("wasi.plugin_not_found", "Export WASI plugin not found"), 404);
      }
      if (info.manifest.integrity.channel === "paid") {
        const token = extract_token(c.req.header("authorization"), null);
        const status = await license_manager.get_status(token);
        if (!status.allowed) {
          return c.json(
            error_response("license.denied", "License denied", {
              revoked: status.revoked,
              exp: status.exp,
              last_good_refresh_at: status.last_good_refresh_at
            }),
            403
          );
        }
      }

      try {
        const input_validation = validate_wasi_export_input({
          kitchen_state: revision.kitchen_state,
          format: body.format ?? "json"
        });
        if (!input_validation.ok) {
          return c.json(
            error_response("schema.invalid", "WASI export input invalid", { errors: input_validation.errors }),
            400
          );
        }
        const output = await run_wasi_export({
          wasm_path,
          input: {
            kitchen_state: revision.kitchen_state,
            format: body.format ?? "json"
          },
          timeout_ms: Number(process.env.WASI_TIMEOUT_MS ?? 2000)
        });
        const output_validation = validate_wasi_export_output(output);
        if (!output_validation.ok) {
          return c.json(
            error_response("schema.invalid", "WASI export output invalid", { errors: output_validation.errors }),
            502
          );
        }
        if (Array.isArray(output.artifacts)) {
          artifacts.push(...(output.artifacts as any[]));
        }
      } catch (error) {
        const err = error as WasiError;
        return c.json(error_response(err.code ?? "wasi.error", err.message ?? "WASI error", err.details), 502);
      }
    }

    const export_id = `exp_${crypto.randomUUID().replace(/-/g, "")}`;
    const stored = await export_store.save_export({
      export_id,
      project_id: body.project_id,
      revision_id: body.revision_id,
      artifacts
    });

    return c.json({ export_id: stored.export_id, artifacts: stored.artifacts });
  });

  app.get("/exports/:export_id", async (c) => {
    const export_id = c.req.param("export_id");
    const stored = export_store.get_export(export_id);
    if (!stored) {
      return c.json(error_response("export.not_found", "Export not found"), 404);
    }
    return c.json(stored);
  });

  app.get("/exports/:export_id/artifacts/:artifact_id", async (c) => {
    const { export_id, artifact_id } = c.req.param();
    const result = await export_store.get_artifact(export_id, artifact_id);
    if (!result.ok || !result.bytes || !result.mime) {
      return c.json(error_response("artifact.not_found", "Artifact not found"), result.status);
    }
    return new Response(result.bytes, {
      status: 200,
      headers: {
        "content-type": result.mime,
        "cache-control": "public, max-age=31536000, immutable"
      }
    });
  });

  app.post("/sessions", async (c) => {
    let body: { project_id?: string; revision_id?: string };
    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      return c.json(error_response("json.invalid", "Invalid JSON body"), 400);
    }

    if (!body?.project_id || !body?.revision_id) {
      return c.json(error_response("session.invalid_request", "project_id and revision_id are required"), 400);
    }

    const session = await store.create_session(body.project_id, body.revision_id);
    if (!session) {
      return c.json(error_response("session.create_failed", "Unable to create session"), 404);
    }
    return c.json(session);
  });

  app.get("/sessions/:session_id", async (c) => {
    const session_id = c.req.param("session_id");
    const session = await store.get_session(session_id);
    if (!session) {
      return c.json(error_response("session.not_found", "Session not found"), 404);
    }
    const messages = await store.list_messages(session_id);
    const proposals = await store.list_proposals(session_id);
    return c.json({ session, messages, proposals });
  });

  app.post("/sessions/:session_id/messages", async (c) => {
    const session_id = c.req.param("session_id");
    let body: { role?: "user" | "assistant" | "system"; content?: string; ts?: number };
    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      return c.json(error_response("json.invalid", "Invalid JSON body"), 400);
    }
    if (!body?.role || !body?.content) {
      return c.json(error_response("message.invalid_request", "role and content are required"), 400);
    }
    const message = await store.add_message(session_id, {
      session_id,
      role: body.role,
      content: body.content,
      ts: body.ts ?? Date.now()
    });
    if (!message) {
      return c.json(error_response("session.not_found", "Session not found"), 404);
    }
    return c.json(message);
  });

  app.post("/sessions/:session_id/proposals", async (c) => {
    const session_id = c.req.param("session_id");
    let body: {
      revision_id?: string;
      proposals?: Array<{
        variant_index: number;
        patch: Record<string, unknown>;
        rationale: Record<string, unknown>;
        metrics?: Record<string, unknown>;
        explanation_text?: string;
      }>;
    };
    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      return c.json(error_response("json.invalid", "Invalid JSON body"), 400);
    }
    if (!body?.revision_id || !Array.isArray(body?.proposals)) {
      return c.json(error_response("proposal.invalid_request", "revision_id and proposals are required"), 400);
    }
    const stored = await store.add_proposals(session_id, body.revision_id, body.proposals);
    if (!stored) {
      return c.json(error_response("session.not_found", "Session not found"), 404);
    }
    return c.json({ proposals: stored });
  });

  app.post("/sessions/:session_id/select", async (c) => {
    const session_id = c.req.param("session_id");
    let body: { proposal_id?: string };
    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      return c.json(error_response("json.invalid", "Invalid JSON body"), 400);
    }
    if (!body?.proposal_id) {
      return c.json(error_response("proposal.invalid_request", "proposal_id is required"), 400);
    }

    const proposals = await store.list_proposals(session_id);
    const proposal = proposals.find((p) => p.proposal_id === body.proposal_id);
    if (!proposal) {
      return c.json(error_response("proposal.not_found", "Proposal not found"), 404);
    }

    const session = await store.get_session(session_id);
    if (!session) {
      return c.json(error_response("session.not_found", "Session not found"), 404);
    }

    const revision = await store.get_revision(session.project_id, proposal.revision_id);
    if (!revision) {
      return c.json(error_response("revision.not_found", "Revision not found"), 404);
    }

    const patched = await apply_patch(revision.kitchen_state, proposal.patch);
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

    const new_revision = await store.create_revision(session.project_id, patched, revision.revision_id, {
      source: "agent",
      reason: "selected_proposal"
    });
    if (!new_revision) {
      return c.json(error_response("revision.create_failed", "Failed to create revision"), 500);
    }

    await store.update_session_revision(session_id, new_revision.revision_id);
    return c.json({
      new_revision_id: new_revision.revision_id,
      violations: validation.violations ?? [],
      proposal_id: proposal.proposal_id
    });
  });

  app.post("/sessions/:session_id/advance", async (c) => {
    const session_id = c.req.param("session_id");
    let body: { revision_id?: string };
    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      return c.json(error_response("json.invalid", "Invalid JSON body"), 400);
    }
    if (!body?.revision_id) {
      return c.json(error_response("session.invalid_request", "revision_id is required"), 400);
    }
    const session = await store.get_session(session_id);
    if (!session) {
      return c.json(error_response("session.not_found", "Session not found"), 404);
    }
    await store.update_session_revision(session_id, body.revision_id);
    return c.json({ session_id, revision_id: body.revision_id });
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
