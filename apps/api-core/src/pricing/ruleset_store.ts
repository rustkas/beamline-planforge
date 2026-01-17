export type PricingRuleset = {
  version: string;
  currency: string;
  delivery: { flat_fee: number };
  installation: { per_module_fee: number };
  discounts: Array<{ code: string; title: string; min_modules: number; percent: number }>;
};

const RULESETS: PricingRuleset[] = [
  {
    version: "pricing_ruleset_0.1.0",
    currency: "USD",
    delivery: { flat_fee: 120 },
    installation: { per_module_fee: 40 },
    discounts: [{ code: "bulk_10", title: "Bulk 10+ modules", min_modules: 10, percent: 5 }]
  }
];

export function get_ruleset(version: string): PricingRuleset | null {
  return RULESETS.find((r) => r.version === version) ?? null;
}

export function list_rulesets(): PricingRuleset[] {
  return [...RULESETS];
}
