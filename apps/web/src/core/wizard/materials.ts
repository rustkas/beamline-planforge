import type { wizard_effect, wizard_state } from "./types";
import { build_material_patch } from "../../lib/wizard_patches";

export type materials_patch_request = {
  patch: {
    ops: Array<{ op: "add" | "replace"; path: string; value: unknown }>;
    reason: string;
    source: "user";
  };
};

export function build_material_patch_request(args: {
  kitchen_state: unknown;
  object_id: string;
  slot: string;
  value: string;
}): materials_patch_request | null {
  const result = build_material_patch({
    kitchen_state: args.kitchen_state,
    object_id: args.object_id,
    slot: args.slot,
    value: args.value
  });
  if (!result) return null;
  return { patch: result.patch };
}

export function apply_material_patch_result(
  _state: wizard_state
): { state_patch: Partial<wizard_state>; effects: wizard_effect[] } {
  return {
    state_patch: { render_status: "loading" },
    effects: [{ kind: "render_refresh" }, { kind: "quote_refresh" }]
  };
}
