import type { host_context } from "./context";
import type { proposed_patch } from "./patch";
import type { quality, validate_mode } from "./types";
import type { violation } from "./violations";

export type hook_kind = "constraints" | "pricing" | "render" | "export";

export type plugin_hook_request<TParams> = {
  context: host_context;
  project: {
    project_id?: string;
    revision_id?: string;
  };
  params: TParams;
  inputs_hash?: string;
};

export type plugin_hook_response<TResult> =
  | { ok: true; result: TResult; logs?: Array<{ level: "debug" | "info" | "warn" | "error"; message: string }> }
  | { ok: false; error: { code: string; message: string; details?: Record<string, unknown> } };

export type constraints_post_validate_params = {
  kitchen_state: unknown;
  base_violations: violation[];
  mode: validate_mode;
};

export type constraints_post_validate_result = {
  add_violations?: violation[];
  suppress_codes?: string[];
  metrics?: Record<string, number>;
};

export type render_instruction =
  | {
      kind: "highlight";
      object_ids: string[];
      style: { mode: "outline" | "solid" };
    }
  | {
      kind: "overlay_labels";
      labels: Array<{ object_id: string; text: string }>;
    };

export type render_post_render_params = {
  kitchen_state: unknown;
  render_model: unknown;
  quality: quality;
};

export type render_post_render_result = {
  instructions: render_instruction[];
};

export type money = { currency: string; amount: number };

export type quote_item = {
  code: string;
  title: string;
  qty: number;
  unit_price: money;
  amount: money;
  meta?: Record<string, unknown>;
};

export type quote = {
  ruleset_version: string;
  currency: string;
  total: money;
  items: quote_item[];
  meta?: Record<string, unknown>;
};

export type pricing_post_quote_params = {
  kitchen_state: unknown;
  quote: quote;
  pricing_context?: { region?: string; channel?: string };
};

export type pricing_post_quote_result = {
  add_items?: quote_item[];
  adjustments?: Array<{
    kind: "discount" | "surcharge";
    code: string;
    title: string;
    amount: money;
    applies_to?: { item_codes?: string[] };
  }>;
};

export type export_format = "pdf" | "csv" | "json" | "gltf" | "glb" | "zip";

export type export_on_export_params = {
  kitchen_state: unknown;
  render_model?: unknown;
  quote?: unknown;
  format: export_format;
  options?: Record<string, unknown>;
};

export type export_artifact = {
  kind: "file" | "link" | "inline";
  name: string;
  mime: string;
  bytes_base64?: string;
  url?: string;
  meta?: Record<string, unknown>;
};

export type export_on_export_result = {
  artifacts: export_artifact[];
};

export type propose_patch_params = {
  kitchen_state: unknown;
  command: string;
};

export type propose_patch_result = {
  patch: proposed_patch;
};
