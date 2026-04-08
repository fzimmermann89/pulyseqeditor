type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
};

type PwaInstallState = {
  canInstall: boolean;
  installed: boolean;
  supported: boolean;
};

const BASE_URL = import.meta.env.BASE_URL;
const withBase = (relativePath: string) => `${BASE_URL}${relativePath}`;

const OFFLINE_RUNTIME_URLS = [
  BASE_URL,
  withBase("manifest.webmanifest"),
  withBase("pulseq-icon.png"),
  withBase("pwa-192.png"),
  withBase("pwa-512.png"),
  withBase("logo.png"),
  withBase("python_packages.zip"),
  withBase("pyodide/pyodide/pyodide.mjs"),
  withBase("pyodide/pyodide/pyodide.asm.js"),
  withBase("pyodide/pyodide/pyodide.asm.wasm"),
  withBase("pyodide/pyodide/pyodide-lock.json"),
  withBase("pyodide/pyodide/python_stdlib.zip"),
  withBase("pyodide/pyodide/libopenblas-0.3.26.zip"),
  withBase("pyodide/pyodide/numpy-2.2.5-cp313-cp313-pyodide_2025_0_wasm32.whl"),
  withBase("pyodide/pyodide/scipy-1.14.1-cp313-cp313-pyodide_2025_0_wasm32.whl"),
  withBase("pyodide/pyodide/matplotlib-3.8.4-cp313-cp313-pyodide_2025_0_wasm32.whl"),
  withBase("pyodide/pyodide/pillow-11.3.0-cp313-cp313-pyodide_2025_0_wasm32.whl"),
  withBase("pyodide/pyodide/contourpy-1.3.1-cp313-cp313-pyodide_2025_0_wasm32.whl"),
  withBase("pyodide/pyodide/cycler-0.12.1-py3-none-any.whl"),
  withBase("pyodide/pyodide/fonttools-4.56.0-py3-none-any.whl"),
  withBase("pyodide/pyodide/kiwisolver-1.4.8-cp313-cp313-pyodide_2025_0_wasm32.whl"),
  withBase("pyodide/pyodide/packaging-24.2-py3-none-any.whl"),
  withBase("pyodide/pyodide/pyparsing-3.2.1-py3-none-any.whl"),
  withBase("pyodide/pyodide/python_dateutil-2.9.0.post0-py2.py3-none-any.whl"),
  withBase("pyodide/pyodide/pytz-2025.2-py2.py3-none-any.whl"),
  withBase("pyodide/pyodide/six-1.17.0-py2.py3-none-any.whl"),
];

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
let initialized = false;

const listeners = new Set<(state: PwaInstallState) => void>();

function emitState() {
  const state: PwaInstallState = {
    canInstall: deferredPrompt !== null && !installed,
    installed,
    supported: true,
  };
  for (const listener of listeners) {
    listener(state);
  }
}

function detectStandaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

export function initializePwaInstall() {
  if (initialized) {
    return;
  }

  initialized = true;
  installed = detectStandaloneMode();

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    emitState();
  });

  window.addEventListener("appinstalled", () => {
    installed = true;
    deferredPrompt = null;
    emitState();
  });

  emitState();
}

export function subscribePwaInstall(listener: (state: PwaInstallState) => void) {
  listeners.add(listener);
  listener({
    canInstall: deferredPrompt !== null && !installed,
    installed,
    supported: true,
  });
  return () => listeners.delete(listener);
}

export async function promptPwaInstall() {
  if (!deferredPrompt) {
    return false;
  }

  const prompt = deferredPrompt;
  deferredPrompt = null;
  emitState();

  await prompt.prompt();
  const result = await prompt.userChoice;
  if (result.outcome !== "accepted") {
    deferredPrompt = prompt;
  }
  emitState();
  return result.outcome === "accepted";
}

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }
  const registration = await navigator.serviceWorker.register(`${BASE_URL}sw.js`);
  await navigator.serviceWorker.ready;
  registration.active?.postMessage({
    type: "cache-urls",
    urls: OFFLINE_RUNTIME_URLS,
  });
}
