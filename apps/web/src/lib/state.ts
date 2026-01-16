import { writable } from "svelte/store";
import { create_core_client } from "./core_adapter";
import { load_kitchen_state_fixture } from "./fixtures";

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
  busy: boolean;
  error: string | null;
};

const initial_state: AppState = {
  kitchen_state: null,
  render_model: null,
  violations: [],
  busy: false,
  error: null
};

export const app_state = writable<AppState>({ ...initial_state });

const core = create_core_client();

function set_state(partial: Partial<AppState>): void {
  app_state.update((state) => ({ ...state, ...partial }));
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

export async function move_first_object_x(new_x: number): Promise<void> {
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

export function get_snapshot(): AppState {
  let current: AppState = initial_state;
  app_state.subscribe((state) => {
    current = state;
  })();
  return current;
}
