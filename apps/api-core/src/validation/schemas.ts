import { create_ajv, validate_with_ajv } from "@planforge/core-contracts";

const ajv = create_ajv();

export type schema_validation = { ok: boolean; errors: string[] };

export function validate_kitchen_state(value: unknown): schema_validation {
  return validate_with_ajv(ajv, "planforge://schemas/kitchen_state.schema.json", value);
}

export function validate_wasi_validate_input(value: unknown): schema_validation {
  return validate_with_ajv(ajv, "planforge://schemas/wasi_validate_input.schema.json", value);
}

export function validate_wasi_validate_output(value: unknown): schema_validation {
  return validate_with_ajv(ajv, "planforge://schemas/wasi_validate_output.schema.json", value);
}

export function validate_wasi_pricing_input(value: unknown): schema_validation {
  return validate_with_ajv(ajv, "planforge://schemas/wasi_pricing_input.schema.json", value);
}

export function validate_wasi_pricing_output(value: unknown): schema_validation {
  return validate_with_ajv(ajv, "planforge://schemas/wasi_pricing_output.schema.json", value);
}

export function validate_wasi_export_input(value: unknown): schema_validation {
  return validate_with_ajv(ajv, "planforge://schemas/wasi_export_input.schema.json", value);
}

export function validate_wasi_export_output(value: unknown): schema_validation {
  return validate_with_ajv(ajv, "planforge://schemas/wasi_export_output.schema.json", value);
}
