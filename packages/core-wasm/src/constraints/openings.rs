use crate::constraints::Footprint;
use crate::geometry::aabb::Aabb;
use crate::model::kitchen_state::KitchenState;
use crate::model::violation::Violation;

const DEFAULT_DOOR_SWING_MM: i32 = 900;

fn wall_axis_length(room: &crate::model::room::SizeMm, wall_id: &str) -> Option<i32> {
    match wall_id {
        "north" | "south" => Some(room.width),
        "east" | "west" => Some(room.depth),
        _ => None,
    }
}

fn door_clearance_zone(
    room: &crate::model::room::SizeMm,
    wall_id: &str,
    offset_mm: i32,
    width_mm: i32,
    swing_radius_mm: i32,
) -> Option<Aabb> {
    let depth = swing_radius_mm.max(0);
    match wall_id {
        "south" => Some(Aabb::from_min_max(
            offset_mm,
            0,
            offset_mm + width_mm,
            depth,
        )),
        "north" => Some(Aabb::from_min_max(
            offset_mm,
            room.depth - depth,
            offset_mm + width_mm,
            room.depth,
        )),
        "west" => Some(Aabb::from_min_max(
            0,
            offset_mm,
            depth,
            offset_mm + width_mm,
        )),
        "east" => Some(Aabb::from_min_max(
            room.width - depth,
            offset_mm,
            room.width,
            offset_mm + width_mm,
        )),
        _ => None,
    }
}

pub fn check_openings(state: &KitchenState, footprints: &[Footprint], violations: &mut Vec<Violation>) {
    let room = &state.room.size_mm;
    for opening in &state.room.openings {
        if opening.kind != crate::model::room::OpeningKind::Door {
            continue;
        }

        if wall_axis_length(room, &opening.wall_id).is_none() {
            continue;
        }

        let swing_radius = opening
            .swing
            .as_ref()
            .map(|s| s.radius_mm)
            .unwrap_or(DEFAULT_DOOR_SWING_MM);

        let Some(zone) = door_clearance_zone(
            room,
            &opening.wall_id,
            opening.offset_mm,
            opening.width_mm,
            swing_radius,
        ) else {
            continue;
        };

        for fp in footprints {
            if fp.aabb.intersects(&zone) {
                violations.push(Violation::error(
                    "layout.door_clearance",
                    "layout object blocks door clearance",
                    vec![fp.id.clone()],
                ));
            }
        }
    }
}
