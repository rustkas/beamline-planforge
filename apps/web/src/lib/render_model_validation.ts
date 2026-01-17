type render_model_validation = { ok: boolean; errors: string[] };

function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function is_string(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function is_number(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function validate_render_model(value: unknown): render_model_validation {
  if (!is_record(value)) return { ok: false, errors: ["root: expected object"] };
  if (!is_string(value.schema_version)) return { ok: false, errors: ["schema_version: missing"] };

  const assets = value.assets;
  if (!is_record(assets) || !is_record(assets.gltf)) {
    return { ok: false, errors: ["assets.gltf: missing"] };
  }

  const nodes = value.nodes;
  if (!Array.isArray(nodes)) {
    return { ok: false, errors: ["nodes: expected array"] };
  }

  for (const node of nodes) {
    if (!is_record(node)) return { ok: false, errors: ["nodes: invalid node"] };
    if (!is_string(node.id)) return { ok: false, errors: ["nodes.id: missing"] };
    if (!is_string(node.gltf_key)) return { ok: false, errors: ["nodes.gltf_key: missing"] };
    if (!is_record(node.transform) || !is_record(node.transform.position_m)) {
      return { ok: false, errors: ["nodes.transform.position_m: missing"] };
    }
    const pos = node.transform.position_m;
    if (!is_number(pos.x) || !is_number(pos.y) || !is_number(pos.z)) {
      return { ok: false, errors: ["nodes.transform.position_m: invalid"] };
    }
  }

  return { ok: true, errors: [] };
}
