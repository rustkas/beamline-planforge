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
        let zone_aabb = if let Some(aabb) = &zone.aabb_mm {
            Some(Aabb::from_min_max(
                aabb.min_mm.x,
                aabb.min_mm.y,
                aabb.max_mm.x,
                aabb.max_mm.y,
            ))
        } else if let Some(poly) = &zone.polygon_mm {
            let (mut min_x, mut min_y, mut max_x, mut max_y) = (i32::MAX, i32::MAX, i32::MIN, i32::MIN);
            for p in poly {
                min_x = min_x.min(p.x);
                min_y = min_y.min(p.y);
                max_x = max_x.max(p.x);
                max_y = max_y.max(p.y);
            }
            if min_x <= max_x && min_y <= max_y {
                Some(Aabb::from_min_max(min_x, min_y, max_x, max_y))
            } else {
                None
            }
        } else {
            None
        };

        let Some(zone_aabb) = zone_aabb else {
            continue;
        };
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
