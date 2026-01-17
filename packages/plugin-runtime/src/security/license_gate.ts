import type { license_decision, license_diagnostic } from "@planforge/plugin-sdk";
import { validate_manifest } from "../manifest";
import type { plugin_manifest } from "../manifest";
import { sha256_hex } from "./sha256";
import { verify_manifest_signature } from "./signature";
import { find_entitlement } from "./entitlement";
import { verify_jwt_entitlement } from "./verify_jwt_entitlement";
import type { trust_store } from "./trust_store";

type artifacts_map = Record<string, Uint8Array>;

function empty_caps(): license_decision["allow_capabilities"] {
  return {
    constraints: false,
    pricing: false,
    render: false,
    export: false,
    solver: false,
    ui: false
  };
}

function caps_from_manifest(manifest: plugin_manifest): license_decision["allow_capabilities"] {
  return {
    constraints: manifest.capabilities.constraints,
    pricing: manifest.capabilities.pricing,
    render: manifest.capabilities.render,
    export: manifest.capabilities.export,
    solver: manifest.capabilities.solver,
    ui: true
  };
}

function cap_list(capabilities: license_decision["allow_capabilities"]): string[] {
  const out: string[] = [];
  if (capabilities.pricing) out.push("pricing");
  if (capabilities.export) out.push("export");
  return out;
}

export type license_gate_args = {
  manifest: plugin_manifest;
  artifacts: artifacts_map;
  trust_store: trust_store | null;
  entitlement_token?: string | null;
  now_epoch_seconds?: number;
  last_online_ok_epoch?: number;
  revoked_jtis?: string[];
};

export async function verify_plugin_license(args: license_gate_args): Promise<license_decision> {
  const diagnostics: license_diagnostic[] = [];

  const schema = validate_manifest(args.manifest);
  if (!schema.ok) {
    diagnostics.push({
      code: "license.manifest_invalid",
      message: "Manifest schema invalid",
      details: { errors: schema.errors }
    });
    return { ok: false, allow_load: false, allow_capabilities: empty_caps(), diagnostics };
  }

  if (!args.manifest.integrity || typeof args.manifest.integrity !== "object") {
    diagnostics.push({ code: "license.policy_denied", message: "Manifest integrity missing" });
    return { ok: false, allow_load: false, allow_capabilities: empty_caps(), diagnostics };
  }

  const channel = args.manifest.integrity.channel;
  const is_paid = channel === "paid";
  const allow_caps = caps_from_manifest(args.manifest);

  if (!is_paid) {
    return { ok: true, allow_load: true, allow_capabilities: allow_caps, diagnostics };
  }

  if (!args.trust_store) {
    diagnostics.push({ code: "license.trust_store_missing", message: "Trust store not available" });
    return { ok: false, allow_load: false, allow_capabilities: empty_caps(), diagnostics };
  }

  const signature = args.manifest.integrity.signature;
  if (!signature || signature.alg !== "ed25519" || !signature.value || !signature.kid) {
    diagnostics.push({ code: "license.signature_invalid", message: "Manifest signature missing or invalid" });
    return { ok: false, allow_load: false, allow_capabilities: empty_caps(), diagnostics };
  }

  const publisher_key = args.trust_store.publisher_keys.find((k) => k.kid === signature.kid);
  if (!publisher_key) {
    diagnostics.push({ code: "license.signature_invalid", message: "Unknown publisher key", details: { kid: signature.kid } });
    return { ok: false, allow_load: false, allow_capabilities: empty_caps(), diagnostics };
  }

  const signature_ok = await verify_manifest_signature({
    manifest: args.manifest as unknown as Record<string, unknown>,
    signature_base64: signature.value,
    public_key_spki_der_base64: publisher_key.public_key_spki_der_base64
  });
  if (!signature_ok) {
    diagnostics.push({ code: "license.signature_invalid", message: "Manifest signature verification failed" });
    return { ok: false, allow_load: false, allow_capabilities: empty_caps(), diagnostics };
  }

  const hashes = args.manifest.integrity.hashes ?? {};
  for (const [path, expected] of Object.entries(hashes)) {
    const bytes = args.artifacts[path];
    if (!bytes) {
      diagnostics.push({ code: "license.hash_mismatch", message: `Missing artifact for ${path}` });
      return { ok: false, allow_load: false, allow_capabilities: empty_caps(), diagnostics };
    }
    const expected_hex = expected.replace(/^sha256:/, "");
    const actual = await sha256_hex(bytes);
    if (actual !== expected_hex) {
      diagnostics.push({
        code: "license.hash_mismatch",
        message: `Hash mismatch for ${path}`,
        details: { expected: expected_hex, actual }
      });
      return { ok: false, allow_load: false, allow_capabilities: empty_caps(), diagnostics };
    }
  }

  if (!args.entitlement_token) {
    diagnostics.push({ code: "license.missing", message: "Entitlement token missing" });
    return { ok: false, allow_load: false, allow_capabilities: empty_caps(), diagnostics };
  }

  const issuer_keys = args.trust_store.issuer_keys.map((k) => ({
    kid: k.kid,
    public_key_spki_der_base64: k.public_key_spki_der_base64
  }));

  const verify = await verify_jwt_entitlement({
    token: args.entitlement_token,
    issuer_keys,
    options: {
      expected_issuer: "planforge-license",
      expected_audience: "planforge",
      required_plugin_id: args.manifest.id,
      allow_expired: true,
      now_epoch_seconds: args.now_epoch_seconds
    }
  });

  if (!verify.ok) {
    diagnostics.push({ code: "license.entitlement_invalid", message: verify.message, details: verify.details });
    return { ok: false, allow_load: false, allow_capabilities: empty_caps(), diagnostics };
  }

  const revoked = args.revoked_jtis ?? [];
  if (verify.claims.jti && revoked.includes(verify.claims.jti)) {
    diagnostics.push({ code: "license.revoked", message: "Entitlement revoked", details: { jti: verify.claims.jti } });
    return { ok: false, allow_load: false, allow_capabilities: empty_caps(), diagnostics };
  }

  const now = args.now_epoch_seconds ?? Math.floor(Date.now() / 1000);
  const exp = verify.claims.exp;
  const grace_days =
    verify.entitlement?.offline_grace_days ??
    args.trust_store.policy?.offline_grace_days_default ??
    0;
  const last_ok = args.last_online_ok_epoch ?? 0;
  const grace_seconds = grace_days * 24 * 60 * 60;
  const within_grace = exp > now || (grace_seconds > 0 && now - last_ok <= grace_seconds);

  if (!within_grace) {
    diagnostics.push({
      code: "license.expired",
      message: "Entitlement expired and grace window exceeded",
      details: { exp, now, last_ok, grace_days }
    });
    return { ok: false, allow_load: false, allow_capabilities: empty_caps(), diagnostics };
  }

  const required_caps = cap_list(allow_caps);
  const entitlement_check = find_entitlement(verify.claims, args.manifest.id, args.manifest.version, required_caps);
  if (!entitlement_check.ok) {
    diagnostics.push({
      code: "license.entitlement_invalid",
      message: entitlement_check.error?.message ?? "Entitlement invalid"
    });
    return { ok: false, allow_load: false, allow_capabilities: empty_caps(), diagnostics };
  }

  return { ok: true, allow_load: true, allow_capabilities: allow_caps, diagnostics };
}
