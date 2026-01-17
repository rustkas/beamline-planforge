export type Money = {
  currency: string;
  amount: number;
};

export type CatalogModuleItem = {
  id: string;
  title: string;
  price: Money;
};

export const MODULES_CATALOG_VERSION = "modules_demo_0.1.0";

const MODULES: CatalogModuleItem[] = [
  { id: "base_sink_600", title: "Base Sink 600", price: { currency: "USD", amount: 240 } },
  { id: "base_drawers_800", title: "Base Drawers 800", price: { currency: "USD", amount: 280 } },
  { id: "tall_oven_600", title: "Tall Oven 600", price: { currency: "USD", amount: 520 } }
];

const MODULE_INDEX = new Map(MODULES.map((item) => [item.id, item]));

export function get_module_item(id: string): CatalogModuleItem | null {
  return MODULE_INDEX.get(id) ?? null;
}

export function list_modules(): CatalogModuleItem[] {
  return [...MODULES];
}
