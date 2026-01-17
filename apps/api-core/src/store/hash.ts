function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function canonical_json_stringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);

  if (Array.isArray(value)) {
    const items = value.map((item) => canonical_json_stringify(item));
    return `[${items.join(",")}]`;
  }

  if (is_record(value)) {
    const keys = Object.keys(value).sort();
    const entries = keys.map((k) => `${JSON.stringify(k)}:${canonical_json_stringify(value[k])}`);
    return `{${entries.join(",")}}`;
  }

  return "null";
}
