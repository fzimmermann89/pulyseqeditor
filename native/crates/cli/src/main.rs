use std::path::PathBuf;

use pypulseq_native_core::host::ConsoleHost;
use pypulseq_native_core::launch::NativeLaunchSpec;
use pypulseq_native_core::runtime::{RunRequest, run_python_script};

#[derive(Debug)]
struct Cli {
    script: PathBuf,
    output_dir: Option<PathBuf>,
    script_args: Vec<String>,
    copy_paths: Vec<PathBuf>,
    verbose: bool,
}

fn parse_args() -> Result<Cli, String> {
    let mut args = std::env::args_os();
    let _binary = args.next();

    let mut output_dir = None;
    let mut script = None;
    let mut script_args = Vec::new();
    let mut copy_paths = Vec::new();
    let mut verbose = false;

    while let Some(argument) = args.next() {
        if script.is_none() {
            if argument == "--output-dir" {
                let Some(value) = args.next() else {
                    return Err("missing value for --output-dir".to_string());
                };
                output_dir = Some(PathBuf::from(value));
                continue;
            }

            if argument == "--verbose" {
                verbose = true;
                continue;
            }

            if argument == "--copy" {
                let Some(value) = args.next() else {
                    return Err("missing value for --copy".to_string());
                };
                copy_paths.push(PathBuf::from(value));
                continue;
            }

            if argument == "--help" || argument == "-h" {
                return Err(
                    "usage: pypulseq-cli [--output-dir DIR] [--copy PATH] [--verbose] <script.py> [script args ...]"
                        .to_string(),
                );
            }

            script = Some(PathBuf::from(argument));
            continue;
        }

        script_args.push(argument.to_string_lossy().into_owned());
    }

    let Some(script) = script else {
        return Err(
            "usage: pypulseq-cli [--output-dir DIR] [--copy PATH] [--verbose] <script.py> [script args ...]"
                .to_string(),
        );
    };

    Ok(Cli {
        script,
        output_dir,
        script_args,
        copy_paths,
        verbose,
    })
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let cli = parse_args()?;
    let launch_spec = NativeLaunchSpec::for_script(
        &cli.script,
        cli.script_args.clone(),
        cli.output_dir,
        cli.copy_paths,
        cli.verbose,
    )?;
    let request: RunRequest = launch_spec.into_run_request();
    let mut host = ConsoleHost::new(cli.verbose);
    let _summary = run_python_script(&request, &mut host)?;

    Ok(())
}
