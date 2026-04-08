use std::path::{Path, PathBuf};

pub const PYODIDE_DIR_NAME: &str = "pyodide";
pub const PYTHON_PACKAGES_DIR_NAME: &str = "python_packages";
pub const GUI_DIR_NAME: &str = "gui";
pub const PYTHON_RUNTIME_DIR_NAME: &str = "python_runtime";
pub const MANIFEST_NAME: &str = "manifest.json";
pub const PYODIDE_ENTRY_RELATIVE_PATH: &str = "pyodide/pyodide/pyodide.mjs";
pub const GUI_INDEX_NAME: &str = "index.html";
pub const PYTHON_RUNTIME_ENTRY_RELATIVE_PATH: &str = "python_runtime/pypulseq_runtime/native_runner.py";

#[derive(Debug, Clone)]
pub struct RuntimePaths {
    pub root: PathBuf,
    pub pyodide_dir: PathBuf,
    pub python_packages_dir: PathBuf,
    pub gui_dir: PathBuf,
    pub python_runtime_dir: PathBuf,
    pub manifest_path: PathBuf,
    pub pyodide_entrypoint: PathBuf,
    pub gui_index_html: PathBuf,
    pub python_runtime_entrypoint: PathBuf,
}

impl RuntimePaths {
    pub fn from_root(root: impl AsRef<Path>) -> Self {
        let root = root.as_ref().to_path_buf();
        Self {
            pyodide_dir: root.join(PYODIDE_DIR_NAME),
            python_packages_dir: root.join(PYTHON_PACKAGES_DIR_NAME),
            gui_dir: root.join(GUI_DIR_NAME),
            python_runtime_dir: root.join(PYTHON_RUNTIME_DIR_NAME),
            manifest_path: root.join(MANIFEST_NAME),
            pyodide_entrypoint: root.join(PYODIDE_ENTRY_RELATIVE_PATH),
            gui_index_html: root.join(GUI_DIR_NAME).join(GUI_INDEX_NAME),
            python_runtime_entrypoint: root.join(PYTHON_RUNTIME_ENTRY_RELATIVE_PATH),
            root,
        }
    }

    pub fn locate_from_executable(executable_path: impl AsRef<Path>) -> Result<Self, String> {
        let executable_path = executable_path.as_ref();
        let exe_dir = executable_path
            .parent()
            .ok_or_else(|| format!("failed to resolve executable directory for {}", executable_path.display()))?;

        let mut candidates = vec![exe_dir.join("runtime")];
        if let Some(native_root) = exe_dir.parent().and_then(|path| path.parent()) {
            candidates.push(native_root.join("runtime"));
        }
        if let Ok(current_dir) = std::env::current_dir() {
            candidates.push(current_dir.join("runtime"));
            candidates.push(current_dir.join("native").join("runtime"));
        }

        for candidate in candidates {
            if candidate.is_dir() {
                return Ok(Self::from_root(candidate));
            }
        }

        Err(format!(
            "failed to locate runtime directory from executable {}",
            executable_path.display()
        ))
    }

    pub fn validate_for_cli(&self) -> Result<(), String> {
        self.validate_common()?;
        Ok(())
    }

    pub fn validate_for_gui(&self) -> Result<(), String> {
        self.validate_common()?;
        validate_file(&self.gui_index_html, "GUI entry HTML")?;
        Ok(())
    }

    fn validate_common(&self) -> Result<(), String> {
        validate_dir(&self.root, "runtime root")?;
        validate_file(&self.manifest_path, "runtime manifest")?;
        validate_dir(&self.pyodide_dir, "Pyodide directory")?;
        validate_file(&self.pyodide_entrypoint, "Pyodide entrypoint")?;
        validate_dir(&self.python_packages_dir, "Python packages directory")?;
        validate_dir(&self.python_runtime_dir, "shared Python runtime directory")?;
        validate_file(
            &self.python_runtime_entrypoint,
            "shared Python runtime native entrypoint",
        )?;
        Ok(())
    }
}

fn validate_dir(path: &Path, label: &str) -> Result<(), String> {
    let metadata = path
        .metadata()
        .map_err(|error| format!("missing {label} at {}: {error}", path.display()))?;
    if !metadata.is_dir() {
        return Err(format!("{label} is not a directory: {}", path.display()));
    }
    Ok(())
}

fn validate_file(path: &Path, label: &str) -> Result<(), String> {
    let metadata = path
        .metadata()
        .map_err(|error| format!("missing {label} at {}: {error}", path.display()))?;
    if !metadata.is_file() {
        return Err(format!("{label} is not a file: {}", path.display()));
    }
    Ok(())
}
