use crate::constraints::Footprint;
use crate::geometry::aabb::Aabb;
use crate::model::kitchen_state::KitchenState;
use crate::model::violation::Violation;

const MIN_WALL_CLEARANCE_MM: i32 = 0;
const MIN_PASSAGE_MM: i32 = 900;

pub fn check_clearances(state: &KitchenState, footprints: &[Footprint], violations: &mut Vec<Violation>) {
    let room = &state.room.size_mm;
    for fp in footprints {
        if fp.width > room.width || fp.depth > room.depth || fp.height > room.height {
            violations.push(Violation::error(
                "layout.object_too_large",
                "layout object exceeds room size",
                vec![fp.id.clone()],
            ));
        }

        if fp.aabb.min_x < MIN_WALL_CLEARANCE_MM
            || fp.aabb.min_y < MIN_WALL_CLEARANCE_MM
            || room.width - fp.aabb.max_x < MIN_WALL_CLEARANCE_MM
            || room.depth - fp.aabb.max_y < MIN_WALL_CLEARANCE_MM
        {
            violations.push(Violation::error(
                "layout.wall_clearance",
                "layout object too close to wall",
                vec![fp.id.clone()],
            ));
        }
    }

    for zone in &state.room.restricted_zones {
        let zone_aabb = Aabb::from_min_max(zone.min_mm.x, zone.min_mm.y, zone.max_mm.x, zone.max_mm.y);
        for fp in footprints {
            if fp.aabb.intersects(&zone_aabb) {
                violations.push(Violation::error(
                    "layout.restricted_zone",
                    "layout object overlaps restricted zone",
                    vec![fp.id.clone()],
                ));
            }
        }
    }

    for (i, a) in footprints.iter().enumerate() {
        for b in footprints.iter().skip(i + 1) {
            if a.aabb.overlaps_y(&b.aabb) {
                let gap = a.aabb.gap_x(&b.aabb);
                if gap > 0 && gap < MIN_PASSAGE_MM {
                    violations.push(Violation::error(
                        "layout.min_passage",
                        "minimum passage width violated",
                        vec![a.id.clone(), b.id.clone()],
                    ));
                }
            }

            if a.aabb.overlaps_x(&b.aabb) {
                let gap = a.aabb.gap_y(&b.aabb);
                if gap > 0 && gap < MIN_PASSAGE_MM {
                    violations.push(Violation::error(
                        "layout.min_passage",
                        "minimum passage width violated",
                        vec![a.id.clone(), b.id.clone()],
                    ));
                }
            }
        }
    }
}
