// ============================================================
// Interactions d’interface déléguées
// ============================================================

function parseArgs(control) {
  const raw = control?.dataset?.uiArgs;
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function createUiActionDispatcher(getActions) {
  const boundRoots = new WeakSet();

  function invoke(control, event) {
    if (!control || control.disabled || control.getAttribute?.("aria-disabled") === "true") return false;
    if (control.dataset.uiSelf === "true" && event.target !== control) return false;

    const action = control.dataset.uiAction;
    const handler = getActions?.()?.[action];
    if (!action || typeof handler !== "function") return false;

    const args = parseArgs(control);
    if (control.dataset.uiValue === "true") args.push(control.value);
    if (control.dataset.uiChecked === "true") args.push(Boolean(control.checked));
    if (control.dataset.uiControl === "true") args.push(control);
    if (control.dataset.uiEvent === "true") args.push(event);
    handler(...args);
    return true;
  }

  function bind(root) {
    if (!root || boundRoots.has(root)) return;
    boundRoots.add(root);

    root.addEventListener("click", event => {
      const control = event.target.closest?.("[data-ui-action]");
      if (!control || !root.contains(control) || control.matches("form") || control.dataset.uiTrigger === "change") return;
      invoke(control, event);
    });

    root.addEventListener("change", event => {
      const control = event.target.closest?.('[data-ui-trigger="change"][data-ui-action]');
      if (control && root.contains(control)) invoke(control, event);
    });

    root.addEventListener("submit", event => {
      const control = event.target.closest?.("form[data-ui-action]");
      if (!control || !root.contains(control)) return;
      event.preventDefault();
      invoke(control, event);
    });

    root.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const control = event.target.closest?.('[role="button"][data-ui-action]:not(button):not(a)');
      if (!control || !root.contains(control) || event.target !== control) return;
      event.preventDefault();
      invoke(control, event);
    });
  }

  return { bind, invoke };
}
