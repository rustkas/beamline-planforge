use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Info,
    Warning,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Violation {
    pub code: String,
    pub severity: Severity,
    pub message: String,
    pub object_ids: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<HashMap<String, Value>>,
}

impl Violation {
    pub fn error(code: &str, message: &str, object_ids: Vec<String>) -> Self {
        Self {
            code: code.to_string(),
            severity: Severity::Error,
            message: message.to_string(),
            object_ids,
            details: None,
        }
    }

    pub fn warning(code: &str, message: &str, object_ids: Vec<String>) -> Self {
        Self {
            code: code.to_string(),
            severity: Severity::Warning,
            message: message.to_string(),
            object_ids,
            details: None,
        }
    }

    pub fn info(code: &str, message: &str, object_ids: Vec<String>) -> Self {
        Self {
            code: code.to_string(),
            severity: Severity::Info,
            message: message.to_string(),
            object_ids,
            details: None,
        }
    }

    pub fn with_details(mut self, details: HashMap<String, Value>) -> Self {
        self.details = Some(details);
        self
    }
}
