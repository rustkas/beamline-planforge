import { create_ajv, validate_with_ajv } from "@planforge/core-contracts";

const ajv = create_ajv();

export type schema_validation = { ok: boolean; errors: string[] };

export function validate_kitchen_state(value: unknown): schema_validation {
  return validate_with_ajv(ajv, "planforge://schemas/kitchen_state.schema.json", value);
}
