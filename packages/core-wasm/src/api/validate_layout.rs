use crate::model::kitchen_state::KitchenState;
use crate::model::violation::Violation;
use serde_json::json;
use std::collections::HashSet;

fn violations_response(violations: Vec<Violation>) -> String {
    serde_json::to_string(&json!({ "violations": violations })).unwrap_or_else(|_| "{\"violations\":[]}".to_string())
}

pub fn validate_layout_json(kitchen_state_json: String) -> String {
    let kitchen_state: KitchenState = match serde_json::from_str(&kitchen_state_json) {
        Ok(value) => value,
        Err(err) => {
            let mut details = std::collections::HashMap::new();
            details.insert("message".to_string(), serde_json::Value::String(err.to_string()));
            return violations_response(vec![
                Violation::error("json.parse_error", "Invalid KitchenState JSON", vec![]).with_details(details),
            ]);
        }
    };

    let mut violations: Vec<Violation> = Vec::new();

    if kitchen_state.schema_version.trim().is_empty() {
        violations.push(Violation::error(
            "schema.empty_version",
            "schema_version must be set",
            vec![],
        ));
    }

    let size = &kitchen_state.room.size_mm;
    if size.width <= 0 || size.depth <= 0 || size.height <= 0 {
        violations.push(Violation::error(
            "room.invalid_size",
            "room size must be positive",
            vec![],
        ));
    }

    let mut ids = HashSet::new();
    for obj in &kitchen_state.layout.objects {
        if !ids.insert(obj.id.clone()) {
            violations.push(Violation::error(
                "layout.duplicate_id",
                "layout object ids must be unique",
                vec![obj.id.clone()],
            ));
        }

        if obj.dims_mm.width <= 0 || obj.dims_mm.depth <= 0 || obj.dims_mm.height <= 0 {
            violations.push(Violation::error(
                "layout.invalid_dims",
                "layout object dimensions must be positive",
                vec![obj.id.clone()],
            ));
        }

        if obj.transform_mm.rotation_deg < 0 || obj.transform_mm.rotation_deg > 359 {
            violations.push(Violation::error(
                "layout.invalid_rotation",
                "rotation_deg must be within 0..359",
                vec![obj.id.clone()],
            ));
        }

        let x = obj.transform_mm.position_mm.x;
        let y = obj.transform_mm.position_mm.y;
        let max_x = x + obj.dims_mm.width;
        let max_y = y + obj.dims_mm.depth;

        if x < 0 || y < 0 || max_x > size.width || max_y > size.depth {
            violations.push(Violation::error(
                "layout.out_of_bounds",
                "layout object must fit inside room bounds",
                vec![obj.id.clone()],
            ));
        }
    }

    violations_response(violations)
}
