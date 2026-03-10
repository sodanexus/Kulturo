# 🎭 Kulturo

> Journal culturel personnel — suivez vos jeux, films et livres.

**Dashboard personnel 100% front-end, hébergeable sur GitHub Pages, connecté à Supabase.**

---

## ✨ Fonctionnalités

- **Bibliothèque** : cartes élégantes, filtres, tri, recherche instantanée
- **Statuts** : Wishlist · En cours · Terminé · En pause · Abandonné
- **Coups de cœur** : système de favoris rapide
- **Notes /10** : étoiles interactives
- **API médias** : préremplissage automatique (TMDb · RAWG · Open Library)
- **Dashboard** : stats, graphiques en barres, répartitions
- **Export / Import JSON** : sauvegarde locale de vos données
- **Mode démo** : fonctionne sans compte Supabase
- **Dark / Light mode** : bascule en un clic
- **Responsive** : mobile · tablette · desktop

---

## 🗂 Structure du projet

```
kulturo/
├── index.html          # Point d'entrée unique (SPA)
├── style.css           # Design system complet
├── app.js              # Logique principale (routing, UI, état)
├── supabase.js         # Client Supabase + toutes les opérations DB
├── api.js              # Intégrations TMDb / RAWG / Open Library
├── config.js           # ← À créer (voir ci-dessous) — NE PAS COMMITTER
├── config.example.js   # Template de configuration
├── schema.sql          # Schéma Supabase avec RLS
└── README.md
```

---

## 🚀 Mise en route rapide

### 1. Cloner et configurer

```bash
git clone https://github.com/VOTRE_USER/kulturo.git
cd kulturo

# Créer votre fichier de config
cp config.example.js config.js
```

### 2. Éditer `config.js`

Ouvrez `config.js` et remplissez vos clés :

```js
const CONFIG = {
  supabase: {
    url:     "https://VOTRE_PROJECT_ID.supabase.co",
    anonKey: "VOTRE_ANON_KEY",
  },
  tmdb: { apiKey: "VOTRE_CLE_TMDB", ... },
  rawg: { apiKey: "VOTRE_CLE_RAWG", ... },
  // ...
};
```

### 3. Ajouter `config.js` au `.gitignore`

```bash
echo "config.js" >> .gitignore
```

---

## 🗄 Configuration Supabase

### Créer un projet

1. Rendez-vous sur [supabase.com](https://supabase.com) → **New project**
2. Notez votre **URL** et votre **anon key** (Settings → API)

### Initialiser la base de données

1. Dans votre projet Supabase → **SQL Editor**
2. Collez et exécutez le contenu de `schema.sql`

### Activer l'authentification

1. Supabase → **Authentication** → **Providers**
2. Activez **Email** (activé par défaut)
3. Optionnel : désactivez la confirmation par email pour le développement
   (Authentication → Settings → "Enable email confirmations" → OFF)

### Clés à récupérer

Dans **Settings → API** :
- `Project URL` → `CONFIG.supabase.url`
- `anon public` → `CONFIG.supabase.anonKey`

---

## 🔌 Ajouter les clés d'API médias

### TMDb (films)

1. Créez un compte sur [themoviedb.org](https://www.themoviedb.org)
2. Settings → API → **Request an API Key** (type : Developer)
3. Copiez la **API Key (v3 auth)** dans `CONFIG.tmdb.apiKey`

### RAWG (jeux vidéo)

1. Créez un compte sur [rawg.io](https://rawg.io)
2. [rawg.io/apidocs](https://rawg.io/apidocs) → **Get API Key**
3. Copiez la clé dans `CONFIG.rawg.apiKey`

### Open Library (livres)

Pas de clé requise — fonctionne immédiatement.

---

## 🌐 Déployer sur GitHub Pages

### Option A — Via l'interface GitHub (recommandé)

1. Poussez votre code sur GitHub :
   ```bash
   git add -A
   git commit -m "Initial commit"
   git push origin main
   ```
2. Dans votre dépôt GitHub → **Settings** → **Pages**
3. Source : **Deploy from a branch** → Branch : `main` → Folder : `/ (root)`
4. Cliquez **Save** — votre site sera disponible en quelques minutes à :
   `https://VOTRE_USER.github.io/kulturo/`

### Option B — GitHub Actions (automatique)

Créez `.github/workflows/deploy.yml` :

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./
```

### ⚠️ Important : `config.js` sur GitHub Pages

Puisque `config.js` est dans le `.gitignore`, il ne sera pas déployé.

**Solutions :**

**A) Inclure `config.js` dans le dépôt (simple, acceptable si dépôt privé)**
```bash
git add -f config.js   # force l'ajout malgré .gitignore
```
Acceptable uniquement si le dépôt est **privé**.

**B) Variables d'environnement via GitHub Actions (recommandé pour dépôt public)**
```yaml
- name: Create config
  run: |
    cat > config.js << EOF
    const CONFIG = {
      supabase: { url: "${{ secrets.SUPABASE_URL }}", anonKey: "${{ secrets.SUPABASE_KEY }}" },
      tmdb: { apiKey: "${{ secrets.TMDB_KEY }}", ... },
      ...
    };
    EOF
```
Puis ajoutez vos secrets dans **Settings → Secrets → Actions**.

**C) Mode démo public + Supabase privé**
Laissez `config.js` dans le dépôt avec `demoMode: false` et vos vraies clés uniquement si le repo est privé.

---

## 🛠 Développement local

Vous avez besoin d'un serveur local (les modules ES ne fonctionnent pas en `file://`) :

```bash
# Python
python3 -m http.server 8000

# Node.js
npx serve .

# VS Code
# Extension "Live Server" → clic droit sur index.html → Open with Live Server
```

---

## 📦 Mode démo

Si `CONFIG.app.demoMode = true` ou si les clés Supabase ne sont pas configurées, l'app démarre avec 10 entrées de démonstration sans aucune connexion requise.

Parfait pour tester ou présenter l'application.

---

## 🔒 Sécurité

- Les policies **Row Level Security** (RLS) de Supabase garantissent que chaque utilisateur ne voit que ses propres données.
- La clé `anon` est conçue pour être publique — elle ne donne accès qu'aux données de l'utilisateur connecté.
- Ne commitez jamais une clé `service_role` dans votre code front-end.

---

## 📄 Licence

MIT — libre d'utilisation, modification et distribution.
