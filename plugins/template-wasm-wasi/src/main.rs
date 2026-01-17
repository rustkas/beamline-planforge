use serde::Serialize;
use std::io::{self, Read};

#[derive(Serialize)]
struct Output {
    ok: bool,
    message: String,
}

fn main() {
    let mut input = String::new();
    let _ = io::stdin().read_to_string(&mut input);
    let out = Output {
        ok: true,
        message: format!("received {} bytes", input.len()),
    };
    let json = serde_json::to_string(&out).unwrap_or_else(|_| "{\"ok\":false}".to_string());
    print!("{}", json);
}
