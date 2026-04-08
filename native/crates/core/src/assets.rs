use std::path::{Path, PathBuf};

pub const PYODIDE_DIR_NAME: &str = "pyodide";
pub const PYTHON_PACKAGES_ARCHIVE_NAME: &str = "python_packages.zip";

#[derive(Debug, Clone)]
pub struct RuntimePaths {
    pub root: PathBuf,
    pub pyodide_dir: PathBuf,
    pub python_packages_archive: PathBuf,
}

impl RuntimePaths {
    pub fn from_root(root: impl AsRef<Path>) -> Self {
        let root = root.as_ref().to_path_buf();
        Self {
            pyodide_dir: root.join(PYODIDE_DIR_NAME),
            python_packages_archive: root.join(PYTHON_PACKAGES_ARCHIVE_NAME),
            root,
        }
    }
}
