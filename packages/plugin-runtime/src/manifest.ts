import { create_ajv, validate_with_ajv } from "@planforge/core-contracts";

export type manifest_validation = { ok: boolean; errors: string[] };

const ajv = create_ajv();

export function validate_manifest(manifest: unknown): manifest_validation {
  return validate_with_ajv(ajv, "planforge://schemas/plugin-manifest.schema.json", manifest);
}

export type plugin_manifest = {
  manifest_version: string;
  id: string;
  name: string;
  version: string;
  description: string;
  license: string;
  publisher: { name: string; url?: string };
  runtime: {
    kind: "web" | "wasm" | "wasi" | "server";
    entry: { js?: string; wasm?: string; module?: string; css?: string };
    min_host_version: string;
    compatibility: {
      core_contracts: string;
      core_wasm?: string;
      host_api: string;
    };
  };
  capabilities: {
    constraints: boolean;
    solver: boolean;
    pricing: boolean;
    render: boolean;
    export: boolean;
    ui: {
      panels: unknown[];
      wizard_steps: unknown[];
      commands: unknown[];
    };
  };
  integrity: {
    channel: "oss" | "paid";
    signature: { alg: "none" | "ed25519" | "ecdsa_p256"; value: string; kid?: string };
    hashes: Record<string, string>;
  };
  configuration_schema: Record<string, unknown>;
  permissions: {
    network: { allow: boolean; allowlist: string[] };
    storage: { allow: boolean; scopes: string[] };
    project_data: { read: boolean; write_via_patches: boolean };
    catalog: { read: boolean };
    pricing: { read: boolean };
    orders: { read: boolean; write: boolean };
  };
};
