use planforge_core_wasm::validate_layout_json;

fn base_state() -> serde_json::Value {
    serde_json::json!({
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
        "layout": { "objects": [] },
        "catalog_refs": {
            "modules_catalog_version": "modules_demo_0.1.0",
            "materials_catalog_version": "materials_demo_0.1.0"
        }
    })
}

#[test]
fn detects_collisions() {
    let mut state = base_state();
    let objects = serde_json::json!([
        {
            "id": "obj_a",
            "kind": "module",
            "catalog_item_id": "base_sink_600",
            "transform_mm": { "position_mm": { "x": 0, "y": 0 }, "rotation_deg": 0 },
            "dims_mm": { "width": 600, "depth": 600, "height": 720 },
            "material_slots": {}
        },
        {
            "id": "obj_b",
            "kind": "module",
            "catalog_item_id": "base_drawers_800",
            "transform_mm": { "position_mm": { "x": 300, "y": 0 }, "rotation_deg": 0 },
            "dims_mm": { "width": 600, "depth": 600, "height": 720 },
            "material_slots": {}
        }
    ]);
    state["layout"]["objects"] = objects;

    let response = validate_layout_json(state.to_string());
    let value: serde_json::Value = serde_json::from_str(&response).unwrap();
    let violations = value.get("violations").and_then(|v| v.as_array()).unwrap();
    assert!(violations.iter().any(|v| v.get("code").unwrap() == "layout.collision"));
}

#[test]
fn detects_min_passage() {
    let mut state = base_state();
    let objects = serde_json::json!([
        {
            "id": "obj_a",
            "kind": "module",
            "catalog_item_id": "base_sink_600",
            "transform_mm": { "position_mm": { "x": 0, "y": 0 }, "rotation_deg": 0 },
            "dims_mm": { "width": 600, "depth": 600, "height": 720 },
            "material_slots": {}
        },
        {
            "id": "obj_b",
            "kind": "module",
            "catalog_item_id": "base_drawers_800",
            "transform_mm": { "position_mm": { "x": 700, "y": 0 }, "rotation_deg": 0 },
            "dims_mm": { "width": 600, "depth": 600, "height": 720 },
            "material_slots": {}
        }
    ]);
    state["layout"]["objects"] = objects;

    let response = validate_layout_json(state.to_string());
    let value: serde_json::Value = serde_json::from_str(&response).unwrap();
    let violations = value.get("violations").and_then(|v| v.as_array()).unwrap();
    assert!(violations.iter().any(|v| v.get("code").unwrap() == "layout.min_passage"));
}

#[test]
fn detects_door_clearance() {
    let mut state = base_state();
    state["room"]["openings"] = serde_json::json!([
        { "id": "door_1", "kind": "door", "wall": "south", "offset_mm": 0, "width_mm": 900, "height_mm": 2100 }
    ]);
    state["layout"]["objects"] = serde_json::json!([
        {
            "id": "obj_a",
            "kind": "module",
            "catalog_item_id": "base_sink_600",
            "transform_mm": { "position_mm": { "x": 100, "y": 0 }, "rotation_deg": 0 },
            "dims_mm": { "width": 600, "depth": 600, "height": 720 },
            "material_slots": {}
        }
    ]);

    let response = validate_layout_json(state.to_string());
    let value: serde_json::Value = serde_json::from_str(&response).unwrap();
    let violations = value.get("violations").and_then(|v| v.as_array()).unwrap();
    assert!(violations.iter().any(|v| v.get("code").unwrap() == "layout.door_clearance"));
}

#[test]
fn detects_restricted_zone() {
    let mut state = base_state();
    state["room"]["restricted_zones"] = serde_json::json!([
        { "id": "zone_1", "min_mm": { "x": 0, "y": 0 }, "max_mm": { "x": 800, "y": 800 }, "reason": "pillar" }
    ]);
    state["layout"]["objects"] = serde_json::json!([
        {
            "id": "obj_a",
            "kind": "module",
            "catalog_item_id": "base_sink_600",
            "transform_mm": { "position_mm": { "x": 100, "y": 100 }, "rotation_deg": 0 },
            "dims_mm": { "width": 600, "depth": 600, "height": 720 },
            "material_slots": {}
        }
    ]);

    let response = validate_layout_json(state.to_string());
    let value: serde_json::Value = serde_json::from_str(&response).unwrap();
    let violations = value.get("violations").and_then(|v| v.as_array()).unwrap();
    assert!(violations.iter().any(|v| v.get("code").unwrap() == "layout.restricted_zone"));
}
