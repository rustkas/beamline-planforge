import type { host_context } from "@planforge/plugin-sdk";
import {
  merge_quote,
  run_pricing_post_quote_hooks,
  type pricing_contribution,
  type quote_merge_diagnostic
} from "../../../../packages/plugin-runtime/src/index.ts";
import { run_wasi_pricing } from "../wasi/runner";
import { validate_wasi_pricing_input, validate_wasi_pricing_output } from "../validation/schemas";
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
  wasi_pricing?: {
    plugin_id: string;
    wasm_path: string;
    timeout_ms?: number;
  };
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

  const contributions: pricing_contribution[] = [...hooks.contributions];
  const wasi_diagnostics: QuoteDiagnostic[] = [];

  if (args.wasi_pricing) {
    try {
      const input_validation = validate_wasi_pricing_input({
        kitchen_state: args.kitchen_state,
        quote: args.base_quote
      });
      if (!input_validation.ok) {
        throw new Error(`wasi.pricing.input_invalid: ${input_validation.errors[0] ?? "invalid input"}`);
      }
      const output = await run_wasi_pricing({
        wasm_path: args.wasi_pricing.wasm_path,
        input: { kitchen_state: args.kitchen_state, quote: args.base_quote },
        timeout_ms: args.wasi_pricing.timeout_ms
      });
      const output_validation = validate_wasi_pricing_output(output);
      if (!output_validation.ok) {
        throw new Error(`wasi.pricing.output_invalid: ${output_validation.errors[0] ?? "invalid output"}`);
      }
      contributions.push({
        plugin_id: args.wasi_pricing.plugin_id,
        add_items: Array.isArray(output.add_items) ? output.add_items : [],
        adjustments: Array.isArray(output.adjustments) ? output.adjustments : []
      });
      wasi_diagnostics.push({
        plugin_id: args.wasi_pricing.plugin_id,
        ok: true,
        added_items: Array.isArray(output.add_items) ? output.add_items.length : 0,
        added_adjustments: Array.isArray(output.adjustments) ? output.adjustments.length : 0,
        errors: [],
        warnings: []
      });
    } catch (error) {
      wasi_diagnostics.push({
        plugin_id: args.wasi_pricing.plugin_id,
        ok: false,
        added_items: 0,
        added_adjustments: 0,
        errors: [error instanceof Error ? error.message : "WASI pricing failed"],
        warnings: []
      });
    }
  }

  const merged = merge_quote(args.base_quote, contributions);
  const diagnostics: QuoteDiagnostic[] = [
    ...hooks.diagnostics,
    ...wasi_diagnostics,
    ...(merged.diagnostics as quote_merge_diagnostic[])
  ];

  return { quote: merged.quote, diagnostics };
}
