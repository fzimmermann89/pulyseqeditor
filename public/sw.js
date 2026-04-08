const CACHE_NAME = "pypulseq-shell-v3";
const BASE_URL = new URL(self.registration.scope).toString();
const withBase = (relativePath) => new URL(relativePath, BASE_URL).toString();
const APP_SHELL = ["./", "manifest.webmanifest", "pulseq-icon.png", "pwa-192.png", "pwa-512.png", "logo.png"];
const PYODIDE_RUNTIME = [
  "python_packages.zip",
  "pyodide/pyodide/pyodide.mjs",
  "pyodide/pyodide/pyodide.asm.js",
  "pyodide/pyodide/pyodide.asm.wasm",
  "pyodide/pyodide/pyodide-lock.json",
  "pyodide/pyodide/python_stdlib.zip",
  "pyodide/pyodide/libopenblas-0.3.26.zip",
  "pyodide/pyodide/numpy-2.2.5-cp313-cp313-pyodide_2025_0_wasm32.whl",
  "pyodide/pyodide/scipy-1.14.1-cp313-cp313-pyodide_2025_0_wasm32.whl",
  "pyodide/pyodide/matplotlib-3.8.4-cp313-cp313-pyodide_2025_0_wasm32.whl",
  "pyodide/pyodide/pillow-11.3.0-cp313-cp313-pyodide_2025_0_wasm32.whl",
  "pyodide/pyodide/contourpy-1.3.1-cp313-cp313-pyodide_2025_0_wasm32.whl",
  "pyodide/pyodide/cycler-0.12.1-py3-none-any.whl",
  "pyodide/pyodide/fonttools-4.56.0-py3-none-any.whl",
  "pyodide/pyodide/kiwisolver-1.4.8-cp313-cp313-pyodide_2025_0_wasm32.whl",
  "pyodide/pyodide/packaging-24.2-py3-none-any.whl",
  "pyodide/pyodide/pyparsing-3.2.1-py3-none-any.whl",
  "pyodide/pyodide/python_dateutil-2.9.0.post0-py2.py3-none-any.whl",
  "pyodide/pyodide/pytz-2025.2-py2.py3-none-any.whl",
  "pyodide/pyodide/six-1.17.0-py2.py3-none-any.whl"
];

async function cacheUrls(urls) {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(urls.map((url) => withBase(url)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    cacheUrls([...APP_SHELL, ...PYODIDE_RUNTIME]),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        const url = new URL(event.request.url);
        if (url.origin === self.location.origin) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return networkResponse;
      }).catch(async () => {
        if (event.request.mode === "navigate") {
          return caches.match(withBase("./"));
        }
        throw new Error(`Offline and not cached: ${event.request.url}`);
      });
    }),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "cache-urls" || !Array.isArray(event.data.urls)) {
    return;
  }

  event.waitUntil(cacheUrls(event.data.urls));
});
