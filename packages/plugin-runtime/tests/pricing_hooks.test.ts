import { describe, expect, test } from "bun:test";
import type { loaded_plugin } from "../src/runtime/hook_runner";
import { run_pricing_post_quote_hooks } from "../src/pricing/run_pricing_hooks";

const base_quote = {
  ruleset_version: "ruleset-0",
  currency: "USD",
  total: { currency: "USD", amount: 0 },
  items: []
};

describe("pricing hooks", () => {
  test("collects contributions in deterministic order", async () => {
    const plugin_a: loaded_plugin = {
      manifest: {
        manifest_version: "1.0",
        id: "a.plugin",
        name: "A",
        version: "0.1.0",
        description: "A",
        license: "Apache-2.0",
        publisher: { name: "PlanForge" },
        runtime: {
          kind: "web",
          entry: { js: "dist/loader.js" },
          min_host_version: "0.1.0",
          compatibility: { core_contracts: "^0.1.0", host_api: "^0.1.0" }
        },
        capabilities: {
          constraints: false,
          solver: false,
          pricing: true,
          render: false,
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
      },
      host: {
        call_plugin: async () => ({
          ok: true,
          result: {
            add_items: [
              {
                code: "a",
                title: "A",
                qty: 1,
                unit_price: { currency: "USD", amount: 1 },
                amount: { currency: "USD", amount: 1 }
              }
            ]
          }
        })
      }
    };

    const plugin_b: loaded_plugin = {
      manifest: {
        manifest_version: "1.0",
        id: "b.plugin",
        name: "B",
        version: "0.1.0",
        description: "B",
        license: "Apache-2.0",
        publisher: { name: "PlanForge" },
        runtime: {
          kind: "web",
          entry: { js: "dist/loader.js" },
          min_host_version: "0.1.0",
          compatibility: { core_contracts: "^0.1.0", host_api: "^0.1.0" }
        },
        capabilities: {
          constraints: false,
          solver: false,
          pricing: true,
          render: false,
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
      },
      host: {
        call_plugin: async () => ({
          ok: true,
          result: {
            adjustments: [
              {
                kind: "surcharge",
                code: "b",
                title: "B",
                amount: { currency: "USD", amount: 2 }
              }
            ]
          }
        })
      }
    };

    const res = await run_pricing_post_quote_hooks({
      plugins: [plugin_b, plugin_a],
      context: { host_version: "0.1.0", plugin_id: "host" },
      kitchen_state: {},
      base_quote
    });

    expect(res.contributions.map((c) => c.plugin_id)).toEqual(["a.plugin", "b.plugin"]);
    expect(res.diagnostics.length).toBe(2);
  });
});
