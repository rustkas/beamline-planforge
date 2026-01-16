use wasm_bindgen::prelude::*;

pub mod api;
pub mod model;

#[wasm_bindgen]
pub fn validate_layout_json(kitchen_state_json: String) -> String {
    api::validate_layout::validate_layout_json(kitchen_state_json)
}

#[wasm_bindgen]
pub fn derive_render_model_json(kitchen_state_json: String, quality: String) -> String {
    api::derive_render_model::derive_render_model_json(kitchen_state_json, quality)
}

#[wasm_bindgen]
pub fn apply_patch_json(kitchen_state_json: String, patch_json: String) -> String {
    api::apply_patch::apply_patch_json(kitchen_state_json, patch_json)
}

#[wasm_bindgen]
pub fn normalize_state_json(kitchen_state_json: String) -> String {
    api::normalize_state::normalize_state_json(kitchen_state_json)
}
