use planforge_core_wasm::api::derive_render_model::derive_render_model_json;

fn kitchen_state_fixture() -> String {
    r#"
    {
      "schema_version": "0.1.0",
      "project": {
        "project_id": "proj_demo_001",
        "revision_id": "rev_0001",
        "units": "mm",
        "ruleset_version": "pricing_ruleset_v1"
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
            },
            "tags": ["base", "sink"]
          },
          {
            "id": "obj_base_drawers_800",
            "kind": "module",
            "catalog_item_id": "base_drawers_800",
            "transform_mm": {
              "position_mm": { "x": 1600, "y": 0 },
              "rotation_deg": 0
            },
            "dims_mm": { "width": 800, "depth": 600, "height": 720 },
            "material_slots": {
              "front": "mat_front_white",
              "body": "mat_body_white",
              "top": "mat_top_oak"
            },
            "tags": ["base", "drawers"]
          }
        ]
      },
      "catalog_refs": {
        "modules_catalog_version": "modules_demo_0.1.0",
        "materials_catalog_version": "materials_demo_0.1.0"
      },
      "extensions": {}
    }
    "#
    .to_string()
}

#[test]
fn derive_render_model_smoke() {
    let json = kitchen_state_fixture();
    let output = derive_render_model_json(json, "draft".to_string());
    let parsed: serde_json::Value = serde_json::from_str(&output).expect("render model json");

    let nodes = parsed.get("nodes").and_then(|v| v.as_array()).expect("nodes array");
    assert_eq!(nodes.len(), 2, "nodes length should match objects");

    let first = nodes[0].get("material_overrides").and_then(|v| v.as_object()).expect("material overrides");
    assert!(first.contains_key("front"));
    assert!(first.contains_key("body"));

    let assets = parsed
        .get("assets")
        .and_then(|v| v.get("gltf"))
        .and_then(|v| v.as_object())
        .expect("assets.gltf");
    let first_asset = assets.get("base_sink_600").and_then(|v| v.get("uri")).and_then(|v| v.as_str()).unwrap_or("");
    assert!(first_asset.contains("lod1"), "draft uses lod1");
}

#[test]
fn derive_render_model_quality_lod() {
    let json = kitchen_state_fixture();
    let output = derive_render_model_json(json, "quality".to_string());
    let parsed: serde_json::Value = serde_json::from_str(&output).expect("render model json");
    let assets = parsed
        .get("assets")
        .and_then(|v| v.get("gltf"))
        .and_then(|v| v.as_object())
        .expect("assets.gltf");
    let first_asset = assets.get("base_sink_600").and_then(|v| v.get("uri")).and_then(|v| v.as_str()).unwrap_or("");
    assert!(first_asset.contains("lod0"), "quality uses lod0");
}
