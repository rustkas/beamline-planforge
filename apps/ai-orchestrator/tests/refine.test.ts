import { describe, expect, test } from "bun:test";
import { build_explanations, summarize_violations } from "../src/agent/refine";

describe("refine helpers", () => {
  test("summarize_violations groups by code+severity", () => {
    const summary = summarize_violations([
      { code: "x", severity: "warning", message: "", object_ids: [] },
      { code: "x", severity: "warning", message: "", object_ids: [] },
      { code: "x", severity: "error", message: "", object_ids: [] },
      { code: "y", severity: "warning", message: "", object_ids: [] }
    ]);
    expect(summary).toEqual([
      { code: "x", severity: "warning", count: 2 },
      { code: "x", severity: "error", count: 1 },
      { code: "y", severity: "warning", count: 1 }
    ]);
  });

  test("build_explanations returns deterministic groups", () => {
    const sink = build_explanations("move sink near window");
    expect(sink[0].group).toBe("utilities");
    const hob = build_explanations("move hob near vent");
    expect(hob[0].group).toBe("utilities");
    const passage = build_explanations("increase passage");
    expect(passage[0].group).toBe("constraints");
    const upper = build_explanations("remove upper cabinets");
    expect(upper[0].group).toBe("ergonomics");
    const fallback = build_explanations("unknown command");
    expect(fallback[0].group).toBe("rules");
  });
});
