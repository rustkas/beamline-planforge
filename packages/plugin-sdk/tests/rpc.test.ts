import { describe, expect, test } from "bun:test";
import { is_rpc_request, is_rpc_response, make_rpc_err, make_rpc_ok } from "../src/rpc";

describe("rpc helpers", () => {
  test("make_rpc_ok produces a valid response", () => {
    const res = make_rpc_ok("1", { ok: true });
    expect(is_rpc_response(res)).toBe(true);
    expect(res.ok).toBe(true);
  });

  test("make_rpc_err produces a valid error response", () => {
    const res = make_rpc_err("2", "E_FAIL", "boom", { detail: 1 });
    expect(is_rpc_response(res)).toBe(true);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("E_FAIL");
    }
  });

  test("is_rpc_request detects a request shape", () => {
    const req = { id: "3", method: "get_context", params: null };
    expect(is_rpc_request(req)).toBe(true);
  });
});
