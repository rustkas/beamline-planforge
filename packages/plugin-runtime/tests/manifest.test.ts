import { describe, expect, test } from "bun:test";
import { validate_manifest } from "../src/manifest";
import { is_rpc_request, is_rpc_response, make_rpc_ok } from "@planforge/plugin-sdk";

describe("plugin-runtime", () => {
  test("valid manifest passes", () => {
    const manifest = {
      $schema: "planforge://schemas/plugin-manifest.schema.json",
      manifest_version: "1.0",
      id: "com.planforge.demo.constraints",
      name: "Demo Constraints",
      version: "0.1.0",
      description: "Demo plugin",
      license: "Apache-2.0",
      publisher: { name: "PlanForge" },
      runtime: {
        kind: "web",
        entry: { js: "dist/loader.js" },
        min_host_version: "0.1.0",
        compatibility: { core_contracts: "^0.1.0", host_api: "^0.1.0" }
      },
      capabilities: {
        constraints: true,
        solver: false,
        pricing: false,
        render: false,
        export: false,
        ui: { panels: [], wizard_steps: [], commands: [] }
      },
      permissions: {
        network: { allow: false, allowlist: [] },
        storage: { allow: false, scopes: ["none"] },
        project_data: { read: true, write_via_patches: false },
        catalog: { read: false },
        pricing: { read: false },
        orders: { read: false, write: false }
      },
      integrity: { channel: "oss", signature: { alg: "none", value: "" }, hashes: {} },
      configuration_schema: { type: "object" }
    };

    const result = validate_manifest(manifest);
    expect(result.ok).toBe(true);
  });

  test("rpc guards accept response", () => {
    const response = make_rpc_ok("1", { ok: true });
    expect(is_rpc_response(response)).toBe(true);
    expect(is_rpc_request(response)).toBe(false);
  });
});
