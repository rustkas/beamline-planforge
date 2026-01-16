import Ajv from "ajv";
import add_formats from "ajv-formats";
import draft2020 from "ajv/dist/refs/json-schema-draft-2020-12.json";
import { get_all_schemas } from "./load_schemas";

export type schema_id =
  | "planforge://schemas/plugin-manifest.schema.json"
  | "planforge://schemas/kitchen_state.schema.json"
  | "planforge://schemas/render_model.schema.json";

export interface validation_result {
  ok: boolean;
  errors: string[];
}

function format_errors(errors: Ajv.ErrorObject[] | null | undefined): string[] {
  if (!errors || errors.length === 0) return [];
  return errors.map((e) => {
    const path = e.instancePath && e.instancePath.length > 0 ? e.instancePath : "/";
    const msg = e.message ?? "validation error";
    return `${path}: ${msg}`;
  });
}

export function create_ajv(): Ajv {
  const ajv = new Ajv({
    strict: true,
    allErrors: true,
    allowUnionTypes: false
  });

  ajv.addMetaSchema(draft2020);
  add_formats(ajv);

  for (const schema of get_all_schemas()) {
    ajv.addSchema(schema);
  }

  return ajv;
}

export function validate_with_ajv(ajv: Ajv, schema: schema_id, value: unknown): validation_result {
  const validate = ajv.getSchema(schema);
  if (!validate) {
    return { ok: false, errors: [`schema not found: ${schema}`] };
  }

  const ok = validate(value) as boolean;
  return { ok, errors: ok ? [] : format_errors(validate.errors) };
}
