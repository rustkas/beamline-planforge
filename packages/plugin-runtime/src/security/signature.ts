import { canonicalize_json } from "./canonical_json";

function strip_b64_prefix(value: string): string {
  return value.startsWith("base64:") ? value.slice("base64:".length) : value;
}

function b64_to_bytes(value: string): Uint8Array {
  const clean = strip_b64_prefix(value);
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(clean, "base64"));
  }
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

function utf8_to_bytes(text: string): Uint8Array {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(text);
  }
  return new Uint8Array(Buffer.from(text, "utf8"));
}

function to_buffer_source(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function import_ed25519_spki(spki_der: Uint8Array): Promise<CryptoKey> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("WebCrypto subtle is not available");
  }
  return subtle.importKey("spki", to_buffer_source(spki_der), { name: "Ed25519" }, false, ["verify"]);
}

async function verify_eddsa_subtle(spki_der: Uint8Array, signing_input: Uint8Array, signature: Uint8Array): Promise<boolean> {
  const key = await import_ed25519_spki(spki_der);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("WebCrypto subtle is not available");
  }
  return subtle.verify(
    { name: "Ed25519" },
    key,
    to_buffer_source(signature),
    to_buffer_source(signing_input)
  );
}

export function canonicalize_manifest_for_signature(manifest: Record<string, unknown>): string {
  const clone = structuredClone(manifest) as Record<string, unknown>;
  const integrity = clone.integrity as Record<string, unknown> | undefined;
  if (integrity && typeof integrity === "object") {
    const signature = integrity.signature as Record<string, unknown> | undefined;
    if (signature && typeof signature === "object") {
      delete signature.value;
    }
  }
  return canonicalize_json(clone);
}

export async function verify_manifest_signature(args: {
  manifest: Record<string, unknown>;
  signature_base64: string;
  public_key_spki_der_base64: string;
}): Promise<boolean> {
  const signing_input = utf8_to_bytes(canonicalize_manifest_for_signature(args.manifest));
  const signature = b64_to_bytes(args.signature_base64);
  const spki_der = b64_to_bytes(args.public_key_spki_der_base64);

  if (globalThis.crypto?.subtle) {
    return verify_eddsa_subtle(spki_der, signing_input, signature);
  }
  throw new Error("WebCrypto subtle is not available for signature verification");
}
