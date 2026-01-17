use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn plugin_entry(input: &str) -> String {
    format!("demo wasm web: {}", input)
}
