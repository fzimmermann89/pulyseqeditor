use pypulseq_native_core::assets::RuntimePaths;

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let executable_path = std::env::current_exe()
        .map_err(|error| format!("failed to resolve current executable path: {error}"))?;
    let runtime_paths = RuntimePaths::locate_from_executable(executable_path)?;
    runtime_paths.validate_for_gui()?;

    launch_gui(runtime_paths)
}

#[cfg(not(target_os = "windows"))]
fn launch_gui(runtime_paths: RuntimePaths) -> Result<(), String> {
    println!("{}", pypulseq_native_core::banner("gui"));
    println!("runtime root: {}", runtime_paths.root.display());
    println!("runtime manifest: {}", runtime_paths.manifest_path.display());
    println!("pyodide dir: {}", runtime_paths.pyodide_dir.display());
    println!("python packages dir: {}", runtime_paths.python_packages_dir.display());
    println!(
        "shared python runtime dir: {}",
        runtime_paths.python_runtime_dir.display()
    );
    println!("gui assets dir: {}", runtime_paths.gui_dir.display());
    println!("GUI host is only implemented on Windows.");
    Ok(())
}

#[cfg(target_os = "windows")]
fn launch_gui(runtime_paths: RuntimePaths) -> Result<(), String> {
    use std::borrow::Cow;
    use std::path::{Path, PathBuf};

    use wry::application::event::{Event, WindowEvent};
    use wry::application::event_loop::{ControlFlow, EventLoop};
    use wry::application::window::WindowBuilder;
    use wry::http::header::{CONTENT_TYPE, HeaderValue};
    use wry::http::{Response, StatusCode};
    use wry::webview::WebViewBuilder;

    fn mime_for(path: &Path) -> &'static str {
        match path.extension().and_then(|ext| ext.to_str()).unwrap_or_default() {
            "html" => "text/html; charset=utf-8",
            "js" => "text/javascript; charset=utf-8",
            "mjs" => "text/javascript; charset=utf-8",
            "css" => "text/css; charset=utf-8",
            "json" => "application/json; charset=utf-8",
            "webmanifest" => "application/manifest+json; charset=utf-8",
            "png" => "image/png",
            "svg" => "image/svg+xml",
            "wasm" => "application/wasm",
            "woff" => "font/woff",
            "woff2" => "font/woff2",
            "zip" => "application/zip",
            "whl" => "application/octet-stream",
            _ => "application/octet-stream",
        }
    }

    fn resolve_request_path(runtime_paths: &RuntimePaths, path: &str) -> PathBuf {
        let trimmed = path.trim_start_matches('/');
        if trimmed.is_empty() {
            return runtime_paths.gui_index_html.clone();
        }
        if trimmed.starts_with("pyodide/") || trimmed == "python_packages.zip" {
            return runtime_paths.root.join(trimmed);
        }
        runtime_paths.gui_dir.join(trimmed)
    }

    fn response_from_path(path: &Path) -> Response<Cow<'static, [u8]>> {
        match std::fs::read(path) {
            Ok(bytes) => {
                let mut response = Response::new(Cow::Owned(bytes));
                *response.status_mut() = StatusCode::OK;
                response.headers_mut().insert(
                    CONTENT_TYPE,
                    HeaderValue::from_static(mime_for(path)),
                );
                response
            }
            Err(_) => {
                let mut response =
                    Response::new(Cow::Borrowed(b"Not found" as &'static [u8]));
                *response.status_mut() = StatusCode::NOT_FOUND;
                response.headers_mut().insert(
                    CONTENT_TYPE,
                    HeaderValue::from_static("text/plain; charset=utf-8"),
                );
                response
            }
        }
    }

    let event_loop = EventLoop::new();
    let window = WindowBuilder::new()
        .with_title("pypulseq")
        .build(&event_loop)
        .map_err(|error| format!("failed to create GUI window: {error}"))?;

    let protocol_runtime = runtime_paths.clone();
    let _webview = WebViewBuilder::new(window)
        .map_err(|error| format!("failed to create WebView builder: {error}"))?
        .with_custom_protocol("pypulseq".into(), move |request| {
            Ok::<_, Box<dyn std::error::Error>>(response_from_path(&resolve_request_path(
                &protocol_runtime,
                request.uri().path(),
            )))
        })
        .with_url("pypulseq://app/index.html")
        .map_err(|error| format!("failed to configure GUI URL: {error}"))?
        .build()
        .map_err(|error| format!("failed to build GUI WebView: {error}"))?;

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;
        if let Event::WindowEvent {
            event: WindowEvent::CloseRequested,
            ..
        } = event
        {
            *control_flow = ControlFlow::Exit;
        }
    });
}
