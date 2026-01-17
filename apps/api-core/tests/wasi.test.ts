import { describe, expect, test } from "bun:test";
import { create_app } from "../src/server";
describe("wasi validate", () => {
  const plugin_id = process.env.WASI_PLUGIN_ID;
  if (!plugin_id) {
    test.skip("WASI_PLUGIN_ID not set", () => {});
    return;
  }

  function fixture(): Record<string, unknown> {
    return {
      schema_version: "0.1.0",
      project: {
        project_id: "proj_demo_001",
        revision_id: "rev_0001",
        units: "mm",
        ruleset_version: "pricing_ruleset_0.1.0"
      },
      room: {
        size_mm: { width: 3200, depth: 2600, height: 2700 },
        openings: [],
        utilities: [],
        restricted_zones: []
      },
      layout: {
        objects: [
          {
            id: "obj_base_sink_600",
            kind: "module",
            catalog_item_id: "base_sink_600",
            transform_mm: {
              position_mm: { x: 1000, y: 0 },
              rotation_deg: 0
            },
            dims_mm: { width: 600, depth: 600, height: 720 },
            material_slots: {}
          }
        ]
      },
      catalog_refs: {
        modules_catalog_version: "modules_demo_0.1.0",
        materials_catalog_version: "materials_demo_0.1.0"
      }
    };
  }

  test("runs wasm plugin and returns violations", async () => {
    const app = await create_app();
    const kitchen_state = fixture();
    const res = await app.request("/wasi/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plugin_id, kitchen_state, mode: "full" })
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { violations: unknown[] };
    expect(Array.isArray(json.violations)).toBe(true);
  });
});
