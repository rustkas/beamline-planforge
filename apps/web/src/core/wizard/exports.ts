import type { wizard_effect, wizard_state } from "./types";

export type exports_request = {
  project_id: string;
  revision_id: string;
  format: "json" | "pdf";
};

export type exports_result = {
  artifacts: Array<{
    id: string;
    name: string;
    mime: string;
    sha256: string;
    size: number;
    download_url?: string;
    url?: string;
  }>;
};

export function build_exports_request(state: wizard_state, format: "json" | "pdf"): exports_request | null {
  if (!state.project_id || !state.revision_id) return null;
  return { project_id: state.project_id, revision_id: state.revision_id, format };
}

export function apply_exports_result(
  _state: wizard_state,
  result: exports_result
): { state_patch: Partial<wizard_state>; effects: wizard_effect[] } {
  return {
    state_patch: { export_status: "ready", export_artifacts: result.artifacts },
    effects: []
  };
}
