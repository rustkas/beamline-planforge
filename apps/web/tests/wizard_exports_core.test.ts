import { describe, expect, test } from "bun:test";
import { apply_exports_result, build_exports_request } from "../src/core/wizard/exports";
import type { wizard_state } from "../src/core/wizard/types";

describe("wizard exports core", () => {
  test("build_exports_request requires project and revision", () => {
    const state: wizard_state = {
      project_id: "proj1",
      revision_id: "rev1",
      draft_dirty: false,
      render_status: "idle",
      export_status: "idle",
      export_artifacts: []
    };
    const req = build_exports_request(state, "pdf");
    expect(req).toEqual({ project_id: "proj1", revision_id: "rev1", format: "pdf" });
  });

  test("apply_exports_result sets artifacts and ready status", () => {
    const state: wizard_state = {
      project_id: "proj1",
      revision_id: "rev1",
      draft_dirty: false,
      render_status: "idle",
      export_status: "loading",
      export_artifacts: []
    };
    const res = apply_exports_result(state, {
      artifacts: [{ id: "a1", name: "spec.json", mime: "application/json", sha256: "x", size: 10 }]
    });
    expect(res.state_patch.export_status).toBe("ready");
    expect(res.state_patch.export_artifacts?.length).toBe(1);
  });
});
