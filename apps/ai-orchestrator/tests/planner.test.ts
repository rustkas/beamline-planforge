import { describe, expect, test } from "bun:test";
import { plan_patch } from "../src/agent/planner";
import { clamp_x_patch } from "../src/agent/repair";

const state = {
  room: {
    size_mm: { width: 2000, depth: 2000 },
    openings: [{ id: "win1", kind: "window", wall_id: "north", offset_mm: 500, width_mm: 600, height_mm: 1200 }],
    utilities: [{ id: "vent1", kind: "vent", wall_id: "east", offset_mm: 400 }]
  },
  layout: {
    objects: [
      {
        id: "sink1",
        tags: ["sink"],
        transform_mm: { position_mm: { x: 1000, y: 0 } },
        dims_mm: { width: 600, depth: 600 }
      },
      {
        id: "hob1",
        tags: ["hob"],
        transform_mm: { position_mm: { x: 1000, y: 0 } },
        dims_mm: { width: 600, depth: 600 }
      },
      {
        id: "upper1",
        tags: ["upper"],
        transform_mm: { position_mm: { x: 1000, y: 0 } },
        dims_mm: { width: 600, depth: 300 }
      }
    ]
  }
};

describe("planner", () => {
  test("english set", () => {
    const res = plan_patch("move first object x to 1200", state);
    expect(res.ok).toBe(true);
  });

  test("english delta", () => {
    const res = plan_patch("move first object x by -200", state);
    expect(res.ok).toBe(true);
  });

  test("russian set", () => {
    const res = plan_patch("поставь x 900", state);
    expect(res.ok).toBe(true);
  });

  test("clamp repair", () => {
    const res = plan_patch("move first object x to 3000", state);
    if (!res.ok) throw new Error("expected patch");
    const clamped = clamp_x_patch(state, res.patch);
    const value = clamped.ops[0].value as number;
    expect(value).toBe(1400);
  });

  test("move sink near window", () => {
    const res = plan_patch("move sink near window", state);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.patch.ops.length).toBe(2);
    }
  });

  test("move hob near vent", () => {
    const res = plan_patch("move hob near vent", state);
    expect(res.ok).toBe(true);
  });

  test("increase passage", () => {
    const res = plan_patch("increase passage", state);
    expect(res.ok).toBe(true);
  });

  test("remove upper cabinets", () => {
    const res = plan_patch("remove upper cabinets", state);
    expect(res.ok).toBe(true);
    if (res.ok) {
      const value = res.patch.ops[0].value as any[];
      expect(value.length).toBe(2);
    }
  });
});
