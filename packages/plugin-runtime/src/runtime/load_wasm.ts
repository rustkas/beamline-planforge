export async function load_wasm_bytes(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch wasm: ${res.status}`);
  }
  return await res.arrayBuffer();
}
