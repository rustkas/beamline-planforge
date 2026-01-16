import { describe, expect, test } from "bun:test";
import { create_ajv } from "../src/validator";

describe("json schemas", () => {
  test("all schemas compile and refs resolve", () => {
    const ajv = create_ajv();

    const ids = [
      "planforge://schemas/plugin-manifest.schema.json",
      "planforge://schemas/kitchen_state.schema.json",
      "planforge://schemas/render_model.schema.json",
      "planforge://schemas/room.schema.json",
      "planforge://schemas/layout.schema.json"
    ] as const;

    for (const id of ids) {
      const v = ajv.getSchema(id);
      expect(v).toBeTruthy();
    }
  });
});
