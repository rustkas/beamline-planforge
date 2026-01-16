use planforge_core_wasm::{apply_patch_json, derive_render_model_json};

fn kitchen_state_fixture() -> String {
    r#"{
  "schema_version": "0.1.0",
  "project": {
    "project_id": "proj_demo_001",
    "revision_id": "rev_0001",
    "units": "mm",
    "ruleset_version": "pricing_ruleset_0.1.0"
  },
  "room": {
    "size_mm": { "width": 3200, "depth": 2600, "height": 2700 },
    "openings": [],
    "utilities": [],
    "restricted_zones": []
  },
  "layout": {
    "objects": [
      {
        "id": "obj_base_sink_600",
        "kind": "module",
        "catalog_item_id": "base_sink_600",
        "transform_mm": {
          "position_mm": { "x": 1000, "y": 0 },
          "rotation_deg": 0
        },
        "dims_mm": { "width": 600, "depth": 600, "height": 720 },
        "material_slots": {
          "front": "mat_front_white",
          "body": "mat_body_white",
          "top": "mat_top_oak"
        }
      }
    ]
  },
  "catalog_refs": {
    "modules_catalog_version": "modules_demo_0.1.0",
    "materials_catalog_version": "materials_demo_0.1.0"
  }
}"#
    .to_string()
}

#[test]
fn apply_patch_updates_position() {
    let patch = r#"{
  "ops": [
    { "op": "replace", "path": "/layout/objects/0/transform_mm/position_mm/x", "value": 1200 }
  ]
}"#;

    let updated = apply_patch_json(kitchen_state_fixture(), patch.to_string());
    let value: serde_json::Value = serde_json::from_str(&updated).unwrap();
    let x = value["layout"]["objects"][0]["transform_mm"]["position_mm"]["x"].as_i64().unwrap();
    assert_eq!(x, 1200);
}

#[test]
fn derive_render_model_has_nodes_per_object() {
    let render_json = derive_render_model_json(kitchen_state_fixture(), "draft".to_string());
    let value: serde_json::Value = serde_json::from_str(&render_json).unwrap();
    let nodes = value.get("nodes").and_then(|v| v.as_array()).unwrap();
    assert_eq!(nodes.len(), 1);
}
