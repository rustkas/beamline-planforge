import { describe, expect, test } from "bun:test";
import { plan_patch } from "../src/agent/planner";
import { clamp_x_patch } from "../src/agent/repair";

const state = {
  room: { size_mm: { width: 2000 } },
  layout: { objects: [{ transform_mm: { position_mm: { x: 1000 } }, dims_mm: { width: 600 } }] }
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
});
