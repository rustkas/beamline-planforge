import type { plugin_manifest } from "../manifest";

export type discovered_plugin = {
  manifest: plugin_manifest;
  base_url: string;
};

export type host_context = {
  host_version: string;
  plugin_id: string;
  project_id?: string;
  revision_id?: string;
  locale?: string;
};

export type host_api_provider = {
  get_context: () => host_context;
  get_project_state: () => Promise<unknown>;
  validate_layout?: (kitchen_state: unknown) => Promise<unknown>;
};
