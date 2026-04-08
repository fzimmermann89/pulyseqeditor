import type { DownloadPayload, LogPayload, PlotPayload } from "../types";
import { dispatchLog, dispatchPlot, dispatchDownload } from "./bridge";

type PyodidePhase =
  | "idle"
  | "warming"
  | "loading-runtime"
  | "loading-packages"
  | "loading-pypulseq"
  | "installing-bootstrap"
  | "ready"
  | "error";

type PyodideStatus = {
  detail: string;
  phase: PyodidePhase;
};

type WorkerOutMessage =
  | { type: "status"; phase: PyodidePhase; detail: string }
  | { type: "log"; payload: LogPayload }
  | { type: "plot"; payload: PlotPayload }
  | { type: "download"; payload: DownloadPayload }
  | { type: "run-complete" }
  | { type: "run-error"; message: string };

let worker: Worker | null = null;
let warmStarted = false;
let currentStatus: PyodideStatus = { phase: "idle", detail: "Idle" };
const statusListeners = new Set<(status: PyodideStatus) => void>();

let runResolve: (() => void) | null = null;
let runReject: ((err: Error) => void) | null = null;

function updateStatus(status: PyodideStatus) {
  currentStatus = status;
  for (const listener of statusListeners) {
    listener(status);
  }
}

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./pyodide.worker.ts", import.meta.url), { type: "module" });
    worker.addEventListener("message", handleWorkerMessage);
  }
  return worker;
}

function handleWorkerMessage(event: MessageEvent<WorkerOutMessage>) {
  const msg = event.data;
  switch (msg.type) {
    case "status":
      updateStatus({ phase: msg.phase, detail: msg.detail });
      break;
    case "log":
      dispatchLog(msg.payload);
      break;
    case "plot":
      dispatchPlot(msg.payload);
      break;
    case "download":
      dispatchDownload(msg.payload);
      break;
    case "run-complete":
      runResolve?.();
      runResolve = null;
      runReject = null;
      break;
    case "run-error":
      runReject?.(new Error(msg.message));
      runResolve = null;
      runReject = null;
      break;
  }
}

export function subscribePyodideStatus(listener: (status: PyodideStatus) => void) {
  statusListeners.add(listener);
  listener(currentStatus);
  return () => statusListeners.delete(listener);
}

export function warmPyodide() {
  if (warmStarted) return;
  warmStarted = true;
  updateStatus({ phase: "warming", detail: "Preparing Python runtime in background" });
  getWorker().postMessage({ type: "warm" });
}

export function executePython(code: string): Promise<void> {
  return new Promise((resolve, reject) => {
    runResolve = resolve;
    runReject = reject;
    getWorker().postMessage({ type: "run", code });
  });
}
