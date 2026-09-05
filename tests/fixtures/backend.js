// Double local : aucune authentification et aucune écriture Supabase réelle.
const run = new URLSearchParams(location.search).get("test") || "manual";
const endpoint = name => `/__test/${encodeURIComponent(run)}/${name}`;
async function request(name, options) {
  const response = await fetch(endpoint(name), options);
  if (!response.ok) throw new Error("Connexion de test interrompue");
  return response.json();
}
const user = { id: "00000000-0000-4000-8000-000000000001", email: "test@example.invalid" };
// Ce module est évalué avant app.js, qui lit certaines préférences dès son
// import. Réinitialiser ici garantit l'indépendance des parcours successifs.
{
  for (const key of ["kulturo-nav", "kulturo-sort", "kulturo-library-density", "kulturo-journal-mode", "kulturo-upcoming-preferences-v2"]) localStorage.removeItem(key);
  sessionStorage.removeItem("kulturo-ui-snapshot-v2");
  sessionStorage.removeItem("kulturo-ui-snapshot-v3");
  localStorage.removeItem("kulturo-entries-v1:" + user.id);
}
export function initSupabase() { return true; }
export const Auth = {
  getSessionUser: async () => user, getUser: async () => user,
  getAccessToken: async () => "local-test",
  onAuthChange() { document.documentElement.dataset.testReady = "true"; },
  signOut: async () => {},
};
export const Media = {
  getAll: () => request("entries"),
  update: (id, changes) => request(`entries/${id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes),
  }),
  create: entry => request("entries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry) }),
  delete: id => request(`entries/${id}`, { method: "DELETE" }),
};
export const Journal = { getAll: () => request("events"), hide: async () => { throw new Error("Non couvert par ce double"); } };
export const Profiles = { get: () => request("profile"), upsert: (_id, username) => request("profile", { method: "POST", body: JSON.stringify({ username }) }) };
export const Activity = { getFeed: () => request("community") };
export const Backup = { restore: async () => { throw new Error("Restauration désactivée dans les tests de parcours"); } };
