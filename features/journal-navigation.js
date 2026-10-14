import { yearMonthOf } from "../domain.js";

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

  function syncTimeline(items, targetMode = mode, { pending = false } = {}) {
    const state = periodState(targetMode);
    const timestampOf = targetMode === "community"
      ? item => item.created_at
      : item => item.occurred_at;
    state.keys = [...new Set(items.map(item => {
      return yearMonthOf(timestampOf(item));
    }).filter(Boolean))].sort((a, b) => b.localeCompare(a));
    if (!pending && state.target !== "all" && !state.keys.includes(state.target)) state.target = "all";
    if (targetMode !== mode) return;

    for (const id of ["journal-month-select", "journal-floating-month-select"]) {
      const select = document.getElementById(id);
      if (!select) continue;
      const choices = [new Option("Tout l’historique", "all")];
      state.keys.forEach(key => choices.push(new Option(monthLabel(key), key)));
      select.replaceChildren(...choices);
      select.value = pending ? "all" : state.target;
      select.disabled = pending || !state.keys.length;
    }
    const nav = document.getElementById("journal-time-nav");
    if (nav) nav.dataset.journalMode = targetMode;
  }

  function filterMonth(items, targetMode = mode) {
    const target = periodState(targetMode).target;
    if (target === "all") return items;
    return items.filter(item => yearMonthOf(targetMode === "community" ? item.created_at : item.occurred_at) === target);
  }

  function selectMonth(value) {
    const state = periodState();
    if (value !== "all" && !state.keys.includes(value)) return;
    const fromFloating = document.activeElement?.id === "journal-floating-month-select";
    state.target = value;
    const main = document.getElementById("main");
    main?.scrollTo({ top: 0, behavior: "instant" });
    options.onMonthChange?.();
    onChange();
    if (fromFloating) document.getElementById("journal-month-select")?.focus({ preventScroll: true });
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
    root.addEventListener("keydown", event => {
      const control = event.target.closest?.('[role="tab"][data-journal-action="mode"]');
      if (!control || !root.contains(control)) return;
      const modes = [...JOURNAL_MODES];
      const index = modes.indexOf(control.dataset.journalMode);
      let nextIndex;
      if (event.key === "ArrowRight") nextIndex = (index + 1) % modes.length;
      else if (event.key === "ArrowLeft") nextIndex = (index + modes.length - 1) % modes.length;
      else if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = modes.length - 1;
      else return;
      event.preventDefault();
      const nextMode = modes[nextIndex];
      if (setMode(nextMode)) handlers.onModeChange?.(mode);
      syncMode();
      document.getElementById(`journal-mode-${nextMode}`)?.focus();
    });
    root.addEventListener("change", event => {
      const control = event.target.closest?.('[data-journal-action="select-month"]');
      if (control && root.contains(control)) selectMonth(control.value);
    });
  }

  return {
    get mode() { return mode; },
    reset() {
      mode = "personal";
      for (const state of Object.values(periods)) { state.target = "all"; state.keys = []; }
      expandedGroups.clear();
    },
    bind,
    groupDomId,
    isGroupExpanded: key => expandedGroups.has(key),
    selectMonth,
    filterMonth,
    monthDomId,
    setMode,
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
