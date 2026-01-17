use crate::constraints::Footprint;
use crate::geometry::aabb::Aabb;
use crate::model::kitchen_state::KitchenState;
use crate::model::room::Wall;
use crate::model::violation::Violation;

const DOOR_CLEARANCE_MM: i32 = 900;

pub fn check_openings(state: &KitchenState, footprints: &[Footprint], violations: &mut Vec<Violation>) {
    let room = &state.room.size_mm;
    for opening in &state.room.openings {
        if opening.kind != crate::model::room::OpeningKind::Door {
            continue;
        }

        let zone = match opening.wall {
            Wall::South => Aabb::from_min_max(
                opening.offset_mm,
                0,
                opening.offset_mm + opening.width_mm,
                DOOR_CLEARANCE_MM,
            ),
            Wall::North => Aabb::from_min_max(
                opening.offset_mm,
                room.depth - DOOR_CLEARANCE_MM,
                opening.offset_mm + opening.width_mm,
                room.depth,
            ),
            Wall::West => Aabb::from_min_max(
                0,
                opening.offset_mm,
                DOOR_CLEARANCE_MM,
                opening.offset_mm + opening.width_mm,
            ),
            Wall::East => Aabb::from_min_max(
                room.width - DOOR_CLEARANCE_MM,
                opening.offset_mm,
                room.width,
                opening.offset_mm + opening.width_mm,
            ),
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
