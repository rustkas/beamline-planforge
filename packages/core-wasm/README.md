# Core WASM

Deterministic core for PlanForge, compiled to WASM. The API accepts JSON strings and returns JSON strings.

Exports:
- `validate_layout_json(kitchen_state_json: String) -> String`
- `derive_render_model_json(kitchen_state_json: String, quality: String) -> String`
- `apply_patch_json(kitchen_state_json: String, patch_json: String) -> String`
- `normalize_state_json(kitchen_state_json: String) -> String`

Build:
- `cargo build --target wasm32-unknown-unknown`
- or `wasm-pack build`

Notes:
- Only RFC6902 `replace` patch ops are supported in this iteration.
