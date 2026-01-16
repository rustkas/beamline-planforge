import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

type json_value = null | boolean | number | string | json_value[] | { [k: string]: json_value };

function is_object(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function collect_refs(value: json_value, out: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collect_refs(item, out);
    return;
  }
  if (!is_object(value)) return;

  for (const [k, v] of Object.entries(value)) {
    if (k === "$ref" && typeof v === "string") out.push(v);
    else collect_refs(v as json_value, out);
  }
}

function is_allowed_ref(ref: string): boolean {
  if (ref.startsWith("#")) return true;
  if (ref.startsWith("planforge://schemas/")) return true;
  return false;
}

describe("schema policy", () => {
  test("all $id use planforge://schemas/ prefix and no external $ref exist", async () => {
    const schemas_dir = path.resolve(process.cwd(), "src", "schemas");
    const entries = await readdir(schemas_dir, { withFileTypes: true });
    const schema_files = entries
      .filter((e) => e.isFile() && e.name.endsWith(".schema.json"))
      .map((e) => path.join(schemas_dir, e.name));

    expect(schema_files.length).toBeGreaterThan(0);

    const bad_ids: string[] = [];
    const bad_refs: Array<{ file: string; ref: string }> = [];

    for (const file of schema_files) {
      const text = await readFile(file, "utf8");
      const schema = JSON.parse(text) as json_value;

      expect(is_object(schema)).toBe(true);
      const id = (schema as Record<string, unknown>).$id;
      if (typeof id !== "string" || !id.startsWith("planforge://schemas/")) {
        bad_ids.push(`${file}: ${String(id)}`);
      }

      const refs: string[] = [];
      collect_refs(schema, refs);
      for (const ref of refs) {
        if (!is_allowed_ref(ref)) {
          bad_refs.push({ file, ref });
        }
      }
    }

    expect(bad_ids).toEqual([]);
    expect(bad_refs).toEqual([]);
  });
});
