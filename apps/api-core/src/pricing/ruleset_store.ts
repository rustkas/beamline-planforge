export type PricingRuleset = {
  version: string;
  currency: string;
  minor_unit: number;
  region_multipliers_bps: Record<string, number>;
  services: {
    delivery_service_id: string;
    installation_service_id: string;
  };
  discounts: Array<{ code: string; title: string; min_modules: number; percent: number }>;
};

const RULESETS: PricingRuleset[] = [
  {
    version: "pricing_ruleset_v1",
    currency: "USD",
    minor_unit: 100,
    region_multipliers_bps: {
      global: 10000,
      eu: 11000,
      us: 10000
    },
    services: {
      delivery_service_id: "service_delivery_standard",
      installation_service_id: "service_installation"
    },
    discounts: [{ code: "bulk_10", title: "Bulk 10+ modules", min_modules: 10, percent: 5 }]
  }
];

export function get_ruleset(version: string): PricingRuleset | null {
  return RULESETS.find((r) => r.version === version) ?? null;
}

export function list_rulesets(): PricingRuleset[] {
  return [...RULESETS];
}
