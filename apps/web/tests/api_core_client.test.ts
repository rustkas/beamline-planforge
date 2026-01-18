import { describe, expect, test } from "bun:test";
import { create_api_core_client } from "../src/lib/api_core_client";

describe("api core client", () => {
  test("create_exports posts to /exports", async () => {
    let called: { url: string; init?: RequestInit } | null = null;
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      called = { url, init };
      return new Response(JSON.stringify({ export_id: "exp1", artifacts: [] }), { status: 200 });
    }) as typeof fetch;

    const client = create_api_core_client("http://core");
    const res = await client.create_exports("proj1", "rev1", "pdf");
    expect(res.ok).toBe(true);
    expect(called?.url).toBe("http://core/exports");
    const body = JSON.parse((called?.init?.body as string) ?? "{}");
    expect(body).toEqual({ project_id: "proj1", revision_id: "rev1", format: "pdf" });

    globalThis.fetch = original;
  });

  test("apply_patch posts to patch endpoint", async () => {
    let called: { url: string; init?: RequestInit } | null = null;
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      called = { url, init };
      return new Response(JSON.stringify({ new_revision_id: "rev2", violations: [] }), { status: 200 });
    }) as typeof fetch;

    const client = create_api_core_client("http://core");
    const res = await client.apply_patch("proj1", "rev1", { ops: [] });
    expect(res.ok).toBe(true);
    expect(called?.url).toBe("http://core/projects/proj1/revisions/rev1/patch");
    expect(called?.init?.method).toBe("POST");

    globalThis.fetch = original;
  });
});
