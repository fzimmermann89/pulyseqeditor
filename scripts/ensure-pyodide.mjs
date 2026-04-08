import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const pyodidePackageJsonPath = path.join(appRoot, "node_modules", "pyodide", "package.json");
const publicPyodideRoot = path.join(appRoot, "public", "pyodide");
const versionMarkerPath = path.join(publicPyodideRoot, ".version");
const cacheDir = path.join(appRoot, ".cache");

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
  const expectedPyodideModule = path.join(publicPyodideRoot, "pyodide", "pyodide.mjs");

  if (await fileExists(expectedPyodideModule)) {
    if (await fileExists(versionMarkerPath)) {
      const currentVersion = (await readFile(versionMarkerPath, "utf8")).trim();
      if (currentVersion === version) {
        console.log(`Pyodide ${version} already present in public assets.`);
        return;
      }
    } else {
      await writeFile(versionMarkerPath, `${version}\n`, "utf8");
      console.log(`Adopted existing Pyodide ${version} assets in public/.`);
      return;
    }
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
  await writeFile(versionMarkerPath, `${version}\n`, "utf8");
  console.log(`Prepared Pyodide ${version} in ${publicPyodideRoot}`);
}

ensurePyodide().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
