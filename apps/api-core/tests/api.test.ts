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

describe("api-core", () => {
  test("POST /projects creates project", async () => {
    const app = create_app();
    const res = await app.request("/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fixture())
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { project_id: string; revision_id: string };
    expect(json.project_id).toContain("proj_");
    expect(json.revision_id).toContain("rev_");
  });

  test("PATCH creates new revision", async () => {
    const app = create_app();
    const create = await app.request("/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fixture())
    });
    const created = (await create.json()) as { project_id: string; revision_id: string };

    const patch = {
      ops: [
        {
          op: "replace",
          path: "/layout/objects/0/transform_mm/position_mm/x",
          value: 1200
        }
      ]
    };

    const res = await app.request(`/projects/${created.project_id}/revisions/${created.revision_id}/patch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch)
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as { new_revision_id: string };
    expect(json.new_revision_id).toContain("rev_");
  });

  test("Render returns nodes", async () => {
    const app = create_app();
    const create = await app.request("/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fixture())
    });
    const created = (await create.json()) as { project_id: string; revision_id: string };

    const res = await app.request(`/projects/${created.project_id}/revisions/${created.revision_id}/render`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quality: "draft" })
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as { nodes: unknown[] };
    expect(Array.isArray(json.nodes)).toBe(true);
    expect(json.nodes.length).toBe(1);
  });

  test("Invalid schema returns 400", async () => {
    const app = create_app();
    const res = await app.request("/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bad: true })
    });

    expect(res.status).toBe(400);
  });
});
