export type Money = {
  currency: string;
  amount: number;
};

export type CatalogKind = "module" | "material" | "appliance" | "service";

export type CatalogItem = {
  id: string;
  sku: string;
  kind: CatalogKind;
  title: string;
  price: Money;
  region_tags: string[];
  attrs: Record<string, unknown>;
  catalog_version: string;
};

export const CATALOG_VERSION = "catalog_v1_1_0";
export const MODULES_CATALOG_VERSION = "modules_demo_0.1.0";

const ITEMS: CatalogItem[] = [
  {
    id: "base_sink_600",
    sku: "MOD-BASE-SINK-600",
    kind: "module",
    title: "Base Sink 600",
    price: { currency: "USD", amount: 24000 },
    region_tags: ["global"],
    attrs: { width_mm: 600, depth_mm: 600, height_mm: 720 },
    catalog_version: CATALOG_VERSION
  },
  {
    id: "base_drawers_800",
    sku: "MOD-BASE-DRAWERS-800",
    kind: "module",
    title: "Base Drawers 800",
    price: { currency: "USD", amount: 28000 },
    region_tags: ["global"],
    attrs: { width_mm: 800, depth_mm: 600, height_mm: 720 },
    catalog_version: CATALOG_VERSION
  },
  {
    id: "tall_oven_600",
    sku: "MOD-TALL-OVEN-600",
    kind: "module",
    title: "Tall Oven 600",
    price: { currency: "USD", amount: 52000 },
    region_tags: ["global"],
    attrs: { width_mm: 600, depth_mm: 600, height_mm: 2100 },
    catalog_version: CATALOG_VERSION
  },
  {
    id: "mat_front_white",
    sku: "MAT-FRONT-WHITE",
    kind: "material",
    title: "Front White Matte",
    price: { currency: "USD", amount: 3500 },
    region_tags: ["global"],
    attrs: { slot: "front" },
    catalog_version: CATALOG_VERSION
  },
  {
    id: "mat_body_white",
    sku: "MAT-BODY-WHITE",
    kind: "material",
    title: "Body White",
    price: { currency: "USD", amount: 2500 },
    region_tags: ["global"],
    attrs: { slot: "body" },
    catalog_version: CATALOG_VERSION
  },
  {
    id: "mat_top_oak",
    sku: "MAT-TOP-OAK",
    kind: "material",
    title: "Top Oak",
    price: { currency: "USD", amount: 5500 },
    region_tags: ["global"],
    attrs: { slot: "top" },
    catalog_version: CATALOG_VERSION
  },
  {
    id: "appliance_hood_basic",
    sku: "APP-HOOD-BASIC",
    kind: "appliance",
    title: "Hood Basic",
    price: { currency: "USD", amount: 18000 },
    region_tags: ["global"],
    attrs: { category: "hood" },
    catalog_version: CATALOG_VERSION
  },
  {
    id: "appliance_oven_builtin",
    sku: "APP-OVEN-BUILTIN",
    kind: "appliance",
    title: "Built-in Oven",
    price: { currency: "USD", amount: 42000 },
    region_tags: ["global"],
    attrs: { category: "oven" },
    catalog_version: CATALOG_VERSION
  },
  {
    id: "service_delivery_standard",
    sku: "SVC-DELIVERY-STD",
    kind: "service",
    title: "Delivery Standard",
    price: { currency: "USD", amount: 12000 },
    region_tags: ["global"],
    attrs: { service: "delivery" },
    catalog_version: CATALOG_VERSION
  },
  {
    id: "service_installation",
    sku: "SVC-INSTALL",
    kind: "service",
    title: "Installation",
    price: { currency: "USD", amount: 4000 },
    region_tags: ["global"],
    attrs: { service: "installation", unit: "module" },
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
