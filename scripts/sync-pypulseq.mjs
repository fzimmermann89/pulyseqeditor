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

function buildCrc32Table() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table[index] = crc >>> 0;
  }
  return table;
}

const CRC32_TABLE = buildCrc32Table();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toDosDateTime(date) {
  const year = Math.max(1980, date.getUTCFullYear());
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = Math.floor(date.getUTCSeconds() / 2);

  const dosTime = (hours << 11) | (minutes << 5) | seconds;
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;
  return { dosTime, dosDate };
}

async function collectFiles(rootDir, currentDir = rootDir) {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(rootDir, fullPath)));
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const relativePath = path.relative(rootDir, fullPath).split(path.sep).join("/");
    files.push({ fullPath, relativePath });
  }

  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  return files;
}

async function writeArchive() {
  await rm(archivePath, { force: true });
  await mkdir(path.dirname(archivePath), { recursive: true });

  const files = await collectFiles(buildPackagesRoot);
  const chunks = [];
  const centralDirectory = [];
  let offset = 0;

  for (const file of files) {
    const fileBytes = await readFile(file.fullPath);
    const nameBytes = Buffer.from(file.relativePath, "utf8");
    const stats = await stat(file.fullPath);
    const { dosTime, dosDate } = toDosDateTime(stats.mtime);
    const checksum = crc32(fileBytes);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(fileBytes.length, 18);
    localHeader.writeUInt32LE(fileBytes.length, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26);
    localHeader.writeUInt16LE(0, 28);

    chunks.push(localHeader, nameBytes, fileBytes);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(fileBytes.length, 20);
    centralHeader.writeUInt32LE(fileBytes.length, 24);
    centralHeader.writeUInt16LE(nameBytes.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralDirectory.push(centralHeader, nameBytes);

    offset += localHeader.length + nameBytes.length + fileBytes.length;
  }

  const centralDirectorySize = centralDirectory.reduce((size, chunk) => size + chunk.length, 0);
  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(0, 4);
  endOfCentralDirectory.writeUInt16LE(0, 6);
  endOfCentralDirectory.writeUInt16LE(files.length, 8);
  endOfCentralDirectory.writeUInt16LE(files.length, 10);
  endOfCentralDirectory.writeUInt32LE(centralDirectorySize, 12);
  endOfCentralDirectory.writeUInt32LE(offset, 16);
  endOfCentralDirectory.writeUInt16LE(0, 20);

  await writeFile(archivePath, Buffer.concat([...chunks, ...centralDirectory, endOfCentralDirectory]));
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
