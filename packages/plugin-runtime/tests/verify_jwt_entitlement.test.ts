import { describe, expect, test } from "bun:test";
import { generateKeyPairSync, sign } from "node:crypto";
import { verify_jwt_entitlement } from "../src/security/verify_jwt_entitlement";

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

function make_jwt_eddsa(args: {
  kid: string;
  priv_pkcs8_der: Uint8Array;
  iss: string;
  aud: string;
  sub: string;
  exp: number;
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

describe("verify_jwt_entitlement (EdDSA, SPKI DER)", () => {
  test("verifies signature + finds entitlement", async () => {
    const now = Math.floor(Date.now() / 1000);
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const spki_der = publicKey.export({ format: "der", type: "spki" }) as Buffer;
    const pkcs8_der = privateKey.export({ format: "der", type: "pkcs8" }) as Buffer;

    const kid = "planforge-license-issuer-2026-01";
    const plugin_id = "com.planforge.demo.pricing";

    const token = make_jwt_eddsa({
      kid,
      priv_pkcs8_der: new Uint8Array(pkcs8_der),
      iss: "planforge-license",
      aud: "planforge",
      sub: "cust_test",
      exp: now + 3600,
      entitlements: [
        {
          plugin_id,
          version_range: "^0.1.0",
          capabilities: ["pricing"],
          offline_grace_days: 14
        }
      ]
    });

    const res = await verify_jwt_entitlement({
      token,
      issuer_keys: [
        {
          kid,
          public_key_spki_der_base64: `base64:${spki_der.toString("base64")}`
        }
      ],
      options: {
        expected_issuer: "planforge-license",
        expected_audience: "planforge",
        required_plugin_id: plugin_id,
        now_epoch_seconds: now
      }
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.header.alg).toBe("EdDSA");
      expect(res.header.kid).toBe(kid);
      expect(res.entitlement?.plugin_id).toBe(plugin_id);
      expect(res.entitlement?.capabilities).toEqual(["pricing"]);
    }
  });
});
