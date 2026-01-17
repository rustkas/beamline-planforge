function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalize_value(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    const items = value.map((item) => canonicalize_value(item)).join(",");
    return `[${items}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const parts = keys.map((key) => `${JSON.stringify(key)}:${canonicalize_value(record[key])}`);
  return `{${parts.join(",")}}`;
}

export function canonicalize_json(value: unknown): string {
  return canonicalize_value(value);
}
