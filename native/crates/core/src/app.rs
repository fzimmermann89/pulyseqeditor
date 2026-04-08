pub const APP_NAME: &str = "pypulseq";

pub const fn runtime_strategy() -> &'static str {
    "pyodide"
}

pub fn banner(binary_name: &str) -> String {
    format!("{APP_NAME} {binary_name} ({})", runtime_strategy())
}
