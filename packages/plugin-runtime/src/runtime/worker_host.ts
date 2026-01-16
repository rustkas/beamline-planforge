import type { rpc_request, rpc_response } from "@planforge/plugin-sdk";
import { make_rpc_err, make_rpc_ok } from "@planforge/plugin-sdk";
import type { plugin_manifest } from "../manifest";
import type { host_api_handler } from "../host_api/host_api_impl";
import { is_rpc_request, is_rpc_response } from "./worker_protocol";

export class WorkerHost {
  private manifest: plugin_manifest;
  private worker: Worker;
  private host_api: host_api_handler;
  private pending = new Map<string, { resolve: (value: unknown) => void; reject: (err: Error) => void }>();

  constructor(manifest: plugin_manifest, worker: Worker, host_api: host_api_handler) {
    this.manifest = manifest;
    this.worker = worker;
    this.host_api = host_api;

    this.worker.onmessage = (event: MessageEvent) => {
      const data = event.data as unknown;
      if (is_rpc_response(data)) {
        this.handle_response(data as rpc_response);
        return;
      }
      if (is_rpc_request(data)) {
        void this.handle_host_request(data as rpc_request);
      }
    };
  }

  async call_plugin(method: string, params: unknown): Promise<unknown> {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const request: rpc_request = { id, method, params };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage(request);
    });
  }

  async init_plugin(plugin_url: string): Promise<unknown> {
    return this.call_plugin("plugin.init", { plugin_url, manifest: this.manifest });
  }

  private handle_response(message: rpc_response): void {
    const entry = this.pending.get(message.id);
    if (!entry) return;
    this.pending.delete(message.id);
    if (message.ok) {
      entry.resolve(message.result);
    } else {
      entry.reject(new Error(`${message.error.code}: ${message.error.message}`));
    }
  }

  private async handle_host_request(message: rpc_request): Promise<void> {
    try {
      const result = await this.host_api.handle(message.method, message.params);
      this.worker.postMessage(make_rpc_ok(message.id, result));
    } catch (error) {
      const err = error as { code?: string; message?: string };
      const code = err?.code ?? "host.error";
      const message_text = err?.message ?? "Host error";
      this.worker.postMessage(make_rpc_err(message.id, code, message_text));
    }
  }
}
