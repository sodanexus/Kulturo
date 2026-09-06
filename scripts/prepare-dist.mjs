#!/usr/bin/env node

import { copyFileSync, existsSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DIST = join(ROOT, "dist");
const COPY_AS_IS = ["config.js", "manifest.json", "sw.js", "logo.svg", "icon.svg", "icon-192.png", "icon-512.png"];

if (!existsSync(join(DIST, "index.html"))) throw new Error("Le build Vite n’a pas produit index.html.");
for (const file of COPY_AS_IS) copyFileSync(join(ROOT, file), join(DIST, file));

// Le manifeste et les icônes doivent rester à la racine : leurs chemins sont
// portables sur GitHub Pages et ne dépendent pas du nom du dépôt.
const version = readFileSync(join(ROOT, "VERSION"), "utf8").trim();
const indexPath = join(DIST, "index.html");
let index = readFileSync(indexPath, "utf8")
  .replace(/\.\/assets\/manifest-[^"']+\.json/g, "manifest.json")
  .replace(/\.\/assets\/icon-192-[^"']+\.png\?v=[^"']+/g, `icon-192.png?v=${version}`)
  .replace(/\.\/assets\/icon-[^"']+\.svg\?v=[^"']+/g, `icon.svg?v=${version}`);
writeFileSync(indexPath, index);
for (const name of readdirSync(join(DIST, "assets"))) {
  if (/^(?:manifest-.*\.json|icon(?:-192)?-.*\.(?:png|svg))$/.test(name)) {
    unlinkSync(join(DIST, "assets", name));
  }
}

function walk(directory, files = []) {
  for (const name of readdirSync(directory).sort()) {
    const absolute = join(directory, name);
    if (statSync(absolute).isDirectory()) walk(absolute, files);
    else files.push(relative(DIST, absolute).split(sep).join("/"));
  }
  return files;
}

const versionedIcons = new Set(["icon.svg", "icon-192.png", "icon-512.png"]);
const assets = ["./", ...walk(DIST)
  .filter(path => path !== "sw.js")
  .map(path => versionedIcons.has(path) ? `${path}?v=${version}` : path)];
const workerPath = join(DIST, "sw.js");
const worker = readFileSync(workerPath, "utf8").replace(
  /const STATIC_ASSET_PATHS = \[[\s\S]*?\];/,
  `const STATIC_ASSET_PATHS = ${JSON.stringify(assets, null, 2)};`,
);
if (!worker.includes('"assets/')) throw new Error("Le manifeste du service worker n’a pas été injecté.");
writeFileSync(workerPath, worker);

// Refuse un build qui ne fonctionnerait qu'à la racine d'un domaine. Chaque
// ressource de la page et du manifeste doit rester relative et exister dans
// l'artefact réellement envoyé à GitHub Pages.
const finalIndex = readFileSync(indexPath, "utf8");
const referencedUrls = [...finalIndex.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)]
  .map(match => match[1])
  .filter(url => !/^(?:https?:|data:|#)/i.test(url));
for (const url of referencedUrls) {
  if (url.startsWith("/")) throw new Error(`Chemin non portable dans index.html : ${url}`);
  const path = url.split(/[?#]/, 1)[0].replace(/^\.\//, "");
  if (path && !existsSync(join(DIST, path))) throw new Error(`Ressource absente du build : ${url}`);
}
const finalManifest = JSON.parse(readFileSync(join(DIST, "manifest.json"), "utf8"));
if (finalManifest.start_url !== "./" || finalManifest.scope !== "./") {
  throw new Error("Le manifeste produit n'est plus portable.");
}
for (const icon of finalManifest.icons || []) {
  const path = String(icon.src || "").split(/[?#]/, 1)[0].replace(/^\.\//, "");
  if (!path || !existsSync(join(DIST, path))) throw new Error(`Icône absente du build : ${icon.src}`);
}
if (!finalIndex.includes(`icon.svg?v=${version}`) || !worker.includes(`kulturo-static-v${version}`)) {
  throw new Error("La version de l'interface et celle du shell PWA divergent.");
}

console.log(`Build Kulturo prêt : ${assets.length} ressources préchargées.`);
