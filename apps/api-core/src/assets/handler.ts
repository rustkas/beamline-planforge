import path from "node:path";
import { readFile, stat } from "node:fs/promises";

const DEFAULT_ASSETS_DIR = path.resolve(process.cwd(), "apps", "web", "public", "assets");

function safe_join(base: string, rel: string): string | null {
  const clean = rel.replace(/^\//, "").replace(/\\/g, "/");
  const resolved = path.resolve(base, clean);
  if (!resolved.startsWith(path.resolve(base) + path.sep)) {
    return null;
  }
  return resolved;
}

function content_type(file_path: string): string {
  const ext = path.extname(file_path).toLowerCase();
  switch (ext) {
    case ".glb":
      return "model/gltf-binary";
    case ".gltf":
      return "model/gltf+json";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".ktx2":
      return "image/ktx2";
    case ".basis":
      return "application/octet-stream";
    case ".json":
      return "application/json";
    default:
      return "application/octet-stream";
  }
}

function cache_control(file_path: string): string {
  const ext = path.extname(file_path).toLowerCase();
  if (ext === ".json") {
    return "public, max-age=300";
  }
  return "public, max-age=31536000, immutable";
}

export async function read_asset(
  relative_path: string,
  options?: { if_none_match?: string | null; accept_encoding?: string | null }
): Promise<{
  ok: boolean;
  status: number;
  body?: Uint8Array;
  headers?: Record<string, string>;
}> {
  const assets_dir = process.env.ASSETS_DIR ?? DEFAULT_ASSETS_DIR;
  const resolved = safe_join(assets_dir, relative_path);
  if (!resolved) {
    return { ok: false, status: 400 };
  }

  try {
    const accept_encoding = options?.accept_encoding ?? "";
    const wants_gzip = accept_encoding.includes("gzip");
    const gzip_path = `${resolved}.gz`;
    const gz_info = wants_gzip ? await stat(gzip_path).catch(() => null) : null;
    const use_gzip = !!gz_info?.isFile();

    const target_path = use_gzip ? gzip_path : resolved;
    const info = await stat(target_path);
    if (!info.isFile()) {
      return { ok: false, status: 404 };
    }
    const etag = `W/"${info.size}-${info.mtimeMs}"`;
    if (options?.if_none_match && options.if_none_match === etag) {
      return {
        ok: true,
        status: 304,
        headers: {
          "cache-control": cache_control(resolved),
          etag,
          ...(use_gzip ? { "content-encoding": "gzip", vary: "accept-encoding" } : {})
        }
      };
    }

    const bytes = await readFile(target_path);
    return {
      ok: true,
      status: 200,
      body: new Uint8Array(bytes),
      headers: {
        "content-type": content_type(resolved),
        "cache-control": cache_control(resolved),
        etag,
        ...(use_gzip ? { "content-encoding": "gzip", vary: "accept-encoding" } : {})
      }
    };
  } catch {
    return { ok: false, status: 404 };
  }
}
