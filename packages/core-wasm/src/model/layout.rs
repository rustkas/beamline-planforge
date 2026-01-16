use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::room::Point2Mm;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Layout {
    pub objects: Vec<LayoutObject>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayoutObject {
    pub id: String,
    pub kind: LayoutObjectKind,
    pub catalog_item_id: String,
    pub transform_mm: Transform2Dmm,
    pub dims_mm: DimsMm,
    pub material_slots: HashMap<String, String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LayoutObjectKind {
    Module,
    Appliance,
    Decor,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transform2Dmm {
    pub position_mm: Point2Mm,
    pub rotation_deg: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DimsMm {
    pub width: i32,
    pub depth: i32,
    pub height: i32,
}
