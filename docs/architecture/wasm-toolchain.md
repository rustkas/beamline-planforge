# WASM Toolchain

This document describes the deterministic WASM build pipeline for PlanForge core and plugins.

## Targets

- Web runtime: `wasm32-unknown-unknown` via `wasm-pack --target web`
- Server runtime: `wasm32-wasi` via `cargo build --target wasm32-wasi --release`

## Commands

From repo root:

```bash
bun run wasm:build <path>
bun run wasm:hash <path>
bun run wasm:verify <path>
bun run wasm:repro <path>
```

Examples:

```bash
bun run wasm:build packages/core-wasm
bun run wasm:build plugins/demo-wasm-web
bun run wasm:hash plugins/demo-wasm-web
bun run wasm:verify plugins/demo-wasm-web
bun run wasm:repro plugins/demo-wasm-web
```

## Outputs

- Plugins: `dist/` contains `plugin.wasm` and loader artifacts (web).
- Core WASM: `packages/core-wasm/dist/` plus copies to:
  - `apps/web/public/wasm/`
  - `apps/api-core/assets/wasm/`

## Reproducibility

`wasm:repro` builds twice in isolated targets and compares the resulting `.wasm` hash.
If hashes differ, the command fails.

## Hash verification

`wasm:hash` computes `sha256` for all `dist/*` files and updates `plugin.json.integrity.hashes`.
`wasm:verify` ensures hashes match and no extra dist files exist.

## Plugin templates

- `plugins/template-wasm-web`
- `plugins/template-wasm-wasi`
- `plugins/demo-wasm-web`
- `plugins/demo-wasi-constraints`

