import type { violation } from "@planforge/plugin-sdk";
import type { proposed_patch } from "@planforge/plugin-sdk";

export function clamp_x_patch(kitchen_state: unknown, patch: proposed_patch): proposed_patch {
  const state = kitchen_state as any;
  const width = state?.room?.size_mm?.width;
  const obj_width = state?.layout?.objects?.[0]?.dims_mm?.width;
  if (typeof width !== "number" || typeof obj_width !== "number") return patch;

  const max_x = Math.max(0, width - obj_width);
  const op = patch.ops[0];
  if (!op || typeof op.value !== "number") return patch;
  const clamped = Math.min(Math.max(0, op.value), max_x);

  return {
    ...patch,
    reason: `Clamped X to ${clamped}`,
    ops: [
      {
        ...op,
        value: clamped
      }
    ]
  };
}

export function is_out_of_bounds(violations: violation[]): boolean {
  return violations.some((v) => v.code === "layout.out_of_bounds");
}
