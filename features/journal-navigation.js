// ============================================================
// Journal — état de navigation et interactions déléguées
// ============================================================

const JOURNAL_MODES = new Set(["personal", "community"]);
const MODE_STORAGE_KEY = "kulturo-journal-mode";

function readInitialMode() {
  try {
    return localStorage.getItem(MODE_STORAGE_KEY) === "community" ? "community" : "personal";
  } catch {
    return "personal";
  }
}

function safeDomToken(value, fallback) {
  return String(value || fallback).replace(/[^a-z0-9_-]+/gi, "-");
}

function monthLabel(monthKey) {
  const label = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" })
    .format(new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)) - 1, 1));
  return label[0].toUpperCase() + label.slice(1);
}

export function createJournalNavigation(options = {}) {
  const onChange = typeof options.onChange === "function" ? options.onChange : () => {};
  let mode = readInitialMode();
  const periods = {
    personal: { target: "all", keys: [] },
    community: { target: "all", keys: [] },
  };
  const expandedGroups = new Set();
  const boundRoots = new WeakSet();

  function periodState(targetMode = mode) {
    return periods[targetMode] || periods.personal;
  }

  function monthDomId(targetMode, monthKey) {
    return `journal-${targetMode}-month-${safeDomToken(monthKey, "unknown")}`;
  }

  function groupDomId(key) {
    return `journal-group-${safeDomToken(key, "group")}`;
  }

  function syncMode() {
    JOURNAL_MODES.forEach(targetMode => {
      const button = document.getElementById(`journal-mode-${targetMode}`);
      const panel = document.getElementById(`journal-${targetMode}-panel`);
      const active = mode === targetMode;
      button?.classList.toggle("active", active);
      button?.setAttribute("aria-selected", String(active));
      if (button) button.tabIndex = active ? 0 : -1;
      if (panel) panel.hidden = !active;
    });
    const timeNav = document.getElementById("journal-time-nav");
    if (timeNav) timeNav.dataset.journalMode = mode;
  }

  function setMode(nextMode) {
    if (!JOURNAL_MODES.has(nextMode) || nextMode === mode) return false;
    mode = nextMode;
    try { localStorage.setItem(MODE_STORAGE_KEY, nextMode); } catch {}
    onChange();
    return true;
  }

  function syncTimeButtons(targetMode = mode) {
    const state = periodState(targetMode);
    const index = state.keys.indexOf(state.target);
    const previous = document.getElementById("journal-time-prev");
    const next = document.getElementById("journal-time-next");
    if (previous) previous.disabled = !state.keys.length || (state.target !== "all" && index >= state.keys.length - 1);
    if (next) next.disabled = state.target === "all" || index <= 0;
  }

  function syncTimeline(items, targetMode = mode) {
    const state = periodState(targetMode);
    const timestampOf = targetMode === "community"
      ? item => item.created_at
      : item => item.occurred_at;
    state.keys = [...new Set(items.map(item => {
      const value = timestampOf(item);
      if (!value) return null;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return null;
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    }).filter(Boolean))].sort((a, b) => b.localeCompare(a));
    if (state.keys.length && state.target !== "all" && !state.keys.includes(state.target)) state.target = "all";
    if (targetMode !== mode) return;

    const select = document.getElementById("journal-month-select");
    const nav = document.getElementById("journal-time-nav");
    if (!select || !nav) return;
    const options = [new Option("Tout l’historique", "all")];
    state.keys.forEach(key => options.push(new Option(monthLabel(key), key)));
    select.replaceChildren(...options);
    select.value = state.target;
    nav.dataset.journalMode = targetMode;
    syncTimeButtons(targetMode);
  }

  function jumpMonth(value) {
    const state = periodState();
    if (value !== "all" && !state.keys.includes(value)) return;
    state.target = value;
    onChange();
    const select = document.getElementById("journal-month-select");
    if (select) select.value = value;
    syncTimeButtons();

    const main = document.getElementById("main");
    const feedId = mode === "community" ? "community-feed" : "journal-feed";
    const target = value === "all"
      ? document.querySelector(`#${feedId} .journal-month-group`)
      : document.getElementById(monthDomId(mode, value));
    if (!main || !target) return;
    const mainRect = main.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const stickyHeight = document.querySelector("#page-journal .journal-sticky-controls")?.offsetHeight || 0;
    const top = Math.max(0, main.scrollTop + targetRect.top - mainRect.top - stickyHeight - 8);
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    main.scrollTo({ top, behavior: reducedMotion ? "auto" : "smooth" });
  }

  function stepMonth(direction) {
    const state = periodState();
    if (!state.keys.length) return;
    const currentIndex = state.target === "all" ? -1 : state.keys.indexOf(state.target);
    const nextIndex = Math.min(state.keys.length - 1, Math.max(0, currentIndex + Number(direction || 0)));
    jumpMonth(state.keys[nextIndex]);
  }

  function toggleGroup(key) {
    const domId = groupDomId(key);
    const group = document.getElementById(domId);
    const content = document.getElementById(`${domId}-content`);
    const toggle = group?.querySelector(".journal-event-group-toggle");
    if (!group || !content || !toggle) return;
    const expanded = !group.classList.contains("is-expanded");
    group.classList.toggle("is-expanded", expanded);
    toggle.setAttribute("aria-expanded", String(expanded));
    const hint = toggle.querySelector("small");
    if (hint) hint.textContent = expanded ? "Masquer le détail" : `Afficher les ${content.querySelectorAll(".journal-event-row").length} œuvres`;
    content.setAttribute("aria-hidden", String(!expanded));
    content.inert = !expanded;
    if (expanded) expandedGroups.add(key);
    else expandedGroups.delete(key);
    onChange();
  }

  function bind(root, handlers = {}) {
    if (!root || boundRoots.has(root)) return;
    boundRoots.add(root);
    root.addEventListener("click", event => {
      const control = event.target.closest?.("[data-journal-action]");
      if (!control || !root.contains(control)) return;
      const action = control.dataset.journalAction;
      if (action === "mode") {
        const changed = setMode(control.dataset.journalMode);
        if (changed) handlers.onModeChange?.(mode);
      } else if (action === "step-month") {
        stepMonth(control.dataset.direction);
      } else if (action === "toggle-group") {
        toggleGroup(control.dataset.groupKey);
      } else if (action === "open-personal") {
        handlers.onOpenPersonal?.(control.dataset.mediaId, control);
      } else if (action === "open-community") {
        handlers.onOpenCommunity?.(control.dataset.mediaId, control);
      } else if (action === "hide-event") {
        event.stopPropagation();
        handlers.onHideEvent?.(control.dataset.eventId);
      }
    });
    root.addEventListener("change", event => {
      const control = event.target.closest?.('[data-journal-action="jump-month"]');
      if (control && root.contains(control)) jumpMonth(control.value);
    });
  }

  return {
    get mode() { return mode; },
    bind,
    groupDomId,
    isGroupExpanded: key => expandedGroups.has(key),
    jumpMonth,
    monthDomId,
    setMode,
    stepMonth,
    syncMode,
    syncTimeline,
    toggleGroup,
    context() {
      return {
        mode,
        periods: {
          personal: periods.personal.target,
          community: periods.community.target,
        },
        expandedGroups: [...expandedGroups].slice(-40),
      };
    },
    restoreContext(value = {}) {
      if (JOURNAL_MODES.has(value?.mode)) mode = value.mode;
      for (const targetMode of JOURNAL_MODES) {
        const target = value?.periods?.[targetMode];
        if (target === "all" || /^\d{4}-(0[1-9]|1[0-2])$/.test(String(target || ""))) {
          periods[targetMode].target = target;
        }
      }
      expandedGroups.clear();
      (Array.isArray(value?.expandedGroups) ? value.expandedGroups : [])
        .filter(key => typeof key === "string" && key.length <= 180)
        .slice(-40)
        .forEach(key => expandedGroups.add(key));
      try { localStorage.setItem(MODE_STORAGE_KEY, mode); } catch {}
    },
  };
}
