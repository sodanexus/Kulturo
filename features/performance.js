// Diagnostic local volontaire : aucun titre, identifiant, jeton ou envoi réseau.
let enabled = false;
const samples = [];
export function startMeasurement(name) {
  if (!enabled || !globalThis.performance?.now) return () => {};
  const start = performance.now();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    samples.push({ name, milliseconds: Math.round((performance.now() - start) * 100) / 100 });
    if (samples.length > 100) samples.shift();
  };
}
export const performanceDiagnostics = Object.freeze({
  enable(value = true) { enabled = Boolean(value); },
  samples() { return samples.map(sample => ({ ...sample })); },
  clear() { samples.length = 0; },
});
