import { get_catalog_item, MODULES_CATALOG_VERSION, type Money } from "../catalog/catalog";
import { get_ruleset, type PricingRuleset } from "./ruleset_store";
import type { QuoteItem } from "../store/store";

export const PRICING_RULESET_VERSION = "pricing_ruleset_v1";

export type Quote = {
  ruleset_version: string;
  currency: string;
  total: Money;
  items: QuoteItem[];
  meta?: Record<string, unknown>;
};

type PricingError = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

function money_add(a: Money, b: Money): Money {
  return { currency: a.currency, amount: Math.round(a.amount + b.amount) };
}

function compute_amount(qty: number, unit_price: Money): Money {
  return { currency: unit_price.currency, amount: Math.round(qty * unit_price.amount) };
}

function normalize_code(value: string): string {
  return value.replace(/\s+/g, "_").toLowerCase();
}

function get_region_multiplier_bps(ruleset: PricingRuleset, region: string): number {
  return ruleset.region_multipliers_bps[region] ?? ruleset.region_multipliers_bps.global ?? 10000;
}

function apply_multiplier(amount: number, bps: number): number {
  return Math.round((amount * bps) / 10000);
}

function should_include_region(tags: string[] | undefined, region: string): boolean {
  if (!tags || tags.length === 0) return true;
  if (tags.includes(region)) return true;
  return tags.includes("global");
}

export function compute_quote(
  kitchen_state: unknown,
  ruleset_version: string,
  pricing_context?: { region?: string }
): { ok: true; quote: Quote } | { ok: false; error: PricingError } {
  const ruleset = get_ruleset(ruleset_version);
  if (!ruleset) {
    return {
      ok: false,
      error: {
        code: "pricing.ruleset_mismatch",
        message: "Unsupported pricing ruleset",
        details: { ruleset_version }
      }
    };
  }

  const state = kitchen_state as any;
  const catalog_version = state?.catalog_refs?.modules_catalog_version;
  if (catalog_version !== MODULES_CATALOG_VERSION) {
    return {
      ok: false,
      error: {
        code: "pricing.catalog_version_mismatch",
        message: "Unsupported modules catalog version",
        details: { catalog_version, expected: MODULES_CATALOG_VERSION }
      }
    };
  }

  const objects = Array.isArray(state?.layout?.objects) ? state.layout.objects : [];
  const region = pricing_context?.region ?? "global";
  const region_multiplier_bps = get_region_multiplier_bps(ruleset, region);
  const counts = new Map<string, number>();
  const material_counts = new Map<string, number>();
  const appliance_counts = new Map<string, number>();

  for (const obj of objects) {
    if (!obj || typeof obj.catalog_item_id !== "string") continue;
    const id = obj.catalog_item_id;
    if (obj.kind === "appliance") {
      appliance_counts.set(id, (appliance_counts.get(id) ?? 0) + 1);
    } else {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }

    if (obj.material_slots && typeof obj.material_slots === "object") {
      for (const material_id of Object.values(obj.material_slots)) {
        if (typeof material_id !== "string") continue;
        material_counts.set(material_id, (material_counts.get(material_id) ?? 0) + 1);
      }
    }
  }

  const items: QuoteItem[] = [];
  let total: Money = { currency: ruleset.currency, amount: 0 };
  let module_qty_total = 0;

  const sorted_ids = [...counts.keys()].sort();
  for (const catalog_item_id of sorted_ids) {
    const qty = counts.get(catalog_item_id) ?? 0;
    const item = get_catalog_item(catalog_item_id);
    if (!item) {
      return {
        ok: false,
        error: {
          code: "pricing.catalog_item_missing",
          message: "Catalog item not found",
          details: { catalog_item_id }
        }
      };
    }
    if (item.kind !== "module") {
      continue;
    }
    if (!should_include_region(item.region_tags, region)) {
      continue;
    }
    const unit_price = item.price;
    const amount = compute_amount(qty, unit_price);
    items.push({
      code: `module.${normalize_code(item.sku)}`,
      title: item.title,
      qty,
      unit_price,
      amount,
      meta: { catalog_item_id, sku: item.sku }
    });
    total = money_add(total, amount);
    module_qty_total += qty;
  }

  const sorted_materials = [...material_counts.keys()].sort();
  for (const material_id of sorted_materials) {
    const qty = material_counts.get(material_id) ?? 0;
    const item = get_catalog_item(material_id);
    if (!item || item.kind !== "material") {
      return {
        ok: false,
        error: {
          code: "pricing.material_missing",
          message: "Material catalog item missing",
          details: { material_id }
        }
      };
    }
    if (!should_include_region(item.region_tags, region)) {
      continue;
    }
    const amount = compute_amount(qty, item.price);
    items.push({
      code: `material.${normalize_code(item.sku)}`,
      title: item.title,
      qty,
      unit_price: item.price,
      amount,
      meta: { catalog_item_id: material_id, sku: item.sku }
    });
    total = money_add(total, amount);
  }

  const sorted_appliances = [...appliance_counts.keys()].sort();
  for (const appliance_id of sorted_appliances) {
    const qty = appliance_counts.get(appliance_id) ?? 0;
    const item = get_catalog_item(appliance_id);
    if (!item || item.kind !== "appliance") {
      return {
        ok: false,
        error: {
          code: "pricing.appliance_missing",
          message: "Appliance catalog item missing",
          details: { appliance_id }
        }
      };
    }
    if (!should_include_region(item.region_tags, region)) {
      continue;
    }
    const amount = compute_amount(qty, item.price);
    items.push({
      code: `appliance.${normalize_code(item.sku)}`,
      title: item.title,
      qty,
      unit_price: item.price,
      amount,
      meta: { catalog_item_id: appliance_id, sku: item.sku }
    });
    total = money_add(total, amount);
  }

  const delivery_item = get_catalog_item(ruleset.services.delivery_service_id);
  if (delivery_item && delivery_item.kind === "service" && should_include_region(delivery_item.region_tags, region)) {
    const base_amount = apply_multiplier(delivery_item.price.amount, region_multiplier_bps);
    const unit_price = { currency: delivery_item.price.currency, amount: base_amount };
    const amount = compute_amount(1, unit_price);
    items.push({
      code: `service.${normalize_code(delivery_item.sku)}`,
      title: delivery_item.title,
      qty: 1,
      unit_price,
      amount,
      meta: { catalog_item_id: delivery_item.id, sku: delivery_item.sku, region }
    });
    total = money_add(total, amount);
  }

  const install_item = get_catalog_item(ruleset.services.installation_service_id);
  if (
    install_item &&
    install_item.kind === "service" &&
    module_qty_total > 0 &&
    should_include_region(install_item.region_tags, region)
  ) {
    const base_amount = apply_multiplier(install_item.price.amount, region_multiplier_bps);
    const unit_price = { currency: install_item.price.currency, amount: base_amount };
    const amount = compute_amount(module_qty_total, unit_price);
    items.push({
      code: `service.${normalize_code(install_item.sku)}`,
      title: install_item.title,
      qty: module_qty_total,
      unit_price,
      amount,
      meta: { catalog_item_id: install_item.id, sku: install_item.sku, region, unit: "module" }
    });
    total = money_add(total, amount);
  }

  if (ruleset.discounts.length > 0) {
    for (const discount of ruleset.discounts) {
      if (module_qty_total < discount.min_modules) continue;
      const discount_amount = Math.round((total.amount * discount.percent) / 100);
      const amount = { currency: ruleset.currency, amount: -Math.abs(discount_amount) };
      items.push({
        code: `pricing.adjustment.${normalize_code(discount.code)}`,
        title: discount.title,
        qty: 1,
        unit_price: amount,
        amount,
        meta: { percent: discount.percent, min_modules: discount.min_modules }
      });
      total = money_add(total, amount);
    }
  }

  return {
    ok: true,
    quote: {
      ruleset_version: ruleset.version,
      currency: total.currency,
      total,
      items,
      meta: {
        catalog_version: MODULES_CATALOG_VERSION,
        region,
        minor_unit: ruleset.minor_unit
      }
    }
  };
}
