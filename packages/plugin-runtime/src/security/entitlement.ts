import type { jwt_entitlement, jwt_claims } from "./verify_jwt_entitlement";

export type entitlement_check_result = {
  ok: boolean;
  entitlement?: jwt_entitlement;
  error?: { code: "entitlement.missing" | "entitlement.version_mismatch" | "entitlement.capability_denied"; message: string };
};

type semver = { major: number; minor: number; patch: number };

function parse_semver(raw: string): semver | null {
  const match = raw.trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function compare(a: semver, b: semver): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

function satisfies(range: string, version: string): boolean {
  const v = parse_semver(version);
  if (!v) return false;
  if (range.startsWith("^")) {
    const base = parse_semver(range.slice(1));
    if (!base) return false;
    if (base.major > 0) {
      return v.major === base.major && compare(v, base) >= 0;
    }
    if (base.minor > 0) {
      return v.major === 0 && v.minor === base.minor && compare(v, base) >= 0;
    }
    return v.major === 0 && v.minor === 0 && v.patch === base.patch;
  }
  const exact = parse_semver(range);
  return !!exact && compare(v, exact) === 0;
}

export function find_entitlement(
  claims: jwt_claims,
  plugin_id: string,
  plugin_version: string,
  required_capabilities: string[]
): entitlement_check_result {
  const entitlement = claims.entitlements.find((entry) => entry.plugin_id === plugin_id);
  if (!entitlement) {
    return { ok: false, error: { code: "entitlement.missing", message: "Entitlement not found" } };
  }
  if (!satisfies(entitlement.version_range, plugin_version)) {
    return { ok: false, entitlement, error: { code: "entitlement.version_mismatch", message: "Version not allowed" } };
  }
  const caps = new Set(entitlement.capabilities);
  for (const required of required_capabilities) {
    if (!caps.has(required)) {
      return {
        ok: false,
        entitlement,
        error: { code: "entitlement.capability_denied", message: `Capability not allowed: ${required}` }
      };
    }
  }
  return { ok: true, entitlement };
}
