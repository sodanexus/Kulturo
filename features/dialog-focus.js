// ============================================================
// Navigation clavier et restauration du focus des fenêtres
// ============================================================

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function isFocusable(element) {
  if (!element || element.hidden || element.inert) return false;
  if (element.getAttribute?.("aria-hidden") === "true") return false;
  if (element.closest?.("[hidden], [inert], [aria-hidden='true']")) return false;
  const closedDetails = element.closest?.("details:not([open])");
  if (closedDetails && !element.matches?.("summary") && !element.closest?.("summary")) return false;
  const style = element.ownerDocument?.defaultView?.getComputedStyle?.(element);
  if (style && (style.display === "none" || style.visibility === "hidden")) return false;
  return typeof element.getClientRects !== "function" || element.getClientRects().length > 0;
}

export function focusableElements(dialog) {
  return [...(dialog?.querySelectorAll?.(FOCUSABLE_SELECTOR) || [])].filter(isFocusable);
}

export function nextFocusIndex(length, currentIndex, backwards = false) {
  if (length < 1) return -1;
  if (backwards) return currentIndex <= 0 ? length - 1 : currentIndex - 1;
  return currentIndex < 0 || currentIndex >= length - 1 ? 0 : currentIndex + 1;
}

export function dialogKeyIntent(event = {}) {
  const keys = new Set([event.key, event.code, event.keyIdentifier].filter(Boolean));
  if (event.keyCode === 27) keys.add("Escape");
  if (event.keyCode === 9) keys.add("Tab");
  return {
    escape: ["Escape", "Esc", "U+001B"].some(key => keys.has(key)),
    tab: keys.has("Tab"),
  };
}

export function createDialogFocusManager(doc = document) {
  const stack = [];
  let listening = false;

  const current = () => stack.at(-1) || null;
  const safeFocus = element => {
    try { if (typeof element === "function") element = element(); }
    catch { return false; }
    if (!element?.focus || element.isConnected === false || element.inert || element.closest?.("[inert], [aria-hidden='true']")) return false;
    try {
      element.focus({ preventScroll: true });
      return true;
    } catch {
      try { element.focus(); return true; } catch { return false; }
    }
  };
  const focusInside = record => {
    if (!record?.dialog?.isConnected) return false;
    const requested = typeof record.initialFocus === "string"
      ? record.dialog.querySelector(record.initialFocus)
      : record.initialFocus;
    const target = isFocusable(requested)
      ? requested
      : focusableElements(record.dialog)[0] || record.dialog;
    return safeFocus(target);
  };

  function onKeydown(event) {
    const record = current();
    if (!record?.dialog?.isConnected) return;
    const { escape: isEscape, tab: isTab } = dialogKeyIntent(event);
    if (isEscape) {
      if (typeof record.onEscape !== "function") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      record.onEscape();
      return;
    }
    if (!isTab) return;

    const items = focusableElements(record.dialog);
    if (!items.length) {
      event.preventDefault();
      safeFocus(record.dialog);
      return;
    }
    const activeIndex = items.indexOf(doc.activeElement);
    const targetIndex = nextFocusIndex(items.length, activeIndex, event.shiftKey);
    const outside = !record.dialog.contains(doc.activeElement);
    const crossesStart = event.shiftKey && (activeIndex <= 0 || outside);
    const crossesEnd = !event.shiftKey && (activeIndex === items.length - 1 || outside);
    if (!crossesStart && !crossesEnd) return;
    event.preventDefault();
    safeFocus(items[targetIndex]);
  }

  function onFocusin(event) {
    const record = current();
    if (!record?.dialog?.isConnected || record.dialog.contains(event.target)) return;
    focusInside(record);
  }

  function syncListeners() {
    if (stack.length && !listening) {
      doc.addEventListener("keydown", onKeydown, true);
      doc.addEventListener("focusin", onFocusin, true);
      listening = true;
    } else if (!stack.length && listening) {
      doc.removeEventListener("keydown", onKeydown, true);
      doc.removeEventListener("focusin", onFocusin, true);
      listening = false;
    }
  }

  function activate(dialog, options = {}) {
    if (!dialog) return null;
    const existingIndex = stack.findIndex(record => record.dialog === dialog);
    if (existingIndex >= 0) stack.splice(existingIndex, 1);
    if (!dialog.hasAttribute("tabindex")) dialog.setAttribute("tabindex", "-1");
    const record = {
      dialog,
      returnFocus: options.returnFocus || doc.activeElement,
      initialFocus: options.initialFocus || null,
      onEscape: options.onEscape || null,
    };
    stack.push(record);
    syncListeners();
    const schedule = callback => doc.defaultView?.requestAnimationFrame
      ? doc.defaultView.requestAnimationFrame(callback)
      : setTimeout(callback, 0);
    schedule(() => { if (current() === record) focusInside(record); });
    return record;
  }

  function deactivate(dialog, options = {}) {
    const index = stack.findIndex(record => record.dialog === dialog);
    if (index < 0) return false;
    const [record] = stack.splice(index, 1);
    syncListeners();
    if (options.restoreFocus !== false && safeFocus(record.returnFocus)) return true;
    const parent = current();
    if (parent) focusInside(parent);
    return true;
  }

  function clear({ restoreFocus = false } = {}) {
    const last = current();
    stack.splice(0);
    syncListeners();
    if (restoreFocus) safeFocus(last?.returnFocus);
  }

  return { activate, deactivate, clear, current };
}
