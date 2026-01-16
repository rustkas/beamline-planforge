import type { host_context } from "./context";
import type { proposed_patch } from "./patch";
import type { quality, revision_id, schema_id, validate_mode } from "./types";
import type { violation } from "./violations";

export interface validate_request {
  kitchen_state: unknown;
  mode: validate_mode;
}

export interface validate_response {
  violations: violation[];
}

export interface derive_render_model_request {
  kitchen_state: unknown;
  quality: quality;
}

export interface derive_render_model_response {
  render_model: unknown;
}

export interface apply_patch_result {
  new_revision_id: revision_id;
}

export interface schema_validation_result {
  ok: boolean;
  errors: string[];
}

export interface host_api {
  get_context(): Promise<host_context>;
  get_project_state(): Promise<{ kitchen_state: unknown; project_id?: string; revision_id?: string }>;
  log(
    level: "debug" | "info" | "warn" | "error",
    message: string,
    fields?: Record<string, unknown>
  ): Promise<void>;
  validate_schema(schema_id: schema_id, value: unknown): Promise<schema_validation_result>;
  validate_layout(req: validate_request): Promise<validate_response>;
  derive_render_model(req: derive_render_model_request): Promise<derive_render_model_response>;
  search_catalog(query: string, filters?: Record<string, unknown>): Promise<unknown>;
  price_quote(kitchen_state: unknown): Promise<unknown>;
  apply_patch(patch: proposed_patch): Promise<apply_patch_result>;
  resolve_asset_uri(asset_id: string): Promise<{ uri: string }>;
}

export type host_api_method =
  | "get_context"
  | "get_project_state"
  | "log"
  | "validate_schema"
  | "validate_layout"
  | "derive_render_model"
  | "search_catalog"
  | "price_quote"
  | "apply_patch"
  | "resolve_asset_uri";

export interface host_api_methods {
  get_context: { params: void; result: host_context };
  get_project_state: { params: void; result: { kitchen_state: unknown; project_id?: string; revision_id?: string } };
  log: {
    params: { level: "debug" | "info" | "warn" | "error"; message: string; fields?: Record<string, unknown> };
    result: void;
  };
  validate_schema: { params: { schema_id: schema_id; value: unknown }; result: schema_validation_result };
  validate_layout: { params: validate_request; result: validate_response };
  derive_render_model: { params: derive_render_model_request; result: derive_render_model_response };
  search_catalog: { params: { query: string; filters?: Record<string, unknown> }; result: unknown };
  price_quote: { params: { kitchen_state: unknown }; result: unknown };
  apply_patch: { params: proposed_patch; result: apply_patch_result };
  resolve_asset_uri: { params: { asset_id: string }; result: { uri: string } };
}
