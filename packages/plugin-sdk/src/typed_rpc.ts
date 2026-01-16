import type { rpc_error, rpc_request, rpc_response } from "./rpc";
import type { any_method, method_params, method_result } from "./methods";

export type typed_rpc_request<M extends any_method> = {
  id: string;
  method: M;
  params: method_params<M>;
};

export type typed_rpc_response<M extends any_method> =
  | { id: string; ok: true; result: method_result<M> }
  | { id: string; ok: false; error: rpc_error };

export function make_typed_request<M extends any_method>(
  id: string,
  method: M,
  params: method_params<M>
): typed_rpc_request<M> {
  return { id, method, params };
}

export function is_rpc_request_shape(x: unknown): x is rpc_request {
  return typeof x === "object" && x !== null && "id" in (x as Record<string, unknown>) && "method" in (x as Record<string, unknown>)
    && "params" in (x as Record<string, unknown>);
}

export function is_rpc_response_shape(x: unknown): x is rpc_response {
  return typeof x === "object" && x !== null && "id" in (x as Record<string, unknown>) && "ok" in (x as Record<string, unknown>);
}
