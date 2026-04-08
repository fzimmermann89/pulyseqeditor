use pypulseq_native_core::assets::RuntimePaths;

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let exe_dir = std::env::current_exe()
        .map_err(|error| format!("failed to resolve current executable path: {error}"))?
        .parent()
        .ok_or_else(|| "failed to resolve executable directory".to_string())?
        .to_path_buf();
    let runtime_paths = RuntimePaths::from_root(exe_dir.join("runtime"));

    println!("{}", pypulseq_native_core::banner("gui"));
    println!("runtime root: {}", runtime_paths.root.display());
    println!("pyodide dir: {}", runtime_paths.pyodide_dir.display());
    println!(
        "python packages archive: {}",
        runtime_paths.python_packages_archive.display()
    );
    println!("GUI host scaffolding is in place. WebView2 integration is not implemented yet.");

    Ok(())
}
