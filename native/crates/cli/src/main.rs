use std::path::{Path, PathBuf};

use pypulseq_native_core::assets::RuntimePaths;

#[derive(Debug)]
struct Cli {
    script: PathBuf,
    script_args: Vec<String>,
}

fn parse_args() -> Result<Cli, String> {
    let mut args = std::env::args_os();
    let _binary = args.next();

    let Some(script) = args.next() else {
        return Err("usage: pypulseq-cli <script.py> [script args ...]".to_string());
    };

    Ok(Cli {
        script: PathBuf::from(script),
        script_args: args.map(|arg| arg.to_string_lossy().into_owned()).collect(),
    })
}

fn validate_script(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Err(format!("script does not exist: {}", path.display()));
    }
    if !path.is_file() {
        return Err(format!("script is not a file: {}", path.display()));
    }
    Ok(())
}

fn runtime_root() -> Result<PathBuf, String> {
    let exe_dir = std::env::current_exe()
        .map_err(|error| format!("failed to resolve current executable path: {error}"))?
        .parent()
        .ok_or_else(|| "failed to resolve executable directory".to_string())?
        .to_path_buf();
    Ok(exe_dir.join("runtime"))
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let cli = parse_args()?;
    validate_script(&cli.script)?;

    let runtime_paths = RuntimePaths::from_root(runtime_root()?);

    println!("{}", pypulseq_native_core::banner("cli"));
    println!("script: {}", cli.script.display());
    if !cli.script_args.is_empty() {
        println!("script args: {}", cli.script_args.join(" "));
    }
    println!("runtime root: {}", runtime_paths.root.display());
    println!("pyodide dir: {}", runtime_paths.pyodide_dir.display());
    println!(
        "python packages archive: {}",
        runtime_paths.python_packages_archive.display()
    );
    println!("CLI host scaffolding is in place. Native Pyodide execution is not implemented yet.");

    Ok(())
}
