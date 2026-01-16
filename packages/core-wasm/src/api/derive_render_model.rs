use crate::model::kitchen_state::KitchenState;
use crate::model::render_model::{Assets, GltfAssetRef, Quat, RenderModel, RenderNode, Transform3D, Vec3};
use crate::model::violation::Violation;
use serde_json::json;
use std::collections::HashMap;

fn violations_response(violations: Vec<Violation>) -> String {
    serde_json::to_string(&json!({ "violations": violations })).unwrap_or_else(|_| "{\"violations\":[]}".to_string())
}

pub fn derive_render_model_json(kitchen_state_json: String, _quality: String) -> String {
    let kitchen_state: KitchenState = match serde_json::from_str(&kitchen_state_json) {
        Ok(value) => value,
        Err(err) => {
            let mut details = HashMap::new();
            details.insert("message".to_string(), serde_json::Value::String(err.to_string()));
            return violations_response(vec![
                Violation::error("json.parse_error", "Invalid KitchenState JSON", vec![]).with_details(details),
            ]);
        }
    };

    let mut gltf_assets: HashMap<String, GltfAssetRef> = HashMap::new();
    let mut nodes: Vec<RenderNode> = Vec::new();

    for obj in &kitchen_state.layout.objects {
        let gltf_key = obj.catalog_item_id.clone();
        gltf_assets.entry(gltf_key.clone()).or_insert_with(|| GltfAssetRef {
            asset_id: format!("asset_{}", gltf_key),
            uri: format!("assets/models/{}.glb", gltf_key),
        });

        let x_m = obj.transform_mm.position_mm.x as f64 / 1000.0;
        let z_m = obj.transform_mm.position_mm.y as f64 / 1000.0;

        let transform = Transform3D {
            position_m: Vec3 { x: x_m, y: 0.0, z: z_m },
            rotation_quat: Quat { x: 0.0, y: 0.0, z: 0.0, w: 1.0 },
            scale: Vec3 { x: 1.0, y: 1.0, z: 1.0 },
        };

        nodes.push(RenderNode {
            id: format!("node_{}", obj.id),
            source_object_id: obj.id.clone(),
            gltf_key,
            transform,
            material_overrides: obj.material_slots.clone(),
            lod: None,
            pickable: Some(true),
        });
    }

    let render_model = RenderModel {
        schema_version: kitchen_state.schema_version,
        assets: Assets { gltf: gltf_assets },
        nodes,
        extensions: None,
    };

    serde_json::to_string(&render_model).unwrap_or_else(|_| "{}".to_string())
}
