/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

declare module "/wasm/planforge_core_wasm.js" {
  const init: (() => Promise<void>) | undefined;
  export default init;
  export function validate_layout_json(input: string): string;
  export function derive_render_model_json(input: string, quality: string): string;
  export function apply_patch_json(state: string, patch: string): string;
}
