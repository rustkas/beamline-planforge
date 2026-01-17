export type jwt_entitlement = {
  plugin_id: string;
  version_range: string;
  capabilities: string[];
  offline_grace_days?: number;
};

export type jwt_claims = {
  iss: string;
  aud: string | string[];
  sub: string;
  exp: number;
  nbf?: number;
  iat?: number;
  jti?: string;
  entitlements: jwt_entitlement[];
};

export type jwt_verify_options = {
  expected_issuer: string;
  expected_audience: string;
  now_epoch_seconds?: number;
  required_plugin_id?: string;
  required_kid?: string;
  allow_expired?: boolean;
};

export type issuer_key_spki = {
  kid: string;
  public_key_spki_der_base64: string;
};

export type verify_ok = {
  ok: true;
  header: { alg: "EdDSA"; kid?: string; typ?: string };
  claims: jwt_claims;
  entitlement?: jwt_entitlement;
};

export type verify_err = {
  ok: false;
  code:
    | "jwt.format_invalid"
    | "jwt.header_invalid"
    | "jwt.alg_not_supported"
    | "jwt.kid_missing"
    | "jwt.unknown_kid"
    | "jwt.signature_invalid"
    | "jwt.claims_invalid"
    | "jwt.iss_mismatch"
    | "jwt.aud_mismatch"
    | "jwt.expired"
    | "jwt.not_yet_valid"
    | "jwt.entitlement_missing";
  message: string;
  details?: Record<string, unknown>;
};

function is_record(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function strip_b64_prefix(s: string): string {
  return s.startsWith("base64:") ? s.slice("base64:".length) : s;
}

function b64url_to_bytes(s: string): Uint8Array {
  const pad_len = (4 - (s.length % 4)) % 4;
  const padded = s + "=".repeat(pad_len);
  const b64 = padded.replace(/-/g, "+").replace(/_/g, "/");

  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(b64, "base64"));
  }

  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function b64_to_bytes(s: string): Uint8Array {
  const clean = strip_b64_prefix(s);
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(clean, "base64"));
  }
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function bytes_to_utf8(bytes: Uint8Array): string {
  if (typeof TextDecoder !== "undefined") return new TextDecoder().decode(bytes);
  return Buffer.from(bytes).toString("utf8");
}

function utf8_to_bytes(s: string): Uint8Array {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s);
  return new Uint8Array(Buffer.from(s, "utf8"));
}

function to_buffer_source(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function safe_json_parse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function aud_matches(aud: string | string[], expected: string): boolean {
  if (typeof aud === "string") return aud === expected;
  if (Array.isArray(aud)) return aud.some((x) => x === expected);
  return false;
}

function validate_claims_shape(x: unknown): x is jwt_claims {
  if (!is_record(x)) return false;
  if (typeof x.iss !== "string") return false;
  if (!(typeof x.aud === "string" || Array.isArray(x.aud))) return false;
  if (typeof x.sub !== "string") return false;
  if (typeof x.exp !== "number" || !Number.isFinite(x.exp)) return false;
  if (!Array.isArray(x.entitlements)) return false;

  for (const e of x.entitlements) {
    if (!is_record(e)) return false;
    if (typeof e.plugin_id !== "string") return false;
    if (typeof e.version_range !== "string") return false;
    if (!Array.isArray(e.capabilities)) return false;
    for (const c of e.capabilities) if (typeof c !== "string") return false;
    if ("offline_grace_days" in e && typeof (e as any).offline_grace_days !== "number") return false;
  }

  if ("nbf" in x && typeof (x as any).nbf !== "number") return false;
  return true;
}

async function import_ed25519_spki(spki_der: Uint8Array): Promise<CryptoKey> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("WebCrypto subtle is not available");
  return subtle.importKey("spki", to_buffer_source(spki_der), { name: "Ed25519" }, false, ["verify"]);
}

async function verify_eddsa(public_key: CryptoKey, signing_input: Uint8Array, signature: Uint8Array): Promise<boolean> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("WebCrypto subtle is not available");
  return subtle.verify(
    { name: "Ed25519" },
    public_key,
    to_buffer_source(signature),
    to_buffer_source(signing_input)
  );
}

export async function verify_jwt_entitlement(args: {
  token: string;
  issuer_keys: issuer_key_spki[];
  options: jwt_verify_options;
}): Promise<verify_ok | verify_err> {
  const now = args.options.now_epoch_seconds ?? Math.floor(Date.now() / 1000);

  const parts = args.token.split(".");
  if (parts.length !== 3) {
    return { ok: false, code: "jwt.format_invalid", message: "JWT must have 3 parts" };
  }

  const [h_b64u, p_b64u, s_b64u] = parts;

  const header_raw = safe_json_parse(bytes_to_utf8(b64url_to_bytes(h_b64u)));
  if (!is_record(header_raw)) {
    return { ok: false, code: "jwt.header_invalid", message: "Invalid JWT header JSON" };
  }

  if (header_raw.alg !== "EdDSA") {
    return { ok: false, code: "jwt.alg_not_supported", message: `Unsupported alg: ${String(header_raw.alg)}` };
  }

  const kid = typeof header_raw.kid === "string" ? header_raw.kid : undefined;

  if (args.options.required_kid) {
    if (!kid) return { ok: false, code: "jwt.kid_missing", message: "kid is required but missing" };
    if (kid !== args.options.required_kid) {
      return { ok: false, code: "jwt.unknown_kid", message: "kid does not match required kid", details: { kid } };
    }
  }

  let key: issuer_key_spki | undefined;
  if (kid) {
    key = args.issuer_keys.find((k) => k.kid === kid);
    if (!key) return { ok: false, code: "jwt.unknown_kid", message: "Unknown kid", details: { kid } };
  } else {
    if (args.issuer_keys.length !== 1) {
      return { ok: false, code: "jwt.kid_missing", message: "kid missing and issuer_keys is not singleton" };
    }
    key = args.issuer_keys[0];
  }

  const payload_raw = safe_json_parse(bytes_to_utf8(b64url_to_bytes(p_b64u)));
  if (!validate_claims_shape(payload_raw)) {
    return { ok: false, code: "jwt.claims_invalid", message: "Invalid claims shape" };
  }

  if (payload_raw.iss !== args.options.expected_issuer) {
    return { ok: false, code: "jwt.iss_mismatch", message: "Issuer mismatch", details: { iss: payload_raw.iss } };
  }
  if (!aud_matches(payload_raw.aud, args.options.expected_audience)) {
    return { ok: false, code: "jwt.aud_mismatch", message: "Audience mismatch", details: { aud: payload_raw.aud } };
  }
  if (!args.options.allow_expired && payload_raw.exp <= now) {
    return { ok: false, code: "jwt.expired", message: "Token expired", details: { exp: payload_raw.exp, now } };
  }
  if (typeof payload_raw.nbf === "number" && payload_raw.nbf > now) {
    return { ok: false, code: "jwt.not_yet_valid", message: "Token not yet valid", details: { nbf: payload_raw.nbf, now } };
  }

  const signing_input = utf8_to_bytes(`${h_b64u}.${p_b64u}`);
  const signature = b64url_to_bytes(s_b64u);

  try {
    const spki = b64_to_bytes(key.public_key_spki_der_base64);
    const pubkey = await import_ed25519_spki(spki);
    const ok = await verify_eddsa(pubkey, signing_input, signature);
    if (!ok) return { ok: false, code: "jwt.signature_invalid", message: "Invalid JWT signature" };
  } catch (e) {
    return { ok: false, code: "jwt.signature_invalid", message: "Signature verification failed", details: { message: String(e) } };
  }

  let entitlement: jwt_entitlement | undefined;
  if (args.options.required_plugin_id) {
    entitlement = payload_raw.entitlements.find((x) => x.plugin_id === args.options.required_plugin_id);
    if (!entitlement) {
      return {
        ok: false,
        code: "jwt.entitlement_missing",
        message: "No entitlement for required plugin_id",
        details: { plugin_id: args.options.required_plugin_id }
      };
    }
  }

  return {
    ok: true,
    header: {
      alg: "EdDSA",
      kid,
      typ: typeof header_raw.typ === "string" ? header_raw.typ : undefined
    },
    claims: payload_raw,
    entitlement
  };
}
