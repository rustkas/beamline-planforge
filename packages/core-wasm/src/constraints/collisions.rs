use crate::constraints::Footprint;
use crate::model::violation::Violation;

pub fn check_collisions(footprints: &[Footprint], violations: &mut Vec<Violation>) {
    for (i, a) in footprints.iter().enumerate() {
        for b in footprints.iter().skip(i + 1) {
            if a.aabb.intersects(&b.aabb) {
                violations.push(Violation::error(
                    "layout.collision",
                    "layout objects collide",
                    vec![a.id.clone(), b.id.clone()],
                ));
            }
        }
    }
}
