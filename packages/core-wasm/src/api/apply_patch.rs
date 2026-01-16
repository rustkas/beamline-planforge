use crate::model::kitchen_state::KitchenState;
use crate::model::patch::{PatchOp, ProposedPatch};
use crate::model::violation::Violation;
use serde_json::{json, Value};
use std::collections::HashMap;

fn violations_response(violations: Vec<Violation>) -> String {
    serde_json::to_string(&json!({ "violations": violations })).unwrap_or_else(|_| "{\"violations\":[]}".to_string())
}

fn decode_pointer(token: &str) -> String {
    token.replace("~1", "/").replace("~0", "~")
}

fn set_pointer(target: &mut Value, pointer: &str, new_value: Value) -> Result<(), String> {
    if pointer.is_empty() || pointer == "/" {
        *target = new_value;
        return Ok(());
    }

    let mut parts = pointer.split('/');
    let first = parts.next();
    if first != Some("") {
        return Err("invalid_json_pointer".to_string());
    }

    let tokens: Vec<String> = parts.map(decode_pointer).collect();
    if tokens.is_empty() {
        *target = new_value;
        return Ok(());
    }

    let mut current = target;
    for i in 0..tokens.len() - 1 {
        let token = &tokens[i];
        match current {
            Value::Object(map) => {
                current = map.get_mut(token).ok_or_else(|| "pointer_not_found".to_string())?;
            }
            Value::Array(arr) => {
                let idx: usize = token
                    .parse()
                    .map_err(|_| "pointer_index_invalid".to_string())?;
                current = arr.get_mut(idx).ok_or_else(|| "pointer_index_out_of_bounds".to_string())?;
            }
            _ => return Err("pointer_target_invalid".to_string()),
        }
    }

    let last = tokens.last().ok_or_else(|| "pointer_empty".to_string())?;
    match current {
        Value::Object(map) => {
            map.insert(last.clone(), new_value);
            Ok(())
        }
        Value::Array(arr) => {
            let idx: usize = last
                .parse()
                .map_err(|_| "pointer_index_invalid".to_string())?;
            if idx >= arr.len() {
                return Err("pointer_index_out_of_bounds".to_string());
            }
            arr[idx] = new_value;
            Ok(())
        }
        _ => Err("pointer_target_invalid".to_string()),
    }
}

pub fn apply_patch_json(kitchen_state_json: String, patch_json: String) -> String {
    let mut state_value: Value = match serde_json::from_str(&kitchen_state_json) {
        Ok(value) => value,
        Err(err) => {
            let mut details = HashMap::new();
            details.insert("message".to_string(), Value::String(err.to_string()));
            return violations_response(vec![
                Violation::error("json.parse_error", "Invalid KitchenState JSON", vec![]).with_details(details),
            ]);
        }
    };

    let patch: ProposedPatch = match serde_json::from_str(&patch_json) {
        Ok(value) => value,
        Err(err) => {
            let mut details = HashMap::new();
            details.insert("message".to_string(), Value::String(err.to_string()));
            return violations_response(vec![
                Violation::error("json.parse_error", "Invalid patch JSON", vec![]).with_details(details),
            ]);
        }
    };

    let mut violations: Vec<Violation> = Vec::new();

    for op in patch.ops {
        match op.op {
            PatchOp::Replace => {
                let value = match op.value {
                    Some(v) => v,
                    None => {
                        violations.push(Violation::error(
                            "patch.missing_value",
                            "replace operation requires value",
                            vec![],
                        ));
                        continue;
                    }
                };
                if let Err(err) = set_pointer(&mut state_value, &op.path, value) {
                    let mut details = HashMap::new();
                    details.insert("reason".to_string(), Value::String(err));
                    violations.push(
                        Violation::error("patch.invalid_pointer", "invalid patch path", vec![])
                            .with_details(details),
                    );
                }
            }
            _ => {
                violations.push(Violation::error(
                    "patch.unsupported_op",
                    "only replace operations are supported",
                    vec![],
                ));
            }
        }
    }

    if !violations.is_empty() {
        return violations_response(violations);
    }

    let kitchen_state: KitchenState = match serde_json::from_value(state_value) {
        Ok(value) => value,
        Err(err) => {
            let mut details = HashMap::new();
            details.insert("message".to_string(), Value::String(err.to_string()));
            return violations_response(vec![
                Violation::error("json.parse_error", "Patched KitchenState invalid", vec![])
                    .with_details(details),
            ]);
        }
    };

    serde_json::to_string(&kitchen_state).unwrap_or_else(|_| "{}".to_string())
}
