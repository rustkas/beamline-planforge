use planforge_core_wasm::validate_layout_json;

fn kitchen_state_fixture() -> String {
    r#"{
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
fn validate_layout_accepts_valid_fixture() {
    let response = validate_layout_json(kitchen_state_fixture());
    let value: serde_json::Value = serde_json::from_str(&response).unwrap();
    let violations = value.get("violations").and_then(|v| v.as_array()).unwrap();
    assert!(violations.is_empty(), "unexpected violations: {}", response);
}

#[test]
fn validate_layout_reports_out_of_bounds() {
    let mut fixture = kitchen_state_fixture();
    fixture = fixture.replace("\"x\": 1000", "\"x\": 4000");
    let response = validate_layout_json(fixture);
    let value: serde_json::Value = serde_json::from_str(&response).unwrap();
    let violations = value.get("violations").and_then(|v| v.as_array()).unwrap();
    assert!(!violations.is_empty());
}
