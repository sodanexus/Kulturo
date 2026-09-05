// Journal : flux personnel et Communauté, rendu et interactions.
import { isClosedMonth, journalEventPresentation, yearMonthOf } from "../domain.js";
import { journalMonthSummary } from "./insights.js";
import { groupJournalDayEvents, journalGroupPresentation } from "./journal-groups.js";
import { createJournalNavigation } from "./journal-navigation.js";
import { emptyState, errorState, loadingState } from "./ui-states.js";

export function createJournalFeature({
  State, Journal, Activity, refreshJournalEvents, replayMotion, hydrateFadeImages,
  esc, safeMediaUrl, uiAction, iconMedia, iconStatus, iconTrash, iconJournalAction,
  journalActionTone, ratingScoreHTML, activityStateMarkersHTML, getTypeLabel,
  STATUS_LABELS, confirmDialog, toast, openDetailPanel, renderDetailPanel,
}) {
  try {
    localStorage.removeItem("kulturo-journal-view");
    localStorage.removeItem("kulturo-community-view");
  } catch {}
  let _communityEntries = [];
  let _communityLoaded = false;
  const journalNavigation = createJournalNavigation();

  function visibleJournalEvents() {
    const existingIds = new Set(State.entries.map(entry => entry.id));
    // Les notations restent dans State.events pour les Tops et les sauvegardes.
    return State.events.filter(event => {
      const metadata = event?.metadata && typeof event.metadata === "object" ? event.metadata : {};
      return event.event_type !== "rated" && !metadata.hidden_from_journal && existingIds.has(event.media_id);
    });
  }

  async function renderJournal() {
    const requestedMode = journalNavigation.mode;
    journalNavigation.syncMode();
    if (requestedMode === "community") {
      await renderCommunity();
    } else {
      await renderPersonalJournal();
    }
    if (journalNavigation.mode === requestedMode) {
      replayMotion(document.getElementById(`journal-${requestedMode}-panel`), "journal-panel-enter");
    }
  }

  async function renderPersonalJournal() {
    const container = document.getElementById("journal-feed");
    if (!container) return;

    if (State.journalDirty) {
      container.innerHTML = loadingState("Chargement du journal…", { compact: true });
      journalNavigation.syncTimeline([], "personal");
      await refreshJournalEvents({ silent: true });
    }

    if (!State.journalAvailable) {
      container.innerHTML = errorState({
        title: "Journal indisponible",
        message: "Impossible de charger votre Journal pour le moment.",
        actionHTML: '<button class="btn btn-secondary" ' + uiAction("retryJournal") + '>Réessayer</button>',
      });
      journalNavigation.syncTimeline([], "personal");
      return;
    }
    renderCurrentJournalView();
  }

  function renderCurrentJournalView() {
    const container = document.getElementById("journal-feed");
    if (!container || !State.journalAvailable) return;
    const visible = visibleJournalEvents();
    container.innerHTML = renderJournalFeed(visible);
    journalNavigation.syncTimeline(visible, "personal");
    hydrateFadeImages(container);
  }

  function journalDateLabel(value) {
    const date = new Date(value);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return "Aujourd’hui";
    if (date.toDateString() === yesterday.toDateString()) return "Hier";
    return date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }

  function renderJournalFeed(events) {
    if (!events.length) {
      return emptyState({
        icon: "journal", title: "Votre Journal commence ici",
        message: "Vos ajouts, débuts et fins de parcours apparaîtront ici.",
        actionHTML: '<button class="btn btn-secondary" ' +
          uiAction(State.entries.length ? "navTo" : "openAddModal", State.entries.length ? ["library"] : []) + '>' +
          (State.entries.length ? "Ouvrir ma bibliothèque" : "Ajouter un média") + '</button>',
      });
    }

    const months = new Map();
    events.forEach(event => {
      const key = yearMonthOf(event.occurred_at) || "unknown";
      if (!months.has(key)) months.set(key, []);
      months.get(key).push(event);
    });

    return [...months.entries()].map(([monthKey, monthEvents]) => {
      const days = new Map();
      monthEvents.forEach(event => {
        const label = journalDateLabel(event.occurred_at);
        if (!days.has(label)) days.set(label, []);
        days.get(label).push(event);
      });
      const monthLabel = monthKey === "unknown"
        ? "Date inconnue"
        : new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" })
            .format(new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)) - 1, 1));
      return `
        <section class="journal-month-group" id="${journalNavigation.monthDomId("personal", monthKey)}" data-journal-month="${esc(monthKey)}">
          <h2 class="journal-month-heading">${esc(monthLabel)}</h2>
          ${[...days.entries()].map(([date, items]) => {
            const groupedItems = groupJournalDayEvents(items, State.entries, 3);
            return `
              <section class="activity-date-group journal-date-group">
                <div class="activity-date-label">${esc(date)}</div>
                ${groupedItems.map(item => item.kind === "group" ? journalGroupHTML(item) : journalRowHTML(item.event)).join("")}
              </section>`;
          }).join("")}
          ${monthKey === "unknown" || !isClosedMonth(monthKey) ? "" : journalMonthSummaryHTML(monthKey)}
        </section>`;
    }).join("");
  }

  function journalMonthSummaryHTML(monthKey) {
    const summary = journalMonthSummary(State.events, State.entries, monthKey);
    const average = summary.average == null ? "—" : `★ ${summary.average.toFixed(1)}/10`;
    const favorite = summary.favorite;
    const favoriteCover = safeMediaUrl(favorite?.cover_url);
    const monthLabel = new Intl.DateTimeFormat("fr-FR", { month: "short", year: "numeric" })
      .format(new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)) - 1, 1));
    return `
      <aside class="journal-month-summary" aria-label="Récapitulatif du mois">
        <div class="journal-month-summary-heading"><span>Le mois en bref</span><strong>${esc(monthLabel)}</strong></div>
        <div class="journal-month-summary-stats">
          <span><strong>${summary.completed}</strong><small>terminé${summary.completed > 1 ? "s" : ""}</small></span>
          <span><strong>${average}</strong><small>${summary.rated} noté${summary.rated > 1 ? "s" : ""}</small></span>
        </div>
        ${favorite ? `
          <button type="button" class="journal-month-favorite" data-prefetch-media="${esc(favorite.id)}" data-transition-media="${esc(favorite.id)}" data-journal-action="open-personal" data-media-id="${esc(favorite.id)}">
            ${favoriteCover ? `<img src="${esc(favoriteCover)}" alt="" loading="lazy" data-fade-image class="fade-image">` : `<span aria-hidden="true">${iconMedia(favorite.media_type, favorite.subtype)}</span>`}
            <span><small>Favori du mois</small><strong>${esc(favorite.title)}</strong></span>
            ${favorite.rating ? ratingScoreHTML(favorite.rating, "journal-month-favorite-rating") : ""}
          </button>` : `<p class="journal-month-no-favorite">Aucun média actuellement terminé à mettre en avant ce mois.</p>`}
      </aside>`;
  }

  function journalGroupCoverHTML(event) {
    const entry = State.entries.find(item => item.id === event?.media_id);
    if (!entry) return "";
    const coverUrl = safeMediaUrl(entry.cover_url);
    return coverUrl
      ? `<img src="${esc(coverUrl)}" alt="" loading="lazy" data-fade-image data-image-fallback="hide" class="fade-image">`
      : `<span aria-hidden="true">${iconMedia(entry.media_type, entry.subtype)}</span>`;
  }

  function journalGroupHTML(group) {
    const presentation = journalGroupPresentation(group);
    const expanded = journalNavigation.isGroupExpanded(group.key);
    const domId = journalNavigation.groupDomId(group.key);
    const tone = journalActionTone(group.action);
    return `
      <section class="journal-event-group ${expanded ? "is-expanded" : ""}" id="${domId}" data-journal-group="${esc(group.key)}" ${tone ? `data-event-tone="${tone}"` : ""}>
        <button type="button" class="journal-event-group-toggle" data-journal-action="toggle-group" data-group-key="${esc(group.key)}" aria-expanded="${expanded}" aria-controls="${domId}-content">
          <span class="journal-event-group-covers" aria-hidden="true">${group.events.slice(0, 3).map(journalGroupCoverHTML).join("")}</span>
          <span class="journal-event-group-copy">
            <strong><span aria-hidden="true">${iconJournalAction(group.action)}</span>${esc(presentation.label)}</strong>
            <small>${expanded ? "Masquer le détail" : `Afficher les ${group.events.length} œuvres`}</small>
          </span>
          <span class="journal-event-group-chevron" aria-hidden="true">⌄</span>
        </button>
        <div class="journal-event-group-expand" id="${domId}-content" aria-hidden="${!expanded}" ${expanded ? "" : "inert"}>
          <div class="journal-event-group-inner">${group.events.map(event => journalRowHTML(event, { grouped: true })).join("")}</div>
        </div>
      </section>`;
  }

  function journalRowHTML(event, options = {}) {
    const entry = State.entries.find(item => item.id === event.media_id);
    if (!entry) return "";
    const presentation = journalEventPresentation(event, entry);
    const coverUrl = safeMediaUrl(entry.cover_url);
    const coverHTML = coverUrl
      ? `<img src="${esc(coverUrl)}" class="activity-cover fade-image" data-fade-image data-image-fallback="hide" alt="" loading="lazy">`
      : `<div class="activity-cover activity-cover-ph">${iconMedia(entry.media_type, entry.subtype)}</div>`;
    const metadata = event.metadata && typeof event.metadata === "object" ? event.metadata : {};
    const tone = journalActionTone(event.event_type, metadata);
    const currentRating = Number(entry.rating);
    const ratingBadge = Number.isInteger(currentRating) && currentRating >= 1 && currentRating <= 10
      ? ratingScoreHTML(currentRating, "journal-rating-badge")
      : "";
    const type = getTypeLabel(entry);
    const dateOnly = Boolean(metadata.date_only || metadata.legacy);
    const time = dateOnly ? "" : new Date(event.occurred_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    const deleteButton = event.id ? `
      <button type="button" class="journal-event-delete" title="Retirer du Journal" aria-label="Retirer cet événement du Journal" data-journal-action="hide-event" data-event-id="${esc(event.id)}">${iconTrash()}</button>` : "";

    return `
      <article class="activity-row is-clickable journal-event-row ${options.grouped ? "is-grouped" : ""}" ${event.id ? `data-journal-event-id="${esc(event.id)}"` : ""} ${tone ? `data-event-tone="${tone}"` : ""}>
        <button type="button" class="journal-event-main" data-prefetch-media="${entry.id}" data-transition-media="${entry.id}" aria-label="Ouvrir la fiche de ${esc(entry.title)}" data-journal-action="open-personal" data-media-id="${entry.id}">
          ${coverHTML}
          <span class="activity-info">
            <span class="journal-event-label"><span aria-hidden="true">${iconJournalAction(event.event_type, metadata)}</span>${esc(presentation.label)}</span>
            <span class="activity-title">${esc(entry.title)}</span>
            <span class="activity-meta">
              <span class="badge badge-${entry.media_type}" style="font-size:var(--type-label)">${iconMedia(entry.media_type, entry.subtype)} ${esc(type)}</span>
              ${ratingBadge}
              ${activityStateMarkersHTML(entry)}
            </span>
          </span>
          ${time ? `<time class="activity-time" datetime="${esc(event.occurred_at)}">${time}</time>` : ""}
        </button>
        ${deleteButton}
      </article>`;
  }

  async function hideJournalEvent(id) {
    const journalEvent = State.events.find(event => event.id === id);
    if (!journalEvent) return;
    const confirmed = await confirmDialog(
      "Retirer cet événement du Journal ?",
      "Le média, son statut et vos statistiques ne seront pas modifiés.",
      "Retirer",
      "danger",
    );
    if (!confirmed) return;

    const rows = [...document.querySelectorAll("[data-journal-event-id]")]
      .filter(row => row.dataset.journalEventId === id);
    rows.forEach(row => row.classList.add("is-removing"));
    try {
      const updated = await Journal.hide(id, journalEvent.metadata || {});
      Object.assign(journalEvent, updated);
      setTimeout(() => renderCurrentJournalView(), 150);
      toast("Événement retiré du Journal", "info");
    } catch (error) {
      rows.forEach(row => row.classList.remove("is-removing"));
      const permissionMissing = /permission|policy|row-level|42501/i.test(String(error?.message || ""));
      toast(permissionMissing
        ? "Autorisation Journal manquante dans Supabase."
        : "Impossible de retirer l’événement : " + error.message, "error");
    }
  }

  function openJournalMedia(id, transitionSource = null) {
    const entry = State.entries.find(item => item.id === id);
    if (!entry) {
      toast("Ce média n’est plus disponible.", "error");
      return;
    }
    openDetailPanel(entry.id, { transitionSource });
  }

  async function renderCommunity() {
    const container = document.getElementById("community-feed");
    if (!container) return;

    if (_communityLoaded) {
      container.innerHTML = renderCommunityFeed(_communityEntries);
      journalNavigation.syncTimeline(_communityEntries, "community");
      hydrateFadeImages(container);
      return;
    }

    container.innerHTML = loadingState("Chargement de la communauté…", { compact: true });
    journalNavigation.syncTimeline([], "community");

    try {
      const entries = await Activity.getFeed(100);
      _communityEntries = entries.filter(entry => entry.user_id !== State.user?.id);
      _communityLoaded = true;
      container.innerHTML = renderCommunityFeed(_communityEntries);
      journalNavigation.syncTimeline(_communityEntries, "community");
      hydrateFadeImages(container);
    } catch (error) {
      console.warn("[Communauté] chargement impossible", error);
      container.innerHTML = errorState({
        title: "Communauté indisponible",
        message: "Impossible de charger les dernières activités pour le moment.",
        actionHTML: '<button class="btn btn-secondary" ' + uiAction("retryJournal") + '>Réessayer</button>',
      });
    }
  }

  function renderCommunityFeed(entries) {
    if (!entries.length) {
      return emptyState({ icon: "journal", title: "Aucune activité",
        message: "Les prochains ajouts des autres membres apparaîtront ici." });
    }

    const months = new Map();
    entries.forEach(entry => {
      const key = yearMonthOf(entry.created_at) || "unknown";
      if (!months.has(key)) months.set(key, []);
      months.get(key).push(entry);
    });

    return [...months.entries()].map(([monthKey, monthEntries]) => {
      const days = new Map();
      monthEntries.forEach(entry => {
        const label = journalDateLabel(entry.created_at);
        if (!days.has(label)) days.set(label, []);
        days.get(label).push(entry);
      });
      const monthLabel = monthKey === "unknown"
        ? "Date inconnue"
        : new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" })
            .format(new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)) - 1, 1));
      return `
        <section class="journal-month-group community-month-group" id="${journalNavigation.monthDomId("community", monthKey)}" data-journal-month="${esc(monthKey)}">
          <h2 class="journal-month-heading">${esc(monthLabel)}</h2>
          ${[...days.entries()].map(([date, items]) => `
            <section class="activity-date-group community-date-group">
              <div class="activity-date-label">${esc(date)}</div>
              ${items.map(communityRowHTML).join("")}
            </section>`).join("")}
        </section>`;
    }).join("");
  }

  function communityRowHTML(entry) {
    const type = entry.media_type === "movie" && !entry.subtype ? "Film / Série" : getTypeLabel(entry);
    const status = STATUS_LABELS[entry.status] || "Ajouté";
    const coverUrl = safeMediaUrl(entry.cover_url);
    const coverHTML = coverUrl
      ? `<img src="${esc(coverUrl)}" class="activity-cover fade-image" data-fade-image data-image-fallback="hide" alt="" loading="lazy">`
      : `<div class="activity-cover activity-cover-ph">${iconMedia(entry.media_type, entry.subtype)}</div>`;
    const rating = entry.rating ? ratingScoreHTML(entry.rating, "community-rating") : "";
    const tone = journalActionTone("added", { status: entry.status });

    return `
      <article class="activity-row is-clickable journal-event-row community-event-row" ${tone ? `data-event-tone="${tone}"` : ""}>
        <button type="button" class="journal-event-main" data-transition-media="${esc(entry.id)}" aria-label="Ouvrir la fiche de ${esc(entry.title)}" data-journal-action="open-community" data-media-id="${esc(entry.id)}">
          ${coverHTML}
          <span class="activity-info">
            <span class="journal-event-label community-event-label"><span aria-hidden="true">${iconJournalAction("added")}</span><strong>${esc(entry.username)}</strong> a ajouté</span>
            <span class="activity-title">${esc(entry.title)}</span>
            <span class="activity-meta">
              <span class="badge badge-${entry.media_type}" style="font-size:var(--type-label)">${iconMedia(entry.media_type, entry.subtype)} ${esc(type)}</span>
              <span class="badge badge-${entry.status}" style="font-size:var(--type-label)">${iconStatus(entry.status)}${esc(status)}</span>
              ${rating}${activityStateMarkersHTML(entry)}
            </span>
          </span>
          <time class="activity-time" datetime="${esc(entry.created_at)}">${new Date(entry.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</time>
        </button>
      </article>`;
  }

  function openCommunityMedia(id, transitionSource = null) {
    const ownEntry = State.entries.find(entry => entry.id === id);
    if (ownEntry) {
      openDetailPanel(ownEntry.id, { transitionSource });
      return;
    }

    const entry = _communityEntries.find(item => item.id === id);
    if (!entry) {
      toast("Ce média n’est plus disponible dans la communauté.", "error");
      return;
    }

    renderDetailPanel({
      ...entry,
      external_id: null,
      source_api: "activity",
    }, { readOnly: true, transitionSource });
  }

  function bindJournalInteractions() {
    journalNavigation.bind(document.getElementById("page-journal"), {
      onModeChange: () => renderJournal(),
      onOpenPersonal: openJournalMedia,
      onOpenCommunity: openCommunityMedia,
      onHideEvent: hideJournalEvent,
    });
  }

  return {
    render: renderJournal,
    async retry() {
      if (journalNavigation.mode === "community") _communityLoaded = false;
      else State.journalDirty = true;
      await renderJournal();
    },
    bind: bindJournalInteractions,
    invalidate() { _communityLoaded = false; },
    reset() { _communityEntries = []; _communityLoaded = false; },
  };
}
