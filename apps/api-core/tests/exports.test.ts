import { describe, expect, test } from "bun:test";
import { create_app } from "../src/server";

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
          material_slots: {
            front: "mat_front_white",
            body: "mat_body_white",
            top: "mat_top_oak"
          }
        }
      ]
    },
    catalog_refs: {
      modules_catalog_version: "modules_demo_0.1.0",
      materials_catalog_version: "materials_demo_0.1.0"
    }
  };
}

describe("exports", () => {
  test("exports are deterministic", async () => {
    const app = await create_app();
    const created = await app.request("/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fixture())
    });
    const json = (await created.json()) as { project_id: string; revision_id: string };

    const first = await app.request("/exports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project_id: json.project_id, revision_id: json.revision_id, format: "json" })
    });
    expect(first.status).toBe(200);
    const first_json = (await first.json()) as { artifacts: Array<{ id: string; sha256: string }> };

    const second = await app.request("/exports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project_id: json.project_id, revision_id: json.revision_id, format: "json" })
    });
    const second_json = (await second.json()) as { artifacts: Array<{ id: string; sha256: string }> };

    const first_map = new Map(first_json.artifacts.map((a) => [a.id, a.sha256]));
    const second_map = new Map(second_json.artifacts.map((a) => [a.id, a.sha256]));

    expect(first_map.get("client_spec")).toBe(second_map.get("client_spec"));
    expect(first_map.get("production_spec")).toBe(second_map.get("production_spec"));
    expect(first_map.get("pdf_stub")).toBe(second_map.get("pdf_stub"));
  });
});
