use crate::model::kitchen_state::KitchenState;
use crate::model::violation::Violation;
use serde_json::json;
use std::collections::HashMap;

fn violations_response(violations: Vec<Violation>) -> String {
    serde_json::to_string(&json!({ "violations": violations })).unwrap_or_else(|_| "{\"violations\":[]}".to_string())
}

pub fn normalize_state_json(kitchen_state_json: String) -> String {
    let kitchen_state: KitchenState = match serde_json::from_str(&kitchen_state_json) {
        Ok(value) => value,
        Err(err) => {
            let mut details = HashMap::new();
            details.insert("message".to_string(), serde_json::Value::String(err.to_string()));
            return violations_response(vec![
                Violation::error("json.parse_error", "Invalid KitchenState JSON", vec![]).with_details(details),
            ]);
        }
    };

    serde_json::to_string(&kitchen_state).unwrap_or_else(|_| "{}".to_string())
}
