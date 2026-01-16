import type { plugin_manifest } from "./manifest";

export function can_read_project_data(manifest: plugin_manifest): boolean {
  return !!manifest.permissions?.project_data?.read;
}

export function can_validate_schema(manifest: plugin_manifest): boolean {
  return true;
}
