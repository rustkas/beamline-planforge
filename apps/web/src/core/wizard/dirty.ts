function stable_stringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stable_stringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${stable_stringify(record[key])}`);
  return `{${entries.join(",")}}`;
}

export function is_draft_dirty(draft: unknown, applied: unknown): boolean {
  return stable_stringify(draft) !== stable_stringify(applied);
}
