export type CoreMethod = "validate_layout" | "derive_render_model" | "apply_patch";

export type RpcRequest = {
  id: string;
  method: CoreMethod;
  params: Record<string, unknown>;
};

export type RpcError = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type RpcResponse =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: RpcError };

export type CoreClient = {
  validate_layout: (kitchen_state: unknown) => Promise<unknown>;
  derive_render_model: (kitchen_state: unknown, quality: "draft" | "quality") => Promise<unknown>;
  apply_patch: (kitchen_state: unknown, patch: unknown) => Promise<unknown>;
};

let client: CoreClient | null = null;

function createWorker(): Worker {
  return new Worker(new URL("../workers/core_wasm.worker.ts", import.meta.url), { type: "module" });
}

function next_id(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function create_core_client(): CoreClient {
  if (client) return client;

  const worker = createWorker();
  const pending = new Map<string, { resolve: (value: unknown) => void; reject: (err: Error) => void }>();

  worker.onmessage = (event: MessageEvent<RpcResponse>) => {
    const data = event.data;
    const entry = pending.get(data.id);
    if (!entry) return;
    pending.delete(data.id);

    if (data.ok) {
      entry.resolve(data.result);
    } else {
      entry.reject(new Error(`${data.error.code}: ${data.error.message}`));
    }
  };

  function call(method: CoreMethod, params: Record<string, unknown>): Promise<unknown> {
    const id = next_id();
    const request: RpcRequest = { id, method, params };
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      worker.postMessage(request);
    });
  }

  client = {
    validate_layout: (kitchen_state) => call("validate_layout", { kitchen_state }),
    derive_render_model: (kitchen_state, quality) =>
      call("derive_render_model", { kitchen_state, quality }),
    apply_patch: (kitchen_state, patch) => call("apply_patch", { kitchen_state, patch })
  };

  return client;
}
