import { describe, expect, test } from "bun:test";
import {
  apply_refine_apply_result,
  apply_refine_preview_result,
  build_refine_apply_request,
  build_refine_preview_request
} from "../src/core/wizard/refine";
import type { wizard_state } from "../src/core/wizard/types";

const base_state: wizard_state = {
  session_id: "sess_1",
  project_id: "proj_1",
  revision_id: "rev_1",
  applied_revision_id: "rev_1",
  draft_dirty: true,
  render_status: "idle",
  export_status: "idle",
  export_artifacts: []
};

describe("wizard refine core", () => {
  test("preview request does not change applied revision", () => {
    const req = build_refine_preview_request(base_state, "move sink near window");
    expect(req).toEqual({ session_id: "sess_1", command: "move sink near window" });

    const res = apply_refine_preview_result(base_state, {
      ok: true,
      explanations: [{ group: "utilities", title: "Sink prioritized near water/window" }],
      violations_summary: [{ code: "x", severity: "warning", count: 1 }]
    });
    expect(res.effects).toEqual([]);
    expect(res.state_patch.applied_revision_id).toBeUndefined();
    expect(res.state_patch.refine_preview).toBeTruthy();
  });

  test("apply result triggers render+quote refresh and resets dirty", () => {
    const req = build_refine_apply_request(base_state, "increase passage");
    expect(req).toEqual({ session_id: "sess_1", command: "increase passage" });

    const res = apply_refine_apply_result(base_state, { ok: true, new_revision_id: "rev_2" });
    expect(res.state_patch.applied_revision_id).toBe("rev_2");
    expect(res.state_patch.draft_dirty).toBe(false);
    expect(res.effects.map((e) => e.kind)).toEqual(["render_refresh", "quote_refresh"]);
  });
});
