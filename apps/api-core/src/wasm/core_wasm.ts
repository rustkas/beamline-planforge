export type CoreWasm = {
  validate_layout_json: (state: string) => string;
  derive_render_model_json: (state: string, quality: string) => string;
  apply_patch_json: (state: string, patch: string) => string;
};

let wasmPromise: Promise<CoreWasm> | null = null;

export function load_core_wasm(): Promise<CoreWasm> {
  if (!wasmPromise) {
    wasmPromise = (async () => {
      const module_url = new URL("../../assets/wasm/planforge_core_wasm.js", import.meta.url);
      const mod = await import(module_url.href);
      if (typeof mod.default === "function") {
        await mod.default();
      }
      return mod as CoreWasm;
    })();
  }
  return wasmPromise;
}

export async function validate_layout(kitchen_state: unknown): Promise<unknown> {
  const wasm = await load_core_wasm();
  const response = wasm.validate_layout_json(JSON.stringify(kitchen_state));
  return JSON.parse(response) as unknown;
}

export async function derive_render_model(kitchen_state: unknown, quality: "draft" | "quality"): Promise<unknown> {
  const wasm = await load_core_wasm();
  const response = wasm.derive_render_model_json(JSON.stringify(kitchen_state), quality);
  return JSON.parse(response) as unknown;
}

export async function apply_patch(kitchen_state: unknown, patch: unknown): Promise<unknown> {
  const wasm = await load_core_wasm();
  const response = wasm.apply_patch_json(JSON.stringify(kitchen_state), JSON.stringify(patch));
  return JSON.parse(response) as unknown;
}
