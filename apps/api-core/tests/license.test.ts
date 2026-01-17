import { describe, expect, test } from "bun:test";
import { create_app } from "../src/server";
import { generateKeyPairSync, sign } from "node:crypto";
import path from "node:path";
import os from "node:os";

function b64url(buf: Uint8Array): string {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function utf8(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, "utf8"));
}

function make_jwt(args: {
  kid: string;
  priv_pkcs8_der: Uint8Array;
  iss: string;
  aud: string;
  sub: string;
  exp: number;
  jti: string;
  entitlements: Array<{
    plugin_id: string;
    version_range: string;
    capabilities: string[];
    offline_grace_days?: number;
  }>;
}): string {
  const header = { alg: "EdDSA", typ: "JWT", kid: args.kid };
  const payload = {
    iss: args.iss,
    aud: args.aud,
    sub: args.sub,
    exp: args.exp,
    jti: args.jti,
    entitlements: args.entitlements
  };

  const h = b64url(utf8(JSON.stringify(header)));
  const p = b64url(utf8(JSON.stringify(payload)));
  const signing_input = `${h}.${p}`;

  const sig = sign(null, Buffer.from(signing_input, "utf8"), {
    key: Buffer.from(args.priv_pkcs8_der),
    format: "der",
    type: "pkcs8"
  });

  return `${h}.${p}.${b64url(new Uint8Array(sig))}`;
}

async function write_trust_store(spki_der: Buffer, kid: string): Promise<string> {
  const file = path.join(
    os.tmpdir(),
    `planforge-trust-store-${Math.random().toString(16).slice(2)}.json`
  );
  const body = {
    publisher_keys: [],
    issuer_keys: [
      {
        kid,
        alg: "ed25519",
        public_key_spki_der_base64: `base64:${spki_der.toString("base64")}`
      }
    ],
    policy: { offline_grace_days_default: 1 }
  };
  await Bun.write(file, JSON.stringify(body));
  return file;
}

describe("license refresh + revocation", () => {
  test("refresh success updates cache", async () => {
    const now = Math.floor(Date.now() / 1000);
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const spki_der = publicKey.export({ format: "der", type: "spki" }) as Buffer;
    const pkcs8_der = privateKey.export({ format: "der", type: "pkcs8" }) as Buffer;

    const kid = "issuer-1";
    const token = make_jwt({
      kid,
      priv_pkcs8_der: new Uint8Array(pkcs8_der),
      iss: "planforge-license",
      aud: "planforge",
      sub: "cust_test",
      exp: now + 600,
      jti: "jti-ok",
      entitlements: [{ plugin_id: "com.planforge.demo.pricing", version_range: "^0.1.0", capabilities: ["pricing"] }]
    });

    const real_fetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
      const url = typeof input === "string" ? input : input.url;
      if (new URL(url).pathname === "/v1/entitlements/refresh") {
        return Response.json({ token, exp: now + 600, refresh_at: now + 420, revoked_jtis: [] });
      }
      return new Response("not found", { status: 404 });
    };

    process.env.LICENSE_SERVER_URL = "http://license.local";
    process.env.TRUST_STORE_PATH = await write_trust_store(spki_der, kid);

    const app = await create_app();
    const refresh = await app.request("/license/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token })
    });

    expect(refresh.status).toBe(200);
    const refresh_json = (await refresh.json()) as { ok: boolean; token?: string };
    expect(refresh_json.ok).toBe(true);

    const status = await app.request("/license/status", {
      headers: { authorization: `Bearer ${token}` }
    });
    const status_json = (await status.json()) as { allowed: boolean; exp: number };
    expect(status_json.allowed).toBe(true);
    expect(status_json.exp).toBeGreaterThan(now);

    globalThis.fetch = real_fetch;
  });

  test("revoked token denied", async () => {
    const now = Math.floor(Date.now() / 1000);
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const spki_der = publicKey.export({ format: "der", type: "spki" }) as Buffer;
    const pkcs8_der = privateKey.export({ format: "der", type: "pkcs8" }) as Buffer;

    const kid = "issuer-2";
    const token = make_jwt({
      kid,
      priv_pkcs8_der: new Uint8Array(pkcs8_der),
      iss: "planforge-license",
      aud: "planforge",
      sub: "cust_test",
      exp: now + 600,
      jti: "jti-revoked",
      entitlements: [{ plugin_id: "com.planforge.demo.pricing", version_range: "^0.1.0", capabilities: ["pricing"] }]
    });

    const real_fetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
      const url = typeof input === "string" ? input : input.url;
      if (new URL(url).pathname === "/v1/entitlements/refresh") {
        return Response.json({ token, exp: now + 600, refresh_at: now + 420, revoked_jtis: ["jti-revoked"] });
      }
      return new Response("not found", { status: 404 });
    };

    process.env.LICENSE_SERVER_URL = "http://license.local";
    process.env.TRUST_STORE_PATH = await write_trust_store(spki_der, kid);

    const app = await create_app();
    const refresh = await app.request("/license/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token })
    });
    expect(refresh.status).toBe(200);

    const status = await app.request("/license/status", {
      headers: { authorization: `Bearer ${token}` }
    });
    const status_json = (await status.json()) as { allowed: boolean; revoked: boolean };
    expect(status_json.allowed).toBe(false);
    expect(status_json.revoked).toBe(true);

    globalThis.fetch = real_fetch;
  });

  test("offline grace allow/deny", async () => {
    const real_now = Date.now;
    const now = Math.floor(Date.now() / 1000);
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const spki_der = publicKey.export({ format: "der", type: "spki" }) as Buffer;
    const pkcs8_der = privateKey.export({ format: "der", type: "pkcs8" }) as Buffer;

    const kid = "issuer-3";
    const token = make_jwt({
      kid,
      priv_pkcs8_der: new Uint8Array(pkcs8_der),
      iss: "planforge-license",
      aud: "planforge",
      sub: "cust_test",
      exp: now + 60,
      jti: "jti-grace",
      entitlements: [{ plugin_id: "com.planforge.demo.pricing", version_range: "^0.1.0", capabilities: ["pricing"] }]
    });

    const real_fetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
      const url = typeof input === "string" ? input : input.url;
      if (new URL(url).pathname === "/v1/entitlements/refresh") {
        return Response.json({ token, exp: now + 60, refresh_at: now + 30, revoked_jtis: [] });
      }
      return new Response("not found", { status: 404 });
    };

    process.env.LICENSE_SERVER_URL = "http://license.local";
    process.env.TRUST_STORE_PATH = await write_trust_store(spki_der, kid);
    process.env.LICENSE_GRACE_HOURS = "24";

    const app = await create_app();
    await app.request("/license/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token })
    });

    Date.now = () => (now + 23 * 3600) * 1000;
    const status_ok = await app.request("/license/status", {
      headers: { authorization: `Bearer ${token}` }
    });
    const status_ok_json = (await status_ok.json()) as { allowed: boolean };
    expect(status_ok_json.allowed).toBe(true);

    Date.now = () => (now + 25 * 3600) * 1000;
    const status_bad = await app.request("/license/status", {
      headers: { authorization: `Bearer ${token}` }
    });
    const status_bad_json = (await status_bad.json()) as { allowed: boolean };
    expect(status_bad_json.allowed).toBe(false);

    Date.now = real_now;
    globalThis.fetch = real_fetch;
  });
});
