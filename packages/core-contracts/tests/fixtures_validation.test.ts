import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { create_ajv, validate_with_ajv } from "../src/validator";

async function read_json(rel: string): Promise<unknown> {
  const text = await readFile(new URL(rel, import.meta.url), "utf8");
  return JSON.parse(text) as unknown;
}

describe("fixtures validate against schemas", () => {
  test("KitchenState fixture is valid", async () => {
    const ajv = create_ajv();
    const fixture = await read_json("./fixtures/kitchen_state.fixture.json");
    const res = validate_with_ajv(ajv, "planforge://schemas/kitchen_state.schema.json", fixture);
    expect(res.ok).toBe(true);
    expect(res.errors).toEqual([]);
  });

  test("RenderModel fixture is valid", async () => {
    const ajv = create_ajv();
    const fixture = await read_json("./fixtures/render_model.fixture.json");
    const res = validate_with_ajv(ajv, "planforge://schemas/render_model.schema.json", fixture);
    expect(res.ok).toBe(true);
    expect(res.errors).toEqual([]);
  });

  test("Room fixtures are valid", async () => {
    const ajv = create_ajv();
    const basic = await read_json("./fixtures/room_basic.fixture.json");
    const detailed = await read_json("./fixtures/room_with_openings_utilities.fixture.json");

    const res_basic = validate_with_ajv(ajv, "planforge://schemas/room.schema.json", basic);
    const res_detailed = validate_with_ajv(ajv, "planforge://schemas/room.schema.json", detailed);

    expect(res_basic.ok).toBe(true);
    expect(res_basic.errors).toEqual([]);
    expect(res_detailed.ok).toBe(true);
    expect(res_detailed.errors).toEqual([]);
  });

  test("Proposal fixtures are valid", async () => {
    const ajv = create_ajv();
    const fixture = await read_json("./fixtures/proposals_3_variants.fixture.json");
    expect(Array.isArray(fixture)).toBe(true);
    for (const item of fixture as unknown[]) {
      const res = validate_with_ajv(ajv, "planforge://schemas/proposal.schema.json", item);
      expect(res.ok).toBe(true);
      expect(res.errors).toEqual([]);
    }
  });
});
