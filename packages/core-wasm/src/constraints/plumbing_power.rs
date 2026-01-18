use crate::constraints::Footprint;
use crate::model::kitchen_state::KitchenState;
use crate::model::room::Point2Mm;
use crate::model::violation::Violation;

fn utility_position(room: &crate::model::room::SizeMm, util: &crate::model::room::UtilityPoint) -> Option<Point2Mm> {
    if let Some(pos) = &util.position_mm {
        return Some(pos.clone());
    }

    let wall_id = util.wall_id.as_deref()?;
    let offset = util.offset_mm?;

    match wall_id {
        "south" => Some(Point2Mm { x: offset, y: 0 }),
        "north" => Some(Point2Mm { x: offset, y: room.depth }),
        "west" => Some(Point2Mm { x: 0, y: offset }),
        "east" => Some(Point2Mm { x: room.width, y: offset }),
        _ => None,
    }
}

fn distance_mm(a: &Point2Mm, b: &Point2Mm) -> f64 {
    let dx = (a.x - b.x) as f64;
    let dy = (a.y - b.y) as f64;
    (dx * dx + dy * dy).sqrt()
}

fn has_tag(tags: &Option<Vec<String>>, expected: &[&str]) -> bool {
    let Some(list) = tags else {
        return false;
    };
    list.iter()
        .any(|tag| expected.iter().any(|e| tag.eq_ignore_ascii_case(e)))
}

pub fn check_plumbing_power(state: &KitchenState, footprints: &[Footprint], violations: &mut Vec<Violation>) {
    let room = &state.room.size_mm;
    let utilities = &state.room.utilities;

    let water_points: Vec<(Point2Mm, i32)> = utilities
        .iter()
        .filter(|u| matches!(u.kind, crate::model::room::UtilityKind::Water | crate::model::room::UtilityKind::Drain))
        .filter_map(|u| utility_position(room, u).map(|p| (p, u.zone_radius_mm)))
        .collect();

    let vent_points: Vec<(Point2Mm, i32)> = utilities
        .iter()
        .filter(|u| matches!(u.kind, crate::model::room::UtilityKind::Vent))
        .filter_map(|u| utility_position(room, u).map(|p| (p, u.zone_radius_mm)))
        .collect();

    for fp in footprints {
        if has_tag(&fp.tags, &["sink"]) {
            let mut ok = false;
            for (pos, radius) in &water_points {
                if distance_mm(&fp.anchor, pos) <= *radius as f64 {
                    ok = true;
                    break;
                }
            }

            if !ok {
                violations.push(Violation::error(
                    "layout.sink_near_water",
                    "sink should be placed near water/drain utilities",
                    vec![fp.id.clone()],
                ));
            }
        }

        if has_tag(&fp.tags, &["hob", "cooktop"]) {
            let mut ok = false;
            for (pos, radius) in &vent_points {
                if distance_mm(&fp.anchor, pos) <= *radius as f64 {
                    ok = true;
                    break;
                }
            }

            if !ok {
                violations.push(Violation::warning(
                    "layout.hob_near_vent",
                    "cooktop should be placed near a vent",
                    vec![fp.id.clone()],
                ));
            }
        }
    }
}
