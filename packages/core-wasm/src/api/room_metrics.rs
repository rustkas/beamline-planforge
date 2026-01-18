use crate::constraints::build_footprints;
use crate::model::kitchen_state::KitchenState;
use serde_json::json;

fn wall_length(room: &crate::model::room::SizeMm, wall_id: &str) -> Option<i32> {
    match wall_id {
        "north" | "south" => Some(room.width),
        "east" | "west" => Some(room.depth),
        _ => None,
    }
}

pub fn compute_room_metrics_json(kitchen_state_json: String) -> String {
    let kitchen_state: KitchenState = match serde_json::from_str(&kitchen_state_json) {
        Ok(value) => value,
        Err(_) => {
            return "{\"metrics\":null}".to_string();
        }
    };

    let room = &kitchen_state.room.size_mm;
    let room_area = (room.width as i64).max(0) * (room.depth as i64).max(0);
    let room_perimeter = ((room.width + room.depth) as i64 * 2).max(0);
    let footprints = build_footprints(&kitchen_state.layout.objects);
    let mut occupied_area: i64 = 0;
    for fp in &footprints {
        occupied_area += fp.aabb.area_mm2();
    }

    let coverage_ratio = if room_area > 0 {
        occupied_area as f64 / room_area as f64
    } else {
        0.0
    };

    let mut wall_available: serde_json::Map<String, serde_json::Value> = serde_json::Map::new();
    for wall in ["north", "south", "east", "west"] {
        let length = wall_length(room, wall).unwrap_or(0).max(0);
        let mut blocked: i64 = 0;
        for opening in &kitchen_state.room.openings {
            if opening.wall_id == wall {
                blocked += opening.width_mm.max(0) as i64;
            }
        }
        let available = (length as i64 - blocked).max(0);
        wall_available.insert(wall.to_string(), json!(available));
    }

    serde_json::to_string(&json!({
        "metrics": {
            "room_area_mm2": room_area,
            "occupied_area_mm2": occupied_area,
            "coverage_ratio": coverage_ratio,
            "object_count": footprints.len(),
            "room_perimeter_mm": room_perimeter,
            "wall_available_mm": wall_available,
        }
    }))
    .unwrap_or_else(|_| "{\"metrics\":null}".to_string())
}
