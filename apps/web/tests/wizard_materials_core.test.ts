import { describe, expect, test } from "bun:test";
import { apply_material_patch_result, build_material_patch_request } from "../src/core/wizard/materials";
import type { wizard_state } from "../src/core/wizard/types";

describe("wizard materials core", () => {
  test("build_material_patch_request creates slot patch", () => {
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
    const req = build_material_patch_request({
      kitchen_state: state,
      object_id: "obj1",
      slot: "front",
      value: "mat_front_graphite"
    });
    expect(req).toBeTruthy();
    expect(req?.patch.ops[0]).toEqual({
      op: "replace",
      path: "/layout/objects/0/material_slots/front",
      value: "mat_front_graphite"
    });
  });

  test("apply_material_patch_result triggers refresh effects", () => {
    const state: wizard_state = {
      draft_dirty: false,
      render_status: "idle",
      export_status: "idle",
      export_artifacts: []
    };
    const res = apply_material_patch_result(state);
    expect(res.effects.map((e) => e.kind)).toEqual(["render_refresh", "quote_refresh"]);
    expect(res.state_patch.render_status).toBe("loading");
  });
});
