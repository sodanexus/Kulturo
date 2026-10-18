import { prefersReducedMotion } from './motion.js';
const pending = new WeakMap();
export function revealImage(image) {
  if (!image || image.classList.contains('is-loaded') || pending.has(image) || !image.complete || !image.naturalWidth) return;
  const source = image.currentSrc || image.src;
  const token = {};
  pending.set(image, token);
  const finish = () => {
    if (pending.get(image) !== token) return;
    pending.delete(image);
    if (!image.isConnected) return;
    if ((image.currentSrc || image.src) !== source) { revealImage(image); return; }
    if (image.naturalWidth) image.classList.add('is-loaded');
  };
  Promise.resolve().then(() => image.decode?.()).catch(() => {}).then(() => {
    if (prefersReducedMotion()) return finish();
    requestAnimationFrame(() => requestAnimationFrame(finish));
  });
}
