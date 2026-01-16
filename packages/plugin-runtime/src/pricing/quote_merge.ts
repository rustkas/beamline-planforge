import type { money, quote, quote_item } from "@planforge/plugin-sdk";

export type pricing_adjustment = {
  kind: "discount" | "surcharge";
  code: string;
  title: string;
  amount: money;
  applies_to?: { item_codes?: string[] };
};

export type pricing_contribution = {
  plugin_id: string;
  add_items?: quote_item[];
  adjustments?: pricing_adjustment[];
};

export type quote_merge_diagnostic = {
  plugin_id: string;
  ok: boolean;
  added_items: number;
  added_adjustments: number;
  errors: string[];
  warnings: string[];
};

export type quote_merge_result = {
  quote: quote;
  diagnostics: quote_merge_diagnostic[];
};

function is_finite_number(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function round_2(amount: number): number {
  return Math.round(amount * 100) / 100;
}

function normalize_currency(base_currency: string, value: money): money {
  const currency = typeof value.currency === "string" && value.currency.length > 0 ? value.currency : base_currency;
  const amount = is_finite_number(value.amount) ? round_2(value.amount) : 0;
  return { currency, amount };
}

function normalize_code(raw: unknown): string {
  const text = String(raw ?? "").trim();
  return text.length > 0 ? text : "unknown";
}

function normalize_title(raw: unknown): string {
  const text = String(raw ?? "").trim();
  return text.length > 0 ? text : "Untitled";
}

function normalize_qty(raw: unknown): number {
  if (!is_finite_number(raw)) return 1;
  return Math.max(0, Math.floor(raw));
}

function compute_amount(qty: number, unit_price: money): money {
  return { currency: unit_price.currency, amount: round_2(qty * unit_price.amount) };
}

function money_add(a: money, b: money): money {
  return { currency: a.currency, amount: round_2(a.amount + b.amount) };
}

function money_sum(currency: string, items: Array<{ amount: money }>): money {
  let total: money = { currency, amount: 0 };
  for (const item of items) {
    total = money_add(total, normalize_currency(currency, item.amount));
  }
  return total;
}

function normalize_item(
  base_currency: string,
  item: quote_item,
  plugin_id: string,
  used_codes: Set<string>
): { item?: quote_item; error?: string; warning?: string } {
  const code_raw = normalize_code(item.code);
  const title = normalize_title(item.title);
  const qty = normalize_qty(item.qty);
  const unit_price = normalize_currency(base_currency, item.unit_price);
  const computed_amount = compute_amount(qty, unit_price);
  const provided_amount = normalize_currency(base_currency, item.amount);

  let warning: string | undefined;
  if (round_2(provided_amount.amount) !== round_2(computed_amount.amount)) {
    warning = `amount mismatch for code=${code_raw}: provided=${provided_amount.amount} computed=${computed_amount.amount}; host uses computed`;
  }

  let code = code_raw;
  if (used_codes.has(code)) {
    code = `plugin.${plugin_id}.${code_raw}`;
  }
  if (used_codes.has(code)) {
    return { error: `duplicate item code even after prefixing: ${code}` };
  }

  used_codes.add(code);

  return {
    item: {
      code,
      title,
      qty,
      unit_price,
      amount: computed_amount,
      meta: item.meta
    },
    warning
  };
}

function normalize_adjustment(
  base_currency: string,
  adjustment: pricing_adjustment,
  plugin_id: string
): { item?: quote_item; error?: string } {
  const code_raw = normalize_code(adjustment.code);
  const code = `pricing.adjustment.${plugin_id}.${code_raw}`;
  const title = normalize_title(adjustment.title);
  const normalized = normalize_currency(base_currency, adjustment.amount);
  const signed_amount =
    adjustment.kind === "discount"
      ? { currency: normalized.currency, amount: -Math.abs(normalized.amount) }
      : { currency: normalized.currency, amount: Math.abs(normalized.amount) };

  return {
    item: {
      code,
      title,
      qty: 1,
      unit_price: signed_amount,
      amount: signed_amount,
      meta: {
        kind: adjustment.kind,
        applies_to: adjustment.applies_to ?? undefined
      }
    }
  };
}

export function merge_quote(base: quote, contributions: pricing_contribution[]): quote_merge_result {
  const currency = base.currency;
  const diagnostics: quote_merge_diagnostic[] = [];
  const used_codes = new Set<string>();
  const merged_items: quote_item[] = [];

  for (const item of base.items) {
    const code = normalize_code(item.code);
    used_codes.add(code);
    merged_items.push({
      code,
      title: normalize_title(item.title),
      qty: normalize_qty(item.qty),
      unit_price: normalize_currency(currency, item.unit_price),
      amount: normalize_currency(currency, item.amount),
      meta: item.meta
    });
  }

  const sorted = [...contributions].sort((a, b) => a.plugin_id.localeCompare(b.plugin_id));

  for (const contribution of sorted) {
    const diagnostic: quote_merge_diagnostic = {
      plugin_id: contribution.plugin_id,
      ok: true,
      added_items: 0,
      added_adjustments: 0,
      errors: [],
      warnings: []
    };

    const add_items = Array.isArray(contribution.add_items) ? contribution.add_items : [];
    for (const item of add_items) {
      const normalized = normalize_item(currency, item, contribution.plugin_id, used_codes);
      if (normalized.error) {
        diagnostic.ok = false;
        diagnostic.errors.push(normalized.error);
        continue;
      }
      if (normalized.warning) diagnostic.warnings.push(normalized.warning);
      merged_items.push(normalized.item as quote_item);
      diagnostic.added_items += 1;
    }

    const adjustments = Array.isArray(contribution.adjustments) ? contribution.adjustments : [];
    for (const adjustment of adjustments) {
      const normalized = normalize_adjustment(currency, adjustment, contribution.plugin_id);
      if (normalized.error) {
        diagnostic.ok = false;
        diagnostic.errors.push(normalized.error);
        continue;
      }
      const code = (normalized.item as quote_item).code;
      if (used_codes.has(code)) {
        diagnostic.ok = false;
        diagnostic.errors.push(`duplicate adjustment code: ${code}`);
        continue;
      }
      used_codes.add(code);
      merged_items.push(normalized.item as quote_item);
      diagnostic.added_adjustments += 1;
    }

    diagnostics.push(diagnostic);
  }

  const total = money_sum(currency, merged_items.map((item) => ({ amount: item.amount })));

  return {
    quote: {
      ruleset_version: base.ruleset_version,
      currency,
      total,
      items: merged_items,
      meta: {
        ...(base.meta ?? {}),
        pricing_plugins: sorted.map((entry) => entry.plugin_id)
      }
    },
    diagnostics
  };
}
