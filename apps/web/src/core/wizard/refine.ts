import type { wizard_effect, wizard_state } from "./types";

export type refine_preview_request = {
  session_id: string;
  command: string;
};

export type refine_apply_request = {
  session_id: string;
  command: string;
};

export type refine_preview_result = {
  ok: boolean;
  proposed_patch?: unknown;
  explanations?: Array<{ group: string; title: string; detail?: string }>;
  violations_summary?: Array<{ code: string; severity: string; count: number }>;
  message?: string;
};

export type refine_apply_result = {
  ok: boolean;
  new_revision_id?: string;
  message?: string;
};

export function build_refine_preview_request(
  state: wizard_state,
  command: string
): refine_preview_request | null {
  if (!state.session_id) return null;
  if (!command.trim()) return null;
  return { session_id: state.session_id, command: command.trim() };
}

export function build_refine_apply_request(
  state: wizard_state,
  command: string
): refine_apply_request | null {
  if (!state.session_id) return null;
  if (!command.trim()) return null;
  return { session_id: state.session_id, command: command.trim() };
}

export function apply_refine_preview_result(
  _state: wizard_state,
  result: refine_preview_result
): { state_patch: Partial<wizard_state>; effects: wizard_effect[] } {
  if (!result.ok) {
    return {
      state_patch: { refine_error: result.message ?? "Refine preview failed", refine_preview: null },
      effects: []
    };
  }
  return {
    state_patch: { refine_error: null, refine_preview: result },
    effects: []
  };
}

export function apply_refine_apply_result(
  _state: wizard_state,
  result: refine_apply_result
): { state_patch: Partial<wizard_state>; effects: wizard_effect[] } {
  if (!result.ok || !result.new_revision_id) {
    return {
      state_patch: { refine_error: result.message ?? "Refine apply failed" },
      effects: []
    };
  }
  return {
    state_patch: {
      applied_revision_id: result.new_revision_id,
      revision_id: result.new_revision_id,
      draft_dirty: false,
      refine_preview: null,
      refine_error: null,
      render_status: "loading"
    },
    effects: [{ kind: "render_refresh" }, { kind: "quote_refresh" }]
  };
}
