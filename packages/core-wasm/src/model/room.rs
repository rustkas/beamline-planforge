use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SizeMm {
    pub width: i32,
    pub depth: i32,
    pub height: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Point2Mm {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Opening {
    pub id: String,
    pub kind: OpeningKind,
    pub wall: Wall,
    pub offset_mm: i32,
    pub width_mm: i32,
    pub height_mm: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sill_height_mm: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum OpeningKind {
    Door,
    Window,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Wall {
    North,
    East,
    South,
    West,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UtilityPoint {
    pub id: String,
    pub kind: UtilityKind,
    pub position_mm: Point2Mm,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UtilityKind {
    Water,
    Drain,
    Power,
    Vent,
    Gas,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RectZone {
    pub id: String,
    pub min_mm: Point2Mm,
    pub max_mm: Point2Mm,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoomModel {
    pub size_mm: SizeMm,
    pub openings: Vec<Opening>,
    pub utilities: Vec<UtilityPoint>,
    pub restricted_zones: Vec<RectZone>,
}
