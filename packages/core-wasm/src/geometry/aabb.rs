#[derive(Debug, Clone)]
pub struct Aabb {
    pub min_x: i32,
    pub min_y: i32,
    pub max_x: i32,
    pub max_y: i32,
}

impl Aabb {
    pub fn from_min_max(min_x: i32, min_y: i32, max_x: i32, max_y: i32) -> Self {
        Self {
            min_x,
            min_y,
            max_x,
            max_y,
        }
    }

    pub fn intersects(&self, other: &Aabb) -> bool {
        self.min_x < other.max_x
            && self.max_x > other.min_x
            && self.min_y < other.max_y
            && self.max_y > other.min_y
    }

    pub fn overlaps_x(&self, other: &Aabb) -> bool {
        self.min_x < other.max_x && self.max_x > other.min_x
    }

    pub fn overlaps_y(&self, other: &Aabb) -> bool {
        self.min_y < other.max_y && self.max_y > other.min_y
    }

    pub fn gap_x(&self, other: &Aabb) -> i32 {
        if self.max_x <= other.min_x {
            other.min_x - self.max_x
        } else if other.max_x <= self.min_x {
            self.min_x - other.max_x
        } else {
            0
        }
    }

    pub fn gap_y(&self, other: &Aabb) -> i32 {
        if self.max_y <= other.min_y {
            other.min_y - self.max_y
        } else if other.max_y <= self.min_y {
            self.min_y - other.max_y
        } else {
            0
        }
    }

    pub fn area_mm2(&self) -> i64 {
        let w = (self.max_x - self.min_x).max(0) as i64;
        let h = (self.max_y - self.min_y).max(0) as i64;
        w * h
    }
}
