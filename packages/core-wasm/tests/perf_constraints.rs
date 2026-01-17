use planforge_core_wasm::validate_layout_json;

#[test]
fn constraints_perf_budget() {
    if std::env::var("PLANFORGE_PERF").ok().as_deref() != Some("1") {
        return;
    }

    let mut objects = Vec::new();
    let mut x = 0;
    let mut y = 0;
    for i in 0..200 {
        objects.push(serde_json::json!({
            "id": format!("obj_{}", i),
            "kind": "module",
            "catalog_item_id": "base_sink_600",
            "transform_mm": { "position_mm": { "x": x, "y": y }, "rotation_deg": 0 },
            "dims_mm": { "width": 500, "depth": 500, "height": 720 },
            "material_slots": {}
        }));
        x += 520;
        if x > 3000 {
            x = 0;
            y += 520;
        }
    }

    let state = serde_json::json!({
        "schema_version": "0.1.0",
        "project": { "project_id": "p1", "revision_id": "r1", "units": "mm" },
        "room": {
            "size_mm": { "width": 8000, "depth": 8000, "height": 2700 },
            "openings": [],
            "utilities": [],
            "restricted_zones": []
        },
        "layout": { "objects": objects },
        "catalog_refs": { "modules_catalog_version": "modules_demo_0.1.0", "materials_catalog_version": "materials_demo_0.1.0" }
    });

    let start = std::time::Instant::now();
    let _ = validate_layout_json(state.to_string());
    let elapsed = start.elapsed().as_millis();
    assert!(elapsed < 200, "constraints perf budget exceeded: {}ms", elapsed);
}
