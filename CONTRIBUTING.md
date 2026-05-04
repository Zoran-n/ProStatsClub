# Guide de contribution — ProClubs Stats

Merci de l'intérêt que vous portez au projet ! Voici comment contribuer efficacement.

## 🌳 Stratégie de Branches (Git Flow)

Nous utilisons le modèle **Git Flow**. Voici les branches principales :

- **`main`** : Code de production stable. Ne reçoit que des merges de `release/*` ou `hotfix/*`.
- **`develop`** : Branche d'intégration. Toutes les nouvelles fonctionnalités y sont regroupées.
- **`feature/*`** : Pour chaque nouvelle fonctionnalité (ex: `feature/dark-mode`).
- **`release/*`** : Préparation d'une nouvelle version (ex: `release/v0.5.0`).
- **`hotfix/*`** : Correction urgente en production (ex: `hotfix/v0.4.1`).

### Cycle d'une fonctionnalité
1. Créez votre branche depuis `develop` : `git checkout -b feature/nom-de-la-feature develop`
2. Développez et testez localement (`npm run test`, `cargo test`).
3. Créez une Pull Request vers `develop`.
4. Une fois validée, elle sera mergée dans `develop`.

## 🛠️ Développement local

1. **Prérequis** : Node.js 20+, Rust (rustup), et les dépendances Tauri selon votre OS.
2. **Installation** : `npm install`
3. **Lancement** : `npm run tauri dev`

## 📝 Conventions de Commits

Nous suivons une convention simple pour garder un historique lisible :
- `feat:` nouvelle fonctionnalité
- `fix:` correction de bug
- `docs:` documentation
- `refactor:` modification du code sans changement de comportement
- `chore:` maintenance (dépendances, config)

Exemple : `feat: ajout du graphique de possession`

## ✅ Workflow de Release

1. Une branche `release/vX.X.X` est créée depuis `develop`.
2. Le numéro de version est mis à jour dans `package.json`, `src-tauri/Cargo.toml` et `src-tauri/tauri.conf.json`.
3. Après validation finale, elle est mergée dans `main` (déclenche le build) et `develop`.
4. Un tag `vX.X.X` est poussé sur `main`.
