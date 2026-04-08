import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const packageJsonPath = path.join(appRoot, "package.json");
const cacheDir = path.join(appRoot, ".cache");
const extractRoot = path.join(cacheDir, "pypulseq-src");

async function readPinnedPypulseq() {
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  const version = packageJson.pypulseq?.version;
  const repo = packageJson.pypulseq?.repo;
  if (!version || !repo) {
    throw new Error("Missing pypulseq.version or pypulseq.repo in package.json");
  }
  return {
    version,
    repo,
    archivePath: path.join(cacheDir, `pypulseq-${version}.tar.gz`),
    sourceRoot: path.join(extractRoot, "source"),
    versionMarkerPath: path.join(extractRoot, ".version"),
    downloadUrl: `${repo}/archive/refs/tags/v${version}.tar.gz`,
  };
}

async function fileExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function ensurePypulseq() {
  const pinned = await readPinnedPypulseq();
  const packageDir = path.join(pinned.sourceRoot, "src", "pypulseq");
  const initPath = path.join(packageDir, "__init__.py");

  if (await fileExists(initPath)) {
    if (await fileExists(pinned.versionMarkerPath)) {
      const currentVersion = (await readFile(pinned.versionMarkerPath, "utf8")).trim();
      if (currentVersion === pinned.version) {
        console.log(`pypulseq ${pinned.version} already present in cache.`);
        return;
      }
    } else {
      await writeFile(pinned.versionMarkerPath, `${pinned.version}\n`, "utf8");
      console.log(`Adopted existing pypulseq ${pinned.version} source cache.`);
      return;
    }
  }

  await mkdir(cacheDir, { recursive: true });

  if (!(await fileExists(pinned.archivePath))) {
    console.log(`Downloading pypulseq ${pinned.version}...`);
    await execFileAsync("curl", ["-L", pinned.downloadUrl, "-o", pinned.archivePath]);
  } else {
    console.log(`Using cached pypulseq archive pypulseq-${pinned.version}.tar.gz.`);
  }

  await rm(extractRoot, { recursive: true, force: true });
  await mkdir(pinned.sourceRoot, { recursive: true });
  console.log(`Extracting pypulseq ${pinned.version}...`);
  await execFileAsync("tar", ["-xzf", pinned.archivePath, "--strip-components=1", "-C", pinned.sourceRoot]);
  await writeFile(pinned.versionMarkerPath, `${pinned.version}\n`, "utf8");
  console.log(`Prepared pypulseq ${pinned.version} in ${pinned.sourceRoot}`);
}

ensurePypulseq().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
