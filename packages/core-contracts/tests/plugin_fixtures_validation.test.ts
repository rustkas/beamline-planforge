import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { create_ajv, validate_with_ajv } from "../src/validator";

async function read_fixture(rel: string): Promise<unknown> {
  const text = await readFile(new URL(rel, import.meta.url), "utf8");
  return JSON.parse(text) as unknown;
}

describe("plugin manifest fixtures validate", () => {
  test("oss wasm manifest fixture is valid", async () => {
    const ajv = create_ajv();
    const fixture = await read_fixture("./fixtures/plugin_manifest_oss_wasm.fixture.json");
    const res = validate_with_ajv(ajv, "planforge://schemas/plugin-manifest.schema.json", fixture);
    expect(res.ok).toBe(true);
    expect(res.errors).toEqual([]);
  });

  test("paid wasm manifest fixture is valid", async () => {
    const ajv = create_ajv();
    const fixture = await read_fixture("./fixtures/plugin_manifest_paid_wasm.fixture.json");
    const res = validate_with_ajv(ajv, "planforge://schemas/plugin-manifest.schema.json", fixture);
    expect(res.ok).toBe(true);
    expect(res.errors).toEqual([]);
  });
});
