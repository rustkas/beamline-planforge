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
    pub wall_id: String,
    pub offset_mm: i32,
    pub width_mm: i32,
    pub height_mm: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sill_height_mm: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub swing: Option<DoorSwing>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum OpeningKind {
    Door,
    Window,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DoorSwing {
    pub direction: DoorSwingDirection,
    pub radius_mm: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DoorSwingDirection {
    Left,
    Right,
    Both,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UtilityPoint {
    pub id: String,
    pub kind: UtilityKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wall_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub offset_mm: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub position_mm: Option<Point2Mm>,
    pub zone_radius_mm: i32,
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
pub struct AabbMm {
    pub min_mm: Point2Mm,
    pub max_mm: Point2Mm,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RestrictedZone {
    pub id: String,
    pub reason: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub aabb_mm: Option<AabbMm>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub polygon_mm: Option<Vec<Point2Mm>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoomModel {
    pub size_mm: SizeMm,
    pub openings: Vec<Opening>,
    pub utilities: Vec<UtilityPoint>,
    pub restricted_zones: Vec<RestrictedZone>,
}
