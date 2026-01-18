use crate::model::kitchen_state::KitchenState;
use crate::model::violation::Violation;
use serde_json::json;
use std::collections::HashMap;

fn violations_response(violations: Vec<Violation>) -> String {
    serde_json::to_string(&json!({ "violations": violations })).unwrap_or_else(|_| "{\"violations\":[]}".to_string())
}

fn wall_length(room: &crate::model::room::SizeMm, wall_id: &str) -> Option<i32> {
    match wall_id {
        "north" | "south" => Some(room.width),
        "east" | "west" => Some(room.depth),
        _ => None,
    }
}

pub fn normalize_state_json(kitchen_state_json: String) -> String {
    let mut kitchen_state: KitchenState = match serde_json::from_str(&kitchen_state_json) {
        Ok(value) => value,
        Err(err) => {
            let mut details = HashMap::new();
            details.insert("message".to_string(), serde_json::Value::String(err.to_string()));
            return violations_response(vec![
                Violation::error("json.parse_error", "Invalid KitchenState JSON", vec![]).with_details(details),
            ]);
        }
    };

    let room = &kitchen_state.room.size_mm;

    kitchen_state.room.openings.sort_by(|a, b| a.id.cmp(&b.id));
    for opening in &mut kitchen_state.room.openings {
        if let Some(length) = wall_length(room, &opening.wall_id) {
            let max_offset = (length - opening.width_mm).max(0);
            if opening.offset_mm < 0 {
                opening.offset_mm = 0;
            } else if opening.offset_mm > max_offset {
                opening.offset_mm = max_offset;
            }
        }
        if let Some(swing) = &mut opening.swing {
            if swing.radius_mm < 0 {
                swing.radius_mm = 0;
            }
        }
    }

    kitchen_state.room.utilities.sort_by(|a, b| a.id.cmp(&b.id));
    for util in &mut kitchen_state.room.utilities {
        if util.zone_radius_mm < 0 {
            util.zone_radius_mm = 0;
        }
        if let (Some(wall_id), Some(offset)) = (&util.wall_id, util.offset_mm) {
            if let Some(length) = wall_length(room, wall_id) {
                let clamped = offset.max(0).min(length.max(0));
                util.offset_mm = Some(clamped);
            }
        }
    }

    kitchen_state
        .room
        .restricted_zones
        .sort_by(|a, b| a.id.cmp(&b.id));

    serde_json::to_string(&kitchen_state).unwrap_or_else(|_| "{}".to_string())
}
