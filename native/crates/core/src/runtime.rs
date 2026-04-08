use std::path::PathBuf;

use crate::assets::RuntimePaths;
use crate::host::NativeHost;
use crate::pyodide_host::run_cli_request;

#[derive(Debug, Clone)]
pub struct RunRequest {
    pub script_path: PathBuf,
    pub script_args: Vec<String>,
    pub output_dir: PathBuf,
    pub working_directory: PathBuf,
    pub copy_paths: Vec<PathBuf>,
    pub verbose: bool,
}

#[derive(Debug, Clone)]
pub enum HostEvent {
    Log { stream: String, text: String },
    Plot { index: usize, title: String, mime: String },
    SeqFile { filename: String },
}

#[derive(Debug, Clone)]
pub struct RunSummary {
    pub runtime_root: PathBuf,
    pub pyodide_dir: PathBuf,
    pub python_packages_dir: PathBuf,
    pub python_runtime_dir: PathBuf,
    pub python_runtime_entrypoint: PathBuf,
    pub manifest_path: PathBuf,
    pub bootstrap_plan: NativeBootstrapPlan,
}

#[derive(Debug, Clone)]
pub struct NativeInvocation {
    pub request_json: String,
    pub python_entrypoint: String,
}

#[derive(Debug, Clone)]
pub struct HostMount {
    pub source: PathBuf,
    pub target: String,
}

#[derive(Debug, Clone)]
pub struct NativeBootstrapPlan {
    pub mounts: Vec<HostMount>,
    pub python_entrypoint: String,
}

pub const APP_FS_ROOT: &str = "/app";
pub const PYTHON_RUNTIME_FS_ROOT: &str = "/app/python_runtime";
pub const PYTHON_PACKAGES_FS_ROOT: &str = "/app/python_packages";

pub fn describe_run_request(request: &RunRequest) -> String {
    if request.script_args.is_empty() {
        format!(
            "script={} output_dir={} cwd={}",
            request.script_path.display(),
            request.output_dir.display(),
            request.working_directory.display()
        )
    } else {
        format!(
            "script={} output_dir={} cwd={} args={}",
            request.script_path.display(),
            request.output_dir.display(),
            request.working_directory.display(),
            request.script_args.join(" ")
        )
    }
}

pub fn serialize_run_request(request: &RunRequest) -> String {
    let script_args = request
        .script_args
        .iter()
        .map(|value| format!("\"{}\"", escape_json_string(value)))
        .collect::<Vec<_>>()
        .join(", ");
    let copy_paths = request
        .copy_paths
        .iter()
        .map(|value| format!("\"{}\"", escape_json_string(&value.to_string_lossy())))
        .collect::<Vec<_>>()
        .join(", ");

    format!(
        concat!(
            "{{",
            "\"scriptPath\":\"{}\",",
            "\"scriptArgs\":[{}],",
            "\"outputDir\":\"{}\",",
            "\"workingDirectory\":\"{}\",",
            "\"copyPaths\":[{}],",
            "\"verbose\":{}",
            "}}"
        ),
        escape_json_string(&request.script_path.to_string_lossy()),
        script_args,
        escape_json_string(&request.output_dir.to_string_lossy()),
        escape_json_string(&request.working_directory.to_string_lossy()),
        copy_paths,
        if request.verbose { "true" } else { "false" },
    )
}

pub fn build_native_invocation(request: &RunRequest) -> NativeInvocation {
    let request_json = serialize_run_request(request);
    let python_entrypoint = format!(
        concat!(
            "import sys\n",
            "if \"/app\" not in sys.path:\n",
            "    sys.path.insert(0, \"/app\")\n",
            "from pypulseq_runtime.native_runner import run_native_request_json\n",
            "run_native_request_json({request_json_literal}, namespace=globals())\n"
        ),
        request_json_literal = python_string_literal(&request_json),
    );

    NativeInvocation {
        request_json,
        python_entrypoint,
    }
}

pub fn build_native_bootstrap_plan(
    request: &RunRequest,
    runtime_paths: &RuntimePaths,
) -> NativeBootstrapPlan {
    let invocation = build_native_invocation(request);
    let mounts = vec![
        HostMount {
            source: runtime_paths.python_runtime_dir.clone(),
            target: PYTHON_RUNTIME_FS_ROOT.to_string(),
        },
        HostMount {
            source: runtime_paths.python_packages_dir.clone(),
            target: PYTHON_PACKAGES_FS_ROOT.to_string(),
        },
    ];
    let python_entrypoint = format!(
        concat!(
            "import sys\n",
            "for _path in [{python_runtime_root}, {python_packages_root}]:\n",
            "    if _path not in sys.path:\n",
            "        sys.path.insert(0, _path)\n",
            "{native_entrypoint}\n"
        ),
        python_runtime_root = python_string_literal(PYTHON_RUNTIME_FS_ROOT),
        python_packages_root = python_string_literal(PYTHON_PACKAGES_FS_ROOT),
        native_entrypoint = invocation.python_entrypoint,
    );

    NativeBootstrapPlan {
        mounts,
        python_entrypoint,
    }
}

pub fn run_python_script(
    request: &RunRequest,
    runtime_paths: &RuntimePaths,
    host: &mut dyn NativeHost,
) -> Result<RunSummary, String> {
    runtime_paths.validate_for_cli()?;
    let invocation = build_native_invocation(request);
    let bootstrap_plan = build_native_bootstrap_plan(request, runtime_paths);

    host.emit(HostEvent::Log {
        stream: "info".to_string(),
        text: format!("runtime={}", runtime_paths.root.display()),
    });
    host.emit(HostEvent::Log {
        stream: "info".to_string(),
        text: format!("request={}", describe_run_request(request)),
    });
    host.emit(HostEvent::Log {
        stream: "info".to_string(),
        text: format!("request_json={}", invocation.request_json),
    });
    host.emit(HostEvent::Log {
        stream: "info".to_string(),
        text: format!(
            "python_entrypoint={} lines",
            invocation.python_entrypoint.lines().count()
        ),
    });
    host.emit(HostEvent::Log {
        stream: "info".to_string(),
        text: format!(
            "bootstrap_plan mounts={} entrypoint={} lines",
            bootstrap_plan.mounts.len(),
            bootstrap_plan.python_entrypoint.lines().count()
        ),
    });
    run_cli_request(&invocation.request_json, &bootstrap_plan, runtime_paths)?;

    Ok(RunSummary {
        runtime_root: runtime_paths.root.clone(),
        pyodide_dir: runtime_paths.pyodide_dir.clone(),
        python_packages_dir: runtime_paths.python_packages_dir.clone(),
        python_runtime_dir: runtime_paths.python_runtime_dir.clone(),
        python_runtime_entrypoint: runtime_paths.python_runtime_entrypoint.clone(),
        manifest_path: runtime_paths.manifest_path.clone(),
        bootstrap_plan,
    })
}

fn escape_json_string(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());
    for ch in value.chars() {
        match ch {
            '\\' => escaped.push_str("\\\\"),
            '"' => escaped.push_str("\\\""),
            '\n' => escaped.push_str("\\n"),
            '\r' => escaped.push_str("\\r"),
            '\t' => escaped.push_str("\\t"),
            '\u{08}' => escaped.push_str("\\b"),
            '\u{0C}' => escaped.push_str("\\f"),
            c if c.is_control() => {
                let code = c as u32;
                escaped.push_str(&format!("\\u{:04x}", code));
            }
            c => escaped.push(c),
        }
    }
    escaped
}

fn python_string_literal(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len() + 2);
    escaped.push('"');
    for ch in value.chars() {
        match ch {
            '\\' => escaped.push_str("\\\\"),
            '"' => escaped.push_str("\\\""),
            '\n' => escaped.push_str("\\n"),
            '\r' => escaped.push_str("\\r"),
            '\t' => escaped.push_str("\\t"),
            c => escaped.push(c),
        }
    }
    escaped.push('"');
    escaped
}
