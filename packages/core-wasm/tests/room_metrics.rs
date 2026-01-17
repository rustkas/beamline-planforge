use planforge_core_wasm::compute_room_metrics_json;

#[test]
fn metrics_reports_coverage() {
    let state = serde_json::json!({
        "schema_version": "0.1.0",
        "project": { "project_id": "p1", "revision_id": "r1", "units": "mm" },
        "room": {
            "size_mm": { "width": 1000, "depth": 1000, "height": 2700 },
            "openings": [],
            "utilities": [],
            "restricted_zones": []
        },
        "layout": {
            "objects": [
                {
                    "id": "obj_a",
                    "kind": "module",
                    "catalog_item_id": "base_sink_600",
                    "transform_mm": { "position_mm": { "x": 0, "y": 0 }, "rotation_deg": 0 },
                    "dims_mm": { "width": 500, "depth": 500, "height": 720 },
                    "material_slots": {}
                }
            ]
        },
        "catalog_refs": { "modules_catalog_version": "modules_demo_0.1.0", "materials_catalog_version": "materials_demo_0.1.0" }
    });

    let response = compute_room_metrics_json(state.to_string());
    let value: serde_json::Value = serde_json::from_str(&response).unwrap();
    let metrics = value.get("metrics").unwrap();
    let room_area = metrics.get("room_area_mm2").unwrap().as_i64().unwrap();
    let occupied_area = metrics.get("occupied_area_mm2").unwrap().as_i64().unwrap();
    let coverage = metrics.get("coverage_ratio").unwrap().as_f64().unwrap();
    assert_eq!(room_area, 1_000_000);
    assert_eq!(occupied_area, 250_000);
    assert!(coverage > 0.24 && coverage < 0.26);
}
