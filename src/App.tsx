import { useEffect, useRef, useState, useCallback, type ChangeEvent, type DragEvent } from "react";
import { CodeEditor } from "./components/CodeEditor";
import { ConsolePanel } from "./components/ConsolePanel";
import { Header } from "./components/Header";
import defaultCode from "./examples/write_gre_label.py?raw";
import { installBridge } from "./runtime/bridge";
import { executePython } from "./runtime/execute";
import {
  initializePwaInstall,
  promptPwaInstall,
  registerServiceWorker,
  subscribePwaInstall,
} from "./runtime/pwa";
import { subscribePyodideStatus, warmPyodide } from "./runtime/pyodide";
import type { ConsoleEntry, LogPayload } from "./types";

function makeConsoleEntry(payload: LogPayload): ConsoleEntry {
  return {
    ...payload,
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  };
}

export default function App() {
  const [code, setCode] = useState(defaultCode);
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Idle");
  const [canInstallPwa, setCanInstallPwa] = useState(false);
  const [installSupported, setInstallSupported] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);

  useEffect(() => {
    installBridge({
      onLog(payload) {
        setEntries((current) => [...current, makeConsoleEntry(payload)]);
      },
    });

    const unsubscribe = subscribePyodideStatus((nextStatus) => {
      if (nextStatus.phase === "idle") return;

      if (!busy && nextStatus.phase === "ready") {
        setStatus("Ready");
      } else if (!busy && nextStatus.phase === "warming") {
        setStatus("Warming");
      } else if (!busy && nextStatus.phase === "error") {
        setStatus("Failed");
      } else if (!busy && nextStatus.phase !== "ready") {
        setStatus("Loading");
      }
    });

    initializePwaInstall();
    const unsubscribePwa = subscribePwaInstall((nextState) => {
      setCanInstallPwa(nextState.canInstall);
      setInstallSupported(nextState.supported);
    });
    void registerServiceWorker();

    const warm = () => warmPyodide();
    if ("requestIdleCallback" in window) {
      const callbackId = window.requestIdleCallback(warm, { timeout: 1500 });
      return () => {
        unsubscribe();
        unsubscribePwa();
        window.cancelIdleCallback(callbackId);
      };
    }

    const timeoutId = globalThis.setTimeout(warm, 300);
    return () => {
      unsubscribe();
      unsubscribePwa();
      globalThis.clearTimeout(timeoutId);
    };
  }, [busy]);

  const loadSourceFile = useCallback(async (file: File) => {
    const text = await file.text();
    setCode(text);
    setStatus(`Loaded ${file.name}`);
    setEntries((current) => [
      ...current,
      makeConsoleEntry({
        stream: "info",
        text: `Loaded ${file.name}\n`,
      }),
    ]);
  }, []);

  const handleOpen = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelection = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        await loadSourceFile(file);
      } finally {
        event.target.value = "";
      }
    },
    [loadSourceFile],
  );

  const handleDragEnter = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setDragActive(true);
  }, []);

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      if (!event.dataTransfer.types.includes("Files")) return;
      event.preventDefault();
      dragDepthRef.current = 0;
      setDragActive(false);
      const file = event.dataTransfer.files.item(0);
      if (!file) return;
      if (!file.name.toLowerCase().endsWith(".py")) {
        setEntries((current) => [
          ...current,
          makeConsoleEntry({
            stream: "stderr",
            text: "Only .py files can be opened.\n",
          }),
        ]);
        setStatus("Failed");
        return;
      }
      await loadSourceFile(file);
    },
    [loadSourceFile],
  );

  const handleRun = useCallback(async () => {
    setBusy(true);
    setEntries([]);
    setStatus("Running");

    try {
      await executePython(code);
      setStatus("Completed");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setEntries((current) => [
        ...current,
        makeConsoleEntry({ stream: "stderr", text: `${message}\n` }),
      ]);
      setStatus("Failed");
    } finally {
      setBusy(false);
    }
  }, [code]);

  const handleInstall = useCallback(() => {
    void promptPwaInstall();
  }, []);

  return (
    <div
      className={`app-layout${dragActive ? " app-layout-dragging" : ""}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".py,text/x-python,text/plain"
        className="hidden-file-input"
        onChange={handleFileSelection}
      />
      <Header
        status={status}
        busy={busy}
        onOpen={handleOpen}
        onRun={handleRun}
        canInstall={canInstallPwa}
        installSupported={installSupported}
        onInstall={handleInstall}
      />
      <CodeEditor
        value={code}
        onChange={setCode}
        disabled={busy}
        onRun={handleRun}
      />
      <ConsolePanel entries={entries} onClear={() => setEntries([])} />
      {dragActive ? (
        <div className="drop-overlay" aria-hidden="true">
          <div className="drop-overlay-card">Drop a Python file to open it</div>
        </div>
      ) : null}
    </div>
  );
}
