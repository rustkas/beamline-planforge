import type { host_context } from "@planforge/plugin-sdk";
import { merge_quote, run_pricing_post_quote_hooks } from "../../../../packages/plugin-runtime/src/index.ts";
import type { QuoteDiagnostic } from "../store/store";

const HOST_CONTEXT: host_context = {
  host_version: "0.1.0",
  plugin_id: "api-core"
};

export async function apply_pricing_hooks(args: {
  project_id: string;
  revision_id: string;
  kitchen_state: unknown;
  base_quote: {
    ruleset_version: string;
    currency: string;
    total: { currency: string; amount: number };
    items: Array<{
      code: string;
      title: string;
      qty: number;
      unit_price: { currency: string; amount: number };
      amount: { currency: string; amount: number };
      meta?: Record<string, unknown>;
    }>;
    meta?: Record<string, unknown>;
  };
  pricing_context?: { region?: string; channel?: string };
}): Promise<{ quote: typeof args.base_quote; diagnostics: QuoteDiagnostic[] }> {
  const hooks = await run_pricing_post_quote_hooks({
    plugins: [],
    context: HOST_CONTEXT,
    project_id: args.project_id,
    revision_id: args.revision_id,
    kitchen_state: args.kitchen_state,
    base_quote: args.base_quote,
    pricing_context: args.pricing_context
  });

  const merged = merge_quote(args.base_quote, hooks.contributions);
  const diagnostics: QuoteDiagnostic[] = [...hooks.diagnostics, ...merged.diagnostics];

  return { quote: merged.quote, diagnostics };
}
