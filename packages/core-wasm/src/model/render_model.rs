use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderModel {
    pub schema_version: String,
    pub assets: Assets,
    pub nodes: Vec<RenderNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extensions: Option<HashMap<String, Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Assets {
    pub gltf: HashMap<String, GltfAssetRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GltfAssetRef {
    pub asset_id: String,
    pub uri: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderNode {
    pub id: String,
    pub source_object_id: String,
    pub gltf_key: String,
    pub transform: Transform3D,
    pub material_overrides: HashMap<String, String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lod: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pickable: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transform3D {
    pub position_m: Vec3,
    pub rotation_quat: Quat,
    pub scale: Vec3,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Vec3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Quat {
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub w: f64,
}
