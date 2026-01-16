import { describe, expect, test } from "bun:test";
import { create_ajv, validate_with_ajv } from "../src/validator";

describe("plugin manifest validation", () => {
  test("valid oss wasm manifest passes", () => {
    const ajv = create_ajv();

    const manifest = {
      $schema: "planforge://schemas/plugin-manifest.schema.json",
      manifest_version: "1.0",
      id: "com.planforge.constraints.basic",
      name: "Constraints Basic",
      version: "0.1.0",
      description: "Baseline constraints.",
      license: "Apache-2.0",
      publisher: { name: "Kitchen PlanForge", url: "https://example.invalid" },
      runtime: {
        kind: "wasm",
        entry: { wasm: "dist/plugin.wasm", js: "dist/loader.js" },
        min_host_version: "0.1.0",
        compatibility: {
          core_contracts: "^0.1.0",
          core_wasm: "^0.1.0",
          host_api: "^0.1.0"
        }
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
        project_data: { read: true, write_via_patches: true },
        catalog: { read: true },
        pricing: { read: false },
        orders: { read: false, write: false }
      },
      integrity: {
        channel: "oss",
        signature: { alg: "none", value: "" },
        hashes: {
          "dist/plugin.wasm": "sha256:0000000000000000000000000000000000000000000000000000000000000000",
          "dist/loader.js": "sha256:0000000000000000000000000000000000000000000000000000000000000000"
        }
      },
      configuration_schema: { type: "object", additionalProperties: false, properties: {}, required: [] }
    };

    const res = validate_with_ajv(ajv, "planforge://schemas/plugin-manifest.schema.json", manifest);
    expect(res.ok).toBe(true);
    expect(res.errors).toEqual([]);
  });

  test("manifest with wrong $schema is rejected", () => {
    const ajv = create_ajv();

    const bad = {
      $schema: "https://json-schema.org/",
      manifest_version: "1.0",
      id: "x",
      name: "x",
      version: "0.1.0",
      description: "x",
      license: "MIT",
      publisher: { name: "x" },
      runtime: { kind: "web", entry: { js: "x.js" }, min_host_version: "0.1.0", compatibility: { core_contracts: "^0.1.0", host_api: "^0.1.0" } },
      capabilities: {
        constraints: false,
        solver: false,
        pricing: false,
        render: false,
        export: false,
        ui: { panels: [], wizard_steps: [], commands: [] }
      },
      permissions: {
        network: { allow: false, allowlist: [] },
        storage: { allow: false, scopes: ["none"] },
        project_data: { read: false, write_via_patches: false },
        catalog: { read: false },
        pricing: { read: false },
        orders: { read: false, write: false }
      },
      integrity: {
        channel: "oss",
        signature: { alg: "none", value: "" },
        hashes: {}
      },
      configuration_schema: { type: "object" }
    };

    const res = validate_with_ajv(ajv, "planforge://schemas/plugin-manifest.schema.json", bad);
    expect(res.ok).toBe(false);
  });
});
