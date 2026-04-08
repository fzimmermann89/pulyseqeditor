import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const packageJsonPath = path.join(appRoot, "package.json");
const buildPackagesRoot = path.join(appRoot, ".cache", "python_packages");
const extractRoot = path.join(appRoot, ".cache", "pypulseq-src");
const targetPackageRoot = path.join(buildPackagesRoot, "pypulseq");
const archivePath = path.join(appRoot, "public", "python_packages.zip");
const execFileAsync = promisify(execFile);

const EXCLUDED_DIRS = new Set([
  "__pycache__",
  ".mypy_cache",
  ".pytest_cache",
  ".ruff_cache",
  "tests",
  "seq_examples",
]);

const EXCLUDED_FILES = new Set(["ruff.toml"]);

async function readPinnedPypulseqVersion() {
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  const version = packageJson.pypulseq?.version;
  if (!version) {
    throw new Error("Missing pypulseq.version in package.json");
  }
  return version;
}

async function readPinnedPypulseqRepo() {
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  return packageJson.pypulseq?.repo ?? "https://github.com/imr-framework/pypulseq";
}

async function fileExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function copyFilteredTree(sourceDir, targetDir) {
  await mkdir(targetDir, { recursive: true });
  const entries = await readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) {
      continue;
    }
    if (entry.isFile() && EXCLUDED_FILES.has(entry.name)) {
      continue;
    }

    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      await copyFilteredTree(sourcePath, targetPath);
      continue;
    }

    await mkdir(path.dirname(targetPath), { recursive: true });
    await cp(sourcePath, targetPath);
  }
}

async function writeDistInfo(version) {
  const distInfoDir = path.join(buildPackagesRoot, `pypulseq-${version}.dist-info`);
  await rm(distInfoDir, { recursive: true, force: true });
  await mkdir(distInfoDir, { recursive: true });

  await writeFile(
    path.join(distInfoDir, "METADATA"),
    [
      "Metadata-Version: 2.1",
      "Name: pypulseq",
      `Version: ${version}`,
      "Summary: Build-fetched upstream pypulseq package",
      "",
    ].join("\n"),
    "utf8",
  );

  await writeFile(
    path.join(distInfoDir, "WHEEL"),
    ["Wheel-Version: 1.0", "Generator: pulseqjs sync script", "Root-Is-Purelib: true", "Tag: py3-none-any", ""].join(
      "\n",
    ),
    "utf8",
  );

  await writeFile(path.join(distInfoDir, "top_level.txt"), "pypulseq\n", "utf8");
  await writeFile(path.join(distInfoDir, "RECORD"), "", "utf8");
}

async function writeArchive() {
  await rm(archivePath, { force: true });
  await mkdir(path.dirname(archivePath), { recursive: true });
  await execFileAsync("tar", ["-a", "-cf", archivePath, "."], {
    cwd: buildPackagesRoot,
  });
}

async function main() {
  const pinnedVersion = await readPinnedPypulseqVersion();
  const pinnedRepo = await readPinnedPypulseqRepo();
  const sourceRoot = path.join(extractRoot, "source");
  const sourcePackageRoot = path.join(sourceRoot, "src", "pypulseq");
  const initPath = path.join(sourcePackageRoot, "__init__.py");
  if (!(await fileExists(initPath))) {
    throw new Error(
      `Missing pypulseq package sources at ${sourcePackageRoot}. Expected upstream repo layout from ${pinnedRepo}. Run: npm run ensure:pypulseq`,
    );
  }

  await rm(buildPackagesRoot, { recursive: true, force: true });
  await mkdir(buildPackagesRoot, { recursive: true });
  await rm(targetPackageRoot, { recursive: true, force: true });
  await copyFilteredTree(sourcePackageRoot, targetPackageRoot);
  await writeDistInfo(pinnedVersion);
  await writeArchive();
  console.log(`Synced pypulseq ${pinnedVersion} from ${sourceRoot} into ${archivePath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
