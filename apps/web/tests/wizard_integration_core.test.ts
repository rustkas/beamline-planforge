import { describe, expect, test } from "bun:test";
import { apply_refine_preview_result, apply_refine_apply_result } from "../src/core/wizard/refine";
import { apply_material_patch_result } from "../src/core/wizard/materials";
import { apply_exports_result } from "../src/core/wizard/exports";
import type { wizard_state } from "../src/core/wizard/types";

describe("wizard integration core", () => {
  test("preview → apply → materials → exports flow", () => {
    let state: wizard_state = {
      project_id: "proj1",
      revision_id: "rev1",
      applied_revision_id: "rev1",
      session_id: "sess1",
      draft_dirty: true,
      render_status: "idle",
      export_status: "idle",
      export_artifacts: []
    };

    const preview = apply_refine_preview_result(state, {
      ok: true,
      explanations: [{ group: "utilities", title: "Sink prioritized near water/window" }],
      violations_summary: [{ code: "x", severity: "warning", count: 1 }]
    });
    state = { ...state, ...(preview.state_patch as wizard_state) };
    expect(preview.effects).toEqual([]);
    expect(state.applied_revision_id).toBe("rev1");

    const applied = apply_refine_apply_result(state, { ok: true, new_revision_id: "rev2" });
    state = { ...state, ...(applied.state_patch as wizard_state) };
    expect(state.applied_revision_id).toBe("rev2");
    expect(applied.effects.map((e) => e.kind)).toEqual(["render_refresh", "quote_refresh"]);

    const material = apply_material_patch_result(state);
    state = { ...state, ...(material.state_patch as wizard_state) };
    expect(material.effects.map((e) => e.kind)).toEqual(["render_refresh", "quote_refresh"]);

    const exports = apply_exports_result(state, {
      artifacts: [{ id: "a1", name: "spec.json", mime: "application/json", sha256: "x", size: 10 }]
    });
    state = { ...state, ...(exports.state_patch as wizard_state) };
    expect(state.export_status).toBe("ready");
    expect(state.export_artifacts.length).toBe(1);
  });
});
