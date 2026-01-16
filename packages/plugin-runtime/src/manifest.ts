import { create_ajv, validate_with_ajv } from "@planforge/core-contracts";

export type manifest_validation = { ok: boolean; errors: string[] };

const ajv = create_ajv();

export function validate_manifest(manifest: unknown): manifest_validation {
  return validate_with_ajv(ajv, "planforge://schemas/plugin-manifest.schema.json", manifest);
}

export type plugin_manifest = {
  id: string;
  name: string;
  version: string;
  runtime: {
    kind: "web" | "wasm" | "server";
    entry: { js?: string; wasm?: string; module?: string };
  };
  permissions: {
    network: { allow: boolean; allowlist: string[] };
    storage: { allow: boolean; scopes: string[] };
    project_data: { read: boolean; write_via_patches: boolean };
    catalog: { read: boolean };
    pricing: { read: boolean };
    orders: { read: boolean; write: boolean };
  };
};
