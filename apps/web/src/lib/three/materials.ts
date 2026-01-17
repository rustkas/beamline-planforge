export type MaterialDefinition = {
  id: string;
  color: string;
  roughness?: number;
  metalness?: number;
};

const material_catalog: Record<string, MaterialDefinition> = {
  mat_front_white: { id: "mat_front_white", color: "#f8f5f0", roughness: 0.7 },
  mat_body_white: { id: "mat_body_white", color: "#f0ede7", roughness: 0.8 },
  mat_top_oak: { id: "mat_top_oak", color: "#b08968", roughness: 0.55 },
  mat_default: { id: "mat_default", color: "#c9b8a7", roughness: 0.75 }
};

const material_priority = ["front", "body", "top"];
let catalog_loaded = false;
let catalog_load_promise: Promise<void> | null = null;

export function pick_primary_material_id(
  material_overrides: Record<string, string> | undefined
): string {
  if (!material_overrides) return "mat_default";
  for (const slot of material_priority) {
    const id = material_overrides[slot];
    if (typeof id === "string" && id.length > 0) {
      return id;
    }
  }
  const ids = Object.values(material_overrides);
  if (ids.length > 0) return ids[0] ?? "mat_default";
  return "mat_default";
}

export function resolve_material(
  material_id: string | undefined
): MaterialDefinition {
  if (material_id && material_catalog[material_id]) {
    return material_catalog[material_id];
  }
  return material_catalog.mat_default;
}

export async function load_material_catalog(url: string): Promise<void> {
  if (catalog_loaded) return;
  if (catalog_load_promise) return catalog_load_promise;

  catalog_load_promise = fetch(url, { cache: "force-cache" })
    .then(async (resp) => {
      if (!resp.ok) throw new Error(`failed to load material catalog: ${resp.status}`);
      const data = (await resp.json()) as { materials?: MaterialDefinition[] };
      if (!data.materials || !Array.isArray(data.materials)) return;
      for (const material of data.materials) {
        if (!material?.id) continue;
        material_catalog[material.id] = material;
      }
      catalog_loaded = true;
    })
    .catch(() => {
      catalog_loaded = false;
    })
    .finally(() => {
      catalog_load_promise = null;
    });

  return catalog_load_promise;
}
