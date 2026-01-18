import { describe, expect, test } from "bun:test";
import { create_ai_orchestrator_client } from "../src/lib/ai_orchestrator_client";

describe("ai orchestrator client", () => {
  test("preview_refine uses correct endpoint", async () => {
    let called: { url: string; init?: RequestInit } | null = null;
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      called = { url, init };
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;

    const client = create_ai_orchestrator_client("http://orch");
    const res = await client.preview_refine("sess1", "move sink near window");
    expect(res.ok).toBe(true);
    expect(called?.url).toBe("http://orch/sessions/sess1/refine/preview");
    expect(called?.init?.method).toBe("POST");

    globalThis.fetch = original;
  });

  test("apply_refine uses correct endpoint", async () => {
    let called: { url: string; init?: RequestInit } | null = null;
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      called = { url, init };
      return new Response(JSON.stringify({ ok: true, new_revision_id: "rev2" }), { status: 200 });
    }) as typeof fetch;

    const client = create_ai_orchestrator_client("http://orch");
    const res = await client.apply_refine("sess2", "increase passage");
    expect(res.ok).toBe(true);
    expect(called?.url).toBe("http://orch/sessions/sess2/refine/apply");
    expect(called?.init?.method).toBe("POST");

    globalThis.fetch = original;
  });
});
