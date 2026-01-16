import type { host_context, rpc_error, violation } from "@planforge/plugin-sdk";
import type {
  constraints_post_validate_params,
  constraints_post_validate_result,
  plugin_hook_request,
  plugin_hook_response,
  render_instruction,
  render_post_render_params,
  render_post_render_result
} from "@planforge/plugin-sdk";
import type { plugin_manifest } from "../manifest";
export type plugin_host = {
  call_plugin: (method: string, params: unknown) => Promise<unknown>;
};

export type hook_diagnostic = {
  plugin_id: string;
  hook: "constraints.post_validate" | "render.post_render";
  ok: boolean;
  error?: rpc_error;
  message?: string;
};

export type constraints_hook_run_result = {
  violations: violation[];
  diagnostics: hook_diagnostic[];
};

export type render_hook_run_result = {
  instructions: render_instruction[];
  diagnostics: hook_diagnostic[];
};

export type loaded_plugin = {
  manifest: plugin_manifest;
  host: plugin_host;
};

function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalize_violation(v: violation): violation {
  return {
    code: String(v.code),
    severity: v.severity,
    message: String(v.message),
    object_ids: Array.isArray(v.object_ids) ? v.object_ids.map(String) : [],
    details: is_record(v.details) ? v.details : undefined
  };
}

function merge_violations(base: violation[], add: violation[]): violation[] {
  const out: violation[] = [];
  for (const v of base) out.push(normalize_violation(v));
  for (const v of add) out.push(normalize_violation(v));
  return out;
}

function apply_suppress_codes(violations: violation[], suppress_codes: string[]): violation[] {
  if (suppress_codes.length === 0) return violations;
  const suppress = new Set(suppress_codes);
  return violations.filter((v) => !suppress.has(v.code));
}

function sort_plugins(plugins: loaded_plugin[]): loaded_plugin[] {
  return [...plugins].sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
}

export async function run_constraints_post_validate_hooks(args: {
  plugins: loaded_plugin[];
  context: host_context;
  project_id?: string;
  revision_id?: string;
  kitchen_state: unknown;
  base_violations: violation[];
  mode: "drag" | "full";
  allow_suppress?: boolean;
}): Promise<constraints_hook_run_result> {
  const allow_suppress = args.allow_suppress === true;
  const diagnostics: hook_diagnostic[] = [];
  let merged = [...args.base_violations];

  for (const plugin of sort_plugins(args.plugins)) {
    if (!plugin.manifest.capabilities?.constraints) {
      continue;
    }

    const req: plugin_hook_request<constraints_post_validate_params> = {
      context: { ...args.context, plugin_id: plugin.manifest.id },
      project: { project_id: args.project_id, revision_id: args.revision_id },
      params: {
        kitchen_state: args.kitchen_state,
        base_violations: merged,
        mode: args.mode
      }
    };

    try {
      const res = (await plugin.host.call_plugin(
        "plugin.constraints.post_validate",
        req
      )) as plugin_hook_response<constraints_post_validate_result>;

      if (!res || typeof res !== "object") {
        diagnostics.push({
          plugin_id: plugin.manifest.id,
          hook: "constraints.post_validate",
          ok: false,
          error: { code: "hook.invalid_response", message: "Hook returned non-object" }
        });
        continue;
      }

      if (res.ok !== true) {
        diagnostics.push({
          plugin_id: plugin.manifest.id,
          hook: "constraints.post_validate",
          ok: false,
          error: res.error
        });
        continue;
      }

      const add = Array.isArray(res.result.add_violations) ? res.result.add_violations : [];
      merged = merge_violations(merged, add);

      if (allow_suppress) {
        const suppress_codes = Array.isArray(res.result.suppress_codes)
          ? res.result.suppress_codes.map(String)
          : [];
        merged = apply_suppress_codes(merged, suppress_codes);
      }

      diagnostics.push({
        plugin_id: plugin.manifest.id,
        hook: "constraints.post_validate",
        ok: true,
        message: `Added ${add.length} violation(s)`
      });
    } catch (error) {
      diagnostics.push({
        plugin_id: plugin.manifest.id,
        hook: "constraints.post_validate",
        ok: false,
        error: {
          code: "hook.exception",
          message: "Exception during hook call",
          details: { message: String(error) }
        }
      });
    }
  }

  return { violations: merged, diagnostics };
}

export async function run_render_post_render_hooks(args: {
  plugins: loaded_plugin[];
  context: host_context;
  project_id?: string;
  revision_id?: string;
  kitchen_state: unknown;
  render_model: unknown;
  quality: "draft" | "quality";
}): Promise<render_hook_run_result> {
  const diagnostics: hook_diagnostic[] = [];
  const instructions: render_instruction[] = [];

  for (const plugin of sort_plugins(args.plugins)) {
    if (!plugin.manifest.capabilities?.render) {
      continue;
    }

    const req: plugin_hook_request<render_post_render_params> = {
      context: { ...args.context, plugin_id: plugin.manifest.id },
      project: { project_id: args.project_id, revision_id: args.revision_id },
      params: {
        kitchen_state: args.kitchen_state,
        render_model: args.render_model,
        quality: args.quality
      }
    };

    try {
      const res = (await plugin.host.call_plugin(
        "plugin.render.post_render",
        req
      )) as plugin_hook_response<render_post_render_result>;

      if (!res || typeof res !== "object") {
        diagnostics.push({
          plugin_id: plugin.manifest.id,
          hook: "render.post_render",
          ok: false,
          error: { code: "hook.invalid_response", message: "Hook returned non-object" }
        });
        continue;
      }

      if (res.ok !== true) {
        diagnostics.push({
          plugin_id: plugin.manifest.id,
          hook: "render.post_render",
          ok: false,
          error: res.error
        });
        continue;
      }

      const hook_instructions = Array.isArray(res.result.instructions) ? res.result.instructions : [];
      for (const instr of hook_instructions) {
        instructions.push(instr);
      }

      diagnostics.push({
        plugin_id: plugin.manifest.id,
        hook: "render.post_render",
        ok: true,
        message: `Returned ${hook_instructions.length} instruction(s)`
      });
    } catch (error) {
      diagnostics.push({
        plugin_id: plugin.manifest.id,
        hook: "render.post_render",
        ok: false,
        error: {
          code: "hook.exception",
          message: "Exception during hook call",
          details: { message: String(error) }
        }
      });
    }
  }

  return { instructions, diagnostics };
}
