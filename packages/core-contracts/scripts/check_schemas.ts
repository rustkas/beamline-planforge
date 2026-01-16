import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import Ajv from "ajv";
import add_formats from "ajv-formats";

type json_value = null | boolean | number | string | json_value[] | { [k: string]: json_value };

function is_record(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function collect_refs(value: json_value, out: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collect_refs(item, out);
    return;
  }
  if (!is_record(value)) return;

  for (const [k, v] of Object.entries(value)) {
    if (k === "$ref" && typeof v === "string") {
      out.push(v);
    } else {
      collect_refs(v as json_value, out);
    }
  }
}

async function read_json_file(file_path: string): Promise<json_value> {
  const text = await readFile(file_path, "utf8");
  return JSON.parse(text) as json_value;
}

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function is_local_id(id: string): boolean {
  return id.startsWith("planforge://schemas/");
}

function is_local_ref(ref: string): boolean {
  return ref.startsWith("planforge://schemas/");
}

function is_internal_ref(ref: string): boolean {
  return ref.startsWith("#");
}

async function main(): Promise<void> {
  const schemas_dir = path.resolve(process.cwd(), "src", "schemas");
  const entries = await readdir(schemas_dir, { withFileTypes: true });
  const schema_files = entries
    .filter((e) => e.isFile() && e.name.endsWith(".schema.json"))
    .map((e) => path.join(schemas_dir, e.name));

  expect(schema_files.length > 0, `No *.schema.json files found in ${schemas_dir}`);

  const schemas: json_value[] = [];
  for (const file of schema_files) {
    schemas.push(await read_json_file(file));
  }

  const id_to_file = new Map<string, string>();
  for (let i = 0; i < schemas.length; i++) {
    const s = schemas[i];
    expect(is_record(s), "Schema must be an object");
    const id = s.$id;
    expect(typeof id === "string" && id.length > 0, "Schema missing $id");
    expect(is_local_id(id as string), `Schema $id must use planforge://schemas/ prefix: ${id}`);
    const file = schema_files[i];

    const existing = id_to_file.get(id as string);
    expect(!existing, `Duplicate $id: ${id} (files: ${existing} and ${file})`);
    id_to_file.set(id as string, file);
  }

  const all_ids = new Set<string>(id_to_file.keys());
  const missing_refs: string[] = [];

  for (const s of schemas) {
    const refs: string[] = [];
    collect_refs(s as json_value, refs);

    for (const ref of refs) {
      if (is_internal_ref(ref)) continue;

      if (is_local_ref(ref)) {
        if (!all_ids.has(ref)) missing_refs.push(ref);
        continue;
      }

      missing_refs.push(ref);
    }
  }

  expect(missing_refs.length === 0, `Unresolved or disallowed $ref:\n- ${missing_refs.join("\n- ")}`);

  const ajv = new Ajv({
    strict: true,
    allErrors: true,
    allowUnionTypes: false
  });
  add_formats(ajv);

  for (const s of schemas) {
    ajv.addSchema(s);
  }

  for (const id of all_ids) {
    const validate = ajv.getSchema(id);
    expect(!!validate, `Ajv could not load schema: ${id}`);
    // Force compilation
    validate?.schema;
  }

  const manifest_id = "planforge://schemas/plugin-manifest.schema.json";
  expect(all_ids.has(manifest_id), `Missing manifest schema: ${manifest_id}`);

  process.stdout.write(`OK: ${schema_files.length} schemas checked, ${all_ids.size} ids, refs resolved.\n`);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`SCHEMA CHECK FAILED:\n${msg}\n`);
  process.exitCode = 1;
});
