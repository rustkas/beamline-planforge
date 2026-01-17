import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

type command = "build" | "hash" | "verify" | "repro";

type wasm_target = "web" | "wasi";

type build_options = {
  out_dir: string;
  target_dir?: string;
};

function usage(): never {
  process.stderr.write("Usage: bun tools/wasm/cli.ts <build|hash|verify|repro> <path>\n");
  process.exit(1);
}

function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function to_hex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256_hex(bytes: Uint8Array): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return to_hex(new Uint8Array(digest));
  }
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256");
  hash.update(Buffer.from(bytes));
  return hash.digest("hex");
}

async function run(cmd: string, args: string[], cwd: string, env?: Record<string, string>): Promise<void> {
  const proc = Bun.spawn([cmd, ...args], {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env, ...(env ?? {}) }
  });
  const code = await proc.exited;
  if (code !== 0) {
    process.exit(code);
  }
}

async function read_json(file_path: string): Promise<Record<string, unknown>> {
  const text = await readFile(file_path, "utf8");
  return JSON.parse(text) as Record<string, unknown>;
}

async function write_json(file_path: string, value: unknown): Promise<void> {
  const text = JSON.stringify(value, null, 2);
  await writeFile(file_path, `${text}\n`, "utf8");
}

async function parse_crate_name(dir: string): Promise<string> {
  const toml = await readFile(path.join(dir, "Cargo.toml"), "utf8");
  const match = toml.match(/\nname\s*=\s*"([^"]+)"/);
  if (!match) throw new Error("crate name not found in Cargo.toml");
  return match[1];
}

function normalize_wasm_name(crate: string): string {
  return crate.replace(/-/g, "_");
}

async function ensure_dir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

async function list_dist_files(dist_dir: string): Promise<string[]> {
  const entries = await readdir(dist_dir, { withFileTypes: true });
  return entries.filter((e) => e.isFile()).map((e) => e.name).sort();
}

function find_wasm_file(files: string[]): string | null {
  if (files.includes("plugin.wasm")) return "plugin.wasm";
  const bg = files.find((f) => f.endsWith("_bg.wasm"));
  if (bg) return bg;
  return files.find((f) => f.endsWith(".wasm")) ?? null;
}

async function copy_file(src: string, dest: string): Promise<void> {
  await ensure_dir(path.dirname(dest));
  await writeFile(dest, await readFile(src));
}

async function copy_dist_to(dest_dir: string, dist_dir: string): Promise<void> {
  await ensure_dir(dest_dir);
  const files = await list_dist_files(dist_dir);
  for (const file of files) {
    await copy_file(path.join(dist_dir, file), path.join(dest_dir, file));
  }
}

async function detect_target(dir: string): Promise<wasm_target> {
  const plugin_json = path.join(dir, "plugin.json");
  try {
    const manifest = await read_json(plugin_json);
    const runtime = manifest.runtime as Record<string, unknown> | undefined;
    const kind = runtime?.kind;
    if (kind === "wasi") return "wasi";
    return "web";
  } catch {
    return "web";
  }
}

async function build_web(dir: string, options: build_options, out_name: string): Promise<void> {
  await ensure_dir(options.out_dir);
  const args = ["build", "--release", "--target", "web", "--out-dir", options.out_dir, "--out-name", out_name];
  const env = options.target_dir ? { CARGO_TARGET_DIR: options.target_dir } : undefined;
  await run("wasm-pack", args, dir, env);
}

async function build_wasi(dir: string, options: build_options): Promise<void> {
  await ensure_dir(options.out_dir);
  const env = options.target_dir ? { CARGO_TARGET_DIR: options.target_dir } : undefined;
  await run("cargo", ["build", "--target", "wasm32-wasip1", "--release"], dir, env);
  const crate = await parse_crate_name(dir);
  const wasm_name = `${normalize_wasm_name(crate)}.wasm`;
  const source = path.join(options.target_dir ?? path.join(dir, "target"), "wasm32-wasip1", "release", wasm_name);
  await copy_file(source, path.join(options.out_dir, "plugin.wasm"));
}

async function build_core_wasm(dir: string, options: build_options): Promise<void> {
  await build_web(dir, options, "planforge_core_wasm");
  const dist_dir = options.out_dir;
  await copy_dist_to(path.resolve(dir, "../../apps/web/public/wasm"), dist_dir);
  await copy_dist_to(path.resolve(dir, "../../apps/api-core/assets/wasm"), dist_dir);
}

async function build_path(dir: string, options: build_options): Promise<void> {
  const plugin_json = path.join(dir, "plugin.json");
  if (await exists(plugin_json)) {
    const target = await detect_target(dir);
    if (target === "wasi") {
      await build_wasi(dir, options);
      return;
    }
    await build_web(dir, options, "plugin");
    return;
  }
  const base = path.basename(dir);
  if (base === "core-wasm") {
    await build_core_wasm(dir, options);
    return;
  }
  const target = await detect_target(dir);
  if (target === "wasi") {
    await build_wasi(dir, options);
    return;
  }
  await build_web(dir, options, normalize_wasm_name(await parse_crate_name(dir)));
}

async function hash_plugin(dir: string): Promise<void> {
  const plugin_json = path.join(dir, "plugin.json");
  const manifest = await read_json(plugin_json);
  const dist_dir = path.join(dir, "dist");
  const files = await list_dist_files(dist_dir);
  const hashes: Record<string, string> = {};
  for (const file of files) {
    const bytes = new Uint8Array(await readFile(path.join(dist_dir, file)));
    const hex = await sha256_hex(bytes);
    hashes[`dist/${file}`] = `sha256:${hex}`;
  }
  if (!manifest.integrity || !is_record(manifest.integrity)) {
    manifest.integrity = { channel: "oss", signature: { alg: "none", value: "" }, hashes: {} };
  }
  (manifest.integrity as Record<string, unknown>).hashes = hashes;
  await write_json(plugin_json, manifest);
}

async function verify_plugin_hashes(dir: string): Promise<void> {
  const plugin_json = path.join(dir, "plugin.json");
  const manifest = await read_json(plugin_json);
  const integrity = manifest.integrity as Record<string, unknown> | undefined;
  const hashes = (integrity?.hashes as Record<string, string> | undefined) ?? {};
  const dist_dir = path.join(dir, "dist");
  const files = await list_dist_files(dist_dir);
  const missing: string[] = [];
  const mismatches: string[] = [];

  for (const [file, expected] of Object.entries(hashes)) {
    const full = path.join(dir, file);
    if (!(await exists(full))) {
      missing.push(file);
      continue;
    }
    const bytes = new Uint8Array(await readFile(full));
    const hex = await sha256_hex(bytes);
    const expected_hex = expected.replace(/^sha256:/, "");
    if (hex !== expected_hex) {
      mismatches.push(`${file} expected=${expected_hex} actual=${hex}`);
    }
  }

  const extras = files.filter((f) => !hashes[`dist/${f}`]);

  if (missing.length > 0 || mismatches.length > 0 || extras.length > 0) {
    const lines = [
      missing.length > 0 ? `Missing: ${missing.join(", ")}` : "",
      mismatches.length > 0 ? `Mismatches:\n- ${mismatches.join("\n- ")}` : "",
      extras.length > 0 ? `Extra files: ${extras.join(", ")}` : ""
    ]
      .filter(Boolean)
      .join("\n");
    process.stderr.write(`hash verify failed:\n${lines}\n`);
    process.exit(1);
  }
}

async function repro_build(dir: string): Promise<void> {
  const tmp_root = path.join(dir, ".wasm-repro");
  const build1 = path.join(tmp_root, "build1");
  const build2 = path.join(tmp_root, "build2");
  await rm(tmp_root, { recursive: true, force: true });
  await ensure_dir(build1);
  await ensure_dir(build2);

  const dist1 = path.join(build1, "dist");
  const dist2 = path.join(build2, "dist");

  await build_path(dir, { out_dir: dist1, target_dir: path.join(build1, "target") });
  await build_path(dir, { out_dir: dist2, target_dir: path.join(build2, "target") });

  const wasm1 = find_wasm_file(await list_dist_files(dist1));
  const wasm2 = find_wasm_file(await list_dist_files(dist2));
  if (!wasm1 || !wasm2) {
    process.stderr.write("repro: wasm file not found in dist\n");
    process.exit(1);
  }
  const hash1 = await sha256_hex(new Uint8Array(await readFile(path.join(dist1, wasm1))));
  const hash2 = await sha256_hex(new Uint8Array(await readFile(path.join(dist2, wasm2))));
  if (hash1 !== hash2) {
    process.stderr.write(`repro failed: ${hash1} != ${hash2}\n`);
    process.exit(1);
  }
  await rm(tmp_root, { recursive: true, force: true });
}

async function exists(file_path: string): Promise<boolean> {
  try {
    await stat(file_path);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const cmd = process.argv[2] as command | undefined;
  const input = process.argv[3];
  if (!cmd || !input) usage();
  const dir = path.resolve(process.cwd(), input);

  if (cmd === "build") {
    await build_path(dir, { out_dir: path.join(dir, "dist") });
    return;
  }
  if (cmd === "hash") {
    await hash_plugin(dir);
    return;
  }
  if (cmd === "verify") {
    await verify_plugin_hashes(dir);
    return;
  }
  if (cmd === "repro") {
    await repro_build(dir);
    return;
  }
  usage();
}

main().catch((err) => {
  process.stderr.write(`${err?.message ?? String(err)}\n`);
  process.exit(1);
});
