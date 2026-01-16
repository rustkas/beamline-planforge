import type { host_api_method, host_api_methods } from "./host_api";

export type rpc_id = string;

export interface rpc_request {
  id: rpc_id;
  method: string;
  params: unknown;
}

export interface rpc_error {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface rpc_response_ok {
  id: rpc_id;
  ok: true;
  result: unknown;
}

export interface rpc_response_err {
  id: rpc_id;
  ok: false;
  error: rpc_error;
}

export type rpc_response = rpc_response_ok | rpc_response_err;

export type rpc_request_for<M extends host_api_method> = {
  id: rpc_id;
  method: M;
  params: host_api_methods[M]["params"];
};

export type rpc_response_for<M extends host_api_method> =
  | { id: rpc_id; ok: true; result: host_api_methods[M]["result"] }
  | { id: rpc_id; ok: false; error: rpc_error };

function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function is_rpc_request(value: unknown): value is rpc_request {
  if (!is_record(value)) return false;
  if (typeof value.id !== "string") return false;
  if (typeof value.method !== "string") return false;
  return "params" in value;
}

export function is_rpc_response(value: unknown): value is rpc_response {
  if (!is_record(value)) return false;
  if (typeof value.id !== "string") return false;
  if (typeof value.ok !== "boolean") return false;
  if (value.ok) return "result" in value;
  return "error" in value;
}

export function make_rpc_ok(id: rpc_id, result: unknown): rpc_response_ok {
  return { id, ok: true, result };
}

export function make_rpc_err(
  id: rpc_id,
  code: string,
  message: string,
  details?: Record<string, unknown>
): rpc_response_err {
  return { id, ok: false, error: { code, message, details } };
}
