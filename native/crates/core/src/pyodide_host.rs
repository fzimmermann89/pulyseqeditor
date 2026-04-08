use std::rc::Rc;
use std::sync::{Mutex, OnceLock};

use deno_core::error::OpError;
use deno_core::error::ModuleLoaderError;
use deno_core::extension;
use deno_core::JsRuntime;
use deno_core::ModuleLoadResponse;
use deno_core::ModuleLoader;
use deno_core::ModuleSpecifier;
use deno_core::ModuleSource;
use deno_core::ModuleSourceCode;
use deno_core::ModuleType;
use deno_core::op2;
use deno_core::PollEventLoopOptions;
use deno_core::RequestedModuleType;
use deno_core::ResolutionKind;
use deno_core::RuntimeOptions;
use deno_core::resolve_import;

use crate::assets::{
    EMBEDDED_RUNTIME_ORIGIN, EmbeddedRuntime, embedded_asset_path_from_specifier,
    embedded_asset_url,
};
use crate::runtime::NativeBootstrapPlan;

#[derive(Clone, Debug)]
struct NativeOpState {
    output_dir: std::path::PathBuf,
    verbose: bool,
}

static NATIVE_OP_STATE: OnceLock<Mutex<Option<NativeOpState>>> = OnceLock::new();

fn native_op_state() -> &'static Mutex<Option<NativeOpState>> {
    NATIVE_OP_STATE.get_or_init(|| Mutex::new(None))
}

fn set_native_op_state(state: NativeOpState) -> Result<(), String> {
    let mut guard = native_op_state()
        .lock()
        .map_err(|_| "failed to lock native host state".to_string())?;
    *guard = Some(state);
    Ok(())
}

fn clear_native_op_state() {
    if let Ok(mut guard) = native_op_state().lock() {
        *guard = None;
    }
}

fn current_output_dir() -> Result<std::path::PathBuf, OpError> {
    let guard = native_op_state()
        .lock()
        .map_err(|_| OpError::from(std::io::Error::other("failed to lock native host state")))?;
    let state = guard
        .as_ref()
        .ok_or_else(|| OpError::from(std::io::Error::other("native host state is not initialized")))?;
    Ok(state.output_dir.clone())
}

fn current_verbose() -> Result<bool, OpError> {
    let guard = native_op_state()
        .lock()
        .map_err(|_| OpError::from(std::io::Error::other("failed to lock native host state")))?;
    let state = guard
        .as_ref()
        .ok_or_else(|| OpError::from(std::io::Error::other("native host state is not initialized")))?;
    Ok(state.verbose)
}

#[op2]
#[buffer]
fn op_pulseq_read_file_bytes(
    #[string] specifier: String,
) -> Result<Vec<u8>, OpError> {
    if let Some(relative_path) = embedded_asset_path_from_specifier(&specifier) {
        let embedded_runtime = EmbeddedRuntime::new();
        let bytes = embedded_runtime
            .file_bytes(&relative_path)
            .ok_or_else(|| {
                OpError::from(std::io::Error::other(format!(
                    "embedded asset not found: {relative_path}"
                )))
            })?;
        return Ok(bytes.to_vec());
    }

    let path = specifier_to_path(&specifier).map_err(|error| {
        OpError::from(std::io::Error::other(error))
    })?;
    let bytes = std::fs::read(&path).map_err(|error| {
        OpError::from(std::io::Error::other(format!(
            "failed to read {}: {error}",
            path.display()
        )))
    })?;
    Ok(bytes)
}

#[op2]
#[string]
fn op_pulseq_read_file_text(
    #[string] specifier: String,
) -> Result<String, OpError> {
    if let Some(relative_path) = embedded_asset_path_from_specifier(&specifier) {
        let embedded_runtime = EmbeddedRuntime::new();
        let text = embedded_runtime.file_text(&relative_path).map_err(|error| {
            OpError::from(std::io::Error::other(error))
        })?;
        return Ok(text.to_string());
    }

    let path = specifier_to_path(&specifier).map_err(|error| {
        OpError::from(std::io::Error::other(error))
    })?;
    let text = std::fs::read_to_string(&path).map_err(|error| {
        OpError::from(std::io::Error::other(format!(
            "failed to read text {}: {error}",
            path.display()
        )))
    })?;
    Ok(text)
}

#[op2]
#[string]
fn op_pulseq_log(
    #[string] stream: String,
    #[string] text: String,
) -> Result<String, OpError> {
    match stream.as_str() {
        "stderr" => eprint!("{text}"),
        "stdout" => print!("{text}"),
        _ if current_verbose()? => print!("{text}"),
        _ => {}
    }
    Ok(String::new())
}

#[op2]
#[string]
fn op_pulseq_list_dir(
    #[string] specifier: String,
) -> Result<String, OpError> {
    let path = specifier_to_path(&specifier).map_err(|error| {
        OpError::from(std::io::Error::other(error))
    })?;
    let mut entries = std::fs::read_dir(&path)
        .map_err(|error| {
            OpError::from(std::io::Error::other(format!(
                "failed to read directory {}: {error}",
                path.display()
            )))
        })?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| {
            OpError::from(std::io::Error::other(format!(
                "failed to enumerate directory {}: {error}",
                path.display()
            )))
        })?;
    entries.sort_by_key(|entry| entry.file_name());

    let json = format!(
        "[{}]",
        entries
            .into_iter()
            .map(|entry| {
                let entry_path = entry.path();
                let metadata = entry.metadata().map_err(|error| {
                    OpError::from(std::io::Error::other(format!(
                        "failed to read metadata for {}: {error}",
                        entry_path.display()
                    )))
                })?;
                Ok(format!(
                    "{{\"name\":{},\"path\":{},\"isDir\":{},\"isFile\":{}}}",
                    js_string(&entry.file_name().to_string_lossy()),
                    js_string(&entry_path.to_string_lossy()),
                    if metadata.is_dir() { "true" } else { "false" },
                    if metadata.is_file() { "true" } else { "false" }
                ))
            })
            .collect::<Result<Vec<_>, OpError>>()?
            .join(",")
    );

    Ok(json)
}

#[op2]
#[string]
fn op_pulseq_list_embedded_files(
    #[string] prefix: String,
) -> Result<String, OpError> {
    let embedded_runtime = EmbeddedRuntime::new();
    let json = format!(
        "[{}]",
        embedded_runtime
            .list_files(&prefix)
            .iter()
            .map(|path| js_string(path))
            .collect::<Vec<_>>()
            .join(",")
    );
    Ok(json)
}

#[op2]
#[string]
fn op_pulseq_resolve_url(
    #[string] input: String,
    #[string] base: String,
) -> Result<String, OpError> {
    let resolved = if ModuleSpecifier::parse(&input).is_ok() {
        input
    } else {
        let base = ModuleSpecifier::parse(&base).map_err(|error| {
            OpError::from(std::io::Error::other(format!(
                "failed to parse base URL {base}: {error}"
            )))
        })?;
        base.join(&input).map_err(|error| {
            OpError::from(std::io::Error::other(format!(
                "failed to resolve URL {input} against {base}: {error}"
            )))
        })?.to_string()
    };

    Ok(resolved)
}

#[op2]
#[string]
fn op_pulseq_btoa(
    #[string] value: String,
) -> Result<String, OpError> {
    let bytes = value
        .chars()
        .map(|ch| {
            let code = ch as u32;
            u8::try_from(code).map_err(|_| {
                OpError::from(std::io::Error::other(
                    "btoa input contained characters outside Latin-1",
                ))
            })
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok(base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        bytes,
    ))
}

#[op2]
#[string]
fn op_pulseq_atob(
    #[string] value: String,
) -> Result<String, OpError> {
    let bytes = base64::Engine::decode(
        &base64::engine::general_purpose::STANDARD,
        value.as_bytes(),
    )
    .map_err(|error| {
        OpError::from(std::io::Error::other(format!(
            "failed to decode base64 input: {error}"
        )))
    })?;
    Ok(bytes.iter().map(|byte| char::from(*byte)).collect())
}

#[op2]
#[string]
fn op_pulseq_write_output_text(
    #[string] filename: String,
    #[string] content: String,
) -> Result<String, OpError> {
    let output_dir = current_output_dir()?;
    let path = output_dir.join(&filename);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| {
            OpError::from(std::io::Error::other(format!(
                "failed to create output directory {}: {error}",
                parent.display()
            )))
        })?;
    }
    std::fs::write(&path, content).map_err(|error| {
        OpError::from(std::io::Error::other(format!(
            "failed to write output text {}: {error}",
            path.display()
        )))
    })?;
    Ok(path.display().to_string())
}

#[op2]
#[string]
fn op_pulseq_write_output_base64(
    #[string] filename: String,
    #[string] base64_data: String,
) -> Result<String, OpError> {
    let output_dir = current_output_dir()?;
    let path = output_dir.join(&filename);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| {
            OpError::from(std::io::Error::other(format!(
                "failed to create output directory {}: {error}",
                parent.display()
            )))
        })?;
    }
    let bytes = base64::Engine::decode(
        &base64::engine::general_purpose::STANDARD,
        base64_data.as_bytes(),
    )
    .map_err(|error| {
        OpError::from(std::io::Error::other(format!(
            "failed to decode base64 output {filename}: {error}"
        )))
    })?;
    std::fs::write(&path, bytes).map_err(|error| {
        OpError::from(std::io::Error::other(format!(
            "failed to write output bytes {}: {error}",
            path.display()
        )))
    })?;
    println!("Wrote {}", path.display());
    Ok(path.display().to_string())
}

extension!(
    pulseq_cli_host,
    ops = [
        op_pulseq_read_file_bytes,
        op_pulseq_read_file_text,
        op_pulseq_log,
        op_pulseq_list_dir,
        op_pulseq_list_embedded_files,
        op_pulseq_resolve_url,
        op_pulseq_btoa,
        op_pulseq_atob,
        op_pulseq_write_output_text,
        op_pulseq_write_output_base64
    ]
);

pub fn run_cli_request(
    request_json: &str,
    plan: &NativeBootstrapPlan,
    embedded_runtime: &EmbeddedRuntime,
) -> Result<(), String> {
    let request_value = serde_json::from_str::<serde_json::Value>(request_json)
        .map_err(|error| format!("failed to parse request JSON for native host state: {error}"))?;
    set_native_op_state(NativeOpState {
        output_dir: request_value
            .get("outputDir")
            .and_then(|value| value.as_str())
            .map(std::path::PathBuf::from)
            .ok_or_else(|| "request JSON did not contain outputDir".to_string())?,
        verbose: request_value
            .get("verbose")
            .and_then(|value| value.as_bool())
            .unwrap_or(false),
    })?;

    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|error| format!("failed to build tokio runtime for deno_core: {error}"))?;

    let result = runtime.block_on(async move {
        run_cli_request_async(request_json, plan, *embedded_runtime).await
    });
    clear_native_op_state();
    result
}

async fn run_cli_request_async(
    request_json: &str,
    plan: &NativeBootstrapPlan,
    embedded_runtime: EmbeddedRuntime,
) -> Result<(), String> {
    let module_loader = Rc::new(EmbeddedModuleLoader::new(embedded_runtime));
    let mut runtime = JsRuntime::new(RuntimeOptions {
        module_loader: Some(module_loader),
        extensions: vec![pulseq_cli_host::init_ops()],
        ..Default::default()
    });
    let entry_specifier = entry_module_specifier()?;
    let source = build_entry_module_source(request_json, plan);

    let module_id = runtime
        .load_main_es_module_from_code(&entry_specifier, source)
        .await
        .map_err(|error| format!("failed to load native Pyodide bootstrap module: {error}"))?;
    let evaluation = runtime.mod_evaluate(module_id);
    runtime
        .run_event_loop(PollEventLoopOptions::default())
        .await
        .map_err(|error| format!("native Pyodide event loop failed: {error}"))?;
    evaluation
        .await
        .map_err(|error| format!("native Pyodide bootstrap evaluation failed: {error}"))?;

    Ok(())
}

fn build_entry_module_source(
    request_json: &str,
    plan: &NativeBootstrapPlan,
) -> String {
    let pyodide_root_url = ensure_trailing_slash(&embedded_asset_url("pyodide/pyodide"));
    let pyodide_module_url = embedded_asset_url("pyodide/pyodide/pyodide.mjs");

    let mount_lines = plan
        .mounts
        .iter()
        .map(|mount| {
            format!(
                "  {{ assetPrefix: {}, target: {} }},",
                js_string(&mount.asset_prefix),
                js_string(&mount.target)
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    format!(
        concat!(
            "const __denoCore = Deno.core;\n",
            "const __pulseqLog = (stream, text) => __denoCore.ops.op_pulseq_log(stream, String(text) + '\\n');\n",
            "globalThis.Deno = undefined;\n",
            "globalThis.self = globalThis;\n",
            "globalThis.window = globalThis;\n",
            "globalThis.document = {{ createElement() {{ return {{}}; }} }};\n",
            "globalThis.sessionStorage = {{}};\n",
            "globalThis.addEventListener = globalThis.addEventListener ?? (() => {{}});\n",
            "globalThis.removeEventListener = globalThis.removeEventListener ?? (() => {{}});\n",
            "globalThis.postMessage = globalThis.postMessage ?? (() => {{}});\n",
            "globalThis.performance = globalThis.performance ?? {{ now: () => Date.now() }};\n",
            "globalThis.crypto = globalThis.crypto ?? {{\n",
            "  getRandomValues(view) {{\n",
            "    for (let i = 0; i < view.length; i += 1) view[i] = Math.floor(Math.random() * 256);\n",
            "    return view;\n",
            "  }},\n",
            "}};\n",
            "let __pulseqTimerId = 0;\n",
            "const __pulseqTimers = new Map();\n",
            "globalThis.setTimeout = (callback, _delay = 0, ...args) => {{\n",
            "  const id = ++__pulseqTimerId;\n",
            "  __pulseqTimers.set(id, true);\n",
            "  queueMicrotask(() => {{\n",
            "    if (!__pulseqTimers.has(id)) return;\n",
            "    __pulseqTimers.delete(id);\n",
            "    callback(...args);\n",
            "  }});\n",
            "  return id;\n",
            "}};\n",
            "globalThis.clearTimeout = (id) => {{ __pulseqTimers.delete(id); }};\n",
            "globalThis.setInterval = globalThis.setTimeout;\n",
            "globalThis.clearInterval = globalThis.clearTimeout;\n",
            "globalThis.btoa = globalThis.btoa ?? ((value) => __denoCore.ops.op_pulseq_btoa(String(value)));\n",
            "globalThis.atob = globalThis.atob ?? ((value) => __denoCore.ops.op_pulseq_atob(String(value)));\n",
            "globalThis.URL = class URL {{\n",
            "  constructor(input, base) {{\n",
            "    this.href = __denoCore.ops.op_pulseq_resolve_url(String(input), String(base ?? globalThis.location ?? ''));\n",
            "  }}\n",
            "  toString() {{ return this.href; }}\n",
            "}};\n",
            "globalThis.location = {pyodide_module_url};\n",
            "globalThis.WebAssembly.instantiateStreaming = async (responsePromise, imports) => {{\n",
            "  const response = await responsePromise;\n",
            "  const bytes = new Uint8Array(await response.arrayBuffer());\n",
            "  return await WebAssembly.instantiate(bytes, imports);\n",
            "}};\n",
            "globalThis.fetch = async (input) => {{\n",
            "  const url = new URL(typeof input === 'string' ? input : input.toString(), globalThis.location);\n",
            "  const bytes = __denoCore.ops.op_pulseq_read_file_bytes(url.toString());\n",
            "  const text = () => __denoCore.ops.op_pulseq_read_file_text(url.toString());\n",
            "  return {{\n",
            "    ok: true,\n",
            "    status: 200,\n",
            "    statusText: 'OK',\n",
            "    url: url.toString(),\n",
            "    headers: {{ get(name) {{ return null; }} }},\n",
            "    async arrayBuffer() {{\n",
            "      return bytes.slice().buffer;\n",
            "    }},\n",
            "    async text() {{\n",
            "      return text();\n",
            "    }},\n",
            "    async json() {{\n",
            "      return JSON.parse(await this.text());\n",
            "    }},\n",
            "  }};\n",
            "}};\n",
            "globalThis.__pulseqNativeBootstrap = {{\n",
            "  assetOrigin: {asset_origin},\n",
            "  pyodideRootUrl: {pyodide_root_url},\n",
            "  pyodideModuleUrl: {pyodide_module_url},\n",
            "  request: JSON.parse({request_json_literal}),\n",
            "  mounts: [\n",
            "{mounts}\n",
            "  ],\n",
            "}};\n",
            "const request = globalThis.__pulseqNativeBootstrap.request;\n",
            "const __pulseqNativeBasename = (value) => String(value).split(/[\\\\/]/).pop() || 'script.py';\n",
            "const __pulseqStageEmbeddedPrefix = (pyodide, assetPrefix, targetRoot) => {{\n",
            "  const files = JSON.parse(__denoCore.ops.op_pulseq_list_embedded_files(assetPrefix));\n",
            "  for (const assetPath of files) {{\n",
            "    const relativePath = assetPath.slice(assetPrefix.length).replace(/^\\/+/, '');\n",
            "    const targetPath = relativePath ? (targetRoot + '/' + relativePath) : targetRoot;\n",
            "    const lastSlash = targetPath.lastIndexOf('/');\n",
            "    if (lastSlash > 0) {{\n",
            "      pyodide.FS.mkdirTree(targetPath.slice(0, lastSlash));\n",
            "    }}\n",
            "    const bytes = __denoCore.ops.op_pulseq_read_file_bytes(globalThis.__pulseqNativeBootstrap.assetOrigin + assetPath);\n",
            "    pyodide.FS.writeFile(targetPath, bytes);\n",
            "  }}\n",
            "}};\n",
            "const __pulseqStageTree = (pyodide, hostRoot, targetRoot) => {{\n",
            "  pyodide.FS.mkdirTree(targetRoot);\n",
            "  let entries;\n",
            "  try {{\n",
            "    entries = JSON.parse(__denoCore.ops.op_pulseq_list_dir(hostRoot));\n",
            "  }} catch (error) {{\n",
            "    __pulseqLog('info', 'Skipping unreadable directory ' + hostRoot + ': ' + error);\n",
            "    return;\n",
            "  }}\n",
            "  for (const entry of entries) {{\n",
            "    const targetPath = targetRoot + '/' + entry.name;\n",
            "    if (entry.isDir) {{\n",
            "      __pulseqStageTree(pyodide, entry.path, targetPath);\n",
            "    }} else if (entry.isFile) {{\n",
            "      const bytes = __denoCore.ops.op_pulseq_read_file_bytes(entry.path);\n",
            "      pyodide.FS.writeFile(targetPath, bytes);\n",
            "    }} else {{\n",
            "      __pulseqLog('info', 'Skipping unsupported filesystem entry ' + entry.path);\n",
            "    }}\n",
            "  }}\n",
            "}};\n",
            "const __pulseqStagePath = (pyodide, hostPath, targetRoot) => {{\n",
            "  try {{\n",
            "    const entries = JSON.parse(__denoCore.ops.op_pulseq_list_dir(hostPath));\n",
            "    for (const entry of entries) {{\n",
            "      const nestedTarget = targetRoot + '/' + entry.name;\n",
            "      if (entry.isDir) {{\n",
            "        __pulseqStageTree(pyodide, entry.path, nestedTarget);\n",
            "      }} else if (entry.isFile) {{\n",
            "        const bytes = __denoCore.ops.op_pulseq_read_file_bytes(entry.path);\n",
            "        pyodide.FS.writeFile(nestedTarget, bytes);\n",
            "      }}\n",
            "    }}\n",
            "    return;\n",
            "  }} catch (_error) {{\n",
            "  }}\n",
            "  const name = __pulseqNativeBasename(hostPath);\n",
            "  const targetPath = targetRoot + '/' + name;\n",
            "  const bytes = __denoCore.ops.op_pulseq_read_file_bytes(hostPath);\n",
            "  pyodide.FS.writeFile(targetPath, bytes);\n",
            "}};\n",
            "globalThis.__pybridge = {{\n",
            "  log(payload) {{\n",
            "    __denoCore.ops.op_pulseq_log(String(payload.stream ?? 'stdout'), String(payload.text ?? ''));\n",
            "  }},\n",
            "  openPlot(payload) {{\n",
            "    const index = Number(payload.figureIndex ?? 0) + 1;\n",
            "    const filename = 'figure' + index + '.png';\n",
            "    __denoCore.ops.op_pulseq_write_output_base64(filename, String(payload.data ?? ''));\n",
            "  }},\n",
            "  downloadSeq(payload) {{\n",
            "    __denoCore.ops.op_pulseq_write_output_text(String(payload.filename ?? 'sequence.seq'), String(payload.content ?? ''));\n",
            "  }},\n",
            "  preferredPlotFormat() {{\n",
            "    return 'png';\n",
            "  }},\n",
            "}};\n",
            "const pyodideModule = await import({pyodide_module_url});\n",
            "if (typeof pyodideModule.loadPyodide !== \"function\") {{\n",
            "  throw new Error(\"loadPyodide export not found in staged pyodide.mjs\");\n",
            "}}\n",
            "const lockFile = await fetch(new URL('pyodide-lock.json', {pyodide_root_url})).then((response) => response.json());\n",
            "const pyodide = await pyodideModule.loadPyodide({{\n",
            "  indexURL: {pyodide_root_url},\n",
            "  packageBaseUrl: {pyodide_root_url},\n",
            "  lockFileContents: lockFile,\n",
            "  stdout: request.verbose ? ((text) => __denoCore.ops.op_pulseq_log('stdout', String(text) + '\\n')) : (() => {{}}),\n",
            "  stderr: request.verbose ? ((text) => __denoCore.ops.op_pulseq_log('stderr', String(text) + '\\n')) : (() => {{}}),\n",
            "}});\n",
            "if (typeof pyodide.runPython !== 'function') {{\n",
            "  throw new Error('Pyodide runPython API is unavailable in native host');\n",
            "}}\n",
            "await pyodide.loadPackage(['numpy', 'matplotlib', 'scipy']);\n",
            "for (const mount of globalThis.__pulseqNativeBootstrap.mounts) {{\n",
            "  __pulseqStageEmbeddedPrefix(pyodide, mount.assetPrefix, mount.target);\n",
            "}}\n",
            "const workspaceRoot = '/workspace';\n",
            "pyodide.FS.mkdirTree(workspaceRoot);\n",
            "for (const copyPath of (request.copyPaths ?? [])) {{\n",
            "  __pulseqStagePath(pyodide, copyPath, workspaceRoot);\n",
            "}}\n",
            "const scriptTargetPath = workspaceRoot + '/' + __pulseqNativeBasename(request.scriptPath);\n",
            "const scriptText = __denoCore.ops.op_pulseq_read_file_text(request.scriptPath);\n",
            "pyodide.FS.writeFile(scriptTargetPath, scriptText, {{ encoding: 'utf8' }});\n",
            "const adjustedRequest = {{\n",
            "  ...request,\n",
            "  scriptPath: scriptTargetPath,\n",
            "  workingDirectory: workspaceRoot,\n",
            "}};\n",
            "pyodide.globals.set('__pulseq_native_request_json__', JSON.stringify(adjustedRequest));\n",
            "pyodide.runPython({python_entrypoint});\n",
            "__pulseqLog('info', 'Native execution finished');\n"
        ),
        asset_origin = js_string(EMBEDDED_RUNTIME_ORIGIN),
        pyodide_root_url = js_string(&pyodide_root_url),
        pyodide_module_url = js_string(&pyodide_module_url),
        request_json_literal = js_string(request_json),
        python_entrypoint = js_string(
            concat!(
                "import sys\n",
                "for _path in ['/app/python_runtime', '/app/python_packages']:\n",
                "    if _path not in sys.path:\n",
                "        sys.path.insert(0, _path)\n",
                "from pypulseq_runtime.native_runner import run_native_request_json\n",
                "run_native_request_json(__pulseq_native_request_json__, namespace=globals())\n"
            ),
        ),
        mounts = mount_lines,
    )
}

fn entry_module_specifier() -> Result<ModuleSpecifier, String> {
    ModuleSpecifier::parse(&embedded_asset_url("__pulseq_native_entry.js"))
    .map_err(|error| format!("failed to build native entry module specifier: {error}"))
}

fn specifier_to_path(specifier: &str) -> Result<std::path::PathBuf, String> {
    if let Ok(url) = ModuleSpecifier::parse(specifier) {
        if url.scheme() == "file" {
            return url
                .to_file_path()
                .map_err(|_| format!("failed to convert file URL to path: {specifier}"));
        }
    }

    Ok(std::path::PathBuf::from(specifier))
}

fn js_string(value: &str) -> String {
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

fn ensure_trailing_slash(value: &str) -> String {
    if value.ends_with('/') {
        value.to_string()
    } else {
        format!("{value}/")
    }
}

#[derive(Debug)]
struct EmbeddedModuleLoader {
    embedded_runtime: EmbeddedRuntime,
}

impl EmbeddedModuleLoader {
    fn new(embedded_runtime: EmbeddedRuntime) -> Self {
        Self { embedded_runtime }
    }
}

impl ModuleLoader for EmbeddedModuleLoader {
    fn resolve(
        &self,
        specifier: &str,
        referrer: &str,
        _kind: ResolutionKind,
    ) -> Result<ModuleSpecifier, ModuleLoaderError> {
        if referrer.is_empty() {
            return ModuleSpecifier::parse(specifier).map_err(|error| {
                ModuleLoaderError::from(std::io::Error::other(format!(
                    "failed to parse module specifier {specifier}: {error}"
                )))
            });
        }

        resolve_import(specifier, referrer).map_err(ModuleLoaderError::from)
    }

    fn load(
        &self,
        module_specifier: &ModuleSpecifier,
        maybe_referrer: Option<&ModuleSpecifier>,
        _is_dyn_import: bool,
        _requested_module_type: RequestedModuleType,
    ) -> ModuleLoadResponse {
        let Some(relative_path) = embedded_asset_path_from_specifier(module_specifier.as_str()) else {
            return ModuleLoadResponse::Sync(Err(ModuleLoaderError::Unsupported {
                specifier: Box::new(module_specifier.clone()),
                maybe_referrer: maybe_referrer.map(|referrer| Box::new(referrer.clone())),
            }));
        };

        let source = match self.embedded_runtime.file_text(&relative_path) {
            Ok(source) => source,
            Err(_) => return ModuleLoadResponse::Sync(Err(ModuleLoaderError::NotFound)),
        };

        ModuleLoadResponse::Sync(Ok(ModuleSource::new(
            ModuleType::JavaScript,
            ModuleSourceCode::String(source.to_string().into()),
            module_specifier,
            None,
        )))
    }
}
