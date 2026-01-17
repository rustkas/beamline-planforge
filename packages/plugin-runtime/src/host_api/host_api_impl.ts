import { create_ajv, validate_with_ajv } from "@planforge/core-contracts";
import type { rpc_error } from "@planforge/plugin-sdk";
import type { plugin_manifest } from "../manifest";
import type { host_api_provider } from "../runtime/types";
import { can_read_project_data } from "../permissions";

const ajv = create_ajv();

export type host_api_handler = {
  handle: (method: string, params: unknown) => Promise<unknown>;
};

function permission_error(): rpc_error {
  return { code: "permission.denied", message: "Permission denied" };
}

export function create_host_api(manifest: plugin_manifest, provider: host_api_provider): host_api_handler {
  return {
    async handle(method: string, params: unknown): Promise<unknown> {
      switch (method) {
        case "host.get_context":
          return provider.get_context();
        case "host.log": {
          const payload = params as { level: string; message: string; fields?: Record<string, unknown> };
          const prefix = `[plugin:${manifest.id}]`;
          console.log(prefix, payload.level, payload.message, payload.fields ?? {});
          return null;
        }
        case "host.validate_schema": {
          if (!params || typeof params !== "object") {
            return { ok: false, errors: ["invalid params"] };
          }
          const { schema_id, value } = params as { schema_id: string; value: unknown };
          return validate_with_ajv(ajv, schema_id as any, value);
        }
        case "host.get_project_state": {
          if (!can_read_project_data(manifest)) throw permission_error();
          return provider.get_project_state();
        }
        case "host.get_license_context": {
          return provider.get_license_context();
        }
        case "host.validate_layout": {
          if (!provider.validate_layout) {
            throw { code: "host.not_supported", message: "validate_layout not supported" } satisfies rpc_error;
          }
          return provider.validate_layout(params);
        }
        case "host.derive_render_model": {
          if (!provider.derive_render_model) {
            throw { code: "host.not_supported", message: "derive_render_model not supported" } satisfies rpc_error;
          }
          return provider.derive_render_model(params);
        }
        default:
          throw { code: "host.unknown_method", message: `Unknown method ${method}` } satisfies rpc_error;
      }
    }
  };
}
