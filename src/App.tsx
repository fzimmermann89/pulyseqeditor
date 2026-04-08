import { useEffect, useState, useCallback } from "react";
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
    <div className="app-layout">
      <Header
        status={status}
        busy={busy}
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
    </div>
  );
}
