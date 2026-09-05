#!/usr/bin/env node

// Vérifie une version Kulturo puis fabrique toujours la même archive ZIP.
// Aucun paquet npm ni outil zip externe n'est nécessaire.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync, lstatSync, mkdirSync, readFileSync, readdirSync,
  renameSync, unlinkSync, writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = readFileSync(join(ROOT, "VERSION"), "utf8").trim();
const argumentsList = process.argv.slice(2);
let requestedVersion = null;
let requestedOutput = null;
let checkOnly = false;
for (let index = 0; index < argumentsList.length; index++) {
  const argument = argumentsList[index];
  if (argument === "--check") { checkOnly = true; continue; }
  if (argument === "--output") {
    requestedOutput = argumentsList[++index];
    if (!requestedOutput) fail("--output attend un chemin.");
    continue;
  }
  if (argument.startsWith("--")) fail(`option inconnue : ${argument}`);
  if (requestedVersion) fail("une seule version peut être indiquée.");
  requestedVersion = argument;
}
const output = resolve(requestedOutput || join(dirname(ROOT), `Kulturo-${VERSION}.zip`));

function fail(message) {
  console.error(`\nÉchec de publication : ${message}`);
  process.exit(1);
}

if (!/^\d+\.\d+\.\d+$/.test(VERSION)) fail("VERSION doit respecter le format x.y.z.");
if (requestedVersion && requestedVersion !== VERSION) {
  fail(`la version demandée (${requestedVersion}) diffère de VERSION (${VERSION}).`);
}

function source(path) {
  const absolute = join(ROOT, path);
  if (!existsSync(absolute)) fail(`${path} est introuvable.`);
  return readFileSync(absolute, "utf8");
}

function requireMatch(path, expression, label) {
  if (!expression.test(source(path))) fail(`${path} ne contient pas ${label}.`);
}

const manifest = JSON.parse(source("manifest.json"));
if (manifest.start_url !== "./" || manifest.scope !== "./") fail("le manifeste PWA n'est plus portable.");
if (!manifest.icons?.length || manifest.icons.some(icon => !String(icon.src).endsWith(`?v=${VERSION}`))) {
  fail("les icônes du manifeste n'utilisent pas la version courante.");
}

requireMatch("config.js", new RegExp(`version:\\s*["']${VERSION.replaceAll(".", "\\.")}["']`), `app.version ${VERSION}`);
requireMatch("index.html", new RegExp(`icon-192\\.png\\?v=${VERSION.replaceAll(".", "\\.")}`), "l'icône iOS versionnée");
requireMatch("index.html", new RegExp(`icon\\.svg\\?v=${VERSION.replaceAll(".", "\\.")}`), "le favicon versionné");
requireMatch("sw.js", new RegExp(`kulturo-static-v${VERSION.replaceAll(".", "\\.")}`), "le cache statique versionné");
requireMatch("sw.js", new RegExp(`icon-512\\.png\\?v=${VERSION.replaceAll(".", "\\.")}`), "les icônes mises en cache");
requireMatch("README.md", new RegExp(`Version actuelle · ${VERSION.replaceAll(".", "\\.")}`), "la version actuelle");
requireMatch("CHANGELOG.md", new RegExp(`^## ${VERSION.replaceAll(".", "\\.")}$`, "m"), "une entrée d'historique");
requireMatch("DEPLOYMENT.md", new RegExp(`archive \\*\\*${VERSION.replaceAll(".", "\\.")}\\*\\*`), "l'archive à publier");
requireMatch("tests/README.md", new RegExp(`archive ${VERSION.replaceAll(".", "\\.")}`, "i"), "la version validée");

function walk(directory, files = []) {
  for (const name of readdirSync(directory).sort((a, b) => a.localeCompare(b, "en"))) {
    if ([".git", "node_modules", ".DS_Store"].includes(name)) continue;
    const absolute = join(directory, name);
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) fail(`le lien symbolique ${relative(ROOT, absolute)} n'est pas autorisé dans une version.`);
    if (stat.isDirectory()) walk(absolute, files);
    else if (!/^Kulturo-\d+\.\d+\.\d+\.zip(?:\.tmp)?$/.test(name)) files.push(absolute);
  }
  return files;
}

const projectFiles = walk(ROOT);
const javascriptFiles = projectFiles.filter(path => /\.(?:m?js)$/.test(path));
for (const file of javascriptFiles) {
  const result = spawnSync(process.execPath, ["--check", file], { cwd: ROOT, stdio: "inherit" });
  if (result.status !== 0) fail(`syntaxe invalide dans ${relative(ROOT, file)}.`);
}

const testFiles = projectFiles.filter(path => /tests[/\\].+\.test\.mjs$/.test(path));
const tests = spawnSync(process.execPath, ["--test", ...testFiles], { cwd: ROOT, stdio: "inherit" });
if (tests.status !== 0) fail("les tests techniques ont échoué.");

if (checkOnly) {
  console.log(`\nKulturo ${VERSION} est cohérent (${projectFiles.length} fichiers).`);
  process.exit(0);
}

// CRC-32 utilisé par le format ZIP.
const CRC_TABLE = new Uint32Array(256);
for (let index = 0; index < 256; index++) {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  CRC_TABLE[index] = value >>> 0;
}
function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

// Date fixe : l'archive est reproductible à contenu identique.
const DOS_TIME = 0;
const DOS_DATE = ((2020 - 1980) << 9) | (1 << 5) | 1;
const localParts = [];
const centralParts = [];
let offset = 0;

for (const absolute of projectFiles) {
  const archiveName = `Kulturo-main/${relative(ROOT, absolute).split(sep).join("/")}`;
  const name = Buffer.from(archiveName, "utf8");
  const raw = readFileSync(absolute);
  const compressed = deflateRawSync(raw, { level: 9 });
  const checksum = crc32(raw);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(checksum, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(name.length, 26);
  localParts.push(local, name, compressed);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(0x0314, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(DOS_TIME, 12);
  central.writeUInt16LE(DOS_DATE, 14);
  central.writeUInt32LE(checksum, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(raw.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
  central.writeUInt32LE(offset, 42);
  centralParts.push(central, name);
  offset += local.length + name.length + compressed.length;
}

if (projectFiles.length > 0xffff) fail("la version contient trop de fichiers pour une archive ZIP classique.");
const centralDirectory = Buffer.concat(centralParts);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(projectFiles.length, 8);
end.writeUInt16LE(projectFiles.length, 10);
end.writeUInt32LE(centralDirectory.length, 12);
end.writeUInt32LE(offset, 16);
const archive = Buffer.concat([...localParts, centralDirectory, end]);

mkdirSync(dirname(output), { recursive: true });
const temporary = `${output}.tmp`;
writeFileSync(temporary, archive);
if (existsSync(output)) unlinkSync(output);
renameSync(temporary, output);
const digest = createHash("sha256").update(archive).digest("hex");
console.log(`\nArchive créée : ${output}`);
console.log(`${projectFiles.length} fichiers · ${archive.length} octets · SHA-256 ${digest}`);
