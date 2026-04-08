import { loadPyodide } from "pyodide";
import bootstrapSource from "../py/bootstrap.py?raw";
import loadPypulseqSource from "../py/load_pypulseq.py?raw";
import runtimeInitSource from "../python_runtime/pypulseq_runtime/__init__.py?raw";
import runtimeBridgeApiSource from "../python_runtime/pypulseq_runtime/bridge_api.py?raw";
import runtimeExecutionSource from "../python_runtime/pypulseq_runtime/execution.py?raw";
import runtimeHostSource from "../python_runtime/pypulseq_runtime/host.py?raw";
import runtimePatchMatplotlibSource from "../python_runtime/pypulseq_runtime/patch_matplotlib.py?raw";
import runtimePatchPypulseqSource from "../python_runtime/pypulseq_runtime/patch_pypulseq.py?raw";
import runtimeRuntimeSource from "../python_runtime/pypulseq_runtime/runtime.py?raw";
import runtimeWebHostSource from "../python_runtime/pypulseq_runtime/web_host.py?raw";
import runtimeWebBootstrapSource from "../python_runtime/pypulseq_runtime/web_bootstrap.py?raw";

type PyodideInterface = {
  FS: {
    mkdirTree: (path: string) => void;
    writeFile: (path: string, data: string | Uint8Array, options?: { encoding?: string }) => void;
  };
  globals: unknown;
  loadPackage: (names: string | string[]) => Promise<void>;
  runPythonAsync: (code: string) => Promise<unknown>;
};

type WorkerMessage =
  | { type: "warm" }
  | { type: "run"; code: string };

const BASE_URL = import.meta.env.BASE_URL;
const PYODIDE_BASE = `${BASE_URL}pyodide/pyodide`;
const PYTHON_PACKAGES_FS_ROOT = "/app/python_packages";
const PYTHON_PACKAGES_ARCHIVE_PUBLIC_PATH = `${BASE_URL}python_packages.zip`;
const PYTHON_PACKAGES_ARCHIVE_FS_PATH = "/app/python_packages.zip";
const SHARED_RUNTIME_ROOT = "/app/pypulseq_runtime";

const SHARED_RUNTIME_FILES = [
  { path: `${SHARED_RUNTIME_ROOT}/__init__.py`, source: runtimeInitSource },
  { path: `${SHARED_RUNTIME_ROOT}/bridge_api.py`, source: runtimeBridgeApiSource },
  { path: `${SHARED_RUNTIME_ROOT}/execution.py`, source: runtimeExecutionSource },
  { path: `${SHARED_RUNTIME_ROOT}/host.py`, source: runtimeHostSource },
  { path: `${SHARED_RUNTIME_ROOT}/patch_matplotlib.py`, source: runtimePatchMatplotlibSource },
  { path: `${SHARED_RUNTIME_ROOT}/patch_pypulseq.py`, source: runtimePatchPypulseqSource },
  { path: `${SHARED_RUNTIME_ROOT}/runtime.py`, source: runtimeRuntimeSource },
  { path: `${SHARED_RUNTIME_ROOT}/web_host.py`, source: runtimeWebHostSource },
  { path: `${SHARED_RUNTIME_ROOT}/web_bootstrap.py`, source: runtimeWebBootstrapSource },
] as const;

const PRE_RUN = `
from pypulseq_runtime.execution import reset_run_state

reset_run_state(_pybridge_state)
`;

const USER_RUN = `
from pypulseq_runtime.execution import execute_user_code

execute_user_code(__user_code__, globals(), _pybridge_state, _export_open_figures)
`;

// Typed handle to the worker global for postMessage and custom properties
const ctx = self as unknown as {
  postMessage: (msg: unknown) => void;
  addEventListener: (type: string, handler: (e: MessageEvent) => void) => void;
  __pybridge: Record<string, unknown>;
};

// Bridge functions that Python calls via js.__pybridge -- forward to main thread
ctx.__pybridge = {
  log(payload: { stream: string; text: string }) {
    ctx.postMessage({ type: "log", payload: { stream: payload.stream, text: payload.text } });
  },
  openPlot(payload: { figureIndex: number; title: string; mime: string; data: string }) {
    ctx.postMessage({
      type: "plot",
      payload: {
        figureIndex: payload.figureIndex,
        title: payload.title,
        mime: payload.mime,
        data: payload.data,
      },
    });
  },
  downloadSeq(payload: { filename: string; content: string; mime?: string }) {
    ctx.postMessage({
      type: "download",
      payload: { filename: payload.filename, content: payload.content, mime: payload.mime },
    });
  },
};

function postStatus(phase: string, detail: string) {
  ctx.postMessage({ type: "status", phase, detail });
}

function setGlobal(pyodide: PyodideInterface, name: string, value: unknown) {
  const globalsProxy = pyodide.globals as { set: (key: string, v: unknown) => void };
  globalsProxy.set(name, value);
}

async function loadBytes(path: string) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${path}: ${response.status} ${response.statusText}`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    throw new Error(`Expected binary asset at ${path}, but received HTML instead.`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

function stageSharedRuntime(pyodide: PyodideInterface) {
  pyodide.FS.mkdirTree(SHARED_RUNTIME_ROOT);
  for (const file of SHARED_RUNTIME_FILES) {
    pyodide.FS.writeFile(file.path, file.source, { encoding: "utf8" });
  }
}

let pyodidePromise: Promise<PyodideInterface> | null = null;

async function initializePyodide(): Promise<PyodideInterface> {
  postStatus("loading-runtime", "Loading Python runtime");
  const pyodide = (await loadPyodide({ indexURL: `${PYODIDE_BASE}/` })) as unknown as PyodideInterface;

  postStatus("loading-packages", "Loading NumPy, matplotlib, and SciPy");
  await pyodide.loadPackage(["numpy", "matplotlib", "scipy"]);

  postStatus("loading-pypulseq", "Loading pypulseq");
  stageSharedRuntime(pyodide);
  pyodide.FS.mkdirTree(PYTHON_PACKAGES_FS_ROOT);
  const archiveBytes = await loadBytes(PYTHON_PACKAGES_ARCHIVE_PUBLIC_PATH);
  pyodide.FS.writeFile(PYTHON_PACKAGES_ARCHIVE_FS_PATH, archiveBytes);
  await pyodide.runPythonAsync(loadPypulseqSource);

  postStatus("installing-bootstrap", "Installing Python runtime patches");
  await pyodide.runPythonAsync(bootstrapSource);

  postStatus("ready", "Runtime ready");
  return pyodide;
}

function getPyodide(): Promise<PyodideInterface> {
  pyodidePromise ??= initializePyodide();
  return pyodidePromise;
}

async function handleRun(code: string) {
  try {
    const pyodide = await getPyodide();
    await pyodide.runPythonAsync(PRE_RUN);
    setGlobal(pyodide, "__user_code__", code);
    await pyodide.runPythonAsync(USER_RUN);
    ctx.postMessage({ type: "run-complete" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.postMessage({ type: "run-error", message });
  }
}

ctx.addEventListener("message", (event: MessageEvent<WorkerMessage>) => {
  const msg = event.data;
  switch (msg.type) {
    case "warm":
      postStatus("warming", "Preparing Python runtime in background");
      getPyodide().catch((err) => {
        postStatus("error", err instanceof Error ? err.message : String(err));
      });
      break;
    case "run":
      handleRun(msg.code);
      break;
  }
});
