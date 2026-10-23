// ============================================================
// Easter egg du logo — quatre cercles qui jonglent
// Survol (souris) : les cercles sautent l'un après l'autre, dans l'ordre
// des catégories, tant que le pointeur reste dessus. Toucher : un saut.
// Cinq touchers rapprochés : les couleurs
// tournent d'un cercle à l'autre. Aucun effet si le mouvement est réduit.
// ============================================================

const COLORS = [
  "var(--brand-coral)", // films
  "var(--brand-blue)",  // séries
  "var(--brand-teal)",  // jeux
  "var(--brand-gold)",  // livres
];
const HOP_STAGGER_MS = 90;
const HOP_MS = 620;
const SPIN_MS = 1800;
const COMBO_TAPS = 5;
const COMBO_WINDOW_MS = 2500;

export function logoMarkHTML() {
  const circles = COLORS
    .map((color, index) => `<circle class="logo-circle" cx="${50 + index * 60}" cy="50" r="40" style="fill:${color}"/>`)
    .join("");
  return `<svg class="topbar-mark" viewBox="0 0 280 100" width="64" height="38" aria-hidden="true" focusable="false">${circles}</svg>`;
}

function reducedMotion() {
  return Boolean(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
}

export function attachLogoEasterEgg(logo) {
  const mark = logo?.querySelector?.(".topbar-mark");
  const circles = mark ? [...mark.querySelectorAll(".logo-circle")] : [];
  if (circles.length !== COLORS.length || typeof circles[0].animate !== "function") return () => {};

  for (const circle of circles) {
    circle.style.transformBox = "fill-box";
    circle.style.transformOrigin = "center";
  }

  let running = 0;
  let hovering = false;
  let taps = [];
  const done = animation => {
    running++;
    const release = () => { running = Math.max(0, running - 1); };
    animation.addEventListener("finish", release, { once: true });
    animation.addEventListener("cancel", release, { once: true });
  };

  // Tant que la souris est dessus, un saut en entraîne un autre.
  const continueIfHovering = animation => {
    animation.addEventListener("finish", () => { if (hovering && !running) hop(); }, { once: true });
  };

  function hop() {
    if (running || reducedMotion()) return;
    circles.forEach((circle, index) => {
      const animation = circle.animate([
        { transform: "translateY(0) scale(1, 1)", offset: 0 },
        { transform: "translateY(0) scale(1.12, .86)", offset: .14 },
        { transform: "translateY(-26px) scale(.92, 1.1)", offset: .44 },
        { transform: "translateY(0) scale(1.14, .84)", offset: .74 },
        { transform: "translateY(0) scale(1, 1)", offset: 1 },
      ], { duration: HOP_MS, delay: index * HOP_STAGGER_MS, easing: "cubic-bezier(.3,.7,.3,1)", fill: "none" });
      done(animation);
      if (index === circles.length - 1) continueIfHovering(animation);
    });
  }

  // Les couleurs passent d'un cercle au suivant, puis tout revient en place.
  function spin() {
    if (reducedMotion()) return;
    circles.forEach((circle, index) => {
      const sequence = COLORS.map((_, step) => COLORS[(index + step) % COLORS.length]);
      sequence.push(COLORS[index]);
      done(circle.animate(
        sequence.map(fill => ({ fill })),
        { duration: SPIN_MS, easing: "ease-in-out", fill: "none" },
      ));
      const rotation = circle.animate([
        { transform: "rotate(0deg) scale(1)" },
        { transform: "rotate(360deg) scale(1.18)", offset: .5 },
        { transform: "rotate(720deg) scale(1)" },
      ], { duration: SPIN_MS, delay: index * 60, easing: "cubic-bezier(.5,0,.2,1)", fill: "none" });
      done(rotation);
      if (index === circles.length - 1) continueIfHovering(rotation);
    });
  }

  const onEnter = event => {
    if (event.pointerType !== "mouse") return;
    hovering = true;
    hop();
  };
  const onLeave = () => { hovering = false; };
  const onClick = () => {
    const now = Date.now();
    taps = taps.filter(time => now - time < COMBO_WINDOW_MS);
    taps.push(now);
    if (taps.length >= COMBO_TAPS) {
      taps = [];
      for (const animation of mark.getAnimations?.({ subtree: true }) || []) animation.cancel();
      running = 0;
      spin();
      return;
    }
    hop();
  };

  logo.addEventListener("pointerenter", onEnter);
  logo.addEventListener("pointerleave", onLeave);
  logo.addEventListener("click", onClick);
  return () => {
    hovering = false;
    logo.removeEventListener("pointerenter", onEnter);
    logo.removeEventListener("pointerleave", onLeave);
    logo.removeEventListener("click", onClick);
  };
}
