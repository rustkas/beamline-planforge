export type planforge_version = string;

export type plugin_id = string;
export type project_id = string;
export type revision_id = string;
export type asset_id = string;

export type severity = "info" | "warning" | "error";
export type quality = "draft" | "quality";
export type validate_mode = "drag" | "full";

export type schema_id =
  | "planforge://schemas/plugin-manifest.schema.json"
  | "planforge://schemas/kitchen_state.schema.json"
  | "planforge://schemas/render_model.schema.json";
