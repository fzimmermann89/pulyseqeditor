use include_dir::{include_dir, Dir, DirEntry, File};

pub const PYODIDE_DIR_NAME: &str = "pyodide";
pub const PYTHON_PACKAGES_DIR_NAME: &str = "python_packages";
pub const GUI_DIR_NAME: &str = "gui";
pub const PYTHON_RUNTIME_DIR_NAME: &str = "python_runtime";
pub const MANIFEST_NAME: &str = "manifest.json";
pub const PYTHON_PACKAGES_ARCHIVE_NAME: &str = "python_packages.zip";
pub const EMBEDDED_RUNTIME_ORIGIN: &str = "https://pypulseq.invalid/";
pub const PYODIDE_ENTRY_RELATIVE_PATH: &str = "pyodide/pyodide/pyodide.mjs";
pub const GUI_INDEX_NAME: &str = "index.html";
pub const PYTHON_RUNTIME_ENTRY_RELATIVE_PATH: &str = "python_runtime/pypulseq_runtime/native_runner.py";

static EMBEDDED_RUNTIME_DIR: Dir<'_> = include_dir!("$PULSEQ_NATIVE_RUNTIME_DIR");

#[derive(Debug, Clone, Copy)]
pub struct EmbeddedRuntime;

impl EmbeddedRuntime {
    pub fn new() -> Self {
        Self
    }

    pub fn file_bytes(&self, relative_path: &str) -> Option<&'static [u8]> {
        let normalized_path = normalize_relative_path(relative_path);
        EMBEDDED_RUNTIME_DIR
            .get_file(&normalized_path)
            .map(File::contents)
    }

    pub fn file_text(&self, relative_path: &str) -> Result<&'static str, String> {
        let normalized_path = normalize_relative_path(relative_path);
        let file = EMBEDDED_RUNTIME_DIR
            .get_file(&normalized_path)
            .ok_or_else(|| format!("embedded asset not found: {relative_path}"))?;
        file.contents_utf8()
            .ok_or_else(|| format!("embedded asset is not valid UTF-8: {relative_path}"))
    }

    pub fn list_files(&self, relative_prefix: &str) -> Vec<String> {
        let normalized_prefix = normalize_relative_path(relative_prefix);
        let mut files = Vec::new();
        collect_embedded_files(&EMBEDDED_RUNTIME_DIR, &normalized_prefix, &mut files);
        files.sort();
        files
    }
}

pub fn embedded_runtime() -> EmbeddedRuntime {
    EmbeddedRuntime::new()
}

pub fn embedded_asset_url(relative_path: &str) -> String {
    format!("{EMBEDDED_RUNTIME_ORIGIN}{}", normalize_relative_path(relative_path))
}

pub fn embedded_asset_path_from_specifier(specifier: &str) -> Option<String> {
    let url = deno_core::ModuleSpecifier::parse(specifier).ok()?;
    if url.scheme() != "https" || url.host_str()? != "pypulseq.invalid" {
        return None;
    }

    let path = url.path().trim_start_matches('/');
    if path.is_empty() {
        None
    } else {
        Some(normalize_relative_path(path))
    }
}

fn normalize_relative_path(value: &str) -> String {
    value.trim_start_matches('/').replace('\\', "/")
}

fn collect_embedded_files(
    root: &'static Dir<'static>,
    normalized_prefix: &str,
    files: &mut Vec<String>,
) {
    if normalized_prefix.is_empty() {
        collect_files_recursive(root.entries(), files);
        return;
    }

    if let Some(dir) = root.get_dir(normalized_prefix) {
        collect_files_recursive(dir.entries(), files);
        return;
    }

    if root.get_file(normalized_prefix).is_some() {
        files.push(normalized_prefix.to_string());
    }
}

fn collect_files_recursive(
    entries: &'static [DirEntry<'static>],
    files: &mut Vec<String>,
) {
    for entry in entries {
        match entry {
            DirEntry::Dir(dir) => collect_files_recursive(dir.entries(), files),
            DirEntry::File(file) => {
                files.push(normalize_relative_path(&file.path().to_string_lossy()));
            }
        }
    }
}
