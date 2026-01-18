pub mod clearances;
pub mod collisions;
pub mod openings;
pub mod plumbing_power;

use crate::geometry::aabb::Aabb;
use crate::model::kitchen_state::KitchenState;
use crate::model::layout::LayoutObject;
use crate::model::room::Point2Mm;
use crate::model::violation::Violation;

#[derive(Debug, Clone)]
pub struct Footprint {
    pub id: String,
    pub aabb: Aabb,
    pub width: i32,
    pub depth: i32,
    pub height: i32,
    pub anchor: Point2Mm,
    pub tags: Option<Vec<String>>,
}

pub fn build_footprints(objects: &[LayoutObject]) -> Vec<Footprint> {
    objects
        .iter()
        .map(|obj| {
            let (width, depth) = footprint_dims(obj);
            let x = obj.transform_mm.position_mm.x;
            let y = obj.transform_mm.position_mm.y;
            let aabb = Aabb::from_min_max(x, y, x + width, y + depth);
            Footprint {
                id: obj.id.clone(),
                aabb,
                width,
                depth,
                height: obj.dims_mm.height,
                anchor: Point2Mm { x, y },
                tags: obj.tags.clone(),
            }
        })
        .collect()
}

pub fn validate_constraints(state: &KitchenState) -> Vec<Violation> {
    let footprints = build_footprints(&state.layout.objects);
    let mut violations = Vec::new();

    collisions::check_collisions(&footprints, &mut violations);
    clearances::check_clearances(state, &footprints, &mut violations);
    openings::check_openings(state, &footprints, &mut violations);
    crate::constraints::plumbing_power::check_plumbing_power(state, &footprints, &mut violations);

    violations
}

fn footprint_dims(obj: &LayoutObject) -> (i32, i32) {
    let rot = obj.transform_mm.rotation_deg.rem_euclid(360);
    if rot % 180 == 0 {
        (obj.dims_mm.width, obj.dims_mm.depth)
    } else {
        (obj.dims_mm.depth, obj.dims_mm.width)
    }
}
