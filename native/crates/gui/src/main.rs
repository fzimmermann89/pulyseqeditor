fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    launch_gui()
}

#[cfg(not(target_os = "windows"))]
fn launch_gui() -> Result<(), String> {
    println!("{}", pypulseq_native_core::banner("gui"));
    println!("runtime=embedded");
    println!("GUI host is only implemented on Windows.");
    Ok(())
}

#[cfg(target_os = "windows")]
fn launch_gui() -> Result<(), String> {
    use std::borrow::Cow;
    use std::path::Path;
    use std::sync::Arc;

    use pypulseq_native_core::assets::{EmbeddedRuntime, GUI_DIR_NAME, PYTHON_PACKAGES_ARCHIVE_NAME};
    use tao::event::{Event, WindowEvent};
    use tao::event_loop::{ControlFlow, EventLoop};
    use tao::window::WindowBuilder;
    use wry::http::header::{CONTENT_TYPE, HeaderValue};
    use wry::http::{Request, Response, StatusCode};
    use wry::WebViewBuilder;

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

    fn resolve_request_path(path: &str) -> String {
        let trimmed = path.trim_start_matches('/');
        let normalized = strip_pages_prefix(trimmed);

        if normalized == "favicon.ico" {
            return format!("{GUI_DIR_NAME}/pulseq-icon.png");
        }
        if normalized.is_empty() {
            return format!("{GUI_DIR_NAME}/index.html");
        }
        if normalized.starts_with("pyodide/") || normalized == PYTHON_PACKAGES_ARCHIVE_NAME {
            return normalized.to_string();
        }
        format!("{GUI_DIR_NAME}/{normalized}")
    }

    fn strip_pages_prefix(path: &str) -> &str {
        if let Some((_, remainder)) = path.split_once('/') {
            if should_strip_prefix(remainder) {
                return remainder;
            }
        }
        path
    }

    fn should_strip_prefix(path: &str) -> bool {
        path == "manifest.webmanifest"
            || path == "logo.png"
            || path == "pulseq-icon.png"
            || path == "pwa-192.png"
            || path == "pwa-512.png"
            || path == "sw.js"
            || path == "favicon.ico"
            || path == PYTHON_PACKAGES_ARCHIVE_NAME
            || path.starts_with("assets/")
            || path.starts_with("pyodide/")
    }

    fn response_from_path(runtime: &EmbeddedRuntime, relative_path: &str) -> Response<Cow<'static, [u8]>> {
        match runtime.file_bytes(relative_path) {
            Some(bytes) => {
                let mut response = Response::new(Cow::Borrowed(bytes));
                *response.status_mut() = StatusCode::OK;
                response.headers_mut().insert(
                    CONTENT_TYPE,
                    HeaderValue::from_static(mime_for(Path::new(relative_path))),
                );
                response
            }
            None => {
                eprintln!("GUI asset not found: {relative_path}");
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

    let embedded_runtime = Arc::new(EmbeddedRuntime::new());
    let _webview = WebViewBuilder::new()
        .with_custom_protocol("pypulseq".into(), {
            let embedded_runtime = Arc::clone(&embedded_runtime);
            move |_webview_id, request: Request<Vec<u8>>| {
                let relative_path = resolve_request_path(request.uri().path());
                response_from_path(&embedded_runtime, &relative_path)
            }
        })
        .with_ipc_handler(|request: Request<String>| {
            eprintln!("GUI IPC: {}", request.body());
        })
        .with_initialization_script(
            r#"
            window.addEventListener("error", (event) => {
              const message = event.error?.stack || event.message || "unknown window error";
              window.ipc.postMessage(`window-error:${message}`);
            });
            window.addEventListener("unhandledrejection", (event) => {
              const reason = event.reason?.stack || event.reason?.message || String(event.reason);
              window.ipc.postMessage(`unhandled-rejection:${reason}`);
            });
            const originalConsoleError = console.error.bind(console);
            console.error = (...args) => {
              try {
                window.ipc.postMessage(`console-error:${args.map((value) => String(value)).join(" ")}`);
              } catch (_) {}
              originalConsoleError(...args);
            };
            "#,
        )
        .with_url("pypulseq://localhost/index.html")
        .build(&window)
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
    })
}
