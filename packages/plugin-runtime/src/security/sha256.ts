function to_hex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256_hex(bytes: Uint8Array): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return to_hex(new Uint8Array(digest));
  }

  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256");
  hash.update(Buffer.from(bytes));
  return hash.digest("hex");
}
