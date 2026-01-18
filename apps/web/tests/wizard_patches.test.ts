import { describe, expect, test } from "bun:test";
import { build_material_patch } from "../src/lib/wizard_patches";

describe("wizard patches", () => {
  test("build_material_patch targets single slot", () => {
    const state = {
      layout: {
        objects: [
          {
            id: "obj1",
            material_slots: { front: "mat_front_white" }
          }
        ]
      }
    };

    const result = build_material_patch({
      kitchen_state: state,
      object_id: "obj1",
      slot: "front",
      value: "mat_front_graphite"
    });

    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.patch.ops).toHaveLength(1);
    expect(result.patch.ops[0]).toEqual({
      op: "replace",
      path: "/layout/objects/0/material_slots/front",
      value: "mat_front_graphite"
    });
  });
});
