export type render_status = "idle" | "loading" | "ready" | "error";
export type export_status = "idle" | "loading" | "ready" | "error";

export type wizard_state = {
  project_id?: string;
  revision_id?: string;
  applied_revision_id?: string;
  session_id?: string;
  draft_dirty: boolean;
  render_status: render_status;
  export_status: export_status;
  refine_preview?: unknown | null;
  refine_error?: string | null;
  export_artifacts: Array<{
    id: string;
    name: string;
    mime: string;
    sha256: string;
    size: number;
    download_url?: string;
    url?: string;
  }>;
};

export type wizard_effect =
  | { kind: "render_refresh" }
  | { kind: "quote_refresh" }
  | { kind: "exports_request" };
