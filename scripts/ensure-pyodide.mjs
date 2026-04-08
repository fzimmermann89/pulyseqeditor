import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, readdir, rm, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const pyodidePackageJsonPath = path.join(appRoot, "node_modules", "pyodide", "package.json");
const publicPyodideRoot = path.join(appRoot, "public", "pyodide");
const extractedPyodideRoot = path.join(publicPyodideRoot, "pyodide");
const versionMarkerPath = path.join(publicPyodideRoot, ".version");
const subsetMarkerPath = path.join(publicPyodideRoot, ".subset");
const cacheDir = path.join(appRoot, ".cache");
const ROOT_PACKAGES = ["numpy", "matplotlib", "scipy"];
const CORE_KEEP_FILES = new Set([
  "package.json",
  "pyodide-lock.json",
  "pyodide.asm.js",
  "pyodide.asm.wasm",
  "pyodide.js",
  "pyodide.mjs",
  "python_stdlib.zip",
]);

function buildSubsetMarker(version) {
  return JSON.stringify({ version, packages: ROOT_PACKAGES }, null, 2);
}

async function fileExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readInstalledPyodideVersion() {
  const packageJson = JSON.parse(await readFile(pyodidePackageJsonPath, "utf8"));
  if (!packageJson.version) {
    throw new Error("Unable to determine installed pyodide version from node_modules.");
  }
  return packageJson.version;
}

async function ensurePyodide() {
  const version = await readInstalledPyodideVersion();
  const expectedPyodideModule = path.join(extractedPyodideRoot, "pyodide.mjs");
  const expectedSubset = buildSubsetMarker(version);

  if (await fileExists(expectedPyodideModule)) {
    if ((await fileExists(versionMarkerPath)) && (await fileExists(subsetMarkerPath))) {
      const currentVersion = (await readFile(versionMarkerPath, "utf8")).trim();
      const currentSubset = (await readFile(subsetMarkerPath, "utf8")).trim();
      if (currentVersion === version && currentSubset === expectedSubset) {
        console.log(`Pyodide ${version} already present in public assets.`);
        return;
      }
    }

    console.log(`Pruning existing Pyodide ${version} assets in public/.`);
    await prunePyodide(extractedPyodideRoot);
    await writeFile(versionMarkerPath, `${version}\n`, "utf8");
    await writeFile(subsetMarkerPath, `${expectedSubset}\n`, "utf8");
    console.log(`Prepared Pyodide ${version} in ${publicPyodideRoot}`);
    return;
  }

  const archiveName = `pyodide-${version}.tar.bz2`;
  const archivePath = path.join(cacheDir, archiveName);
  const downloadUrl = `https://github.com/pyodide/pyodide/releases/download/${version}/${archiveName}`;

  await mkdir(cacheDir, { recursive: true });

  if (!(await fileExists(archivePath))) {
    console.log(`Downloading Pyodide ${version}...`);
    await execFileAsync("curl", ["-L", downloadUrl, "-o", archivePath]);
  } else {
    console.log(`Using cached Pyodide archive ${archiveName}.`);
  }

  await rm(publicPyodideRoot, { recursive: true, force: true });
  await mkdir(publicPyodideRoot, { recursive: true });
  console.log(`Extracting Pyodide ${version}...`);
  await execFileAsync("tar", ["-xjf", archivePath, "-C", publicPyodideRoot]);
  await prunePyodide(extractedPyodideRoot);
  await writeFile(versionMarkerPath, `${version}\n`, "utf8");
  await writeFile(subsetMarkerPath, `${expectedSubset}\n`, "utf8");
  console.log(`Prepared Pyodide ${version} in ${publicPyodideRoot}`);
}

async function prunePyodide(pyodideRoot) {
  const lockFilePath = path.join(pyodideRoot, "pyodide-lock.json");
  const lockFile = JSON.parse(await readFile(lockFilePath, "utf8"));
  const keepPackages = resolvePackageClosure(lockFile, ROOT_PACKAGES);
  const keepPackageFiles = new Set(
    [...keepPackages]
      .map((name) => lockFile.packages?.[name]?.file_name)
      .filter(Boolean),
  );

  const entries = await readdir(pyodideRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    if (CORE_KEEP_FILES.has(entry.name) || keepPackageFiles.has(entry.name)) {
      continue;
    }

    await unlink(path.join(pyodideRoot, entry.name));
  }
}

function resolvePackageClosure(lockFile, rootPackages) {
  const seen = new Set();
  const queue = [...rootPackages];

  while (queue.length > 0) {
    const packageName = queue.pop();
    if (seen.has(packageName)) {
      continue;
    }
    seen.add(packageName);

    const metadata = lockFile.packages?.[packageName];
    if (!metadata) {
      throw new Error(`Missing ${packageName} in pyodide-lock.json`);
    }

    for (const dependency of metadata.depends ?? []) {
      queue.push(dependency);
    }
  }

  return seen;
}

ensurePyodide().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
