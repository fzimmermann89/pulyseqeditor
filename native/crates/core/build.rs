fn main() {
    let manifest_dir = std::path::PathBuf::from(
        std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR should be set"),
    );
    let runtime_root = manifest_dir.join("../../runtime");
    let pyodide_dir = runtime_root.join("pyodide");
    let python_packages_dir = runtime_root.join("python_packages");
    let gui_dir = runtime_root.join("gui");
    let python_runtime_dir = runtime_root.join("python_runtime");
    let python_packages_archive = runtime_root.join("python_packages.zip");

    for (label, path) in [
        ("runtime root", &runtime_root),
        ("Pyodide runtime", &pyodide_dir),
        ("Python packages runtime", &python_packages_dir),
        ("GUI runtime", &gui_dir),
        ("Python shared runtime", &python_runtime_dir),
    ] {
        if !path.is_dir() {
            panic!(
                "missing {label} at {}. Run: npm run stage:native-runtime",
                path.display()
            );
        }
    }
    if !python_packages_archive.is_file() {
        panic!(
            "missing Python packages archive at {}. Run: npm run stage:native-runtime",
            python_packages_archive.display()
        );
    }

    println!("cargo:rerun-if-changed={}", runtime_root.display());
    println!(
        "cargo:rustc-env=PULSEQ_NATIVE_RUNTIME_DIR={}",
        runtime_root.display()
    );

    if std::env::var("CARGO_CFG_WINDOWS").is_ok() {
        println!("cargo:rustc-link-lib=advapi32");
    }
}
