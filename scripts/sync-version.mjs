#!/usr/bin/env node
// VERSION est la seule valeur éditée ; les autres références sont générées.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function syncVersion(root = fileURLToPath(new URL('..', import.meta.url))) {
  const read = name => readFileSync(resolve(root, name), 'utf8');
  const version = read('VERSION').trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('VERSION doit respecter x.y.z.');
  const changes = new Map();
  const replace = (name, regex, value) => {
    const text = read(name);
    if (!regex.test(text)) throw new Error(`Référence de version introuvable : ${name}`);
    regex.lastIndex = 0;
    changes.set(name, text.replace(regex, value));
  };
  for (const name of ['package.json', 'package-lock.json']) {
    const data = JSON.parse(read(name));
    data.version = version;
    if (name === 'package-lock.json') data.packages[''].version = version;
    changes.set(name, JSON.stringify(data, null, 2) + '\n');
  }
  replace('config.js', /version:\s*["']\d+\.\d+\.\d+["']/, `version: "${version}"`);
  replace('src/main.ts', /KULTURO_RUNTIME = ["']\d+\.\d+\.\d+["']/, `KULTURO_RUNTIME = "${version}"`);
  for (const name of ['index.html', 'manifest.json']) {
    replace(name, /\?v=\d+\.\d+\.\d+/g, `?v=${version}`);
  }
  const worker = read('sw.js');
  if (!/kulturo-static-v\d+\.\d+\.\d+/.test(worker)) throw new Error('Cache versionné introuvable dans sw.js');
  changes.set('sw.js', worker.replace(/kulturo-static-v\d+\.\d+\.\d+/g, `kulturo-static-v${version}`).replace(/\?v=\d+\.\d+\.\d+/g, `?v=${version}`));
  replace('README.md', /Version actuelle · \d+\.\d+\.\d+/, `Version actuelle · ${version}`);
  replace('DEPLOYMENT.md', /archive \*\*\d+\.\d+\.\d+\*\*/, `archive **${version}**`);
  replace('tests/README.md', /archive \d+\.\d+\.\d+/, `archive ${version}`);
  replace('tests/browser-server.mjs', /version:\s*["']\d+\.\d+\.\d+-test["']/, `version: "${version}-test"`);
  // Toutes les références doivent exister avant de commencer les écritures.
  for (const [name, text] of changes) if (text !== read(name)) writeFileSync(resolve(root, name), text);
  return version;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Versions synchronisées : ${syncVersion()}`);
}
