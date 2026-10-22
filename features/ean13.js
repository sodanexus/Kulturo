// Lecture d'un code-barres EAN-13 (ISBN-13 : préfixe 978/979) dans une image,
// sans dépendance. Fonctionne sur les niveaux de gris d'une image de caméra.
const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

export function ean13Checksum(digits) {
  const text = String(digits);
  if (!/^\d{13}$/.test(text)) return false;
  return [...text].reduce((sum, n, i) => sum + Number(n) * (i % 2 ? 3 : 1), 0) % 10 === 0;
}

function bitsToDigits(bits) {
  if (bits.length !== 95) return null;
  const guardOk = bits.startsWith("101") && bits.slice(45, 50) === "01010" && bits.endsWith("101");
  if (!guardOk) return null;
  let parity = "";
  const digits = [];
  for (let i = 0; i < 6; i++) {
    const code = bits.slice(3 + i * 7, 10 + i * 7);
    const l = L.indexOf(code);
    const g = G.indexOf(code);
    if (l >= 0) { parity += "L"; digits.push(l); }
    else if (g >= 0) { parity += "G"; digits.push(g); }
    else return null;
  }
  const first = PARITY.indexOf(parity);
  if (first < 0) return null;
  for (let i = 0; i < 6; i++) {
    const r = R.indexOf(bits.slice(50 + i * 7, 57 + i * 7));
    if (r < 0) return null;
    digits.push(r);
  }
  const value = `${first}${digits.join("")}`;
  return ean13Checksum(value) ? value : null;
}

// Convertit une ligne de pixels en suite de largeurs (barre/espace alternés).
function runsFromRow(row, threshold) {
  const runs = [];
  let dark = row[0] < threshold;
  let length = 1;
  for (let i = 1; i < row.length; i++) {
    const isDark = row[i] < threshold;
    if (isDark === dark) { length++; continue; }
    runs.push({ dark, length });
    dark = isDark;
    length = 1;
  }
  runs.push({ dark, length });
  return runs;
}

function decodeRuns(runs) {
  // Le code commence par une barre (garde 101) : cherche chaque début possible.
  for (let start = 0; start + 59 <= runs.length; start++) {
    if (!runs[start].dark) continue;
    // 3 + 24 + 5 + 24 + 3 = 59 groupes de barres/espaces
    const unit = (runs[start].length + runs[start + 1].length + runs[start + 2].length) / 3;
    if (unit < 1) continue;
    const bits = [];
    let total = 0;
    for (let i = start; i < start + 59; i++) {
      const modules = Math.max(1, Math.round(runs[i].length / unit));
      if (modules > 4) { total = -1; break; }
      bits.push((runs[i].dark ? "1" : "0").repeat(modules));
      total += modules;
    }
    if (total !== 95) continue;
    const value = bitsToDigits(bits.join(""));
    if (value) return value;
  }
  return null;
}

export function decodeEan13Row(row) {
  if (!row || row.length < 95) return null;
  let min = 255;
  let max = 0;
  for (let i = 0; i < row.length; i++) { if (row[i] < min) min = row[i]; if (row[i] > max) max = row[i]; }
  if (max - min < 40) return null;
  const threshold = (min + max) / 2;
  const runs = runsFromRow(row, threshold);
  const forward = decodeRuns(runs);
  if (forward) return forward;
  return decodeRuns([...runs].reverse());
}

// `gray` : Uint8Array/Uint8ClampedArray de largeur*hauteur niveaux de gris.
export function decodeEan13Image(gray, width, height) {
  const rows = [];
  const mid = Math.floor(height / 2);
  for (let offset = 0; offset < height / 2; offset += 3) {
    rows.push(mid + offset);
    if (offset) rows.push(mid - offset);
  }
  for (const y of rows) {
    if (y < 0 || y >= height) continue;
    const row = gray.subarray(y * width, (y + 1) * width);
    const value = decodeEan13Row(row);
    if (value) return value;
  }
  return null;
}

export function rgbaToGray(rgba, width, height) {
  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = (rgba[p] * 299 + rgba[p + 1] * 587 + rgba[p + 2] * 114) / 1000;
  }
  return gray;
}

export function isbnFromEan13(value) {
  return /^97[89]\d{10}$/.test(String(value || "")) && ean13Checksum(value) ? String(value) : null;
}
