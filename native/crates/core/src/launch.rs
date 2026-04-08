use std::path::{Path, PathBuf};

use crate::runtime::RunRequest;

#[derive(Debug, Clone)]
pub struct NativeLaunchSpec {
    pub script_path: PathBuf,
    pub script_args: Vec<String>,
    pub output_dir: PathBuf,
    pub working_directory: PathBuf,
    pub copy_paths: Vec<PathBuf>,
    pub verbose: bool,
}

impl NativeLaunchSpec {
    pub fn for_script(
        script_path: impl AsRef<Path>,
        script_args: Vec<String>,
        output_dir: Option<PathBuf>,
        copy_paths: Vec<PathBuf>,
        verbose: bool,
    ) -> Result<Self, String> {
        let script_path = script_path.as_ref();
        if !script_path.exists() {
            return Err(format!("script does not exist: {}", script_path.display()));
        }
        if !script_path.is_file() {
            return Err(format!("script is not a file: {}", script_path.display()));
        }

        let script_path = script_path.canonicalize().map_err(|error| {
            format!(
                "failed to resolve script path {}: {error}",
                script_path.display()
            )
        })?;
        let working_directory = script_path
            .parent()
            .ok_or_else(|| format!("failed to resolve parent directory for {}", script_path.display()))?
            .to_path_buf();
        let output_dir = output_dir.unwrap_or_else(|| working_directory.clone());
        let copy_paths = copy_paths
            .into_iter()
            .map(|path| {
                path.canonicalize().map_err(|error| {
                    format!("failed to resolve copy path {}: {error}", path.display())
                })
            })
            .collect::<Result<Vec<_>, _>>()?;

        Ok(Self {
            script_path,
            script_args,
            output_dir,
            working_directory,
            copy_paths,
            verbose,
        })
    }

    pub fn for_gui(working_directory: PathBuf) -> Self {
        Self {
            script_path: PathBuf::from("<gui>"),
            script_args: Vec::new(),
            output_dir: working_directory.clone(),
            working_directory,
            copy_paths: Vec::new(),
            verbose: false,
        }
    }

    pub fn into_run_request(self) -> RunRequest {
        RunRequest {
            script_path: self.script_path,
            script_args: self.script_args,
            output_dir: self.output_dir,
            working_directory: self.working_directory,
            copy_paths: self.copy_paths,
            verbose: self.verbose,
        }
    }
}
