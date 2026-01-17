import { describe, expect, test } from "bun:test";
import { compute_quote } from "../src/pricing/ruleset";

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

describe("pricing", () => {
  test("computes quote deterministically", () => {
    const res = compute_quote(fixture(), "pricing_ruleset_0.1.0");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.quote.items.length).toBe(1);
      expect(res.quote.total.amount).toBeGreaterThan(0);
    }
  });
});
