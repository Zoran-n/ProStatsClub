# Changelog — ProClubs Stats

## v0.7.2 — 2026-05-11 (Refonte Header & Standardisation du Thème)

### Thème

- **Palette "Classic" (Anthracite/Bleu)** : nouveau preset par défaut — `#121212`/`#1e1e1e`, accent bleu `#3b82f6`, sobre et neutre
- **Thème par défaut** : `palettePreset: "classic"` (était `"neon-cyber"`) — Neon Cyber reste disponible dans les réglages
- **Discord Classic** renommé "Discord" dans le sélecteur de palettes pour éviter la collision de labels

### Header contextuel

- **Background dynamique** : `background: var(--surface)` remplace le `rgba(3,3,3,0.85)` hardcodé — le header s'adapte à tous les thèmes (clair, classic, cyber)
- **Épuration totale** : retrait du titre de page (`# Joueurs`), du nom de club, logo, SR et de tous les boutons Discord du header
- **Barre de recherche** à gauche (flex, max 200px) avec raccourci `Ctrl+K` visible
- **Boutons de vue textualisés** à droite : "VUE DASHBOARD" (`LayoutDashboard` + texte) et "VUE COMPACTE" (`Minimize2` + texte), Bebas Neue 10px, état actif en couleur accent

### Bandeau Club — Centre de Commande

- **Actions Discord déplacées** dans le bandeau club (sous le header) : bouton PARTAGER conditionnel sur l'onglet actif + 6 icônes d'actions (Annonce, Sondage, Highlight, Thread, Classement, Rapport)
- **Hover interactif** sur les icônes Discord : couleur accent au survol
- **Badge LIVE** conservé à droite du bandeau

---

## v0.6.9 — 2026-05-11 (Simplification & Automatisation)

### Suppression

- **CompareModal supprimé** : retrait de la modale de comparaison multi-joueurs et de toute la logique associée dans PlayersTab (`compareMode`, `compareSelected`, `COMPARE_COLORS`, bannière compare, bouton toolbar)
- **MyProfilePage supprimé** : onglet "PROFIL" retiré de la sidebar et de `SidebarTab` — la gestion du compte EA reste dans les paramètres

### Automatisation

- **Auto-refresh permanent** : `useAutoRefresh` hook always-on (60 s), s'active dès qu'un club est chargé — remplace le toggle manuel
- **Barre de progression 1 px** : `.refresh-bar` cyan animée (`@keyframes refresh-sweep` 60 s linéaire) en haut du panneau principal, indique le prochain refresh
- **`discordLogger.ts`** : module singleton extrait dans `src/api/` — `addDiscordLog`, `useDiscordLogs`, `clearDiscordLogs` découplés de MyProfilePage

### Responsive

- **ProfilePanel** : grille de stats `repeat(auto-fill, minmax(100px, 1fr))` — passe naturellement de 4 à 2 colonnes sur panneau étroit

---

## v0.6.8 — 2026-05-11 (Refonte UI SaaS High-Tech)

### Design System — Migration Discord → SaaS High-Tech

- **Nouvelle palette "Neon Cyber"** : `--bg: #030303`, `--surface: #0a0a0b`, `--card: #0d0d10`, accent cyan `#00f2ff` + violet `#7000ff` — activée par défaut au premier lancement
- **Tokens CSS centralisés** : `--app-bar-bg`, `--app-bar-w: 52px`, `--sidebar-w: 220px`, `--z-sidebar/header/modal/toast`, `--radius: 8px` — toutes les valeurs en une seule source de vérité
- **Classe `.glass-card`** : `backdrop-filter: blur(12px)` + fallback opaque `@supports`, bordure `rgba(255,255,255,0.08)`, variantes glow cyan/violet
- **Classe `.border-beam`** : animation `@property --border-angle` conic-gradient tournant en continu (bordure lumineuse)
- **Classe `.stagger-container`** : 8 enfants animés en cascade (0–385 ms)
- **Composant `GlassCard`** : `motion.div` framer-motion avec props `glow`, `beam`, `hover`, `padding` — micro-lift `y: -1` au survol

### App Shell

- **GuildBar réduite à 52 px** : icônes 40×40 px, `borderRadius: 8`, indicateur actif 2 px cyan (`cubic-bezier(0.4,0,0.2,1)`) avec `box-shadow` glow
- **Suppression totale des vestiges Discord** : classes `.guild-pill`, `.guild-icon`, `.guild-icon-text`, variables `--guild-bar` → `--app-bar-bg`, prop `showDiscordLayout` → `showAppBar`
- **TitleBar** : fond `var(--app-bar-bg)`, `paddingLeft` calé sur 52 px quand `showAppBar` actif
- **Header MainPanel** : sticky, `backdrop-filter: blur(12px)`, hauteur 44 px, `z-index: var(--z-header)`
- **Tooltip** : `.ui-tooltip` (remplace `.discord-tooltip`) — fond `var(--surface)`, bordure + box-shadow, sans flèche

### Graphiques & Données

- **AreaChart** avec gradients SVG uniques (`GRAD_IDS`) sur Possession, Shot Ratio, Performance — remplace LineChart
- **RadarChart** : `PolarGrid` à 6 % opacité, fill gradient cyan
- **CartesianGrid** : `strokeDasharray="2 4"`, opacité 4 %, sans lignes verticales
- **Tooltip recharts** : fond `var(--surface)`, `boxShadow: 0 8px 24px rgba(0,0,0,0.5)`
- **PlayersTab hover** : `borderColor: rgba(0,242,255,0.3)` + fond `rgba(0,242,255,0.03)`
- **MatchesTab separators** : `0.5px solid rgba(255,255,255,0.04)` — plus discrets

### Contraste & Accessibilité

- **`--muted` → `#8892a4`** : ratio WCAG AA ~5.4:1 sur `#030303` (était `#4a5568`, ratio 2.6:1)
- **`@media (forced-colors: active)`** : règle `.nav-icon-btn.active` conservée, règle obsolète `.guild-icon.active` supprimée

### Qualité

- **Scrollbar** : 4 px, track transparent, thumb `rgba(255,255,255,0.1)` → hover `rgba(0,242,255,0.4)` — bloc CSS dupliqué supprimé
- **Empty states** : `GlassCard` centrée + icône `DatabaseZap` dans PlayersTab et MatchesTab (×3 emplacements)
- **Palette `neon-cyber`** ajoutée dans `PALETTE_PRESETS` et dans `useAppStore` (défaut)

---

## v0.4.1 — 2026-04-17 (comparaison de clubs enrichie)

### Comparaison multi-saisons
- Sélecteur de saison par club dans l'onglet Stats — compare les stats d'une saison précise au lieu de la saison actuelle
- Appel `getSeasonHistory` au chargement de chaque club — dropdown avec toutes les saisons disponibles + SR par saison
- Le radar et le tableau reflètent dynamiquement la saison choisie

### Mode Battle
- Nouvel onglet **Battle** dans la comparaison de clubs (accessible dès 2 clubs chargés)
- Pour chaque stat (V%, Victoires, Buts, Buts/Match, Joueurs, Note moy., MOTM) : bouton de vote par club
- Auto-highlight du meilleur sur chaque ligne (fond coloré)
- Classement final en temps réel : compteur de stats gagnées par club + podium visuel
- Bouton "Réinitialiser" pour recommencer

### Comparaisons nommées
- Bouton **Sauvegarder** dans la barre d'actions — prompt inline pour nommer la comparaison
- Panel **Sauvegardées** : liste des comparaisons nommées avec nom, clubs et date
- Restauration en un clic (recharge les clubs), **renommage inline** (clic crayon), suppression
- Stockées dans `Settings.savedComparisons` (max 30), persistées localement

### Export PDF rapport
- Bouton **PDF** dans la barre d'actions de la comparaison
- Rapport complet : header coloré, tableau des 10 stats comparées (meilleur marqué ★), radar multi-clubs dessiné avec primitives jsPDF, section H2H optionnelle
- Footer de page numérotée sur chaque page

### Alertes SR dans la comparaison
- Icône 🔔/🔕 par slot de club — active/désactive la surveillance du Skill Rating
- Notification toast si le SR a changé depuis la dernière visite (en mémoire des favoris)
- Cohérent avec le système `srAlerts` existant du store

### Types & Store
- Nouveau type `SavedComparison` dans `types/index.ts`
- Champ `savedComparisons?: SavedComparison[]` dans `Settings`
- Nouvelles actions store : `saveComparison`, `deleteSavedComparison`, `renameSavedComparison`
- Persistance complète dans `persistSettings` / `loadSettings`

---

## v0.4.1 — 2026-04-08 (post-release, offline + cache)

### Mode hors-ligne
- Détection automatique de la connexion réseau via `navigator.onLine` + événements `online`/`offline`
- Bannière **MODE HORS-LIGNE** affichée en haut de l'app quand le réseau est absent
- `useAutoLoad` et `useMatchData` vérifient `navigator.onLine` avant chaque appel API — aucune requête inutile hors connexion
- Les données du cache (matchs, joueurs, sessions) restent entièrement accessibles et navigables

### Cache matchs — capacité 2000
- Limite `CACHE_LIMIT = 2000` matchs par type dans `useAutoLoad` — la pagination s'arrête proprement à 2000
- **Indicateur de progression dans Mon Profil** : barre de progression (X / 2000) pour chaque type (Championnat / Playoff / Amical) et total global (X / 6000)
- Les barres passent au vert quand la limite est atteinte

---

## v0.4.1 — 2026-04-08 (post-release, perf)

### Performance & architecture

#### Virtualisation de la liste joueurs
- `react-window` (FixedSizeList) dans PlayersTab — seules les cartes visibles sont dans le DOM
- Performances constantes que le club ait 5 ou 500 joueurs

#### Hook `useMatchData` — séparation API / composant
- Toute la logique fetch/cache/pagination/auto-loader extraite de MatchesTab dans `src/hooks/useMatchData.ts`
- MatchesTab ne gère plus que l'affichage — hook réutilisable dans d'autres vues

#### Persistance sélective
- `persistSettings` compare le JSON sérialisé avec le dernier sauvegardé
- Si rien n'a changé, apiSave n'est pas appelé → zéro I/O disque inutile
- Particulièrement utile lors du chargement automatique de matchs en arrière-plan

---

## v0.4.1 — 2026-04-08 (post-release, suite)

### Chargement automatique au démarrage

#### Club auto-chargé si profil EA lié
- Nouveau hook `useAutoLoad` : dès que les settings sont restaurés, si un profil EA est lié, le club est chargé automatiquement — plus besoin de cliquer "Charger mon club" à chaque ouverture

#### Chargement complet des matchs en arrière-plan
- Dès que le club est chargé et un profil EA est lié, les 3 types de matchs (Championnat, Playoff, Amical) sont récupérés silencieusement page par page (800 ms entre chaque page, 500 ms entre chaque type)
- Tous les matchs sont stockés dans `matchCache` → la vue Calendrier est entièrement remplie sans action manuelle
- Évite les re-téléchargements inutiles : si des matchs sont déjà en cache, la pagination reprend depuis le plus ancien

### Bundle Windows — réduction faux positifs antivirus
- Ajout des métadonnées `publisher`, `copyright`, `shortDescription` dans le bundle
- Installeur NSIS configuré en `installMode: currentUser` (installation sans droits admin, moins suspect pour les AV)
- `digestAlgorithm: sha256` pour les signatures

---

## v0.4.1 — 2026-04-08 (post-release, comparaison de clubs)

### Comparaison de clubs — refonte complète

#### Multi-clubs (jusqu'à 4)
- Slots dynamiques : bouton **+** pour ajouter jusqu'à 4 clubs, **×** pour en retirer un
- Chaque slot a sa propre couleur (cyan / violet / orange / vert) pour distinguer les clubs visuellement

#### Onglets de section
- Nouvelle barre d'onglets **Stats | Radar | H2H | Joueurs** pour naviguer entre les vues

#### Tableau Stats N colonnes
- Colonnes dynamiques : autant de colonnes que de clubs chargés
- Nouvelle ligne **V%** (taux de victoire) dans le tableau
- Mise en valeur couleur du meilleur par ligne (et du moins bon pour les Défaites)

#### Radar normalisé
- Radar **Recharts** avec une courbe par club, normalisé sur 100
- 6 stats clés : V%, Buts/Match, Passes/J, Tacles/J, Note Moyenne, MOTM total
- Légende interactive avec nom de chaque club

#### Historique H2H
- Chargement automatique des matchs de championnat du Club 1 et filtrage des confrontations directes avec le Club 2
- **Bilan résumé** : 4 compteurs (Victoires / Nuls / Défaites / Total matchs)
- **Liste triée par date** : score, résultat (V/N/D coloré), date de chaque confrontation
- Message "Aucune confrontation directe trouvée" si l'API ne retourne pas de matchs communs

#### Joueurs multi-clubs
- Tableau multi-colonnes : une colonne par club pour chaque groupe de poste (GK, DEF, MIL, ATT)
- Surlignage couleur du meilleur joueur par poste (seulement si ex-æquo non partagé)

---

## v0.4.1 — 2026-03-30

### KPIs personnalisables

#### Bouton ÉDITER sur la barre KPI
- Nouveau bouton **ÉDITER** (icône crayon) à droite de la barre de KPIs — s'allume en couleur d'accent quand actif
- Ouvre un **panel dropdown** listant les 8 KPIs disponibles avec checkbox visuelle, nom coloré et description
- KPIs disponibles : **Matchs**, **Victoires**, **Nuls**, **Défaites**, **% Victoires**, **Buts** (originaux), + **Buts/Match** (moyenne calculée) et **Points** (V×3 + N×1, format ligue)
- Impossible de désactiver le dernier KPI visible (minimum 1 toujours affiché)
- La sélection est **persistée** immédiatement dans les settings locaux (survit au redémarrage)
- Traduit en 5 langues (FR / EN / ES / DE / PT)

### Joueurs — nouvelles fonctionnalités

#### Classement score composite
- Nouvelle option de tri **🏆 Score** dans le sélecteur : classe les joueurs par score pondéré (buts×3 + PD×2 + MOTM×5 + note×10)
- Le score s'affiche sur chaque carte quand ce tri est actif

#### Sparkline inline
- **Mini courbe des dernières notes** visible directement sur chaque carte joueur (sans ouvrir la modale)
- Calculée depuis le cache de matchs (10 derniers matchs de championnat)
- Point final coloré selon la dernière note (vert ≥ 7.5, jaune ≥ 6.5, rouge < 6.5)

#### Alerte de performance
- Icône ⚠️ sur les joueurs dont la **moyenne des 5 derniers matchs < 6.5**
- Bordure rouge légère sur leur carte
- Filtre "Alertes seulement" dans le panneau de filtres pour n'afficher que ces joueurs

#### Export PDF fiche joueur
- Bouton **PDF** (orange) dans la modale joueur
- Génère un PDF avec : en-tête coloré, tableau stats complet (+ stats avancées si disponibles), historique de la note par match

#### Comparaison étendue (2 à 4 joueurs)
- Mode COMPARER : sélection de **2 à 4 joueurs** avec chips colorées dans la bannière
- Bouton **Comparer (N)** pour ouvrir la modale manuellement quand la sélection est prête
- Radar chart + tableau stats supporte maintenant 3 et 4 joueurs simultanément
- **Bouton Discord** dans la modale de comparaison : envoie un embed avec scores et highlight du meilleur par stat

---

## v0.4.0 — 2026-03-30

### Nouvelles fonctionnalités — Onglet Matchs

#### Chargement automatique
- **Persistance auto de tous les matchs** : quand le profil EA est lié, les pages suivantes sont chargées silencieusement en arrière-plan (800 ms entre chaque batch) jusqu'à épuisement de l'historique — le calendrier se remplit entièrement sans action manuelle
- Le bouton "Charger plus" reste visible uniquement sans profil EA lié ; avec profil, un indicateur pulsé remplace le bouton

#### Bilan vs adversaire
- Quand un nom d'adversaire est saisi dans le filtre, un bandeau s'affiche au-dessus de la liste avec **W/N/D** + **buts moyens marqués/encaissés** calculés sur tous les matchs chargés contre ce club

#### Graphique de forme
- **Mini line chart** (recharts) affichant les 10 derniers résultats (V=3, N=1, D=0) avec points colorés (vert/jaune/rouge) — visible dès 3 matchs chargés en mode liste

#### Filtre par période
- Deux champs date **Du / Au** dans la barre d'outils pour filtrer la liste et le calendrier sur une plage de dates précise
- Bouton ✕ pour effacer les dates rapidement

#### Annotations de match
- Bouton ✏️ (PenLine) sur chaque carte de match pour ouvrir une zone de texte libre
- La note est affichée en italique dans le sous-titre quand elle est remplie et le panneau fermé
- Persistée localement via les settings Tauri (`matchAnnotations` dans `Settings`)

---

## v0.3.22 — 2026-03-30

### Nouvelles fonctionnalités

#### Session
- **Modal Détails session** : bouton ℹ sur chaque session passée — affiche la liste des matchs (score, adversaire, badge W/L/D, heure), le tableau des stats joueurs (MJ / ⚽ / 🅰️ / ★ MOTM / note moyenne), et les boutons Discord + PDF
- **Bilan V/N/D** affiché directement sur les cartes de sessions passées (vert / gris / rouge)
- **Correction** : les badges W/L/D affichaient toujours "D" — corrigé en utilisant les champs `wins`/`losses` de l'API EA au lieu de `matchResult` inexistant

#### Discord
- **Partage profil joueur** : bouton Discord dans la modale joueur — envoie stats complètes + évolution Note/Buts/PD match par match
- **Embed stats club redesigné** : format proche de OurProClub — Games Played, Skill Rating, Record (W/D/L), Goals (F/A/D), Win Rate, Most Appearances, Most MOTM, Top Scorer, Top Assister, Top Passer, Top Tackler, résultats récents par type (🟢🔴🟡)
- **Embed session enrichi** : liste des matchs avec score et icônes résultat + stats top 5 joueurs
- Section Discord masquée quand aucun club n'est sélectionné

#### Mises à jour
- **Toggle "Mise à jour automatique"** dans les paramètres (persistant) — vérifie une mise à jour au démarrage si activé
- **Pastille rouge 🔴** pulsante sur l'icône ⚙️ quand une nouvelle version est disponible
- **Modal de mise à jour** : affiche la version disponible, les notes de release GitHub, propose "Installer maintenant" (télécharge + relance) ou "Plus tard"

### Corrections
- `auto_update` ajouté à la struct Rust `Settings` pour que le toggle soit bien persisté au redémarrage
- Détection W/L/D corrigée dans toutes les vues (session active, liste matchs, modal détails)

---

## v0.2.x — antérieur

Voir l'historique Git pour les versions précédentes.
