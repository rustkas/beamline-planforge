import path from "node:path";
import { access } from "node:fs/promises";

function is_safe_id(value: string): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(value);
}

export async function resolve_wasi_plugin_path(plugin_id: string): Promise<string | null> {
  if (!is_safe_id(plugin_id)) return null;
  const base_dir = process.env.WASI_PLUGINS_DIR ?? path.resolve(process.cwd(), "plugins");
  const wasm_path = path.join(base_dir, plugin_id, "dist", "plugin.wasm");
  try {
    await access(wasm_path);
    return wasm_path;
  } catch {
    return null;
  }
}
