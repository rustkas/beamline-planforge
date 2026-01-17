import { describe, expect, test } from "bun:test";
import type { violation } from "@planforge/plugin-sdk";
import type { plugin_manifest } from "../src/manifest";
import type { loaded_plugin } from "../src/runtime/hook_runner";
import { run_constraints_post_validate_hooks, run_render_post_render_hooks } from "../src/runtime/hook_runner";

function make_manifest(id: string, capabilities: { constraints?: boolean; render?: boolean }): plugin_manifest {
  return {
    manifest_version: "1.0",
    id,
    name: "demo",
    version: "0.1.0",
    description: "demo",
    license: "Apache-2.0",
    publisher: { name: "PlanForge" },
    runtime: {
      kind: "web",
      entry: { js: "dist/loader.js" },
      min_host_version: "0.1.0",
      compatibility: { core_contracts: "^0.1.0", host_api: "^0.1.0" }
    },
    capabilities: {
      constraints: capabilities.constraints ?? false,
      solver: false,
      pricing: false,
      render: capabilities.render ?? false,
      export: false,
      ui: { panels: [], wizard_steps: [], commands: [] }
    },
    integrity: {
      channel: "oss",
      signature: { alg: "none", value: "" },
      hashes: {}
    },
    configuration_schema: { type: "object" },
    permissions: {
      network: { allow: false, allowlist: [] },
      storage: { allow: false, scopes: ["none"] },
      project_data: { read: true, write_via_patches: false },
      catalog: { read: false },
      pricing: { read: false },
      orders: { read: false, write: false }
    }
  };
}

describe("hook runner", () => {
  test("constraints hook merges violations in deterministic order", async () => {
    const base: violation[] = [
      { code: "base", severity: "error", message: "base", object_ids: [] }
    ];

    const plugin_a: loaded_plugin = {
      manifest: make_manifest("a.plugin", { constraints: true }),
      host: {
        call_plugin: async () => ({
          ok: true,
          result: {
            add_violations: [{ code: "a", severity: "warning", message: "a", object_ids: [] }]
          }
        })
      }
    };

    const plugin_b: loaded_plugin = {
      manifest: make_manifest("b.plugin", { constraints: true }),
      host: {
        call_plugin: async () => ({
          ok: true,
          result: {
            add_violations: [{ code: "b", severity: "warning", message: "b", object_ids: [] }]
          }
        })
      }
    };

    const result = await run_constraints_post_validate_hooks({
      plugins: [plugin_b, plugin_a],
      context: { host_version: "0.1.0", plugin_id: "host" },
      kitchen_state: {},
      base_violations: base,
      mode: "full"
    });

    expect(result.violations.map((v) => v.code)).toEqual(["base", "a", "b"]);
  });

  test("render hook aggregates instructions", async () => {
    const plugin_a: loaded_plugin = {
      manifest: make_manifest("a.plugin", { render: true }),
      host: {
        call_plugin: async () => ({
          ok: true,
          result: { instructions: [{ kind: "highlight", object_ids: ["a"], style: { mode: "outline" } }] }
        })
      }
    };

    const result = await run_render_post_render_hooks({
      plugins: [plugin_a] as any,
      context: { host_version: "0.1.0", plugin_id: "host" },
      kitchen_state: {},
      render_model: {},
      quality: "draft"
    });

    expect(result.instructions.length).toBe(1);
  });
});
