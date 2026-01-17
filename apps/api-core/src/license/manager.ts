import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import type { trust_store } from "../../../../packages/plugin-runtime/src/security/trust_store.ts";
import { verify_jwt_entitlement, type jwt_claims } from "../../../../packages/plugin-runtime/src/security/verify_jwt_entitlement.ts";

export type license_status = {
  ok: boolean;
  allowed: boolean;
  exp?: number;
  refresh_at?: number;
  last_good_refresh_at?: number;
  revoked?: boolean;
  token_jti?: string;
  diagnostics?: string[];
  error?: { code: string; message: string };
};

export type license_refresh_result = {
  ok: boolean;
  token?: string;
  exp?: number;
  refresh_at?: number;
  last_good_refresh_at?: number;
  revoked_jtis?: string[];
  error?: { code: string; message: string };
};

type cache_entry = {
  token: string;
  token_hash: string;
  exp: number;
  refresh_at: number;
  last_good_refresh_at: number;
  claims: jwt_claims;
  token_jti?: string;
};

type trust_cache = {
  store: trust_store;
  loaded_at: number;
  source: "remote" | "local";
};

function now_epoch(): number {
  return Math.floor(Date.now() / 1000);
}

function hash_token(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function parse_base_dir(): string {
  return process.cwd();
}

function default_trust_store_path(): string {
  return path.resolve(parse_base_dir(), "trust", "trust_store.json");
}

async function read_trust_store_file(file_path: string): Promise<trust_store | null> {
  try {
    const raw = await readFile(file_path, "utf8");
    return JSON.parse(raw) as trust_store;
  } catch {
    return null;
  }
}

async function fetch_trust_store(url: string): Promise<trust_store | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as trust_store;
  } catch {
    return null;
  }
}

function compute_refresh_at(exp: number, now: number): number {
  const default_refresh = now + Number(process.env.LICENSE_REFRESH_AFTER_SECONDS ?? 420);
  const max_refresh = exp - 60;
  return Math.min(default_refresh, max_refresh);
}

export async function create_license_manager() {
  const cache = new Map<string, cache_entry>();
  const revoked = new Set<string>();
  let trust_cache: trust_cache | null = null;

  const revocation_path = process.env.LICENSE_REVOCATION_PATH;
  if (revocation_path) {
    const loaded = await read_revocations(revocation_path);
    for (const jti of loaded) revoked.add(jti);
  }

  async function get_trust_store(): Promise<trust_store | null> {
    const ttl = Number(process.env.TRUST_STORE_TTL_SECONDS ?? 3600);
    const now = now_epoch();
    if (trust_cache && now - trust_cache.loaded_at < ttl) return trust_cache.store;

    const remote_url = process.env.TRUST_STORE_URL;
    if (remote_url) {
      const remote = await fetch_trust_store(remote_url);
      if (remote) {
        trust_cache = { store: remote, loaded_at: now, source: "remote" };
        return remote;
      }
    }

    const local_path = process.env.TRUST_STORE_PATH ?? default_trust_store_path();
    const local = await read_trust_store_file(local_path);
    if (local) {
      trust_cache = { store: local, loaded_at: now, source: "local" };
      return local;
    }

    return null;
  }

  async function verify_token(token: string, allow_expired: boolean): Promise<{ claims?: jwt_claims; error?: string }> {
    const store = await get_trust_store();
    if (!store) return { error: "trust_store_missing" };

    const res = await verify_jwt_entitlement({
      token,
      issuer_keys: store.issuer_keys.map((k) => ({
        kid: k.kid,
        public_key_spki_der_base64: k.public_key_spki_der_base64
      })),
      options: {
        expected_issuer: "planforge-license",
        expected_audience: "planforge",
        allow_expired,
        now_epoch_seconds: now_epoch()
      }
    });

    if (!res.ok) return { error: res.message };
    return { claims: res.claims };
  }

  async function ensure_cache_entry(token: string): Promise<cache_entry | null> {
    const token_hash = hash_token(token);
    const cached = cache.get(token_hash);
    if (cached) return cached;

    const verified = await verify_token(token, true);
    if (!verified.claims) return null;

    const exp = verified.claims.exp;
    const entry: cache_entry = {
      token,
      token_hash,
      exp,
      refresh_at: compute_refresh_at(exp, now_epoch()),
      last_good_refresh_at: 0,
      claims: verified.claims,
      token_jti: verified.claims.jti
    };
    cache.set(token_hash, entry);
    return entry;
  }

  function within_grace(exp: number, last_ok: number, grace_hours: number, now: number): boolean {
    if (exp > now) return true;
    if (!last_ok) return false;
    const grace_seconds = grace_hours * 3600;
    return now - last_ok <= grace_seconds;
  }

  async function get_status(token: string | null): Promise<license_status> {
    if (!token) {
      return { ok: false, allowed: false, error: { code: "license.missing", message: "Token missing" } };
    }

    const entry = await ensure_cache_entry(token);
    if (!entry) {
      return { ok: false, allowed: false, error: { code: "license.invalid", message: "Token invalid" } };
    }

    const now = now_epoch();
    const grace_hours = Number(process.env.LICENSE_GRACE_HOURS ?? 24);
    const revoked_flag = entry.token_jti ? revoked.has(entry.token_jti) : false;
    const allowed = !revoked_flag && within_grace(entry.exp, entry.last_good_refresh_at, grace_hours, now);

    return {
      ok: true,
      allowed,
      exp: entry.exp,
      refresh_at: entry.refresh_at,
      last_good_refresh_at: entry.last_good_refresh_at,
      revoked: revoked_flag,
      token_jti: entry.token_jti
    };
  }

  async function refresh(token: string | null): Promise<license_refresh_result> {
    if (!token) {
      return { ok: false, error: { code: "license.missing", message: "Token missing" } };
    }

    const license_url = process.env.LICENSE_SERVER_URL;
    if (!license_url) {
      return { ok: false, error: { code: "license.refresh_unavailable", message: "LICENSE_SERVER_URL not set" } };
    }

    const res = await fetch(`${license_url.replace(/\/$/, "")}/v1/entitlements/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token })
    });

    if (!res.ok) {
      return {
        ok: false,
        error: { code: "license.refresh_failed", message: `Refresh failed (${res.status})` }
      };
    }

    const payload = (await res.json()) as {
      token?: string;
      exp?: number;
      refresh_at?: number;
      revoked_jtis?: string[];
      trust_store?: trust_store;
    };

    const updated_token = payload.token ?? token;
    const verified = await verify_token(updated_token, false);
    if (!verified.claims) {
      return { ok: false, error: { code: "license.invalid", message: "Refreshed token invalid" } };
    }

    if (payload.trust_store) {
      trust_cache = { store: payload.trust_store, loaded_at: now_epoch(), source: "remote" };
    }

    const exp = payload.exp ?? verified.claims.exp;
    const refresh_at = payload.refresh_at ?? compute_refresh_at(exp, now_epoch());
    const token_hash = hash_token(updated_token);
    const entry: cache_entry = {
      token: updated_token,
      token_hash,
      exp,
      refresh_at,
      last_good_refresh_at: now_epoch(),
      claims: verified.claims,
      token_jti: verified.claims.jti
    };
    cache.set(token_hash, entry);

    if (Array.isArray(payload.revoked_jtis)) {
      for (const jti of payload.revoked_jtis) revoked.add(jti);
      if (revocation_path) {
        await write_revocations(revocation_path, Array.from(revoked));
      }
    }

    return {
      ok: true,
      token: updated_token,
      exp,
      refresh_at,
      last_good_refresh_at: entry.last_good_refresh_at,
      revoked_jtis: payload.revoked_jtis ?? []
    };
  }

  async function read_revocations(file_path: string): Promise<string[]> {
    try {
      const raw = await readFile(file_path, "utf8");
      const parsed = JSON.parse(raw) as { revoked_jtis?: string[] };
      return Array.isArray(parsed.revoked_jtis) ? parsed.revoked_jtis : [];
    } catch {
      return [];
    }
  }

  async function write_revocations(file_path: string, list: string[]): Promise<void> {
    const body = JSON.stringify({ revoked_jtis: list, updated_at: now_epoch() });
    await Bun.write(file_path, body);
  }

  return {
    get_trust_store,
    get_status,
    refresh
  };
}
