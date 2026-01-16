import { describe, expect, test } from "bun:test";
import { merge_quote, type pricing_contribution } from "../src/pricing/quote_merge";

const base_quote = {
  ruleset_version: "ruleset-0",
  currency: "USD",
  total: { currency: "USD", amount: 100 },
  items: [
    {
      code: "base",
      title: "Base",
      qty: 1,
      unit_price: { currency: "USD", amount: 100 },
      amount: { currency: "USD", amount: 100 }
    }
  ]
};

describe("quote_merge", () => {
  test("adds items and adjustments deterministically", () => {
    const contributions: pricing_contribution[] = [
      {
        plugin_id: "b.plugin",
        add_items: [
          {
            code: "fee",
            title: "Fee",
            qty: 1,
            unit_price: { currency: "USD", amount: 10 },
            amount: { currency: "USD", amount: 10 }
          }
        ],
        adjustments: [
          {
            kind: "surcharge",
            code: "rush",
            title: "Rush",
            amount: { currency: "USD", amount: 5 }
          }
        ]
      },
      {
        plugin_id: "a.plugin",
        add_items: [
          {
            code: "fee",
            title: "Fee A",
            qty: 2,
            unit_price: { currency: "USD", amount: 3 },
            amount: { currency: "USD", amount: 6 }
          }
        ]
      }
    ];

    const result = merge_quote(base_quote, contributions);
    const codes = result.quote.items.map((item) => item.code);

    expect(codes).toEqual([
      "base",
      "fee",
      "plugin.b.plugin.fee",
      "pricing.adjustment.b.plugin.rush"
    ]);
    expect(result.quote.total.amount).toBe(121);
  });

  test("conflicting codes are prefixed deterministically", () => {
    const contributions: pricing_contribution[] = [
      {
        plugin_id: "plugin.one",
        add_items: [
          {
            code: "base",
            title: "Override",
            qty: 1,
            unit_price: { currency: "USD", amount: 1 },
            amount: { currency: "USD", amount: 1 }
          }
        ]
      }
    ];

    const result = merge_quote(base_quote, contributions);
    expect(result.quote.items[1].code).toBe("plugin.plugin.one.base");
  });
});
