import { get_catalog_item, MODULES_CATALOG_VERSION, type Money } from "../catalog/catalog";
import { get_ruleset, type PricingRuleset } from "./ruleset_store";
import type { QuoteItem } from "../store/store";

export const PRICING_RULESET_VERSION = "pricing_ruleset_0.1.0";

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

function round_2(amount: number): number {
  return Math.round(amount * 100) / 100;
}

function money_add(a: Money, b: Money): Money {
  return { currency: a.currency, amount: round_2(a.amount + b.amount) };
}

function compute_amount(qty: number, unit_price: Money): Money {
  return { currency: unit_price.currency, amount: round_2(qty * unit_price.amount) };
}

function normalize_code(value: string): string {
  return value.replace(/\s+/g, "_").toLowerCase();
}

export function compute_quote(
  kitchen_state: unknown,
  ruleset_version: string
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
  const counts = new Map<string, number>();
  for (const obj of objects) {
    if (!obj || typeof obj.catalog_item_id !== "string") continue;
    const id = obj.catalog_item_id;
    counts.set(id, (counts.get(id) ?? 0) + 1);
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
    if (item.kind != "module") {
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

  const installation = ruleset.installation;
  if (installation.per_module_fee > 0 && module_qty_total > 0) {
    const fee = {
      currency: ruleset.currency,
      amount: installation.per_module_fee
    };
    const amount = compute_amount(module_qty_total, fee);
    items.push({
      code: "pricing.adjustment.installation",
      title: "Installation",
      qty: module_qty_total,
      unit_price: fee,
      amount,
      meta: { per_module_fee: installation.per_module_fee }
    });
    total = money_add(total, amount);
  }

  const delivery = ruleset.delivery;
  if (delivery.flat_fee > 0) {
    const amount = { currency: ruleset.currency, amount: round_2(delivery.flat_fee) };
    items.push({
      code: "pricing.adjustment.delivery",
      title: "Delivery",
      qty: 1,
      unit_price: amount,
      amount,
      meta: { flat_fee: delivery.flat_fee }
    });
    total = money_add(total, amount);
  }

  if (ruleset.discounts.length > 0) {
    for (const discount of ruleset.discounts) {
      if (module_qty_total < discount.min_modules) continue;
      const discount_amount = round_2((total.amount * discount.percent) / 100);
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
      meta: { catalog_version: MODULES_CATALOG_VERSION }
    }
  };
}
