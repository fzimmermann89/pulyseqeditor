import { loadPyodide } from "pyodide";
import bootstrapSource from "../py/bootstrap.py?raw";
import loadPypulseqSource from "../py/load_pypulseq.py?raw";

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

const PRE_RUN = `
import io
import traceback
import matplotlib.pyplot as plt
from pyodide.ffi import to_js

_pybridge_state["show_called"] = False
plt.close("all")
`;

const USER_RUN = `
import traceback
import matplotlib.pyplot as plt

try:
    exec(__user_code__, globals(), globals())
    if not _pybridge_state.get("show_called", False):
        _export_open_figures()
except Exception:
    traceback.print_exc()
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

let pyodidePromise: Promise<PyodideInterface> | null = null;

async function initializePyodide(): Promise<PyodideInterface> {
  postStatus("loading-runtime", "Loading Python runtime");
  const pyodide = (await loadPyodide({ indexURL: `${PYODIDE_BASE}/` })) as unknown as PyodideInterface;

  postStatus("loading-packages", "Loading NumPy, matplotlib, and SciPy");
  await pyodide.loadPackage(["numpy", "matplotlib", "scipy"]);

  postStatus("loading-pypulseq", "Loading pypulseq");
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
