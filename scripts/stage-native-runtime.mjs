import { cp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import packageJson from "../package.json" with { type: "json" };

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const publicRoot = path.join(repoRoot, "public");
const distRoot = path.join(repoRoot, "dist");
const buildPackagesRoot = path.join(repoRoot, ".cache", "python_packages");
const sharedPythonRuntimeRoot = path.join(repoRoot, "src", "python_runtime");
const nativeRoot = path.join(repoRoot, "native");
const runtimeRoot = path.join(nativeRoot, "runtime");
const guiRoot = path.join(runtimeRoot, "gui");
const pythonPackagesRoot = path.join(runtimeRoot, "python_packages");
const pythonPackagesArchivePath = path.join(runtimeRoot, "python_packages.zip");
const pythonRuntimeRoot = path.join(runtimeRoot, "python_runtime");
const manifestPath = path.join(runtimeRoot, "manifest.json");

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function copyRequired(sourcePath, targetPath) {
  if (!(await pathExists(sourcePath))) {
    throw new Error(`Missing required asset: ${sourcePath}`);
  }
  await cp(sourcePath, targetPath, { recursive: true });
}

async function writeManifest() {
  const manifest = {
    appVersion: packageJson.version,
    runtime: "pyodide",
    pyodide: {
      version: packageJson.dependencies.pyodide.replace(/^\^/, ""),
      root: "pyodide",
      entrypoint: "pyodide/pyodide/pyodide.mjs",
    },
    pypulseq: {
      version: packageJson.pypulseq.version,
      root: "python_packages",
    },
    gui: {
      root: "gui",
      entrypoint: "gui/index.html",
    },
    pythonRuntime: {
      root: "python_runtime",
      packageRoot: "python_runtime/pypulseq_runtime",
      nativeEntrypoint: "python_runtime/pypulseq_runtime/native_runner.py",
    },
  };

  await writeFile(`${manifestPath}`, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function main() {
  await rm(runtimeRoot, { recursive: true, force: true });
  await mkdir(runtimeRoot, { recursive: true });
  await mkdir(guiRoot, { recursive: true });
  await mkdir(pythonPackagesRoot, { recursive: true });
  await mkdir(pythonRuntimeRoot, { recursive: true });

  await copyRequired(path.join(publicRoot, "pyodide"), path.join(runtimeRoot, "pyodide"));
  await copyRequired(buildPackagesRoot, pythonPackagesRoot);
  await copyRequired(path.join(publicRoot, "python_packages.zip"), pythonPackagesArchivePath);
  await copyRequired(distRoot, guiRoot);
  await copyRequired(sharedPythonRuntimeRoot, pythonRuntimeRoot);
  await rm(path.join(guiRoot, "pyodide"), { recursive: true, force: true });
  await rm(path.join(guiRoot, "python_packages"), { recursive: true, force: true });
  await rm(path.join(guiRoot, "python_packages.zip"), { force: true });
  await writeManifest();

  console.log(`Staged native runtime into ${runtimeRoot}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
