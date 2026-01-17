export type Money = {
  currency: string;
  amount: number;
};

export type CatalogKind = "module" | "material" | "appliance";

export type CatalogItem = {
  id: string;
  sku: string;
  kind: CatalogKind;
  title: string;
  price: Money;
  attrs: Record<string, unknown>;
  catalog_version: string;
};

export const CATALOG_VERSION = "catalog_v1_0_0";
export const MODULES_CATALOG_VERSION = "modules_demo_0.1.0";

const ITEMS: CatalogItem[] = [
  {
    id: "base_sink_600",
    sku: "MOD-BASE-SINK-600",
    kind: "module",
    title: "Base Sink 600",
    price: { currency: "USD", amount: 240 },
    attrs: { width_mm: 600, depth_mm: 600, height_mm: 720 },
    catalog_version: CATALOG_VERSION
  },
  {
    id: "base_drawers_800",
    sku: "MOD-BASE-DRAWERS-800",
    kind: "module",
    title: "Base Drawers 800",
    price: { currency: "USD", amount: 280 },
    attrs: { width_mm: 800, depth_mm: 600, height_mm: 720 },
    catalog_version: CATALOG_VERSION
  },
  {
    id: "tall_oven_600",
    sku: "MOD-TALL-OVEN-600",
    kind: "module",
    title: "Tall Oven 600",
    price: { currency: "USD", amount: 520 },
    attrs: { width_mm: 600, depth_mm: 600, height_mm: 2100 },
    catalog_version: CATALOG_VERSION
  },
  {
    id: "mat_front_white",
    sku: "MAT-FRONT-WHITE",
    kind: "material",
    title: "Front White Matte",
    price: { currency: "USD", amount: 35 },
    attrs: { slot: "front" },
    catalog_version: CATALOG_VERSION
  },
  {
    id: "mat_top_oak",
    sku: "MAT-TOP-OAK",
    kind: "material",
    title: "Top Oak",
    price: { currency: "USD", amount: 55 },
    attrs: { slot: "top" },
    catalog_version: CATALOG_VERSION
  },
  {
    id: "appliance_hood_basic",
    sku: "APP-HOOD-BASIC",
    kind: "appliance",
    title: "Hood Basic",
    price: { currency: "USD", amount: 180 },
    attrs: { category: "hood" },
    catalog_version: CATALOG_VERSION
  }
];

const ITEM_INDEX = new Map(ITEMS.map((item) => [item.id, item]));

export function get_catalog_item(id: string): CatalogItem | null {
  return ITEM_INDEX.get(id) ?? null;
}

export function list_catalog_items(kind?: CatalogKind): CatalogItem[] {
  if (!kind) return [...ITEMS];
  return ITEMS.filter((item) => item.kind === kind);
}
