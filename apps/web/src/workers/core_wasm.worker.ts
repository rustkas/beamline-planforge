type CoreMethod = "validate_layout" | "derive_render_model" | "apply_patch";

type RpcRequest = {
  id: string;
  method: CoreMethod;
  params: Record<string, unknown>;
};

type RpcError = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

type RpcResponse =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: RpcError };

let wasmModule: null | {
  validate_layout_json: (state: string) => string;
  derive_render_model_json: (state: string, quality: string) => string;
  apply_patch_json: (state: string, patch: string) => string;
  default?: () => Promise<void> | void;
} = null;

async function loadWasm(): Promise<typeof wasmModule> {
  if (!wasmModule) {
    const mod = await import("/wasm/planforge_core_wasm.js");
    if (typeof mod.default === "function") {
      await mod.default();
    }
    wasmModule = mod as typeof wasmModule;
  }
  return wasmModule;
}

function ok(id: string, result: unknown): RpcResponse {
  return { id, ok: true, result };
}

function err(id: string, code: string, message: string, details?: Record<string, unknown>): RpcResponse {
  return { id, ok: false, error: { code, message, details } };
}

self.onmessage = async (event: MessageEvent<RpcRequest>) => {
  const { id, method, params } = event.data;

  try {
    const wasm = await loadWasm();
    if (!wasm) {
      postMessage(err(id, "wasm.load_error", "WASM module failed to load"));
      return;
    }

    if (method === "validate_layout") {
      const payload = JSON.stringify(params.kitchen_state ?? null);
      const response = wasm.validate_layout_json(payload);
      const result = JSON.parse(response) as unknown;
      postMessage(ok(id, result));
      return;
    }

    if (method === "derive_render_model") {
      const payload = JSON.stringify(params.kitchen_state ?? null);
      const quality = String(params.quality ?? "draft");
      const response = wasm.derive_render_model_json(payload, quality);
      const result = JSON.parse(response) as unknown;
      postMessage(ok(id, result));
      return;
    }

    if (method === "apply_patch") {
      const payload = JSON.stringify(params.kitchen_state ?? null);
      const patch = JSON.stringify(params.patch ?? null);
      const response = wasm.apply_patch_json(payload, patch);
      const result = JSON.parse(response) as unknown;
      postMessage(ok(id, result));
      return;
    }

    postMessage(err(id, "rpc.unknown_method", `Unknown method: ${method}`));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    postMessage(err(id, "wasm.call_error", message));
  }
};
