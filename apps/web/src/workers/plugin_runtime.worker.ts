type rpc_request = { id: string; method: string; params: unknown };
type rpc_error = { code: string; message: string; details?: Record<string, unknown> };
type rpc_response = { id: string; ok: true; result: unknown } | { id: string; ok: false; error: rpc_error };

let plugin: { init?: (host: HostApi, params?: unknown) => Promise<unknown>; run?: (params: unknown, host: HostApi) => Promise<unknown> } | null = null;

const pending = new Map<string, { resolve: (value: unknown) => void; reject: (err: Error) => void }>();

type HostApi = {
  call: (method: string, params: unknown) => Promise<unknown>;
  get_context: () => Promise<unknown>;
  log: (level: string, message: string, fields?: Record<string, unknown>) => Promise<unknown>;
  validate_schema: (schema_id: string, value: unknown) => Promise<unknown>;
  get_project_state: () => Promise<unknown>;
};

function is_rpc_request(value: unknown): value is rpc_request {
  return !!value && typeof value === "object" && "method" in value && "id" in value;
}

function is_rpc_response(value: unknown): value is rpc_response {
  return !!value && typeof value === "object" && "ok" in value && "id" in value;
}

function make_rpc_ok(id: string, result: unknown): rpc_response {
  return { id, ok: true, result };
}

function make_rpc_err(id: string, code: string, message: string, details?: Record<string, unknown>): rpc_response {
  return { id, ok: false, error: { code, message, details } };
}

function call_host(method: string, params: unknown): Promise<unknown> {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const request: rpc_request = { id, method, params };
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    postMessage(request);
  });
}

const host_api: HostApi = {
  call: call_host,
  get_context: () => call_host("host.get_context", {}),
  log: (level, message, fields) => call_host("host.log", { level, message, fields }),
  validate_schema: (schema_id, value) => call_host("host.validate_schema", { schema_id, value }),
  get_project_state: () => call_host("host.get_project_state", {})
};

async function handle_plugin_request(message: rpc_request): Promise<void> {
  if (message.method === "plugin.init") {
    const params = message.params as { plugin_url?: string };
    if (!params?.plugin_url) {
      postMessage(make_rpc_err(message.id, "plugin.init_error", "plugin_url missing"));
      return;
    }
    const mod = await import(/* @vite-ignore */ params.plugin_url);
    plugin = (mod.default ?? mod) as typeof plugin;
    if (plugin?.init) {
      await plugin.init(host_api, params);
    }
    postMessage(make_rpc_ok(message.id, { ok: true }));
    return;
  }

  if (message.method === "plugin.run") {
    if (!plugin?.run) {
      postMessage(make_rpc_err(message.id, "plugin.not_ready", "plugin.run not available"));
      return;
    }
    const result = await plugin.run(message.params, host_api);
    postMessage(make_rpc_ok(message.id, result));
    return;
  }

  postMessage(make_rpc_err(message.id, "plugin.unknown_method", `Unknown method ${message.method}`));
}

self.onmessage = async (event: MessageEvent) => {
  const msg = event.data as unknown;
  if (is_rpc_response(msg)) {
    const response = msg as rpc_response;
    const entry = pending.get(response.id);
    if (!entry) return;
    pending.delete(response.id);
    if (response.ok) {
      entry.resolve(response.result);
    } else {
      entry.reject(new Error(`${response.error.code}: ${response.error.message}`));
    }
    return;
  }

  if (is_rpc_request(msg)) {
    try {
      await handle_plugin_request(msg as rpc_request);
    } catch (error) {
      const message = error instanceof Error ? error.message : "plugin error";
      postMessage(make_rpc_err((msg as rpc_request).id, "plugin.error", message));
    }
  }
};
