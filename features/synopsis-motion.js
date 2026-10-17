import { prefersReducedMotion } from './motion.js';

const active = new WeakMap();
export const synopsisProgress = t => t * t * (3 - 2 * t);

// Une seule horloge pilote la hauteur ET le défilement, dans les deux sens.
export function animateSynopsis(wrap, expanded) {
  const section = wrap?.closest('.detail-section');
  const body = wrap?.closest('.detail-body');
  if (!section || !body) return;
  const clip = wrap.querySelector('.detail-synopsis-clip');
  const fromTextHeight = clip?.getBoundingClientRect().height || 0;
  const fromHeight = section.getBoundingClientRect().height;
  const fromScroll = body.scrollTop;
  active.get(body)?.();
  const savedSection = section.style.cssText;
  const savedClip = clip?.style.cssText;
  const saved = new Map(['scroll-behavior', 'overflow-anchor'].map(key =>
    [key, [body.style.getPropertyValue(key), body.style.getPropertyPriority(key)]]));
  const spacer = document.createElement('div');
  spacer.setAttribute('aria-hidden', 'true');
  spacer.style.cssText = `height:${fromHeight}px;flex:0 0 ${fromHeight}px;pointer-events:none`;
  let frame = 0;
  const finish = () => {
    cancelAnimationFrame(frame);
    section.style.cssText = savedSection;
    if (clip) clip.style.cssText = savedClip;
    spacer.remove();
    section.removeAttribute('data-height-changing');
    for (const [key, [value, priority]] of saved) {
      if (value) body.style.setProperty(key, value, priority);
      else body.style.removeProperty(key);
    }
    if (active.get(body) === finish) active.delete(body);
  };
  active.set(body, finish);
  body.style.setProperty('overflow-anchor', 'none');
  body.style.setProperty('scroll-behavior', 'auto');
  // Réserver assez de course avant le repli : le navigateur ne doit pas
  // borner brutalement scrollTop quand le contenu raccourcit.
  body.appendChild(spacer);
  section.setAttribute('data-height-changing', '');
  wrap.classList.toggle('expanded', expanded);
  const toHeight = section.getBoundingClientRect().height;
  const toTextHeight = clip?.getBoundingClientRect().height || 0;
  body.scrollTop = fromScroll;
  const modal = body.closest('.detail-modal');
  const compact = modal?.classList.contains('is-collapsible')
    ? parseFloat(getComputedStyle(modal).getPropertyValue('--detail-compact-h')) || 64 : 0;
  const target = expanded ? Math.max(0, body.scrollTop + section.getBoundingClientRect().top - body.getBoundingClientRect().top - compact - 8) : 0;
  if (prefersReducedMotion() || !fromHeight) {
    body.scrollTop = target;
    finish();
    return;
  }
  const setHeight = height => {
    section.style.height = `${height}px`;
    section.style.minHeight = `${height}px`;
    section.style.maxHeight = `${height}px`;
    section.style.overflow = 'clip';
  };
  const setTextHeight = height => {
    if (!clip) return;
    clip.style.height = `${height}px`;
    clip.style.maxHeight = `${height}px`;
  };
  setTextHeight(fromTextHeight);
  setHeight(fromHeight);
  body.scrollTop = fromScroll;
  const start = performance.now();
  const tick = now => {
    if (!wrap.isConnected) { finish(); return; }
    const t = Math.min(1, Math.max(0, (now - start) / 350));
    const progress = synopsisProgress(t);
    setTextHeight(fromTextHeight + (toTextHeight - fromTextHeight) * progress);
    setHeight(fromHeight + (toHeight - fromHeight) * progress);
    body.scrollTop = fromScroll + (target - fromScroll) * progress;
    if (t < 1) frame = requestAnimationFrame(tick);
    else finish();
  };
  frame = requestAnimationFrame(tick);
}
