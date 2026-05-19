# ProClubs Stats

> Créé par **Tatsuki**

> Utilisation de claude Pour les Push et le build mais aussi de la correction en cas d'erreur manuscrite

Application desktop pour suivre les statistiques de votre club EA FC Pro Clubs. Construite avec **Tauri 2** (Rust) + **React** + **TypeScript**.

> **v0.7.2** — Refonte Header & Thème Classic : header contextuel dynamique (thème-aware), palette "Classic" Anthracite/Bleu par défaut, boutons de vue textualisés, actions Discord déplacées dans le bandeau club. Voir [CHANGELOG.md](CHANGELOG.md) pour les détails.

---

## Fonctionnalités

### Recherche de club

- Recherche par nom sur toutes les plateformes en parallèle (PS5/Xbox Series X, PS4/Xbox One, PC)
- Recherche directe par ID de club
- Détection automatique de plateforme
- **Autocomplete** : suggestions en temps réel pendant la saisie (debounce 400ms, min 3 chars, 6 résultats) — clic sur une suggestion charge le club directement
- **Historique étendu** : jusqu'à 25 clubs récents (contre 8 auparavant) + champ de filtrage rapide pour retrouver un club dans l'historique
- Gestion des clubs favoris (épinglés)
- **Dossiers de favoris** : organiser les clubs favoris en groupes nommés (Rivaux, Amis, Suivis…) — dossiers collapsibles, suppression, sélecteur par club
- **Alerte SR** : icône 🔔 par favori — notification toast quand le Skill Rating change au rechargement, mise à jour automatique du SR stocké
- **Fiche survol** : tooltip fixe avec SR, MJ, V/N/D, buts au survol de chaque club dans l'historique et les favoris
- **Export favoris** : boutons CSV et JSON dans l'onglet Favoris — exporte la liste complète avec dossiers, SR, bilan V/N/D, buts
- Logo du club affiché (crest EA)

### Joueurs

- Liste des membres du club avec leurs statistiques saison
- Tri par n'importe quelle colonne : matchs joués, buts, passes décisives, passes, tacles, MOTM, note
- **Tri score composite** : classement pondéré (buts×3 + PD×2 + MOTM×5 + note×10) via l'option "🏆 Score"
- Filtrage par nom en temps réel + **filtrage multi-critères** (par poste, note min, matchs min)
- **Filtre alertes** : afficher uniquement les joueurs dont la note moyenne récente est < 6.5
- **Filtre "Partants habituels"** : slider de présence minimum (0–100%) calculé sur les 20 derniers matchs — affiche le % de présence sur chaque carte quand activé
- **Filtre période custom** : champs Du / Au pour recalculer les stats joueurs depuis le cache matchs sur une plage de dates précise
- **Sparkline inline** : mini courbe des dernières notes par match visible directement sur chaque carte
- **Alerte de performance** : indicateur ⚠️ sur les joueurs en baisse (avg note < 6.5 sur les 5 derniers matchs)
- **Avatar initiales colorées** (style Discord) pour chaque joueur
- Podium visuel (or / argent / bronze) pour le top 3
- Badge de position (GK, ST, CM…)
- Badge de note coloré (or, vert, jaune, rouge)
- Modale détail joueur : stats de base + **statistiques avancées** (tirs cadrés, interceptions, fautes, cartons jaunes/rouges, clean sheets, arrêts GK) — affichées uniquement si disponibles via l'API EA
- **Graphique d'évolution par match** : line chart note/buts/PD par match avec toggle
- **Vue mensuelle** : BarChart buts/PD/note par mois (tous types de matchs depuis le cache) dans la modale joueur
- **Tendance prédictive** : régression linéaire sur la note — ligne de tendance (tirets violets) + 5 points projetés + résumé direction/pente/projection dans la modale joueur
- **Classement cross-clubs** : bouton "🌐 Cross-clubs" — charge les joueurs de plusieurs clubs favoris via l'API et les compare dans un tableau trié unifié
- **Export PDF fiche joueur enrichi** : PDF avec radar 6 axes dessiné (buts, PD, passes, tacles, MOTM, note) + courbe de note + tableau mensuel + annotation tendance (pente + projection)
- Export **PNG** (capture avec prévisualisation) et **CSV** (tableau complet)
- **Carte FIFA-style** : bouton Carte (⬛ or/argent/bronze) dans la modale joueur — canvas 300×420 avec gradient tier selon OVR, avatar initiales + glow coloré, 6 stats en grille, footer club — téléchargeable en PNG ou envoyée directement sur Discord en image
- **Comparaison de périodes** : panneau COMPARER 2 PÉRIODES dans la modale joueur — deux sélecteurs De/Au indépendants, comparaison MJ / Buts / PD / MOTM / Note côte-à-côte avec indicateurs ↑ ↓ = colorés
- **Comparaison de joueurs** : mode COMPARER, sélection de **2 à 4 joueurs**, radar chart normalisé + tableau face-à-face + **partage Discord**

### Matchs

- Trois types de matchs : Championnat, Playoff, Amical
- Cache intelligent par type — pas de rechargement inutile
- Carte par match : score, adversaire, date, résultat (VICTOIRE / NUL / DEFAITE)
- Modale détail match : score final, durée, stats joueurs avec colonnes **avancées** : tacles, interceptions, fautes, cartons (colonnes affichées uniquement si les données existent)
- **Résumé d'événements** : buteurs, passeurs, cartons et MOTM affichés en badges dans la modale match
- **Stats d'équipe** : possession, tirs, tirs cadrés, corners, passes, fautes, hors-jeu (affichées si disponibles via l'API EA)
- **Filtrage par adversaire** : champ de recherche pour retrouver les matchs contre un club spécifique
- **Bilan vs adversaire** : quand un adversaire est filtré, affiche W/N/D + buts moyens pour/contre sur tous les matchs chargés
- **Graphique de forme** : courbe des 10 derniers résultats (V=3, N=1, D=0) avec points colorés
- **Filtre par période** : sélectionner une plage de dates (Du / Au) pour n'afficher que les matchs de cette période
- **Annotations de match** : ajouter une note libre sur chaque match (stockée localement, persistée)
- **Chargement automatique en arrière-plan** : quand le profil EA est lié, tous les matchs sont chargés silencieusement pour un historique complet et un calendrier rempli
- **Refresh automatique** : les nouveaux matchs apparaissent toutes les 60s (onglet matches ouvert) ou toutes les 3 min en arrière-plan — sans redémarrer l'app
- **Vue calendrier** : vue mensuelle des matchs avec navigation mois par mois, résultats colorés par jour
- **Analyse des adversaires** : vue dédiée (bouton 👥 Adversaires) — tableau de tous les clubs affrontés avec MJ, V, N, D, % victoires, buts pour/contre et différentiel, trié par nombre de confrontations
- **Filtre résultat combiné** : pills Tous / V / N / D cumulables avec les autres filtres (adversaire, période)
- **Indicateur de série** : badge "Série V/N/D X en cours" affiché dans le graphique de forme
- **Score de mi-temps** : affiché sous le score final dans chaque carte si disponible via l'API EA
- **Export Excel (.xls)** : mise en forme colorée (V=vert, D=rouge, N=jaune), inclut le score mi-temps
- **Export PNG calendrier** : bouton dédié dans la vue calendrier pour capturer uniquement la grille mensuelle
- **Rendu incrémental** : liste paginée par 50 matchs au défilement — performances préservées sur les longs historiques
- Export **PNG** et **CSV** avec prévisualisation

### Graphiques

- Donut victoires / nuls / défaites
- Bar chart top buteurs
- Bar chart top passeurs décisifs
- Bar chart top passeurs réussis
- Export **PNG** avec prévisualisation
- **Historique des saisons** (lazy-load) : bilan victoires/nuls/défaites par saison + **bar chart empilé V/N/D** + comparaison N vs N-1
- **Classement all time** (lazy-load) : top 25 clubs de la plateforme avec V/N/D/Buts/SR
- **Radar collectif d'équipe** : 5 axes normalisés (possession, tirs, passes, buts, % victoires) calculés sur les matchs chargés
- **Courbe de possession** : évolution du % de possession sur les 20 derniers matchs
- **Évolution de l'effectif** : nombre de joueurs distincts par match sur les 20 derniers matchs
- **Distribution des scores** : histogramme des 10 scores les plus fréquents, coloré V/N/D
- **Heatmap jour × heure** : grille 7 jours × 6 créneaux horaires affichant le taux de victoire par tranche

### Session live

- Démarrage / arrêt de session de suivi
- Polling automatique toutes les 30 secondes (3 types de matchs en parallèle)
- KPIs live : matchs joués, victoires, nuls, défaites, buts marqués/encaissés
- **Bilan V/N/D** affiché sur chaque carte de session passée (vert / gris / rouge)
- Liste des matchs joués pendant la session
- Sauvegarde des sessions terminées (historique illimité avec pagination)
- **Notification système** à chaque nouveau match détecté (Tauri notification plugin)
- **Statistiques enrichies** : meilleur buteur, meilleur passeur, MOTM de la session
- **Export PDF** : résumé automatique proposé en fin de session avec modal de confirmation (affiche le nom du fichier avant enregistrement)
- Archivage / désarchivage des sessions passées
- Suppression de sessions
- Export **PNG**, **CSV** et **PDF** des données de session (CSV enrichi avec Tags et Notes)
- **Modal Détails session** : liste complète des matchs (score, adversaire, résultat, heure) + tableau stats joueurs (MJ, buts, PD, MOTM, note moyenne) + boutons Discord & PDF
- **Objectif de session** : fixez un nombre cible de victoires, barre de progression live colorée (verte quand atteint)
- **Objectifs avancés** : objectifs multi-critères — défaites maximum autorisées + note moyenne minimale, chacun avec barre de progression live (rouge si dépassé, vert si respecté)
- **Notes tactiques** : champ texte libre par session pour consigner remarques et observations (inclus dans le Discord share)
- **Tags personnalisés** : étiquetez vos sessions (Tournoi, Division, Soirée, Entraînement, Friendly, Ranked) avec filtrage par tag au-dessus de la liste
- **Graphique de forme** : courbe du taux de victoire session par session (12 dernières sessions, recharts)
- **Comparaison inter-sessions** : sélectionnez 2 sessions passées, comparez leurs stats face-à-face (MJ, V, N, D, %V) et visualisez les courbes de victoires cumulées superposées sur un même graphique
- **Templates de session** : sauvegardez une config (objectifs + tags + notes) comme template réutilisable — lancez une session pré-configurée en un clic
- **Partage Discord en cours** : bouton Discord dans la session active pour envoyer le bilan partiel sans attendre la fin
- **Historique des objectifs** : graphique du taux de réussite des objectifs sur toutes les sessions passées, avec badges ✓/✗ par session et indicateurs avancés
- **Radar de session** : graphique radar des stats collectives (buts, PD, passes, tacles, MOTM, % victoires) normalisées — sélecteur de session
- **Alertes en session** : notifications visuelles quand un objectif avancé est sur le point d'être manqué (défaites proches de la limite, note sous l'objectif)
- **Fusion de sessions** : regroupez plusieurs sessions en une session "tournoi" avec bilan global — sélection par checkbox, nom personnalisable
- **Post-match auto Discord** : toggle ON/OFF dans le header de session active — envoie automatiquement le récap complet (bilan, top buteur, top passeur, MOTM, forme, tags) sur le webhook Discord configuré dès que la session est terminée, sans action manuelle
- **Classement Discord hebdo** : modal dédié (bouton 🏆 dans la toolbar Discord) — calcule le top 3 buteurs/passeurs/notes sur toutes les sessions de la semaine, navigation ← → entre semaines, prévisualisation avant envoi Discord ou copie texte
- **Alertes de records personnels** : détection automatique des records individuels (buts, notes, passes décisives, MOTM) lors du rafraîchissement des matchs — toast interactif permettant le partage du record sur Discord via un embed stylisé
- **Rapport de saison narratif Discord** : modal de fin de saison (bouton 📊) — personnalisation du résultat de la saison (Titre, Montée, Relégation), calcul des agrégats, points et tops sur les N derniers matchs, export direct en embed vers le Discord de l'équipe

### Comparaison de clubs

- Recherche et sélection de **2 à 4 clubs** simultanément (bouton + / × par slot)
- Logo affiché pour chaque club
- **Onglets de section** : Stats | Radar | H2H | Battle | Joueurs
- **Tableau multi-colonnes** : SR, V%, Victoires, Nuls, Défaites, Buts, Nombre de joueurs — meilleur mis en valeur par ligne
- **Comparaison multi-saisons** : sélecteur de saison par club — compare des saisons différentes entre clubs
- **Radar normalisé** : radar des 6 stats clés (V%, Buts/Match, Passes/J, Tacles/J, Note Moy, MOTM) normalisées sur 100
- **Historique H2H** : filtre automatique des matchs directs entre les 2 clubs, bilan V/N/D, liste des confrontations triées par date
- **Mode Battle** : vote sur chaque stat — quel club est supérieur ? — avec classement final des clubs
- **Meilleurs joueurs par poste** : GK, DEF, MIL, ATT — tableau N colonnes avec surlignage du meilleur
- **Comparaisons nommées** : sauvegarder une comparaison sous un nom personnalisé (ex: "Finale div 2"), restaurer / renommer / supprimer
- **Alerte SR** : icône 🔔 par club dans la comparaison — notification toast si le SR change au rechargement
- **Export PDF** : rapport complet avec tableau stats, radar dessiné et H2H — généré via jsPDF
- **Historique des comparaisons** : sauvegarde automatique, rechargement en un clic, suppression
- Export **PNG** et **CSV** du tableau comparatif

### Export

- Modale d'export avec **prévisualisation** avant téléchargement
- Champ nom de fichier éditable
- Format **PNG** : capture html2canvas (scale ×2, fond correct)
- Format **CSV** : encodage UTF-8 BOM, compatible Excel

### Intégration Discord

- **Webhook personnel** configuré dans **Mon Profil** (URL privée, non partagée)
- Badge violet sur l'icône profil quand le webhook est actif
- **Partage par onglet** : bouton Discord dans le header de chaque onglet (Joueurs / Matchs / Graphiques) — embed formaté avec les données de la vue courante
- **Partage de match** : bouton dans chaque modale match — embed avec score, buteurs, passeurs, MOTM
- **Partage de session** : bouton dans le modal Détails — embed enrichi avec bilan V/N/D, liste des matchs (🟢/🟡/🔴 + score), stats joueurs top 5, couleur dynamique
- **Partage profil joueur** : bouton Discord dans la modale joueur — embed avec toutes ses stats + évolution note/buts/PD match par match
- **Stats générales club** : embed format OurProClub — Games Played, Skill Rating, Record W/D/L, Goals F/A/D, Win Rate, top joueurs (Most Appearances, MOTM, Buteur, Passeur, Passes, Tacles), résultats récents par type (🟢🔴🟡)
- **Rapport hebdomadaire** : bouton "Rapport semaine" dans l'historique des sessions — exporte un PDF résumant la semaine en cours (V/N/D, meilleur buteur, meilleur passeur, stats agrégées)
- **Thread Discord de saison** : bouton dédié (icône livre) dans la barre d'outils Discord — modal avec bilan saison, top buteur, copie au presse-papier ou envoi webhook en embed structuré
- **Carte joueur sur Discord** : bouton Discord dans la préview de carte FIFA — envoie l'image PNG via multipart/form-data (fichier brut, pas d'embed texte)
- Embeds colorés dynamiquement : vert (victoire dominante), jaune (équilibré), rouge (défaites dominantes)
- Section Discord masquée si aucun club sélectionné

### Système
- **Icône System Tray** : l'application tourne en arrière-plan à côté de l'horloge Windows.
- **Background Mode** : fermer la fenêtre cache l'application sans l'arrêter (style Discord). Quitter définitivement se fait via le clic-droit sur l'icône tray.
- **Menu contextuel Tray** : accès rapide pour afficher l'app, lancer/arrêter une session ou quitter.
- **Démarrage avec Windows** : lancement automatique au boot (en mode réduit) pour un suivi constant sans action manuelle.

### Paramètres

- **10 thèmes de couleur accent** : Cyan, Violet, Orange, Vert, Rouge, Discord, **Midnight** (fond noir bleuté), **Gold** (ambre), **Matrix** (fond vert terminal), **Rose** — Midnight et Matrix modifient aussi le fond et les surfaces
- **Palettes complètes** : 5 presets (EA FC, Blood, Ocean, Forest, Classic) — modifient accent + fond + surface + card + bordures en un clic, aperçu 3 couleurs — sélectionner une palette désactive le thème accent et inversement
- **Thème personnalisé complet** : color pickers pour Accent, Background, Surface et Card — bouton "Tout réinitialiser" + reset individuel par couleur — changer de thème efface les couleurs custom
- **Import / export des paramètres** : exporte uniquement les paramètres (thème, raccourcis, tactiques, favoris, profils EA) sans matchCache ni sessions — fusion à l'import
- **Raccourcis clavier personnalisables** : Ctrl+F (recherche), Ctrl+E (export), Ctrl+K (recherche globale) remappables — clic sur le bouton → appuyez sur la nouvelle combinaison → sauvegarde automatique — bouton « Réinitialiser »
- **Mode streaming** : toggle dans Paramètres → masque gamertag, plateforme et webhook Discord dans Mon Profil (bannière orange indicatrice)
- **Rappels planifiés** : ajouter des notifications à une heure HH:MM précise sur des jours de semaine sélectionnés — vérifiés toutes les minutes, affichés en toast in-app
- **Profils d'interface** : sauvegarder la config actuelle (thème + disposition + mode clair/sombre) sous un nom personnalisé, appliquer en un clic — plusieurs profils stockés
- Mode clair / sombre
- Taille de police ajustable (slider 10–20px)
- 4 polices : Barlow, Inter, Roboto, Système
- Configuration proxy HTTP/HTTPS
- Affichage des logs API (debug)
- Recherche par ID activable/désactivable
- **Sélecteur de langue** : FR / EN / ES / DE / PT
- **Mise à jour automatique** : toggle ON/OFF — vérifie au démarrage et propose un modal d'installation
- **Pastille de mise à jour** : badge rouge 🔴 pulsant sur l'icône ⚙️ quand une nouvelle version est disponible
- **Modal de mise à jour** : affiche la version disponible, les notes de release, et propose "Installer maintenant" ou "Plus tard"

### Mon Profil

- **Liaison gamertag EA** : entre ton pseudo EA + le nom de ton club — l'app vérifie que le gamertag est bien membre du club via `getMembers()`, puis lie le profil
- **Chargement automatique au démarrage** : si un profil EA est lié, le club est chargé automatiquement à l'ouverture de l'app sans aucune action requise
- **Chargement complet des matchs en arrière-plan** : dès que le club est chargé, les 3 types de matchs (Championnat, Playoff, Amical) sont récupérés page par page en silent, pour que la vue Calendrier soit entièrement remplie
- Bouton "Charger mon club" : force le rechargement manuel du club lié
- **Webhook Discord** : configuré dans le profil (URL privée par utilisateur), bouton Tester inclus
- Indicateur "Webhook configuré" (point vert) + badge violet sur l'icône profil dans la guild bar
- **Profils multiples** : lier plusieurs gamertags / clubs et basculer entre eux en un clic (liste avec "ACTIVER" / "✕")
- **Stats personnelles agrégées** : bilan tous matchs toutes sessions confondues (buts, PD, MOTM, note moyenne) affiché en KPI cards
- **Badge de rang** : division estimée à partir du Skill Rating (Elite → Div 10) affichée dans le header avec couleur par tier
- **Historique de chargement** : log des dernières synchronisations avec horodatage, club et statut (collapsible)
- **Backup / restauration locale** : export complet en JSON (sessions, tactics, profils, settings) + import depuis fichier
- **Fiche de profil partageable** : export PNG canvas (gamertag, club, division, stats) + copie embed Discord au presse-papiers
- **Page Stats Solo** : page dédiée accessible depuis la sidebar (onglet Profil) avec :
  - KPI cards dynamiques : matchs, buts, PD, MOTM, note moy, % victoires + passes et tacles (données saison)
  - **Vrais totaux saison** depuis l'API `getMembers` (ex. 228 MJ, 89 buts) — pas limité au cache matchs
  - Barre V/N/D proportionnelle (résultats club saison)
  - Courbe d'évolution de la note (40 derniers matchs analysés)
  - Bar chart buts/PD par tranche de 5 matchs
  - Répartition par poste (matchs, buts, PD, note moy)
  - Tableau des 25 dernières performances individuelles
  - Indicateur "X matchs (Y analysés)" distinguant totaux saison et matchs en cache
- **Carte Joueur Publique** : section dédiée dans *Mon Profil* permettant de personnaliser et d'exporter une "Carte Pro"
  - Choix de 6 statistiques clés à afficher
  - Paramétrage d'un objectif de saison (barre de progression intégrée)
  - Sélection parmi plusieurs thèmes visuels (Gold, Neon, Dark, Minimaliste)
  - Export direct en PNG ou partage instantané sur le Discord de l'équipe

### Interface

- Fenêtre frameless avec barre de titre draggable (minimize / maximize / close)
- Interface style Discord : guild bar, sidebar canaux, panel principal
- Animations de transition entre onglets
- Overlay de grille activable/désactivable
- Spinner de chargement
- Gestion des erreurs réseau avec message utilisateur
- **Raccourcis clavier globaux** : F11 plein écran, Ctrl+F recherche sidebar, Ctrl+K recherche globale, Ctrl+E export, Ctrl+1–5 navigation, Ctrl+Shift+D panel dev, **R** refresh du club, **S** toggle session live
- **Recherche globale (Ctrl+K)** : modal searchable avec navigation clavier (↑↓ Entrée ESC), résultats groupés Clubs / Joueurs / Sessions, badge favori et indicateur club actif
- **Mode compact** : bouton toggle dans le header — densifie l'affichage des cartes joueurs
- **Drag & drop favoris** : icône grip dans la sidebar Favoris pour réordonner les clubs par glisser-déposer (ordre persisté)
- **Internationalisation** : FR / EN / ES / DE / PT (~250 clés de traduction, toute l'interface)
- **Onboarding** : assistant de bienvenue 3 étapes (langue, fonctionnalités, raccourcis) au premier lancement
- **Accessibilité** : focus-visible, skip-link, reduced-motion, forced-colors, attributs ARIA
- **KPIs personnalisables** : bouton ÉDITER sur la barre KPI — choisir quels indicateurs afficher parmi 8 disponibles (Matchs, Victoires, Nuls, Défaites, % Victoires, Buts, Buts/Match, Points) — sélection persistée
- **Disposition de la navigation configurable** : 4 positions — Haut, Bas, Gauche, Droite — sélecteur avec prévisualisations dans Paramètres → Interface, persisté entre les sessions
- **Dashboard personnalisable** : bouton tableau de bord dans le header principal — vue avec 6 widgets activables/désactivables (KPIs, graphique de forme, derniers matchs, top buteurs, effectif, radar collectif) — disposition en grille
- **Heatmap de présence** : grille joueurs × matchs récents (20 derniers), cellules colorées par résultat (victoire/nul/défaite/absent), pourcentage de présence par joueur — accessible via l'icône grille dans l'onglet Joueurs
- **Classement interne (Podium)** : vue podium dynamique (or/argent/bronze) par catégorie — Buteurs, Passeurs, Défenseurs (tacles), MOTM, Moyenne, Présence — accessible via l'icône trophée dans l'onglet Joueurs
- **Évolution du Skill Rating** : courbe SR par saison dans l'onglet Graphiques, avec min/max/actuel — chargement à la demande via le bouton CHARGER dans la section historique

### Mode hors-ligne

- Bannière **MODE HORS-LIGNE** affichée automatiquement quand il n'y a pas de connexion réseau
- Toutes les données du cache (matchs, joueurs, sessions) restent accessibles
- Le chargement automatique en arrière-plan et la pagination sont suspendus quand offline, reprennent dès reconnexion
- Aucune perte de données : les matchs déjà chargés restent en mémoire et sur disque

### Cache matchs

- **Capacité 2000 matchs par type** (Championnat / Playoff / Amical) — soit jusqu'à 6000 matchs stockés pour le club lié
- **Section « Gestion du cache »** dans Mon Profil : barre de progression par type avec compteur X / 2000
- **Indicateur de fraîcheur** : « il y a X min / X h / X j » affiché sous chaque type de cache — horodatage persisté
- **Propriété par profil** : chaque entrée de cache affiche le gamertag du profil qui l'a peuplée (`cacheOwners`)
- **Suppression manuelle** : bouton Corbeille par type pour vider une entrée de cache individuelle, bouton « TOUT VIDER » global
- **Suppression par période** : panneau inline avec sélecteur de dates (Du / Au) pour ne garder que les matchs d'une plage précise
- **Suppression par profil** : boutons par gamertag pour supprimer toutes les entrées appartenant à un profil spécifique (multi-profils)
- **Export cache JSON** : export séparé du `matchCache` uniquement (distinct du backup complet)
- **Import cache JSON** : fusion d'un fichier cache exporté dans le cache existant
- **Synchronisation incrémentale** : au démarrage, seule la première page (10 matchs les plus récents) est rechargée — la pagination complète n'a lieu qu'au tout premier chargement (cache vide) — évite de re-télécharger l'historique complet à chaque ouverture
- **Compression gzip** : le fichier `settings.json` est compressé via flate2 (Rust) à chaque sauvegarde — rétrocompatible avec les anciennes sauvegardes JSON non compressées
- Le chargement en arrière-plan s'arrête proprement à la limite — aucun téléchargement inutile

### Proxy & réseau

- Support proxy configurable (HTTP/HTTPS)
- Détection du proxy système (variables d'environnement)
- Logs détaillés des requêtes API (URL, statut, aperçu réponse)

---

## Stack technique

| Composant | Technologie |
|-----------|-------------|
| Desktop shell | Tauri 2 |
| Backend | Rust (reqwest, tokio, serde_json) |
| Frontend | React 18 + TypeScript + Vite |
| État global | Zustand |
| Graphiques | Recharts |
| Capture PNG | html2canvas |
| Export PDF | jsPDF + jspdf-autotable |
| Notifications | tauri-plugin-notification |
| Icônes | lucide-react |
| Police | Bebas Neue + Barlow (Google Fonts) |
| Persistance | JSON local (`~/.local/share/com.codespace.proclubs-tauri/settings.json`) |
| Discord | Webhook API (fetch natif, embeds formatés + upload fichier multipart) |
| Virtualisation | react-window (FixedSizeList joueurs) |

---

## 🗺️ Roadmap

### 🤖 IA & Coach virtuel

- **Analyse tactique post-match automatique** : résumé narratif généré depuis `aiEngine.ts` avec recommandations de formation selon les stats du match
- **Score de chemistry d'équipe** : indice calculé sur les associations de joueurs récurrentes (qui joue avec qui, impact sur le résultat)
- **Détection de patterns adverses** : identifier le style de jeu d'un club depuis son historique H2H (possession haute, pressing, contre-attaque)
- **Suggestions de titulaires** : composition optimale proposée selon la forme des 5 derniers matchs de chaque joueur
- **Coach alert** : notification automatique si un joueur montre des signes de baisse (anomaly detection déjà câblée dans `detectPerformanceAnomaly`)
- **Prédiction avant match enrichie** : facteurs d'influence détaillés (forme, adversaire, heure, fatigue estimée) depuis `predictNextMatch`

---

### ⚽ Tactiques & Formations

- **Tag formation par match** : associer la formation jouée à chaque match pour tracer l'évolution tactique
- **Stats par formation** : V/N/D, buts pour/contre, note moyenne selon le schéma utilisé (4-3-3 vs 4-2-3-1 etc.)
- **Comparaison matchup** : forces/faiblesses de ta formation face à la formation adverse détectée
- **Instructions par poste** : role cards éditables dans `TacticsTab` (consignes défensives, pressing, position)
- **Bibliothèque de plans de jeu** : sauvegarder des tactiques nommées avec notes (ex: "Plan B contre possession")
- **Export PDF fiche tactique** : terrain + positionnement + stats par formation en un clic

---

### 🏆 Compétition & Tournois

- **Bracket interne** : tournoi élimination directe ou poules entre joueurs du club, résultats saisis manuellement
- **Mini-ligue inter-clubs** : calendrier, classement et résultats entre clubs favoris avec export PDF
- **Défis hebdomadaires auto-générés** : objectifs calculés depuis la moyenne récente (ex: "5 victoires cette semaine") avec badge récompense
- **Système de paris amicaux** : prédictions V/N/D avant match entre membres, classement des pronostics
- **Challenge run** : série de N matchs sans défaite avec compteur live et notification de record battu
- **Hall of Fame toutes saisons** : classement cumulé depuis l'installation, médailles or/argent/bronze par catégorie

---

### 📊 Analytics avancés

- **Corrélation présence ↔ résultat** : impact statistique de chaque joueur sur les victoires (scatter plot présence vs % V)
- **Analyse momentum** : détecter les séquences gagnantes/perdantes et leurs catalyseurs (changement de formation, retour joueur)
- **Heat zones offensives** : efficacité par contexte de score (à 0-0, à 1-0, à 0-1) sur les matchs en cache
- **Radar évolutif collectif** : superposition N-1 vs N sur le radar d'équipe pour visualiser la progression saison
- **Analyse "Big matches"** : filtrer et analyser séparément les matchs contre le top 10 du classement
- **Formation adverse automatique** : déduire la tactique habituelle de chaque adversaire depuis l'historique H2H

---

### 🔔 Notifications & Alertes intelligentes

- **Résumé push hebdomadaire** : notification automatique chaque dimanche soir avec le bilan de la semaine
- **Alerte record personnel** : push immédiat quand un joueur bat son record de buts, notes ou MOTM en une session
- **Alerte SR critique** : notification si le Skill Rating chute de plus de X points entre deux chargements
- **Joueur fantôme** : alerte si un membre habituel est absent depuis N matchs consécutifs
- **Adversaire redoutable** : prévenir avant un match si le H2H est inférieur à 30% de victoires
- **Rappels planifiés avancés** : récurrence hebdomadaire configurable par jour (ex: "Rappel entraînement tous les mardis 20h")

---

### 📤 Export & Communication

- **Rapport PDF mensuel automatique** : généré le 1er de chaque mois, envoyable sur Discord en un clic
- **Templates Discord personnalisables** : couleurs, structure et contenu des embeds configurables par type de partage
- **QR code fiche club** : générer un QR pointant vers une capture PNG de la fiche club partageable hors app
- **Galerie de captures** : historique des PNG générés dans l'app, renommables et ré-exportables
- **Export Excel enrichi** : statistiques joueurs multi-saisons dans un classeur `.xlsx` avec onglets séparés
- **Partage presse-papiers universel** : copier n'importe quel embed Discord formaté sans envoyer (pour coller manuellement)

---

### 🎮 Matchs & Gameplay

- **Timeline de match** : reconstituer les événements chronologiques (but min X, carton min Y) depuis les stats disponibles
- **Éditeur de substitutions** : noter les entrées/sorties et leur impact estimé sur le score
- **Débriefing post-match guidé** : questionnaire rapide après chaque match (moral, tactique, joueur du match perso)
- **Analyse mi-temps** : comparer les stats 1ère vs 2ème mi-temps sur l'historique des matchs avec score mi-temps
- **Filtre "matchs serrés"** : isoler les matchs décidés à ±1 but pour analyser les performances dans les moments clés
- **Évolution du score simulée** : reconstitution graphique de la progression du score depuis les événements disponibles

---

### 🧑‍💼 Profil & Identité joueur

- **Achievements automatiques** : trophées débloqués en temps réel (100 victoires, série de 10, 50 MOTM…) avec notification et badge profil
- **Niveau d'expérience (XP)** : points gagnés par match joué, but, MOTM — barre de progression et rang (Rookie → Legend)
- **Comparaison toutes saisons** : évolution des stats personnelles saison par saison depuis le cache historique
- **Mode Capitaine** : désigner le capitaine du club avec indicateur visuel et stats de leadership (V% quand il joue)
- **Carte de visite digitale** : fiche joueur partageable avec QR code généré depuis la carte FIFA-style
- **Historique de progressions** : courbe d'évolution du rang estimé (division) mois par mois depuis les données SR

---

### 🔧 Performance & Technique

- **Web Worker étendu** : déléguer les calculs lourds (régression, corrélation, radar normalisé) au `statsWorker.ts` existant
- **Cache TTL configurable** : paramètre par type de données (matchs, joueurs, SR) — invalider selon l'ancienneté
- **Synchronisation différée** : mise en file des requêtes EA quand hors-ligne, exécution automatique à la reconnexion
- **Mode économie de données** : désactiver le chargement automatique en arrière-plan sur réseau limité
- **Profiling intégré** : timer d'exécution par onglet dans le DevPanel pour identifier les ralentissements
- **Import/export cloud via GitHub Gist** : backup optionnel sur Gist privé (token GitHub configuré dans Paramètres)

---

### 🎨 Interface & Accessibilité

- **Mode présentation** : vue plein écran épurée sans sidebar ni chrome, optimisée pour stream/projection
- **Notifications sonores** : son court configurable par événement (nouveau match, objectif atteint, record)
- **Thème daltonien** : palette adaptée deutéranopie/protanopie, activable dans Paramètres → Thème
- **Zoom par section** : contrôle de zoom indépendant pour les graphiques et les tableaux joueurs
- **Overlay raccourcis** : affichage de tous les shortcuts actifs via la touche `?` (liste dynamique selon config)
- **Layout responsive compact** : vue colonne unique pour les petits écrans ou fenêtres réduites (< 900px)

---

### 🤝 Collaboration & Multi-utilisateurs

- **Notes d'équipe partagées** : bloc-notes synchronisé entre membres via webhook Discord (lecture/écriture)
- **Vue spectateur** : affichage en lecture seule des stats pour les membres sans accès complet
- **Historique d'audit** : log des modifications importantes (chargement, suppression cache, changement config) avec horodatage
- **Répartition des rôles** : admin, analyste, joueur — droits différenciés sur les actions sensibles
- **Rapport collaboratif** : plusieurs membres peuvent annoter un match ou une session avant export PDF
- **Sync de favoris** : partager sa liste de clubs favoris avec un autre membre via export/import JSON ciblé

---

Initial dev environment setup
