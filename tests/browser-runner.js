// Tests d'intégration dans un vrai document de navigateur, sans dépendance.
// Les événements ciblent les contrôles rendus ; les modules applicatifs ne
// sont pas remplacés. Seuls Supabase et les catalogues utilisent des doubles.
const frame = document.getElementById("app-frame");
const results = document.getElementById("results");
const status = document.getElementById("status");
const start = document.getElementById("run");
let run, doc, win;
let passed = 0, failed = 0;
const errors = [];
const assert = (condition, message) => { if (!condition) throw new Error(message); };
async function waitFor(check, message, timeout = 7000) {
  const deadline = performance.now() + timeout;
  while (performance.now() < deadline) {
    const value = await check();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error(message);
}
const control = async values => (await fetch(`/__test/${run}/control`, values ? {
  method: "POST", body: JSON.stringify(values), headers: { "Content-Type": "application/json" },
} : undefined)).json();
async function mount(width, controls = {}) {
  run = crypto.randomUUID();
  await control(controls);
  frame.width = width;
  frame.height = width < 500 ? 844 : 850;
  const loaded = new Promise(resolve => frame.addEventListener("load", resolve, { once: true }));
  frame.src = `/app/?test=${run}`;
  await loaded;
  doc = frame.contentDocument; win = frame.contentWindow;
  win.addEventListener("error", event => errors.push(event.message));
  win.addEventListener("unhandledrejection", event => errors.push(String(event.reason)));
  await waitFor(() => doc.querySelector("#cards-grid"), "Application non montée");
}
const ready = async () => {
  await waitFor(() => doc.documentElement.dataset.testReady === "true", "Initialisation non terminée");
  return waitFor(() => doc.querySelector("#cards-grid .media-card"), "Bibliothèque non chargée");
};
function action(name, args, root = doc) {
  const controls = [...root.querySelectorAll(`[data-ui-action="${name}"]`)];
  const found = controls.find(item => args === undefined || JSON.stringify(JSON.parse(item.dataset.uiArgs || "[]")) === JSON.stringify(args));
  assert(found, `Commande absente : ${name} ${JSON.stringify(args || [])}`);
  return found;
}
function key(key, shiftKey = false) {
  doc.activeElement.dispatchEvent(new win.KeyboardEvent("keydown", { key, code: key, shiftKey, bubbles: true, cancelable: true }));
}
const closeDetail = async () => { key("Escape"); await waitFor(() => !doc.querySelector("#modal-overlay"), "Fiche non fermée"); };
const edit = async () => { action("openEditFromDetail").click(); await waitFor(() => doc.querySelector(".edit-modal"), "Édition absente"); };
async function openFirst() {
  const card = await ready();
  card.click();
  await waitFor(() => doc.querySelector(".detail-modal"), "Fiche absente");
  return card;
}
async function test(name, callback) {
  status.textContent = name;
  const row = document.createElement("li"); row.textContent = name; results.append(row);
  const before = errors.length;
  try {
    await callback();
    assert(errors.length === before, errors.slice(before).join(" | "));
    row.className = "pass"; row.textContent = `✓ ${name}`; passed++;
  } catch (error) {
    row.className = "fail"; row.textContent = `✗ ${name} — ${error.message}`; failed++;
  }
}

start.addEventListener("click", async () => {
  start.disabled = true; results.replaceChildren(); passed = 0; failed = 0; errors.length = 0;
  delete status.dataset.complete; delete status.dataset.failed;

  for (const width of [390, 768, 1120]) {
    await test(`Jaquettes et squelettes : même géométrie à ${width}px`, async () => {
      await mount(width, { holdEntries: true });
      const skeleton = await waitFor(() => doc.querySelector(".skeleton-cover"), "Squelettes absents");
      const rect = skeleton.getBoundingClientRect();
      assert(!doc.querySelector(".skeleton-body"), "Anciennes lignes sous les jaquettes");
      await control({ holdEntries: false });
      const card = await ready();
      await Promise.allSettled(card.getAnimations().map(animation => animation.finished));
      const cover = card.querySelector(".card-cover").getBoundingClientRect();
      assert(Math.abs(rect.width - cover.width) < 1 && Math.abs(rect.height - cover.height) < 1, "Taille différente entre chargement et résultat");
      assert(doc.documentElement.scrollWidth <= width + 1, "Débordement horizontal");
      action("toggleFilterDrawer").click();
      await waitFor(() => doc.querySelector(".filter-modal"), "Filtres absents");
      action("setLibraryDensity", ["compact"]).click();
      action("applyFilters").click();
      await waitFor(() => !doc.querySelector("#filter-modal-overlay"), "Filtres non fermés");
      assert(doc.documentElement.dataset.libraryDensity === "compact", "Densité Compact non appliquée");
      assert(doc.documentElement.scrollWidth <= width + 1, "Débordement en Compact");
    });
  }

  await test("Recherche vide et filtres vides proposent la bonne action", async () => {
    await mount(390); await ready();
    const input = doc.querySelector("#global-search");
    input.value = "Titre introuvable <test>";
    input.dispatchEvent(new win.Event("input", { bubbles: true }));
    await waitFor(() => doc.querySelector("#cards-grid .ui-state"), "État vide absent");
    assert(doc.querySelector("#cards-grid").textContent.includes("Effacer la recherche"), "Action de recherche incorrecte");
    assert(!doc.querySelector("#cards-grid test"), "Recherche interprétée comme HTML");
    action("clearLibraryFilter", ["search"], doc.querySelector("#cards-grid")).click();
    await ready(); assert(input.value === "", "Recherche non effacée");
    action("toggleFilterDrawer").click();
    action("toggleFavFilter").click();
    action("applyFilters").click();
    await waitFor(() => !doc.querySelector("#filter-modal-overlay"), "Filtres non fermés");
    assert(doc.querySelector("#cards-grid").textContent.includes("Réinitialiser les filtres"), "Action de filtre incorrecte");
    action("clearAllLibraryFilters", [], doc.querySelector("#cards-grid")).click();
    await ready();
  });

  await test("Chargement échoué : Réessayer récupère la bibliothèque", async () => {
    await mount(768, { failEntries: 1 });
    const retry = await waitFor(() => doc.querySelector('#cards-grid [data-ui-action="retryLibrary"]'), "Bouton Réessayer absent");
    await waitFor(() => doc.documentElement.dataset.testReady === "true", "Initialisation non terminée");
    retry.click(); await ready();
    await waitFor(() => doc.querySelector("#cards-grid").getAttribute("aria-busy") === "false", "Chargement encore annoncé");
    assert(doc.querySelector("#cards-grid").getAttribute("aria-busy") === "false", "Chargement encore annoncé");
  });

  await test("Quarante ouvertures successives sans ressource orpheline", async () => {
    await mount(768); await ready();
    const cards = [...doc.querySelectorAll("#cards-grid .media-card")];
    for (let index = 0; index < 40; index++) {
      const card = cards[index % cards.length];
      card.click();
      await waitFor(() => doc.querySelector(".detail-title")?.textContent === card.querySelector(".card-title").textContent, "Mauvais média ouvert");
      await waitFor(() => doc.querySelector(".detail-modal")?.contains(doc.activeElement), "Focus absent de la fiche");
      await closeDetail();
      assert(doc.activeElement === card, "Focus non rendu à la jaquette");
      assert(!doc.querySelector("#main").inert, "Arrière-plan resté inerte");
      assert(!doc.querySelector(".detail-cover-flight"), "Clone de transition resté monté");
    }
    assert(doc.querySelectorAll(".detail-modal").length === 0, "Ancienne fiche encore montée");
  });

  for (const width of [390, 768]) {
    await test(`Modifier → fiche : note, cœur et lecture conservés à ${width}px`, async () => {
      await mount(width); const card = await openFirst();
      const toggle = await waitFor(() => {
        const button = doc.querySelector(".detail-synopsis-toggle"); return button && !button.hidden ? button : null;
      }, "Synopsis non dépliable");
      toggle.click();
      const body = doc.querySelector(".detail-body"); body.scrollTop = 180;
      const previousScroll = body.scrollTop;
      assert(previousScroll > 0, "Le test doit partir d'une fiche défilée");
      await edit();
      doc.querySelector('[data-rating-value="10"]').click();
      doc.querySelector("#f-favorite").click();
      action("saveEntry").click();
      await waitFor(() => doc.querySelector(".detail-modal"), "Pas de retour à la fiche après enregistrement");
      assert(doc.querySelector(".detail-rating").textContent.includes("10/10"), "Note non actualisée");
      assert(doc.querySelector(".detail-fav").classList.contains("is-active"), "Coup de cœur non actualisé");
      assert(doc.querySelector(".detail-synopsis-wrap").classList.contains("expanded"), "Synopsis replié au retour");
      assert(Math.abs(doc.querySelector(".detail-body").scrollTop - previousScroll) < 3, "Position de lecture perdue");
      await waitFor(() => doc.activeElement?.dataset.uiAction === "openEditFromDetail", "Focus non rendu à Modifier");
      await closeDetail(); assert(doc.activeElement?.dataset.id === card.dataset.id, "Retour final sur une mauvaise jaquette");
    });
  }

  await test("Annuler une modification et revenir au clavier", async () => {
    await mount(1120); await openFirst(); await edit();
    doc.querySelector("#f-favorite").click();
    key("Escape");
    await waitFor(() => doc.querySelector("#confirm-overlay"), "Confirmation de perte absente");
    doc.querySelector("#confirm-cancel").click();
    await waitFor(() => !doc.querySelector("#confirm-overlay"), "Confirmation restée ouverte");
    assert(doc.querySelector("#f-favorite").checked, "Brouillon perdu après refus");
    key("Escape");
    await waitFor(() => doc.querySelector("#confirm-overlay"), "Seconde confirmation absente");
    doc.querySelector("#confirm-ok").click();
    await waitFor(() => doc.querySelector(".detail-modal"), "Annuler ne revient pas à la fiche");
    assert(!doc.querySelector(".detail-fav").classList.contains("is-active"), "Modification annulée sauvegardée");
    const items = [...doc.querySelectorAll('.detail-modal a[href], .detail-modal button:not([disabled])')].filter(el => el.getClientRects().length);
    items.at(-1).focus(); key("Tab"); assert(doc.activeElement === items[0], "Tab sort de la fiche");
    key("Tab", true); assert(doc.activeElement === items.at(-1), "Maj+Tab sort de la fiche");
    await closeDetail();
  });

  await test("Coupure pendant l'enregistrement : changement local puis synchronisation automatique", async () => {
    await mount(390); await openFirst(); await edit();
    doc.querySelector("#f-favorite").click();
    await control({ failWrites: 1, writeDelay: 350 });
    const save = action("saveEntry"); const width = save.getBoundingClientRect().width;
    save.click();
    assert(save.disabled, "Double enregistrement possible");
    assert(Math.abs(save.getBoundingClientRect().width - width) < 1, "Le bouton change de largeur");
    await waitFor(() => doc.querySelector(".detail-modal"), "Le changement local n'a pas rouvert la fiche");
    assert(doc.querySelector(".detail-fav").classList.contains("is-active"), "Le changement local n'est pas visible");
    assert((await control()).writes === 0, "Une écriture a eu lieu malgré la coupure");
    const network = doc.querySelector("#network-status");
    assert(!network.hidden && /attente|indisponible/i.test(network.textContent), "Synchronisation en attente non signalée");
    await waitFor(async () => (await control()).writes === 1, "La synchronisation automatique n'a pas repris", 5000);
    await waitFor(() => doc.querySelector("#network-status").hidden, "L'indicateur reste visible après synchronisation");
    await closeDetail();
  });

  await test("Actualiser une fiche retrouve exactement la page et le média", async () => {
    await mount(768); const card = await openFirst();
    const mediaId = card.dataset.id;
    assert(win.location.hash.includes(`media-id=${encodeURIComponent(mediaId)}`), "La fiche n'est pas inscrite dans l'URL");
    const loaded = new Promise(resolve => frame.addEventListener("load", resolve, { once: true }));
    win.location.reload();
    await loaded;
    doc = frame.contentDocument; win = frame.contentWindow;
    win.addEventListener("error", event => errors.push(event.message));
    win.addEventListener("unhandledrejection", event => errors.push(String(event.reason)));
    await waitFor(() => doc.querySelector(`.detail-modal[data-detail-media-id="${mediaId}"]`), "La fiche n'a pas été restaurée");
    assert(doc.documentElement.dataset.page === "library", "La page d'origine n'a pas été restaurée");
    await closeDetail();
  });

  await test("Profil et Journal : navigation, états communs et reprise après erreur", async () => {
    await mount(768, { failEvents: 1, failCommunity: 1 }); await ready();
    await waitFor(() => doc.querySelector("#cards-grid").getAttribute("aria-busy") === "false", "Chargement non terminé");
    action("navTo", ["journal"]).click();
    const retry = await waitFor(() => doc.querySelector('[data-ui-action="retryJournal"]'), "État d'erreur du Journal absent");
    retry.click(); await waitFor(() => doc.querySelector(".journal-event-row"), "Journal non récupéré");
    doc.querySelector("#journal-mode-community").click();
    await waitFor(() => doc.querySelector('#community-feed [data-ui-action="retryJournal"]'), "État d'erreur Communauté absent");
    action("retryJournal", undefined, doc.querySelector("#community-feed")).click();
    await waitFor(() => doc.querySelector(".community-event-row"), "Communauté non récupérée");
    action("navTo", ["dashboard"]).click();
    await waitFor(() => doc.querySelector(".profile-ratings-card"), "Profil absent après extraction");
    assert(doc.querySelector(".profile-year-overview").nextElementSibling.classList.contains("profile-ratings-card"), "Histogramme mal placé");
    action("setProfilePeriod", ["year"]).click();
    await waitFor(() => doc.querySelector(".profile-year-overview h2")?.textContent.includes("Votre année"), "Sélecteur annuel inactif");
  });

  await test("Sorties : erreur puis récupération des cartes", async () => {
    await mount(1120, { failUpcoming: 3 }); await ready();
    action("navTo", ["upcoming"]).click();
    await waitFor(() => doc.querySelector("#upcoming-grid .ui-state-error"), "État d'erreur Sorties absent");
    action("refreshUpcoming", undefined, doc.querySelector("#upcoming-grid")).click();
    await waitFor(() => doc.querySelector(".upcoming-card"), "Sorties non récupérées");
  });

  status.textContent = `${passed} parcours réussis · ${failed} échec${failed === 1 ? "" : "s"}`;
  status.dataset.complete = "true"; status.dataset.failed = String(failed);
  start.disabled = false;
});
