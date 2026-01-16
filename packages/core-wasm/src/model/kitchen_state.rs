use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

use super::layout::Layout;
use super::room::RoomModel;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KitchenState {
    pub schema_version: String,
    pub project: ProjectMeta,
    pub room: RoomModel,
    pub layout: Layout,
    pub catalog_refs: CatalogRefs,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extensions: Option<HashMap<String, Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectMeta {
    pub project_id: String,
    pub revision_id: String,
    pub units: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ruleset_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatalogRefs {
    pub modules_catalog_version: String,
    pub materials_catalog_version: String,
}
