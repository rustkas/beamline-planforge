import type { host_context } from "./context";
import type { proposed_patch } from "./patch";
import type { violation } from "./violations";
import type { license_context } from "./licensing";
import type {
  constraints_post_validate_params,
  constraints_post_validate_result,
  plugin_hook_request,
  plugin_hook_response,
  pricing_post_quote_params,
  pricing_post_quote_result,
  render_post_render_params,
  render_post_render_result
} from "./hooks";
import type { quality } from "./types";

export type schema_validation_result = { ok: boolean; errors: string[] };

export type validate_request = {
  kitchen_state: unknown;
  mode: "drag" | "full";
};

export type validate_response = {
  violations: violation[];
};

export type derive_render_model_request = {
  kitchen_state: unknown;
  quality: quality;
};

export type derive_render_model_response = {
  render_model: unknown;
};

export type apply_patch_result = {
  new_revision_id?: string;
  kitchen_state?: unknown;
};

export type host_get_project_state_result = {
  project_id?: string;
  revision_id?: string;
  kitchen_state: unknown;
};

export interface host_api_methods {
  "host.get_context": {
    params: void;
    result: host_context;
  };
  "host.log": {
    params: { level: "debug" | "info" | "warn" | "error"; message: string; fields?: Record<string, unknown> };
    result: void;
  };
  "host.validate_schema": {
    params: { schema_id: string; value: unknown };
    result: schema_validation_result;
  };
  "host.get_project_state": {
    params: void;
    result: host_get_project_state_result;
  };
  "host.get_license_context": {
    params: void;
    result: license_context;
  };
  "host.validate_layout": {
    params: validate_request;
    result: validate_response;
  };
  "host.derive_render_model": {
    params: derive_render_model_request;
    result: derive_render_model_response;
  };
  "host.price_quote": {
    params: { kitchen_state: unknown };
    result: unknown;
  };
  "host.apply_patch": {
    params: proposed_patch;
    result: apply_patch_result;
  };
  "host.resolve_asset_uri": {
    params: { asset_id: string };
    result: { uri: string };
  };
}

export interface plugin_hook_methods {
  "plugin.init": {
    params: { context: host_context };
    result: { ok: true };
  };
  "plugin.ping": {
    params: { nonce?: string };
    result: { pong: true; nonce?: string };
  };
  "plugin.constraints.post_validate": {
    params: plugin_hook_request<constraints_post_validate_params>;
    result: plugin_hook_response<constraints_post_validate_result>;
  };
  "plugin.pricing.post_quote": {
    params: plugin_hook_request<pricing_post_quote_params>;
    result: plugin_hook_response<pricing_post_quote_result>;
  };
  "plugin.render.post_render": {
    params: plugin_hook_request<render_post_render_params>;
    result: plugin_hook_response<render_post_render_result>;
  };
}

export type host_method = keyof host_api_methods;
export type plugin_method = keyof plugin_hook_methods;
export type any_method = host_method | plugin_method;

export type method_params<M extends any_method> = M extends host_method
  ? host_api_methods[M]["params"]
  : M extends plugin_method
    ? plugin_hook_methods[M]["params"]
    : never;

export type method_result<M extends any_method> = M extends host_method
  ? host_api_methods[M]["result"]
  : M extends plugin_method
    ? plugin_hook_methods[M]["result"]
    : never;
