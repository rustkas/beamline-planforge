import type { host_context } from "@planforge/plugin-sdk";
import type { plugin_manifest } from "../manifest";

export type discovered_plugin = {
  manifest: plugin_manifest;
  base_url: string;
};

export type host_api_provider = {
  get_context: () => host_context;
  get_project_state: () => Promise<{ kitchen_state: unknown; project_id?: string; revision_id?: string }>;
  validate_layout?: (kitchen_state: unknown) => Promise<unknown>;
  derive_render_model?: (params: unknown) => Promise<unknown>;
};
