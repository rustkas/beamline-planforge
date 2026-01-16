import type { host_context } from "@planforge/plugin-sdk";
import type {
  plugin_hook_request,
  plugin_hook_response,
  pricing_post_quote_params,
  pricing_post_quote_result,
  quote
} from "@planforge/plugin-sdk";
import type { loaded_plugin } from "../runtime/hook_runner";
import type { pricing_contribution, quote_merge_diagnostic } from "./quote_merge";

export type pricing_hooks_result = {
  contributions: pricing_contribution[];
  diagnostics: quote_merge_diagnostic[];
};

export async function run_pricing_post_quote_hooks(args: {
  plugins: loaded_plugin[];
  context: host_context;
  project_id?: string;
  revision_id?: string;
  kitchen_state: unknown;
  base_quote: quote;
  pricing_context?: { region?: string; channel?: string };
}): Promise<pricing_hooks_result> {
  const sorted = [...args.plugins]
    .filter((plugin) => plugin.manifest.capabilities?.pricing === true)
    .sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));

  const contributions: pricing_contribution[] = [];
  const diagnostics: quote_merge_diagnostic[] = [];

  for (const plugin of sorted) {
    const plugin_id = plugin.manifest.id;
    const req: plugin_hook_request<pricing_post_quote_params> = {
      context: { ...args.context, plugin_id },
      project: { project_id: args.project_id, revision_id: args.revision_id },
      params: {
        kitchen_state: args.kitchen_state,
        quote: args.base_quote,
        pricing_context: args.pricing_context
      }
    };

    try {
      const res = (await plugin.host.call_plugin(
        "plugin.pricing.post_quote",
        req
      )) as plugin_hook_response<pricing_post_quote_result>;

      if (!res || typeof res !== "object") {
        diagnostics.push({
          plugin_id,
          ok: false,
          added_items: 0,
          added_adjustments: 0,
          errors: ["hook returned non-object"],
          warnings: []
        });
        continue;
      }

      if (res.ok !== true) {
        diagnostics.push({
          plugin_id,
          ok: false,
          added_items: 0,
          added_adjustments: 0,
          errors: [`${res.error.code}: ${res.error.message}`],
          warnings: []
        });
        continue;
      }

      const add_items = Array.isArray(res.result.add_items) ? res.result.add_items : [];
      const adjustments = Array.isArray(res.result.adjustments) ? res.result.adjustments : [];

      contributions.push({ plugin_id, add_items, adjustments });
      diagnostics.push({
        plugin_id,
        ok: true,
        added_items: add_items.length,
        added_adjustments: adjustments.length,
        errors: [],
        warnings: []
      });
    } catch (error) {
      diagnostics.push({
        plugin_id,
        ok: false,
        added_items: 0,
        added_adjustments: 0,
        errors: [`hook exception: ${String(error)}`],
        warnings: []
      });
    }
  }

  return { contributions, diagnostics };
}
