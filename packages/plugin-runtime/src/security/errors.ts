export type license_error_code =
  | "license.missing"
  | "license.entitlement_missing"
  | "license.entitlement_invalid"
  | "license.signature_invalid"
  | "license.hash_mismatch"
  | "license.revoked"
  | "license.expired"
  | "license.not_yet_valid"
  | "license.trust_store_missing"
  | "license.manifest_invalid"
  | "license.policy_denied";

export type license_error = {
  code: license_error_code;
  message: string;
  details?: Record<string, unknown>;
};
