import path from "node:path";
import { access, readFile } from "node:fs/promises";
import { validate_manifest, type plugin_manifest } from "../../../../packages/plugin-runtime/src/index.ts";

function is_safe_id(value: string): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(value);
}

function base_dir(): string {
  return process.env.WASI_PLUGINS_DIR ?? path.resolve(process.cwd(), "plugins");
}

type wasi_hook = "constraints" | "pricing" | "export";

export type wasi_plugin_info = {
  manifest: plugin_manifest;
  allowed_hooks: wasi_hook[];
};

function parse_allowed_hooks(): wasi_hook[] | null {
  const raw = process.env.WASI_ALLOWED_HOOKS;
  if (!raw) return null;
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0) as wasi_hook[];
  return parts.length > 0 ? parts : null;
}

function hooks_from_manifest(manifest: plugin_manifest): wasi_hook[] {
  const hooks: wasi_hook[] = [];
  if (manifest.capabilities.constraints) hooks.push("constraints");
  if (manifest.capabilities.pricing) hooks.push("pricing");
  if (manifest.capabilities.export) hooks.push("export");
  return hooks;
}

export async function load_wasi_manifest(plugin_id: string): Promise<plugin_manifest | null> {
  if (!is_safe_id(plugin_id)) return null;
  const manifest_path = path.join(base_dir(), plugin_id, "plugin.json");
  try {
    const raw = await readFile(manifest_path, "utf8");
    const parsed = JSON.parse(raw) as plugin_manifest;
    const validation = validate_manifest(parsed);
    if (!validation.ok) {
      return null;
    }
    if (parsed.runtime.kind !== "wasi") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function get_wasi_plugin_info(plugin_id: string): Promise<wasi_plugin_info | null> {
  const manifest = await load_wasi_manifest(plugin_id);
  if (!manifest) return null;
  const allowed = parse_allowed_hooks();
  const hooks = hooks_from_manifest(manifest);
  const allowed_hooks = allowed ? hooks.filter((h) => allowed.includes(h)) : hooks;
  return { manifest, allowed_hooks };
}

export async function resolve_wasi_plugin_path(plugin_id: string): Promise<string | null> {
  if (!is_safe_id(plugin_id)) return null;
  const wasm_path = path.join(base_dir(), plugin_id, "dist", "plugin.wasm");
  try {
    await access(wasm_path);
    return wasm_path;
  } catch {
    return null;
  }
}
