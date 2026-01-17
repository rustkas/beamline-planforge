import { get_module_item, MODULES_CATALOG_VERSION, type Money } from "../catalog/catalog";
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

export function compute_quote(kitchen_state: unknown): { ok: true; quote: Quote } | { ok: false; error: PricingError } {
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
  let total: Money = { currency: "USD", amount: 0 };

  for (const [catalog_item_id, qty] of counts) {
    const item = get_module_item(catalog_item_id);
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
    const unit_price = item.price;
    const amount = compute_amount(qty, unit_price);
    items.push({
      code: `module.${catalog_item_id}`,
      title: item.title,
      qty,
      unit_price,
      amount,
      meta: { catalog_item_id }
    });
    total = money_add(total, amount);
  }

  return {
    ok: true,
    quote: {
      ruleset_version: PRICING_RULESET_VERSION,
      currency: total.currency,
      total,
      items,
      meta: { catalog_version: MODULES_CATALOG_VERSION }
    }
  };
}
