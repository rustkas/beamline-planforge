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

export type license_diagnostic = {
  code: license_error_code;
  message: string;
  details?: Record<string, unknown>;
};

export type license_capabilities = {
  constraints: boolean;
  pricing: boolean;
  render: boolean;
  export: boolean;
  solver: boolean;
  ui: boolean;
};

export type license_decision = {
  ok: boolean;
  allow_load: boolean;
  allow_capabilities: license_capabilities;
  diagnostics: license_diagnostic[];
};

export type license_context = {
  ok: boolean;
  allow_capabilities: license_capabilities;
  exp?: number;
  refresh_at?: number;
  last_good_refresh_at?: number;
  revoked?: boolean;
  diagnostics?: license_diagnostic[];
};
