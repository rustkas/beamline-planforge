import { describe, expect, test } from "bun:test";
import { generateKeyPairSync, sign } from "node:crypto";
import { verify_plugin_license } from "../src/security/license_gate";
import { canonicalize_manifest_for_signature } from "../src/security/signature";
import { sha256_hex } from "../src/security/sha256";
import type { plugin_manifest } from "../src/manifest";

function b64url(buf: Uint8Array): string {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function make_jwt(args: {
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
  const h = b64url(new Uint8Array(Buffer.from(JSON.stringify(header), "utf8")));
  const p = b64url(new Uint8Array(Buffer.from(JSON.stringify(payload), "utf8")));
  const signing_input = `${h}.${p}`;
  const sig = sign(null, Buffer.from(signing_input, "utf8"), {
    key: Buffer.from(args.priv_pkcs8_der),
    format: "der",
    type: "pkcs8"
  });
  return `${h}.${p}.${b64url(new Uint8Array(sig))}`;
}

async function build_paid_manifest(args: {
  plugin_id: string;
  plugin_version: string;
  signature_kid: string;
  signature_value: string;
  hash: string;
}): Promise<plugin_manifest> {
  return {
    $schema: "planforge://schemas/plugin-manifest.schema.json",
    manifest_version: "1.0",
    id: args.plugin_id,
    name: "Paid Demo",
    version: args.plugin_version,
    description: "Paid plugin",
    license: "Proprietary",
    publisher: { name: "PlanForge" },
    runtime: {
      kind: "web",
      entry: { js: "dist/loader.js" },
      min_host_version: "0.1.0",
      compatibility: { core_contracts: "^0.1.0", host_api: "^0.1.0" }
    },
    capabilities: {
      constraints: false,
      solver: false,
      pricing: true,
      render: false,
      export: false,
      ui: { panels: [], wizard_steps: [], commands: [] }
    },
    integrity: {
      channel: "paid",
      signature: { alg: "ed25519", kid: args.signature_kid, value: args.signature_value },
      hashes: { "dist/loader.js": `sha256:${args.hash}` }
    },
    configuration_schema: { type: "object" },
    permissions: {
      network: { allow: false, allowlist: [] },
      storage: { allow: false, scopes: ["none"] },
      project_data: { read: true, write_via_patches: false },
      catalog: { read: false },
      pricing: { read: false },
      orders: { read: false, write: false }
    }
  };
}

describe("license gate", () => {
  test("valid signature/hash/entitlement allows load", async () => {
    const now = Math.floor(Date.now() / 1000);
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const spki_der = publicKey.export({ format: "der", type: "spki" }) as Buffer;
    const pkcs8_der = privateKey.export({ format: "der", type: "pkcs8" }) as Buffer;
    const issuer_key = generateKeyPairSync("ed25519");
    const issuer_spki = issuer_key.publicKey.export({ format: "der", type: "spki" }) as Buffer;
    const issuer_pkcs8 = issuer_key.privateKey.export({ format: "der", type: "pkcs8" }) as Buffer;

    const kid = "publisher-1";
    const issuer_kid = "issuer-1";
    const artifact = new Uint8Array(Buffer.from("demo", "utf8"));
    const hash = await sha256_hex(artifact);
    const manifest = await build_paid_manifest({
      plugin_id: "com.planforge.demo.paid",
      plugin_version: "0.1.0",
      signature_kid: kid,
      signature_value: "",
      hash
    });

    const signing_input = canonicalize_manifest_for_signature(manifest as unknown as Record<string, unknown>);
    const signature = sign(null, Buffer.from(signing_input, "utf8"), {
      key: Buffer.from(pkcs8_der),
      format: "der",
      type: "pkcs8"
    });
    manifest.integrity.signature.value = `base64:${Buffer.from(signature).toString("base64")}`;

    const token = make_jwt({
      kid: issuer_kid,
      priv_pkcs8_der: new Uint8Array(issuer_pkcs8),
      iss: "planforge-license",
      aud: "planforge",
      sub: "cust",
      exp: now + 3600,
      entitlements: [
        { plugin_id: manifest.id, version_range: "^0.1.0", capabilities: ["pricing"], offline_grace_days: 1 }
      ]
    });

    const decision = await verify_plugin_license({
      manifest,
      artifacts: { "dist/loader.js": artifact },
      trust_store: {
        publisher_keys: [{ kid, alg: "ed25519", public_key_spki_der_base64: `base64:${spki_der.toString("base64")}` }],
        issuer_keys: [{ kid: issuer_kid, alg: "ed25519", public_key_spki_der_base64: `base64:${issuer_spki.toString("base64")}` }],
        policy: { offline_grace_days_default: 1 }
      },
      entitlement_token: token,
      now_epoch_seconds: now
    });

    expect(decision.ok).toBe(true);
    expect(decision.allow_load).toBe(true);
    expect(decision.allow_capabilities.pricing).toBe(true);
  });

  test("hash mismatch denies load", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const spki_der = publicKey.export({ format: "der", type: "spki" }) as Buffer;
    const pkcs8_der = privateKey.export({ format: "der", type: "pkcs8" }) as Buffer;

    const kid = "publisher-2";
    const artifact = new Uint8Array(Buffer.from("demo", "utf8"));
    const hash = await sha256_hex(new Uint8Array(Buffer.from("other", "utf8")));
    const manifest = await build_paid_manifest({
      plugin_id: "com.planforge.demo.paid",
      plugin_version: "0.1.0",
      signature_kid: kid,
      signature_value: "",
      hash
    });
    const signing_input = canonicalize_manifest_for_signature(manifest as unknown as Record<string, unknown>);
    const signature = sign(null, Buffer.from(signing_input, "utf8"), {
      key: Buffer.from(pkcs8_der),
      format: "der",
      type: "pkcs8"
    });
    manifest.integrity.signature.value = `base64:${Buffer.from(signature).toString("base64")}`;

    const decision = await verify_plugin_license({
      manifest,
      artifacts: { "dist/loader.js": artifact },
      trust_store: {
        publisher_keys: [{ kid, alg: "ed25519", public_key_spki_der_base64: `base64:${spki_der.toString("base64")}` }],
        issuer_keys: [],
        policy: { offline_grace_days_default: 1 }
      },
      entitlement_token: "token",
      now_epoch_seconds: Math.floor(Date.now() / 1000)
    });

    expect(decision.ok).toBe(false);
    expect(decision.allow_load).toBe(false);
    expect(decision.diagnostics[0]?.code).toBe("license.hash_mismatch");
  });

  test("offline grace allows expired token when within window", async () => {
    const now = Math.floor(Date.now() / 1000);
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const spki_der = publicKey.export({ format: "der", type: "spki" }) as Buffer;
    const pkcs8_der = privateKey.export({ format: "der", type: "pkcs8" }) as Buffer;
    const issuer_key = generateKeyPairSync("ed25519");
    const issuer_spki = issuer_key.publicKey.export({ format: "der", type: "spki" }) as Buffer;
    const issuer_pkcs8 = issuer_key.privateKey.export({ format: "der", type: "pkcs8" }) as Buffer;

    const kid = "publisher-3";
    const issuer_kid = "issuer-3";
    const artifact = new Uint8Array(Buffer.from("demo", "utf8"));
    const hash = await sha256_hex(artifact);
    const manifest = await build_paid_manifest({
      plugin_id: "com.planforge.demo.paid",
      plugin_version: "0.1.0",
      signature_kid: kid,
      signature_value: "",
      hash
    });
    const signing_input = canonicalize_manifest_for_signature(manifest as unknown as Record<string, unknown>);
    const signature = sign(null, Buffer.from(signing_input, "utf8"), {
      key: Buffer.from(pkcs8_der),
      format: "der",
      type: "pkcs8"
    });
    manifest.integrity.signature.value = `base64:${Buffer.from(signature).toString("base64")}`;

    const token = make_jwt({
      kid: issuer_kid,
      priv_pkcs8_der: new Uint8Array(issuer_pkcs8),
      iss: "planforge-license",
      aud: "planforge",
      sub: "cust",
      exp: now - 10,
      entitlements: [
        { plugin_id: manifest.id, version_range: "^0.1.0", capabilities: ["pricing"], offline_grace_days: 1 }
      ]
    });

    const decision = await verify_plugin_license({
      manifest,
      artifacts: { "dist/loader.js": artifact },
      trust_store: {
        publisher_keys: [{ kid, alg: "ed25519", public_key_spki_der_base64: `base64:${spki_der.toString("base64")}` }],
        issuer_keys: [{ kid: issuer_kid, alg: "ed25519", public_key_spki_der_base64: `base64:${issuer_spki.toString("base64")}` }],
        policy: { offline_grace_days_default: 1 }
      },
      entitlement_token: token,
      now_epoch_seconds: now,
      last_online_ok_epoch: now - 60
    });

    expect(decision.allow_load).toBe(true);
  });
});
