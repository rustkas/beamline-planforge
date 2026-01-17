export type WasiValidateInput = {
  kitchen_state: unknown;
  mode: "drag" | "full";
};

export type WasiValidateOutput = {
  violations: unknown[];
};

export type WasiPricingInput = {
  kitchen_state: unknown;
  quote: unknown;
};

export type WasiPricingOutput = {
  add_items?: unknown[];
  adjustments?: unknown[];
};

export type WasiExportInput = {
  kitchen_state: unknown;
  render_model?: unknown;
  quote?: unknown;
  format: string;
};

export type WasiExportOutput = {
  artifacts: unknown[];
};

export type WasiError = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validate_violations_output(value: unknown): value is WasiValidateOutput {
  if (!is_record(value)) return false;
  if (!Array.isArray(value.violations)) return false;
  return true;
}

function validate_pricing_output(value: unknown): value is WasiPricingOutput {
  if (!is_record(value)) return false;
  if ("add_items" in value && !Array.isArray(value.add_items)) return false;
  if ("adjustments" in value && !Array.isArray(value.adjustments)) return false;
  return true;
}

function validate_export_output(value: unknown): value is WasiExportOutput {
  if (!is_record(value)) return false;
  if (!Array.isArray(value.artifacts)) return false;
  return true;
}

function build_wasmtime_cmd(wasm_path: string): string[] {
  const cmd = [process.env.WASMTIME_BIN ?? "wasmtime", "run", wasm_path];
  const max_memory = process.env.WASI_MAX_MEMORY_BYTES;
  if (max_memory && Number(max_memory) > 0) {
    cmd.push("--max-memory", String(max_memory));
  }
  return cmd;
}

export async function run_wasi_validate(args: {
  wasm_path: string;
  input: WasiValidateInput;
  timeout_ms?: number;
}): Promise<WasiValidateOutput> {
  const payload = JSON.stringify(args.input);
  const stdin = new TextEncoder().encode(payload);

  const cache_dir = process.env.WASMTIME_CACHE_DIR ?? "/tmp/wasmtime-cache";
  const xdg_cache = process.env.XDG_CACHE_HOME ?? "/tmp/wasmtime-cache-home";
  await mkdir(cache_dir, { recursive: true });
  await mkdir(xdg_cache, { recursive: true });
  const proc = Bun.spawn({
    cmd: build_wasmtime_cmd(args.wasm_path),
    env: { ...process.env, WASMTIME_CACHE_DIR: cache_dir, XDG_CACHE_HOME: xdg_cache },
    stdin,
    stdout: "pipe",
    stderr: "pipe"
  });

  const timer = setTimeout(() => {
    proc.kill();
  }, args.timeout_ms ?? 2000);

  const [exit_code, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text()
  ]);

  clearTimeout(timer);

  if (exit_code !== 0) {
    throw {
      code: "wasi.exec_failed",
      message: "WASI plugin execution failed",
      details: { exit_code, stderr: stderr.trim() }
    } satisfies WasiError;
  }

  try {
    const decoded = stdout.trim().length > 0 ? stdout : "{}";
    const json = JSON.parse(decoded) as WasiValidateOutput;
    if (!validate_violations_output(json)) {
      throw new Error("missing violations");
    }
    return json;
  } catch (error) {
    throw {
      code: "wasi.invalid_output",
      message: "WASI plugin returned invalid JSON",
      details: { error: String(error), stdout: stdout.trim() }
    } satisfies WasiError;
  }
}

export async function run_wasi_pricing(args: {
  wasm_path: string;
  input: WasiPricingInput;
  timeout_ms?: number;
}): Promise<WasiPricingOutput> {
  const payload = JSON.stringify(args.input);
  const stdin = new TextEncoder().encode(payload);

  const cache_dir = process.env.WASMTIME_CACHE_DIR ?? "/tmp/wasmtime-cache";
  const xdg_cache = process.env.XDG_CACHE_HOME ?? "/tmp/wasmtime-cache-home";
  await mkdir(cache_dir, { recursive: true });
  await mkdir(xdg_cache, { recursive: true });
  const proc = Bun.spawn({
    cmd: build_wasmtime_cmd(args.wasm_path),
    env: { ...process.env, WASMTIME_CACHE_DIR: cache_dir, XDG_CACHE_HOME: xdg_cache },
    stdin,
    stdout: "pipe",
    stderr: "pipe"
  });

  const timer = setTimeout(() => {
    proc.kill();
  }, args.timeout_ms ?? 2000);

  const [exit_code, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text()
  ]);

  clearTimeout(timer);

  if (exit_code !== 0) {
    throw {
      code: "wasi.exec_failed",
      message: "WASI plugin execution failed",
      details: { exit_code, stderr: stderr.trim() }
    } satisfies WasiError;
  }

  try {
    const decoded = stdout.trim().length > 0 ? stdout : "{}";
    const json = JSON.parse(decoded) as WasiPricingOutput;
    if (!validate_pricing_output(json)) {
      throw new Error("invalid pricing output");
    }
    return json;
  } catch (error) {
    throw {
      code: "wasi.invalid_output",
      message: "WASI plugin returned invalid JSON",
      details: { error: String(error), stdout: stdout.trim() }
    } satisfies WasiError;
  }
}

export async function run_wasi_export(args: {
  wasm_path: string;
  input: WasiExportInput;
  timeout_ms?: number;
}): Promise<WasiExportOutput> {
  const payload = JSON.stringify(args.input);
  const stdin = new TextEncoder().encode(payload);

  const cache_dir = process.env.WASMTIME_CACHE_DIR ?? "/tmp/wasmtime-cache";
  const xdg_cache = process.env.XDG_CACHE_HOME ?? "/tmp/wasmtime-cache-home";
  await mkdir(cache_dir, { recursive: true });
  await mkdir(xdg_cache, { recursive: true });
  const proc = Bun.spawn({
    cmd: build_wasmtime_cmd(args.wasm_path),
    env: { ...process.env, WASMTIME_CACHE_DIR: cache_dir, XDG_CACHE_HOME: xdg_cache },
    stdin,
    stdout: "pipe",
    stderr: "pipe"
  });

  const timer = setTimeout(() => {
    proc.kill();
  }, args.timeout_ms ?? 2000);

  const [exit_code, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text()
  ]);

  clearTimeout(timer);

  if (exit_code !== 0) {
    throw {
      code: "wasi.exec_failed",
      message: "WASI plugin execution failed",
      details: { exit_code, stderr: stderr.trim() }
    } satisfies WasiError;
  }

  try {
    const decoded = stdout.trim().length > 0 ? stdout : "{}";
    const json = JSON.parse(decoded) as WasiExportOutput;
    if (!validate_export_output(json)) {
      throw new Error("invalid export output");
    }
    return json;
  } catch (error) {
    throw {
      code: "wasi.invalid_output",
      message: "WASI plugin returned invalid JSON",
      details: { error: String(error), stdout: stdout.trim() }
    } satisfies WasiError;
  }
}
import { mkdir } from "node:fs/promises";
