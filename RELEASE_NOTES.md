# ProClubs Stats — v0.6.0

## 🔐 Sécurisation du backend Rust

- **Suppression des panics** : remplacement de tous les `.unwrap()` et `.expect()` critiques par une gestion d'erreur via `Result` et `?`
  - `ea_client.rs` : le `RwLock` poison est récupéré proprement, la construction du client HTTP dispose d'un fallback sans proxy
  - `lib.rs` : l'accès au répertoire `app_data_dir` retourne désormais une erreur Tauri propre au lieu de crasher l'app
- **Content Security Policy activée** : CSP stricte configurée dans `tauri.conf.json` — whitelist `unsafe-inline` (jsPDF), Google Fonts, EA Sports CDN

## 🔄 Migration du système de mise à jour automatique

- **Nouveau dépôt de release** : l'updater pointe désormais vers `github.com/Zoran-n/ProStatsClub`
- **Format Tauri Updater v2 complet** : le workflow CD génère désormais le `latest.json` avec l'archive `.nsis.zip` signée (et non plus le `.exe` NSIS direct), conforme au protocole de mise à jour automatique
- Les artefacts uploadés par release : `.exe` (installeur manuel) + `.nsis.zip` + `.nsis.zip.sig` + `latest.json`

## 🧹 Qualité du code TypeScript

- **Zéro `any` explicite** : les 21 occurrences de `any` ont été remplacées par des types précis (`unknown`, `Record<string, number | string>`, types Recharts inline)
- **Auto-archivage des sessions** : les sessions de plus de 90 jours sont automatiquement archivées à la fermeture d'une session pour préserver la RAM

## 📖 Documentation

- La section "💡 Prochaines idées" du README a été transformée en **🗺️ Roadmap** structurée, distinguant les fonctionnalités en cours (heatmap, rapport saison Discord, bannière offline) des idées futures
