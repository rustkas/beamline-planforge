import { writable } from "svelte/store";
import { create_api_core_client } from "./api_core_client";
import { create_core_client } from "./core_adapter";
import { load_kitchen_state_fixture } from "./fixtures";

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
  violations: Violation[];
  project_id: string | null;
  revision_id: string | null;
  api_base_url: string;
  mode: Mode;
  busy: boolean;
  error: string | null;
};

const initial_state: AppState = {
  kitchen_state: null,
  render_model: null,
  violations: [],
  project_id: null,
  revision_id: null,
  api_base_url: "http://localhost:3001",
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
    const violations = validation?.violations ?? [];
    const render_model = await core.derive_render_model(snapshot.kitchen_state, "draft");
    set_state({ violations, render_model });
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
    set_state({ render_model: render.data, violations: [] });
  } finally {
    set_state({ busy: false });
  }
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
      set_state({ violations: result.data.violations as Violation[] });
      return;
    }
    set_state({ revision_id: result.data.new_revision_id, violations: [] });
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

export async function init_demo(mode: Mode, api_base_url: string): Promise<void> {
  write_mode(mode);
  set_state({ mode, api_base_url, error: null });

  if (mode === "local") {
    await load_fixture();
    return;
  }

  set_state({ busy: true });
  try {
    const api = create_api_core_client(api_base_url);
    const fixture = await load_kitchen_state_fixture();
    let ids = read_demo_ids();
    if (!ids) {
      const created = await api.create_project(fixture);
      if (!created.ok) {
        set_state({ error: created.error.message });
        return;
      }
      ids = { project_id: created.data.project_id, revision_id: created.data.revision_id };
      set_state({ violations: (created.data.violations ?? []) as Violation[] });
      write_demo_ids(ids.project_id, ids.revision_id);
    }

    const revision = await api.get_revision(ids.project_id, ids.revision_id);
    if (!revision.ok) {
      clear_demo_ids();
      set_state({ error: revision.error.message });
      return;
    }

    set_state({ project_id: ids.project_id, revision_id: ids.revision_id, kitchen_state: revision.data.kitchen_state });
    await recompute_server();
  } finally {
    set_state({ busy: false });
  }
}

export async function reset_demo(): Promise<void> {
  clear_demo_ids();
  const snapshot = get_snapshot();
  if (snapshot.mode === "server") {
    await init_demo("server", snapshot.api_base_url);
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

export function get_snapshot(): AppState {
  let current: AppState = initial_state;
  app_state.subscribe((state) => {
    current = state;
  })();
  return current;
}
