export type trust_store_key = {
  kid: string;
  alg: "ed25519";
  public_key_spki_der_base64: string;
};

export type trust_store = {
  publisher_keys: trust_store_key[];
  issuer_keys: trust_store_key[];
  policy?: {
    offline_grace_days_default?: number;
  };
};

export async function load_trust_store(url: string): Promise<trust_store> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load trust store (${res.status})`);
  }
  return (await res.json()) as trust_store;
}
