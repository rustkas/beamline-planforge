import { writable } from "svelte/store";
import { create_api_core_client } from "./api_core_client";
import { create_ai_orchestrator_client, type TurnResult } from "./ai_orchestrator_client";
import { create_core_client } from "./core_adapter";
import { load_kitchen_state_fixture } from "./fixtures";
import type { host_context, quote, render_instruction } from "@planforge/plugin-sdk";
import {
  merge_quote,
  run_constraints_post_validate_hooks,
  run_pricing_post_quote_hooks,
  run_render_post_render_hooks,
  type quote_merge_diagnostic
} from "@planforge/plugin-runtime";
import { get_loaded_plugins } from "./plugins/registry";

export type Mode = "server" | "local";

export type Violation = {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  object_ids: string[];
  details?: Record<string, unknown>;
};

export type AppState = {
  kitchen_state: unknown | null;
  render_model: unknown | null;
  render_instructions: render_instruction[];
  base_violations: Violation[];
  violations: Violation[];
  base_quote: quote | null;
  final_quote: quote | null;
  quote_diagnostics: quote_merge_diagnostic[];
  pricing_context: { channel?: string; region?: string };
  project_id: string | null;
  revision_id: string | null;
  api_base_url: string;
  orchestrator_base_url: string;
  session_id: string | null;
  mode: Mode;
  busy: boolean;
  error: string | null;
};

const initial_state: AppState = {
  kitchen_state: null,
  render_model: null,
  render_instructions: [],
  base_violations: [],
  violations: [],
  base_quote: null,
  final_quote: null,
  quote_diagnostics: [],
  pricing_context: {},
  project_id: null,
  revision_id: null,
  api_base_url: "http://localhost:3001",
  orchestrator_base_url: "http://localhost:3002",
  session_id: null,
  mode: "server",
  busy: false,
  error: null
};

export const app_state = writable<AppState>({ ...initial_state });

const core = create_core_client();

function set_state(partial: Partial<AppState>): void {
  app_state.update((state) => ({ ...state, ...partial }));
}

function storage_key(): string {
  return "planforge_demo_state";
}

function mode_key(): string {
  return "planforge_demo_mode";
}

function session_key(project_id: string): string {
  return `planforge_demo_orch_session::${project_id}`;
}

function read_demo_ids(): { project_id: string; revision_id: string } | null {
  try {
    const raw = localStorage.getItem(storage_key());
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { project_id?: string; revision_id?: string };
    if (parsed.project_id && parsed.revision_id) {
      return { project_id: parsed.project_id, revision_id: parsed.revision_id };
    }
  } catch {
    return null;
  }
  return null;
}

function write_demo_ids(project_id: string, revision_id: string): void {
  localStorage.setItem(storage_key(), JSON.stringify({ project_id, revision_id }));
}

function clear_demo_ids(): void {
  localStorage.removeItem(storage_key());
}

function write_mode(mode: Mode): void {
  localStorage.setItem(mode_key(), mode);
}

function read_session_id(project_id: string): string | null {
  try {
    const raw = localStorage.getItem(session_key(project_id));
    return raw ?? null;
  } catch {
    return null;
  }
}

function write_session_id(project_id: string, session_id: string): void {
  localStorage.setItem(session_key(project_id), session_id);
}

function clear_session_id(project_id: string): void {
  localStorage.removeItem(session_key(project_id));
}

export async function load_fixture(): Promise<void> {
  set_state({ busy: true, error: null });
  try {
    const fixture = await load_kitchen_state_fixture();
    set_state({ kitchen_state: fixture });
    await recompute();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load fixture";
    set_state({ error: message });
  } finally {
    set_state({ busy: false });
  }
}

export async function recompute(): Promise<void> {
  const snapshot = get_snapshot();
  if (!snapshot.kitchen_state) return;
  if (snapshot.mode === "server") {
    await recompute_server();
    return;
  }
  set_state({ busy: true, error: null });
  try {
    const validation = (await core.validate_layout(snapshot.kitchen_state)) as { violations?: Violation[] };
    const base_violations = validation?.violations ?? [];
    const render_model = await core.derive_render_model(snapshot.kitchen_state, "draft");
    const plugin_result = await apply_plugin_hooks({
      kitchen_state: snapshot.kitchen_state,
      base_violations,
      render_model
    });
    const quote_result = await recompute_quote({
      mode: "local",
      api_base_url: snapshot.api_base_url,
      kitchen_state: snapshot.kitchen_state,
      host_context: build_host_context(snapshot),
      pricing_context: snapshot.pricing_context
    });
    set_state({
      base_violations,
      violations: plugin_result.violations,
      render_model,
      render_instructions: plugin_result.instructions,
      base_quote: quote_result.base_quote,
      final_quote: quote_result.final_quote,
      quote_diagnostics: quote_result.diagnostics
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Core call failed";
    set_state({ error: message });
  } finally {
    set_state({ busy: false });
  }
}

async function recompute_server(): Promise<void> {
  const snapshot = get_snapshot();
  if (!snapshot.project_id || !snapshot.revision_id) return;

  set_state({ busy: true, error: null });
  try {
    const api = create_api_core_client(snapshot.api_base_url);
    const render = await api.render(snapshot.project_id, snapshot.revision_id, "draft");
    if (!render.ok) {
      set_state({ error: render.error.message });
      return;
    }
    const plugin_result = await apply_plugin_hooks({
      kitchen_state: snapshot.kitchen_state,
      base_violations: snapshot.base_violations,
      render_model: render.data
    });
    const quote_result = await recompute_quote({
      mode: "server",
      api_base_url: snapshot.api_base_url,
      project_id: snapshot.project_id,
      revision_id: snapshot.revision_id,
      kitchen_state: snapshot.kitchen_state,
      host_context: build_host_context(snapshot),
      pricing_context: snapshot.pricing_context
    });
    set_state({
      render_model: render.data,
      violations: plugin_result.violations,
      render_instructions: plugin_result.instructions,
      base_quote: quote_result.base_quote,
      final_quote: quote_result.final_quote,
      quote_diagnostics: quote_result.diagnostics
    });
  } finally {
    set_state({ busy: false });
  }
}

function build_host_context(snapshot: AppState): host_context {
  return {
    host_version: "0.1.0",
    plugin_id: "host",
    project_id: snapshot.project_id ?? undefined,
    revision_id: snapshot.revision_id ?? undefined
  };
}

async function apply_plugin_hooks(args: {
  kitchen_state: unknown;
  base_violations: Violation[];
  render_model: unknown;
}): Promise<{ violations: Violation[]; instructions: render_instruction[] }> {
  const snapshot = get_snapshot();
  const plugins = get_loaded_plugins();
  if (plugins.length === 0) {
    return { violations: args.base_violations, instructions: [] };
  }

  const context = build_host_context(snapshot);

  const constraints = await run_constraints_post_validate_hooks({
    plugins,
    context,
    project_id: snapshot.project_id ?? undefined,
    revision_id: snapshot.revision_id ?? undefined,
    kitchen_state: args.kitchen_state,
    base_violations: args.base_violations,
    mode: "full",
    allow_suppress: false
  });

  const render = await run_render_post_render_hooks({
    plugins,
    context,
    project_id: snapshot.project_id ?? undefined,
    revision_id: snapshot.revision_id ?? undefined,
    kitchen_state: args.kitchen_state,
    render_model: args.render_model,
    quality: "draft"
  });

  return { violations: constraints.violations, instructions: render.instructions };
}

function make_stub_quote(currency: string, ruleset_version: string): quote {
  return {
    ruleset_version,
    currency,
    total: { currency, amount: 0 },
    items: [],
    meta: { stub: true }
  };
}

async function recompute_quote(args: {
  mode: Mode;
  api_base_url: string;
  project_id?: string;
  revision_id?: string;
  kitchen_state: unknown;
  host_context: host_context;
  pricing_context?: { region?: string; channel?: string };
}): Promise<{ base_quote: quote; final_quote: quote; diagnostics: quote_merge_diagnostic[] }> {
  let base_quote = make_stub_quote("USD", "ruleset-v0");
  if (args.mode === "server" && args.project_id && args.revision_id) {
    const api = create_api_core_client(args.api_base_url);
    const res = await api.quote(args.project_id, args.revision_id);
    if (res.ok) {
      base_quote = res.data as quote;
    }
  }

  const plugins = get_loaded_plugins();
  if (plugins.length === 0) {
    return { base_quote, final_quote: base_quote, diagnostics: [] };
  }

  const hook_result = await run_pricing_post_quote_hooks({
    plugins,
    context: args.host_context,
    project_id: args.project_id,
    revision_id: args.revision_id,
    kitchen_state: args.kitchen_state,
    base_quote,
    pricing_context: args.pricing_context
  });

  const merged = merge_quote(base_quote, hook_result.contributions);
  return {
    base_quote,
    final_quote: merged.quote,
    diagnostics: [...hook_result.diagnostics, ...merged.diagnostics]
  };
}

export async function set_pricing_channel(channel: string | undefined): Promise<void> {
  const snapshot = get_snapshot();
  set_state({ pricing_context: { ...snapshot.pricing_context, channel } });
  await recompute();
}

async function move_first_object_x_local(new_x: number): Promise<void> {
  const snapshot = get_snapshot();
  if (!snapshot.kitchen_state) {
    set_state({ error: "KitchenState not loaded" });
    return;
  }

  const patch = {
    ops: [
      {
        op: "replace",
        path: "/layout/objects/0/transform_mm/position_mm/x",
        value: new_x
      }
    ]
  };

  set_state({ busy: true, error: null });
  try {
    const updated = await core.apply_patch(snapshot.kitchen_state, patch);
    set_state({ kitchen_state: updated });
    await recompute();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Patch failed";
    set_state({ error: message });
  } finally {
    set_state({ busy: false });
  }
}

async function move_first_object_x_server(new_x: number): Promise<void> {
  const snapshot = get_snapshot();
  if (!snapshot.project_id || !snapshot.revision_id) {
    set_state({ error: "Project not initialized" });
    return;
  }

  const patch = {
    ops: [
      {
        op: "replace",
        path: "/layout/objects/0/transform_mm/position_mm/x",
        value: new_x
      }
    ]
  };

  set_state({ busy: true, error: null });
  try {
    const api = create_api_core_client(snapshot.api_base_url);
    const result = await api.apply_patch(snapshot.project_id, snapshot.revision_id, patch);
    if (!result.ok) {
      set_state({ error: result.error.message });
      return;
    }
    if (result.data.violations.length > 0) {
      set_state({
        base_violations: result.data.violations as Violation[],
        violations: result.data.violations as Violation[],
        render_instructions: []
      });
      return;
    }
    set_state({ revision_id: result.data.new_revision_id, base_violations: [], violations: [] });
    write_demo_ids(snapshot.project_id, result.data.new_revision_id);
    await refresh_revision();
  } finally {
    set_state({ busy: false });
  }
}

export async function move_first_object_x(new_x: number): Promise<void> {
  const snapshot = get_snapshot();
  if (snapshot.mode === "server") {
    await move_first_object_x_server(new_x);
  } else {
    await move_first_object_x_local(new_x);
  }
}

async function ensure_session(project_id: string, revision_id: string): Promise<string | null> {
  const snapshot = get_snapshot();
  const orchestrator = create_ai_orchestrator_client(snapshot.orchestrator_base_url);
  const existing = read_session_id(project_id);
  if (existing) return existing;

  const created = await orchestrator.create_session(project_id, revision_id);
  if (!created.ok) {
    set_state({ error: created.error.message });
    return null;
  }
  write_session_id(project_id, created.data.session_id);
  return created.data.session_id;
}

export async function init_demo(mode: Mode, api_base_url: string, orchestrator_base_url: string): Promise<void> {
  write_mode(mode);
  set_state({ mode, api_base_url, orchestrator_base_url, error: null });

  if (mode === "local") {
    await load_fixture();
    return;
  }

  set_state({ busy: true });
  try {
    const api = create_api_core_client(api_base_url);
    const fixture = await load_kitchen_state_fixture();
    let base_violations: Violation[] = [];
    let ids = read_demo_ids();
    if (!ids) {
      const created = await api.create_project(fixture);
      if (!created.ok) {
        set_state({ error: created.error.message });
        return;
      }
      ids = { project_id: created.data.project_id, revision_id: created.data.revision_id };
      base_violations = (created.data.violations ?? []) as Violation[];
      set_state({ base_violations, violations: base_violations });
      write_demo_ids(ids.project_id, ids.revision_id);
    }

    const revision = await api.get_revision(ids.project_id, ids.revision_id);
    if (!revision.ok) {
      clear_demo_ids();
      clear_session_id(ids.project_id);
      set_state({ error: revision.error.message });
      return;
    }

    const session_id = await ensure_session(ids.project_id, ids.revision_id);
    set_state({
      project_id: ids.project_id,
      revision_id: ids.revision_id,
      kitchen_state: revision.data.kitchen_state,
      session_id,
      base_violations
    });
    await recompute_server();
  } finally {
    set_state({ busy: false });
  }
}

export async function reset_demo(): Promise<void> {
  clear_demo_ids();
  const snapshot = get_snapshot();
  if (snapshot.project_id) {
    clear_session_id(snapshot.project_id);
  }
  if (snapshot.mode === "server") {
    await init_demo("server", snapshot.api_base_url, snapshot.orchestrator_base_url);
  }
}

export async function refresh_revision(): Promise<void> {
  const snapshot = get_snapshot();
  if (!snapshot.project_id || !snapshot.revision_id) return;
  const api = create_api_core_client(snapshot.api_base_url);
  const revision = await api.get_revision(snapshot.project_id, snapshot.revision_id);
  if (!revision.ok) {
    set_state({ error: revision.error.message });
    return;
  }
  set_state({ kitchen_state: revision.data.kitchen_state });
  await recompute_server();
}

export async function run_agent_command(command: string): Promise<TurnResult | null> {
  const snapshot = get_snapshot();
  if (snapshot.mode !== "server") {
    set_state({ error: "Agent available only in server mode" });
    return null;
  }
  if (!snapshot.project_id || !snapshot.revision_id) {
    set_state({ error: "Project not initialized" });
    return null;
  }

  set_state({ busy: true, error: null });
  try {
    const orchestrator = create_ai_orchestrator_client(snapshot.orchestrator_base_url);
    let session_id = snapshot.session_id ?? read_session_id(snapshot.project_id);
    if (!session_id) {
      const created = await orchestrator.create_session(snapshot.project_id, snapshot.revision_id);
      if (!created.ok) {
        set_state({ error: created.error.message });
        return null;
      }
      session_id = created.data.session_id;
      write_session_id(snapshot.project_id, session_id);
      set_state({ session_id });
    }

    const turn = await orchestrator.run_turn(session_id, command);
    if (!turn.ok) {
      if (turn.error.status === 404) {
        const created = await orchestrator.create_session(snapshot.project_id, snapshot.revision_id);
        if (created.ok) {
          session_id = created.data.session_id;
          write_session_id(snapshot.project_id, session_id);
          set_state({ session_id });
          const retry = await orchestrator.run_turn(session_id, command);
          if (retry.ok) return await handle_turn_result(retry.data);
        }
      }
      set_state({ error: turn.error.message });
      return null;
    }

    return await handle_turn_result(turn.data);
  } finally {
    set_state({ busy: false });
  }
}

async function handle_turn_result(result: TurnResult): Promise<TurnResult> {
  if (result.violations && result.violations.length > 0) {
    set_state({ base_violations: result.violations as Violation[], violations: result.violations as Violation[] });
  }

  if (result.new_revision_id) {
    set_state({ revision_id: result.new_revision_id });
    if (result.project_id) {
      write_demo_ids(result.project_id, result.new_revision_id);
    }
    await refresh_revision();
  }

  return result;
}

export function get_snapshot(): AppState {
  let current: AppState = initial_state;
  app_state.subscribe((state) => {
    current = state;
  })();
  return current;
}
