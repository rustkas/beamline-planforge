import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { create_store } from "../src/store/store";
import { canonical_json_stringify } from "../src/store/hash";

describe("db integration", () => {
  const database_url = process.env.DATABASE_URL;

  if (!database_url) {
    test.skip("DATABASE_URL not set", () => {});
    return;
  }

  test("persists projects, revisions, quotes, orders", async () => {
    const { connect_db } = await import("../src/storage/db");
    const { run_migrations } = await import("../src/storage/migrations");
    const db = connect_db();
    await run_migrations(db);
    await db`
      TRUNCATE orders, quotes, revisions, projects, catalog_items RESTART IDENTITY CASCADE
    `;

    const store = await create_store();

    const state = {
      schema_version: "0.1.0",
      project: {
        project_id: "proj_demo_001",
        revision_id: "rev_0001",
        units: "mm",
        ruleset_version: "pricing_ruleset_0.1.0"
      },
      room: { size_mm: { width: 3200, depth: 2600, height: 2700 }, openings: [], utilities: [], restricted_zones: [] },
      layout: {
        objects: [
          {
            id: "obj_base_sink_600",
            kind: "module",
            catalog_item_id: "base_sink_600",
            transform_mm: { position_mm: { x: 1000, y: 0 }, rotation_deg: 0 },
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

    const { project, revision } = await store.create_project(state, { source: "user" });

    const rev = await store.get_revision(project.project_id, revision.revision_id);
    expect(rev).not.toBeNull();
    if (rev) {
      const expected_hash = createHash("sha256").update(canonical_json_stringify(state)).digest("hex");
      expect(rev.content_hash).toBe(expected_hash);
    }

    const quote = await store.create_quote(project.project_id, revision.revision_id, {
      ruleset_version: "pricing_ruleset_0.1.0",
      currency: "USD",
      total: { currency: "USD", amount: 100 },
      items: [
        {
          code: "module.base_sink_600",
          title: "Base Sink 600",
          qty: 1,
          unit_price: { currency: "USD", amount: 100 },
          amount: { currency: "USD", amount: 100 }
        }
      ],
      diagnostics: []
    });

    expect(quote?.quote_id).toContain("quote_");

    const order = await store.create_order({
      project_id: project.project_id,
      revision_id: revision.revision_id,
      quote: quote!,
      customer: { name: "Test User", email: "test@example.com" },
      delivery: { line1: "Main Street 1", city: "Test City", country: "US" },
      idempotency_key: "idem-db-1"
    });

    expect(order?.order_id).toContain("order_");

    const order2 = await store.create_order({
      project_id: project.project_id,
      revision_id: revision.revision_id,
      quote: quote!,
      customer: { name: "Test User", email: "test@example.com" },
      delivery: { line1: "Main Street 1", city: "Test City", country: "US" },
      idempotency_key: "idem-db-1"
    });

    expect(order2?.order_id).toBe(order?.order_id);
  });
});
