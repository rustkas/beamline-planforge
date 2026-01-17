import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { create_app } from "../src/server";

function fixture(): Record<string, unknown> {
  return {
    schema_version: "0.1.0",
    project: {
      project_id: "proj_demo_001",
      revision_id: "rev_0001",
      units: "mm",
      ruleset_version: "pricing_ruleset_v1"
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
    const app = await create_app();
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
    const app = await create_app();
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
    const app = await create_app();
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
    const json = (await res.json()) as {
      nodes: Array<{ material_overrides?: Record<string, string>; lod?: number; gltf_key?: string }>;
      assets?: { gltf?: Record<string, { uri?: string }> };
    };
    expect(Array.isArray(json.nodes)).toBe(true);
    expect(json.nodes.length).toBe(1);
    expect(json.nodes[0]?.material_overrides?.front).toBe("mat_front_white");
    const gltf_key = json.nodes[0]?.gltf_key ?? "base_sink_600";
    const uri = json.assets?.gltf?.[gltf_key]?.uri ?? "";
    expect(uri).toContain(`assets/models/${gltf_key}`);
  });

  test("Quote returns deterministic items", async () => {
    const app = await create_app();
    const create = await app.request("/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fixture())
    });
    const created = (await create.json()) as { project_id: string; revision_id: string };
    const res = await app.request("/quotes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project_id: created.project_id, revision_id: created.revision_id })
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as { quote_id: string; items: Array<{ code: string }>; total: { amount: number } };
    expect(json.quote_id).toContain("quote_");
    expect(Array.isArray(json.items)).toBe(true);
    expect(json.items.map((item) => item.code)).toContain("service.svc-delivery-std");
    expect(json.total.amount).toBeGreaterThan(0);
  });

  test("Order freezes quote", async () => {
    const app = await create_app();
    const create = await app.request("/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fixture())
    });
    const created = (await create.json()) as { project_id: string; revision_id: string };

    const quote = await app.request("/quotes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project_id: created.project_id, revision_id: created.revision_id })
    });
    const quote_json = (await quote.json()) as { quote_id: string };

    const order = await app.request("/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project_id: created.project_id,
        revision_id: created.revision_id,
        quote_id: quote_json.quote_id,
        customer: { name: "Test User", email: "test@example.com" },
        delivery: { line1: "Main Street 1", city: "Test City", country: "US" }
      })
    });

    expect(order.status).toBe(200);
    const order_json = (await order.json()) as { order_id: string; status: string };
    expect(order_json.order_id).toContain("order_");
    expect(order_json.status).toBe("confirmed");
  });

  test("Order rejects quote from another revision", async () => {
    const app = await create_app();
    const create = await app.request("/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fixture())
    });
    const created = (await create.json()) as { project_id: string; revision_id: string };

    const quote = await app.request("/quotes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project_id: created.project_id, revision_id: created.revision_id })
    });
    const quote_json = (await quote.json()) as { quote_id: string };

    const patch = {
      ops: [{ op: "replace", path: "/layout/objects/0/transform_mm/position_mm/x", value: 1200 }]
    };
    const patch_res = await app.request(`/projects/${created.project_id}/revisions/${created.revision_id}/patch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch)
    });
    const patch_json = (await patch_res.json()) as { new_revision_id: string };

    const order = await app.request("/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project_id: created.project_id,
        revision_id: patch_json.new_revision_id,
        quote_id: quote_json.quote_id,
        customer: { name: "Test User", email: "test@example.com" },
        delivery: { line1: "Main Street 1", city: "Test City", country: "US" }
      })
    });

    expect(order.status).toBe(400);
  });

  test("Order idempotency key returns same order", async () => {
    const app = await create_app();
    const create = await app.request("/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fixture())
    });
    const created = (await create.json()) as { project_id: string; revision_id: string };

    const quote = await app.request("/quotes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project_id: created.project_id, revision_id: created.revision_id })
    });
    const quote_json = (await quote.json()) as { quote_id: string };

    const payload = {
      project_id: created.project_id,
      revision_id: created.revision_id,
      quote_id: quote_json.quote_id,
      customer: { name: "Test User", email: "test@example.com" },
      delivery: { line1: "Main Street 1", city: "Test City", country: "US" }
    };

    const first = await app.request("/orders", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "abc-123" },
      body: JSON.stringify(payload)
    });
    const first_json = (await first.json()) as { order_id: string };

    const second = await app.request("/orders", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "abc-123" },
      body: JSON.stringify(payload)
    });
    const second_json = (await second.json()) as { order_id: string };

    expect(first_json.order_id).toBe(second_json.order_id);
  });

  test("GET /quotes/:id returns stored quote", async () => {
    const app = await create_app();
    const create = await app.request("/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fixture())
    });
    const created = (await create.json()) as { project_id: string; revision_id: string };

    const quote = await app.request("/quotes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project_id: created.project_id, revision_id: created.revision_id })
    });
    const quote_json = (await quote.json()) as { quote_id: string };

    const res = await app.request(`/quotes/${quote_json.quote_id}`);
    expect(res.status).toBe(200);
    const loaded = (await res.json()) as { quote_id: string };
    expect(loaded.quote_id).toBe(quote_json.quote_id);
  });

  test("Invalid schema returns 400", async () => {
    const app = await create_app();
    const res = await app.request("/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bad: true })
    });

    expect(res.status).toBe(400);
  });

  test("Assets endpoint serves files with cache headers", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "planforge-assets-"));
    const file_path = path.join(dir, "models", "demo", "lod0.glb");
    await mkdir(path.dirname(file_path), { recursive: true });
    await writeFile(file_path, new Uint8Array([0x67, 0x6c, 0x54, 0x46]));
    process.env.ASSETS_DIR = dir;

    const app = await create_app();
    const res = await app.request("/assets/models/demo/lod0.glb");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("model/gltf-binary");
    expect(res.headers.get("cache-control")).toContain("max-age=");
    expect(res.headers.get("etag")).toBeTruthy();

    const not_modified = await app.request("/assets/models/demo/lod0.glb", {
      headers: { "if-none-match": res.headers.get("etag") ?? "" }
    });
    expect(not_modified.status).toBe(304);

    await writeFile(`${file_path}.gz`, new Uint8Array([0x1f, 0x8b, 0x08, 0x00]));
    const gz = await app.request("/assets/models/demo/lod0.glb", {
      headers: { "accept-encoding": "gzip" }
    });
    expect(gz.status).toBe(200);
    expect(gz.headers.get("content-encoding")).toBe("gzip");
    expect(gz.headers.get("vary")).toBe("accept-encoding");

    const by_id = await app.request("/assets/asset_demo?lod=0");
    expect(by_id.status).toBe(200);

    await rm(dir, { recursive: true, force: true });
  });
});
