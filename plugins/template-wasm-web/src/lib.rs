use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn plugin_entry(input: &str) -> String {
    input.to_string()
}
