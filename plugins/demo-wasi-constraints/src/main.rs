use serde::Serialize;
use serde_json::Value;
use std::io::{self, Read};

#[derive(Serialize)]
struct Violation {
    code: String,
    severity: String,
    message: String,
    object_ids: Vec<String>,
}

#[derive(Serialize)]
struct Output {
    violations: Vec<Violation>,
}

fn main() {
    let mut input = String::new();
    let _ = io::stdin().read_to_string(&mut input);
    let parsed: Value = serde_json::from_str(&input).unwrap_or(Value::Null);
    let object_id = parsed
        .get("layout")
        .and_then(|v| v.get("objects"))
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.get(0))
        .and_then(|v| v.get("id"))
        .and_then(|v| v.as_str())
        .unwrap_or("unknown");

    let violation = Violation {
        code: "demo.wasi.constraint".to_string(),
        severity: "warning".to_string(),
        message: "WASI demo constraint applied".to_string(),
        object_ids: vec![object_id.to_string()],
    };

    let out = Output {
        violations: vec![violation],
    };

    let json = serde_json::to_string(&out).unwrap_or_else(|_| "{\"violations\":[]}".to_string());
    print!("{}", json);
}
