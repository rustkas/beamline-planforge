export type WasiValidateInput = {
  kitchen_state: unknown;
  mode: "drag" | "full";
};

export type WasiValidateOutput = {
  violations: unknown[];
};

export type WasiError = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export async function run_wasi_validate(args: {
  wasm_path: string;
  input: WasiValidateInput;
  timeout_ms?: number;
}): Promise<WasiValidateOutput> {
  const payload = JSON.stringify(args.input);
  const stdin = new TextEncoder().encode(payload);

  const proc = Bun.spawn({
    cmd: ["wasmtime", "run", args.wasm_path],
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
    if (!json || typeof json !== "object" || !Array.isArray(json.violations)) {
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
