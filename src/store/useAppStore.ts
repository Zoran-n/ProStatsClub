import { create } from "zustand";
import type { Club, Player, Match, Session, Tactic, EaProfile, SyncEntry, CompareEntry, SessionTemplate, SavedComparison, RecordEntry, PublicProfileConfig } from "../types";
import type { ToastMessage } from "../components/UI/Toast";
import { saveSettings as apiSave, loadSettings as apiLoad, setProxy as apiSetProxy } from "../api/tauri";
import type { Lang } from "../i18n";
import { sendDiscordWebhook } from "../api/discord";
import { buildSessionSummaryEmbed } from "../utils/discordEmbeds";

export type ActiveTab = "players" | "matches" | "charts" | "session" | "compare";
export type SidebarTab = "search" | "favs" | "settings" | "profile" | "myprofile" | "analyse";

// Injects a <style> tag that proportionally overrides hard-coded inline font-size px values.
// This scales only text, without affecting layout dimensions or icons.
function applyFontScale(fontSize: number) {
  const scale = fontSize / 13;
  document.documentElement.style.setProperty("--fs", `${fontSize}px`);
  let styleEl = document.getElementById("fs-scale") as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "fs-scale";
    document.head.appendChild(styleEl);
  }
  const sizes = [9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32, 36, 48];
  styleEl.textContent = sizes.map(px =>
    `[style*="font-size: ${px}px"] { font-size: ${Math.round(px * scale)}px !important; }`
  ).join("\n");
}

interface AppState {
  currentClub: Club | null;
  players: Player[];
  matches: Match[];
  sessions: Session[];
  tactics: Tactic[];
  history: Club[];
  favs: Club[];
  eaProfile: EaProfile | null;
  eaProfiles: EaProfile[];
  syncHistory: SyncEntry[];
  theme: string;
  darkMode: boolean;
  showGrid: boolean;
  showAnimations: boolean;
  showLogs: boolean;
  showIdSearch: boolean;
  fontSize: number;
  fontFamily: string;
  customAccent: string;
  customBg: string;
  customSurface: string;
  customCard: string;
  language: Lang;
  onboarded: boolean;
  settingsLoaded: boolean;
  proxyUrl: string;
  isLoading: boolean;
  error: string | null;
  activeTab: ActiveTab;
  sidebarTab: SidebarTab;
  activeSession: Session | null;
  viewingSession: Session | null;
  logs: string[];
  rawLogs: string[];
  showDevPanel: boolean;
  proxyInfo: string | null;
  compareHistory: CompareEntry[];
  searchResults: Club[];
  showSearchModal: boolean;
  toasts: ToastMessage[];
  matchCache: Record<string, Match[]>;
  cacheTimestamps: Record<string, number>;   // epoch ms quand chaque clé a été mise à jour
  cacheOwners: Record<string, string>;       // gamertag du profil qui a peuplé chaque clé
  discordWebhook: string;
  autoUpdate: boolean;
  updateAvailable: boolean;
  updateVersion: string | null;
  updateNotes: string | null;
  matchAnnotations: Record<string, string>;
  visibleKpis: string[];
  compactMode: boolean;
  showGlobalSearch: boolean;
  navLayout: "horizontal" | "vertical" | "right" | "bottom";
  sessionTemplates: SessionTemplate[];
  streamingMode: boolean;
  customShortcuts: Record<string, string>;  // action → key combo, e.g. "search" → "ctrl+f"
  scheduledNotifications: { id: string; time: string; days: number[]; message: string; enabled: boolean }[];
  interfaceProfiles: { id: string; name: string; theme: string; navLayout: string; darkMode: boolean }[];
  favFolders: { id: string; name: string; clubIds: string[] }[];
  srAlerts: string[];  // clubIds with SR monitoring
  savedComparisons: SavedComparison[];
  palettePreset: string | null;
  autoPostSession: boolean;
  personalRecords: RecordEntry[];
  recordAlerts: RecordEntry[];
  publicProfileConfig: PublicProfileConfig | null;

  addCompareEntry: (entry: CompareEntry) => void;
  deleteCompareEntry: (id: string) => void;
  setClub: (club: Club, players: Player[], matches: Match[]) => void;
  addHistory: (club: Club) => void;
  toggleFav: (club: Club) => void;
  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
  setActiveTab: (t: ActiveTab) => void;
  setSidebarTab: (t: SidebarTab) => void;
  startSession: (club: Club) => void;
  addSessionMatch: (matches: Match[]) => void;
  stopSession: () => void;
  setViewingSession: (s: Session | null) => void;
  deleteSession: (id: string) => void;
  archiveSession: (id: string) => void;
  updateSession: (id: string, patch: Partial<Session>) => void;
  setActiveSessionGoal: (goal: number | undefined) => void;
  setActiveSessionAdvancedGoals: (ag: { maxLosses?: number; minRating?: number }) => void;
  saveSessionTemplate: (tpl: SessionTemplate) => void;
  deleteSessionTemplate: (id: string) => void;
  mergeSessions: (ids: string[], label: string) => void;
  setTheme: (t: string) => void;
  setDarkMode: (v: boolean) => void;
  setShowGrid: (v: boolean) => void;
  setShowAnimations: (v: boolean) => void;
  setShowLogs: (v: boolean) => void;
  setShowIdSearch: (v: boolean) => void;
  setFontSize: (v: number) => void;
  setFontFamily: (v: string) => void;
  setCustomAccent: (v: string) => void;
  setCustomBg: (v: string) => void;
  setCustomSurface: (v: string) => void;
  setCustomCard: (v: string) => void;
  setLanguage: (v: Lang) => void;
  setOnboarded: () => void;
  setEaProfile: (p: EaProfile) => void;
  addEaProfile: (p: EaProfile) => void;
  removeEaProfile: (gamertag: string) => void;
  switchEaProfile: (p: EaProfile) => void;
  addSyncEntry: (e: SyncEntry) => void;
  saveTactic: (t: Tactic) => void;
  deleteTactic: (id: string) => void;
  addLog: (msg: string) => void;
  addRawLog: (msg: string) => void;
  clearRawLogs: () => void;
  toggleDevPanel: () => void;
  setProxyInfo: (v: string | null) => void;
  setSearchResults: (clubs: Club[], show: boolean) => void;
  closeSearchModal: () => void;
  addToast: (message: string, type?: ToastMessage["type"]) => void;
  removeToast: (id: string) => void;
  addRecordAlert: (record: RecordEntry) => void;
  removeRecordAlert: (matchId: string, type: string) => void;
  setMatchCache: (key: string, matches: Match[]) => void;
  clearMatchCacheKey: (key: string) => void;
  clearAllMatchCache: () => void;
  clearMatchCacheStaleFor: (clubId: string, platform: string) => void;
  clearMatchCacheForPeriod: (key: string, fromMs: number, toMs: number) => void;
  clearMatchCacheForProfile: (gamertag: string) => void;
  syncMatchCache: (key: string, incoming: Match[]) => number;
  exportMatchCacheJson: () => string;
  importMatchCacheJson: (json: string) => { added: number; errors: string[] };
  setDiscordWebhook: (v: string) => void;
  setAutoUpdate: (v: boolean) => void;
  setUpdateAvailable: (v: boolean) => void;
  setUpdateInfo: (version: string | null, notes: string | null) => void;
  setMatchAnnotation: (matchId: string, note: string) => void;
  setVisibleKpis: (keys: string[]) => void;
  setCompactMode: (v: boolean) => void;
  toggleGlobalSearch: () => void;
  setNavLayout: (v: "horizontal" | "vertical" | "right" | "bottom") => void;
  reorderFavs: (favs: Club[]) => void;
  setStreamingMode: (v: boolean) => void;
  setCustomShortcut: (action: string, combo: string) => void;
  resetCustomShortcuts: () => void;
  addScheduledNotification: (n: { id: string; time: string; days: number[]; message: string; enabled: boolean }) => void;
  updateScheduledNotification: (id: string, patch: Partial<{ time: string; days: number[]; message: string; enabled: boolean }>) => void;
  deleteScheduledNotification: (id: string) => void;
  saveInterfaceProfile: (p: { id: string; name: string; theme: string; navLayout: string; darkMode: boolean }) => void;
  deleteInterfaceProfile: (id: string) => void;
  applyInterfaceProfile: (id: string) => void;
  addFavFolder: (name: string) => void;
  deleteFavFolder: (id: string) => void;
  renameFavFolder: (id: string, name: string) => void;
  setClubFolder: (clubId: string, folderId: string | null) => void;
  toggleSrAlert: (clubId: string) => void;
  saveComparison: (name: string, clubs: { id: string; name: string; platform: string }[]) => void;
  deleteSavedComparison: (id: string) => void;
  renameSavedComparison: (id: string, name: string) => void;
  setPalettePreset: (id: string | null) => void;
  setAutoPostSession: (v: boolean) => void;
  updateRecords: (records: RecordEntry[]) => void;
  applyProxy: (url: string) => Promise<void>;
  loadSettings: () => Promise<void>;
  persistSettings: () => Promise<void>;
  setPublicProfileConfig: (config: PublicProfileConfig) => void;
}

// ── Selective persistence: skip apiSave if nothing changed ───────────────────
let _lastSavedJson = "";

export const useAppStore = create<AppState>((set, get) => ({
  currentClub: null, players: [], matches: [], sessions: [], tactics: [],
  history: [], favs: [], eaProfile: null, eaProfiles: [], syncHistory: [],
  theme: "cyan", darkMode: true, showGrid: true, showAnimations: true,
  showLogs: true, showIdSearch: false, fontSize: 13, fontFamily: "barlow",
  customAccent: "",
  customBg: "",
  customSurface: "",
  customCard: "",
  language: "fr" as Lang,
  onboarded: false,
  settingsLoaded: false,
  proxyUrl: "",
  isLoading: false, error: null,
  activeTab: "players", sidebarTab: "search",
  activeSession: null, viewingSession: null,
  logs: ["Prêt."],
  rawLogs: [],
  showDevPanel: false,
  proxyInfo: null,
  compareHistory: [],
  searchResults: [],
  showSearchModal: false,
  toasts: [],
  matchCache: {},
  cacheTimestamps: {},
  cacheOwners: {},
  discordWebhook: "",
  autoUpdate: false,
  updateAvailable: false,
  updateVersion: null,
  updateNotes: null,
  matchAnnotations: {},
  visibleKpis: ["matches", "wins", "draws", "losses", "winRate", "goals"],
  compactMode: false,
  showGlobalSearch: false,
  navLayout: "horizontal",
  sessionTemplates: [],
  streamingMode: false,
  customShortcuts: {},
  scheduledNotifications: [],
  interfaceProfiles: [],
  favFolders: [],
  srAlerts: [],
  savedComparisons: [],
  palettePreset: null,
  autoPostSession: false,
  personalRecords: [],
  recordAlerts: [],
  publicProfileConfig: null,

  addCompareEntry: (entry) => set((s) => ({
    compareHistory: [entry, ...s.compareHistory.filter((e) => e.id !== entry.id)].slice(0, 20),
  })),
  deleteCompareEntry: (id) => set((s) => ({ compareHistory: s.compareHistory.filter((e) => e.id !== id) })),
  setClub: (club, players, matches) => set({ currentClub: club, players, matches, error: null }),
  addHistory: (club) => {
    const s = get();
    let newFavs = s.favs;
    // SR alert: notify if tracked fav's SR changed
    if (s.srAlerts.includes(club.id) && club.skillRating) {
      const fav = s.favs.find((f) => f.id === club.id);
      if (fav && fav.skillRating && fav.skillRating !== club.skillRating) {
        get().addToast(`📊 SR mis à jour — ${club.name}: ${fav.skillRating} → ${club.skillRating}`, "info");
      }
      if (fav) newFavs = s.favs.map((f) => f.id === club.id ? { ...f, skillRating: club.skillRating } : f);
    }
    set({
      history: [club, ...s.history.filter((c) => c.id !== club.id)].slice(0, 25),
      favs: newFavs,
    });
  },
  toggleFav: (club) => set((s) => {
    const isFav = s.favs.some((c) => c.id === club.id);
    if (isFav) {
      return {
        favs: s.favs.filter((c) => c.id !== club.id),
        favFolders: s.favFolders.map((f) => ({ ...f, clubIds: f.clubIds.filter((id) => id !== club.id) })),
        srAlerts: s.srAlerts.filter((id) => id !== club.id),
      };
    }
    return { favs: [...s.favs, club] };
  }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setSidebarTab: (sidebarTab) => set({ sidebarTab }),

  startSession: (club) => set({
    activeSession: {
      id: Date.now().toString(),
      clubName: club.name, clubId: club.id, platform: club.platform,
      date: new Date().toISOString(), matches: [],
    },
  }),
  addSessionMatch: (newMatches) => set((s) => {
    if (!s.activeSession) return {};
    return { activeSession: { ...s.activeSession, matches: [...s.activeSession.matches, ...newMatches] } };
  }),
  stopSession: () => {
    const s = get();
    if (!s.activeSession) return;
    const session = s.activeSession;
    // Auto-archive sessions older than 90 days to protect memory
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const updatedSessions = [session, ...s.sessions].map((x) =>
      !x.archived && new Date(x.date).getTime() < cutoff ? { ...x, archived: true } : x
    );
    set({ sessions: updatedSessions, activeSession: null });
    // Auto post-match Discord
    if (s.autoPostSession && s.discordWebhook && session.matches.length > 0) {
      const embed = buildSessionSummaryEmbed(session);
      sendDiscordWebhook(s.discordWebhook, [embed]).catch(() => {});
    }
  },

  setViewingSession: (viewingSession) => set({ viewingSession }),
  deleteSession: (id) => set((s) => ({ sessions: s.sessions.filter((x) => x.id !== id) })),
  archiveSession: (id) => set((s) => ({
    sessions: s.sessions.map((x) => x.id === id ? { ...x, archived: !x.archived } : x),
  })),
  updateSession: (id, patch) => set((s) => ({
    sessions: s.sessions.map((x) => x.id === id ? { ...x, ...patch } : x),
  })),
  setActiveSessionGoal: (goal) => set((s) => ({
    activeSession: s.activeSession ? { ...s.activeSession, goal } : null,
  })),
  setActiveSessionAdvancedGoals: (advancedGoals) => set((s) => ({
    activeSession: s.activeSession ? { ...s.activeSession, advancedGoals } : null,
  })),
  saveSessionTemplate: (tpl) => set((s) => ({
    sessionTemplates: [tpl, ...s.sessionTemplates.filter((t) => t.id !== tpl.id)],
  })),
  deleteSessionTemplate: (id) => set((s) => ({
    sessionTemplates: s.sessionTemplates.filter((t) => t.id !== id),
  })),
  mergeSessions: (ids, label) => set((s) => {
    const toMerge = s.sessions.filter((x) => ids.includes(x.id));
    if (toMerge.length < 2) return {};
    const first = toMerge.reduce((a, b) => (a.date < b.date ? a : b));
    const allMatches: Match[] = [];
    const seenIds = new Set<string>();
    for (const sess of toMerge) {
      for (const m of sess.matches) {
        if (!seenIds.has(m.matchId)) { seenIds.add(m.matchId); allMatches.push(m); }
      }
    }
    const merged: Session = {
      id: Date.now().toString(),
      clubName: label || first.clubName,
      clubId: first.clubId,
      platform: first.platform,
      date: first.date,
      matches: allMatches,
      tags: ["Tournoi"],
      notes: `Fusion de ${toMerge.length} sessions`,
      mergedFrom: ids,
    };
    return { sessions: [merged, ...s.sessions.filter((x) => !ids.includes(x.id))] };
  }),
  setAutoPostSession: (autoPostSession) => set({ autoPostSession }),
  updateRecords: (records) => set((s) => {
    // Merge new records with existing ones
    // Only keep the best record per player per type
    const map = new Map<string, RecordEntry>();
    for (const r of [...s.personalRecords, ...records]) {
      const key = `${r.playerId}-${r.type}`;
      if (!map.has(key) || r.new > map.get(key)!.new) {
        map.set(key, r);
      }
    }
    return { personalRecords: Array.from(map.values()) };
  }),

  setPalettePreset: (id) => {
    const root = document.documentElement;
    if (id) {
      root.setAttribute("data-palette", id);
    } else {
      root.removeAttribute("data-palette");
    }
    set({ palettePreset: id });
  },
  setTheme: (theme) => {
    document.documentElement.removeAttribute("data-palette");
    document.documentElement.setAttribute("data-theme", theme);
    if (theme === "custom") {
      const { customAccent, customBg, customSurface, customCard } = get();
      if (customAccent) document.documentElement.style.setProperty("--accent", customAccent);
      if (customBg)     document.documentElement.style.setProperty("--bg",      customBg);
      if (customSurface) document.documentElement.style.setProperty("--surface", customSurface);
      if (customCard)   document.documentElement.style.setProperty("--card",    customCard);
    } else {
      // Quitter le thème custom : retirer toutes les surcharges de couleur
      document.documentElement.style.removeProperty("--accent");
      document.documentElement.style.removeProperty("--bg");
      document.documentElement.style.removeProperty("--surface");
      document.documentElement.style.removeProperty("--card");
      set({ theme, palettePreset: null, customBg: "", customSurface: "", customCard: "" });
      return;
    }
    set({ theme, palettePreset: null });
  },
  setDarkMode: (darkMode) => {
    document.documentElement.toggleAttribute("data-light", !darkMode);
    set({ darkMode });
  },
  setShowGrid: (showGrid) => {
    document.documentElement.toggleAttribute("data-no-grid", !showGrid);
    set({ showGrid });
  },
  setShowAnimations: (showAnimations) => {
    document.documentElement.toggleAttribute("data-no-anim", !showAnimations);
    set({ showAnimations });
  },
  setShowLogs: (showLogs) => set({ showLogs }),
  setShowIdSearch: (showIdSearch) => set({ showIdSearch }),
  setFontSize: (fontSize) => {
    const clamped = Math.max(10, Math.min(20, fontSize));
    applyFontScale(clamped);
    set({ fontSize: clamped });
  },
  setFontFamily: (fontFamily) => {
    if (fontFamily === "barlow") {
      document.documentElement.removeAttribute("data-font");
    } else {
      document.documentElement.setAttribute("data-font", fontFamily);
    }
    set({ fontFamily });
  },
  setCustomAccent: (customAccent) => {
    document.documentElement.style.setProperty("--accent", customAccent);
    set({ customAccent, theme: "custom" });
    document.documentElement.setAttribute("data-theme", "custom");
  },
  setCustomBg: (customBg) => {
    if (customBg) document.documentElement.style.setProperty("--bg", customBg);
    else document.documentElement.style.removeProperty("--bg");
    set({ customBg, theme: "custom" });
    document.documentElement.setAttribute("data-theme", "custom");
  },
  setCustomSurface: (customSurface) => {
    if (customSurface) document.documentElement.style.setProperty("--surface", customSurface);
    else document.documentElement.style.removeProperty("--surface");
    set({ customSurface, theme: "custom" });
    document.documentElement.setAttribute("data-theme", "custom");
  },
  setCustomCard: (customCard) => {
    if (customCard) document.documentElement.style.setProperty("--card", customCard);
    else document.documentElement.style.removeProperty("--card");
    set({ customCard, theme: "custom" });
    document.documentElement.setAttribute("data-theme", "custom");
  },
  setLanguage: (language) => set({ language }),
  setOnboarded: () => set({ onboarded: true }),
  setEaProfile: (eaProfile) => set({ eaProfile }),
  addEaProfile: (p) => set((s) => {
    const filtered = s.eaProfiles.filter(x => !(x.gamertag === p.gamertag && x.platform === p.platform));
    return { eaProfiles: [...filtered, p] };
  }),
  removeEaProfile: (gamertag) => set((s) => ({
    eaProfiles: s.eaProfiles.filter(x => x.gamertag !== gamertag),
  })),
  switchEaProfile: (p) => set({ eaProfile: p }),
  addSyncEntry: (e) => set((s) => ({
    syncHistory: [e, ...s.syncHistory].slice(0, 50),
  })),
  saveTactic: (t) => set((s) => ({ tactics: [...s.tactics.filter((x) => x.id !== t.id), t] })),
  deleteTactic: (id) => set((s) => ({ tactics: s.tactics.filter((t) => t.id !== id) })),
  addLog: (msg) => set((s) => ({ logs: [...s.logs.slice(-99), msg] })),
  addRawLog: (msg) => set((s) => ({ rawLogs: [...s.rawLogs.slice(-199), msg] })),
  clearRawLogs: () => set({ rawLogs: [] }),
  toggleDevPanel: () => set((s) => ({ showDevPanel: !s.showDevPanel })),
  setProxyInfo: (proxyInfo) => set({ proxyInfo }),
  setSearchResults: (searchResults, show) => set({ searchResults, showSearchModal: show }),
  closeSearchModal: () => set({ showSearchModal: false, searchResults: [] }),
  addToast: (message, type = "info") => set((s) => ({
    toasts: [...s.toasts, { id: `${Date.now()}-${Math.random()}`, message, type }],
  })),
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  addRecordAlert: (record) => set((s) => ({
    recordAlerts: [...s.recordAlerts, record],
  })),
  removeRecordAlert: (matchId, type) => set((s) => ({
    recordAlerts: s.recordAlerts.filter((r) => !(r.matchId === matchId && r.type === type)),
  })),
  setMatchCache: (key, matches) => set((s) => ({
    matchCache: { ...s.matchCache, [key]: matches },
    cacheTimestamps: { ...s.cacheTimestamps, [key]: Date.now() },
    cacheOwners: { ...s.cacheOwners, [key]: s.eaProfile?.gamertag ?? "" },
  })),
  clearMatchCacheKey: (key) => set((s) => {
    const nextCache = { ...s.matchCache };
    const nextTs = { ...s.cacheTimestamps };
    const nextOwners = { ...s.cacheOwners };
    delete nextCache[key]; delete nextTs[key]; delete nextOwners[key];
    return { matchCache: nextCache, cacheTimestamps: nextTs, cacheOwners: nextOwners };
  }),
  clearAllMatchCache: () => set({ matchCache: {}, cacheTimestamps: {}, cacheOwners: {} }),
  clearMatchCacheStaleFor: (clubId, platform) => set((s) => {
    const next: Record<string, Match[]> = {};
    const nextTs: Record<string, number> = {};
    const nextOwners: Record<string, string> = {};
    for (const [key, val] of Object.entries(s.matchCache)) {
      if (!key.startsWith(`${clubId}_`) || key.startsWith(`${clubId}_${platform}_`)) {
        next[key] = val;
        if (s.cacheTimestamps[key] !== undefined) nextTs[key] = s.cacheTimestamps[key];
        if (s.cacheOwners[key] !== undefined) nextOwners[key] = s.cacheOwners[key];
      }
    }
    return { matchCache: next, cacheTimestamps: nextTs, cacheOwners: nextOwners };
  }),
  clearMatchCacheForPeriod: (key, fromMs, toMs) => set((s) => {
    const existing = s.matchCache[key] ?? [];
    const filtered = existing.filter((m) => {
      const ts = Number(m.timestamp);
      const t = ts > 1e12 ? ts : ts * 1000;
      return t < fromMs || t > toMs;
    });
    return { matchCache: { ...s.matchCache, [key]: filtered } };
  }),
  clearMatchCacheForProfile: (gamertag) => set((s) => {
    const next: Record<string, Match[]> = {};
    const nextTs: Record<string, number> = {};
    const nextOwners: Record<string, string> = {};
    for (const [key, val] of Object.entries(s.matchCache)) {
      if ((s.cacheOwners[key] ?? "") !== gamertag) {
        next[key] = val;
        if (s.cacheTimestamps[key] !== undefined) nextTs[key] = s.cacheTimestamps[key];
        if (s.cacheOwners[key] !== undefined) nextOwners[key] = s.cacheOwners[key];
      }
    }
    return { matchCache: next, cacheTimestamps: nextTs, cacheOwners: nextOwners };
  }),
  syncMatchCache: (key, incoming) => {
    let added = 0;
    set((s) => {
      const existing = s.matchCache[key] ?? [];
      const seen = new Set(existing.map((m) => m.matchId));
      const fresh = incoming.filter((m) => m.matchId && !seen.has(m.matchId));
      added = fresh.length;
      if (fresh.length === 0) return s;
      const merged = [...existing, ...fresh].sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
      return {
        matchCache: { ...s.matchCache, [key]: merged },
        cacheTimestamps: { ...s.cacheTimestamps, [key]: Date.now() },
        cacheOwners: { ...s.cacheOwners, [key]: s.eaProfile?.gamertag ?? "" },
      };
    });
    return added;
  },
  exportMatchCacheJson: () => {
    const s = useAppStore.getState();
    return JSON.stringify({ matchCache: s.matchCache, exportedAt: new Date().toISOString() }, null, 2);
  },
  importMatchCacheJson: (json) => {
    const errors: string[] = [];
    let added = 0;
    try {
      const parsed = JSON.parse(json) as { matchCache?: Record<string, unknown> };
      if (!parsed.matchCache || typeof parsed.matchCache !== "object") {
        return { added: 0, errors: ["Format invalide : clé matchCache manquante"] };
      }
      set((s) => {
        const next = { ...s.matchCache };
        const nextTs = { ...s.cacheTimestamps };
        for (const [key, val] of Object.entries(parsed.matchCache!)) {
          if (!Array.isArray(val)) { errors.push(`Clé "${key}" ignorée (pas un tableau)`); continue; }
          const existing = next[key] ?? [];
          const seen = new Set(existing.map((m: Match) => m.matchId));
          const fresh = (val as Match[]).filter((m) => m?.matchId && !seen.has(m.matchId));
          added += fresh.length;
          next[key] = [...existing, ...fresh].sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
          nextTs[key] = Date.now();
        }
        return { matchCache: next, cacheTimestamps: nextTs };
      });
    } catch (e) {
      return { added: 0, errors: [`JSON invalide : ${String(e)}`] };
    }
    return { added, errors };
  },
  setDiscordWebhook: (discordWebhook) => set({ discordWebhook }),
  setAutoUpdate: (autoUpdate) => set({ autoUpdate }),
  setUpdateAvailable: (updateAvailable) => set({ updateAvailable }),
  setUpdateInfo: (updateVersion, updateNotes) => set({ updateVersion, updateNotes }),
  setMatchAnnotation: (matchId, note) => set((s) => ({
    matchAnnotations: note.trim()
      ? { ...s.matchAnnotations, [matchId]: note }
      : Object.fromEntries(Object.entries(s.matchAnnotations).filter(([k]) => k !== matchId)),
  })),
  setVisibleKpis: (visibleKpis) => set({ visibleKpis }),
  setCompactMode: (compactMode) => {
    document.documentElement.toggleAttribute("data-compact", compactMode);
    set({ compactMode });
  },
  toggleGlobalSearch: () => set((s) => ({ showGlobalSearch: !s.showGlobalSearch })),
  setNavLayout: (navLayout) => set({ navLayout }),
  reorderFavs: (favs) => set({ favs }),
  addFavFolder: (name) => set((s) => ({
    favFolders: [...s.favFolders, { id: Date.now().toString(), name, clubIds: [] }],
  })),
  deleteFavFolder: (id) => set((s) => ({
    favFolders: s.favFolders.filter((f) => f.id !== id),
  })),
  renameFavFolder: (id, name) => set((s) => ({
    favFolders: s.favFolders.map((f) => f.id === id ? { ...f, name } : f),
  })),
  setClubFolder: (clubId, folderId) => set((s) => ({
    favFolders: s.favFolders.map((f) => ({
      ...f,
      clubIds: f.id === folderId
        ? (f.clubIds.includes(clubId) ? f.clubIds : [...f.clubIds, clubId])
        : f.clubIds.filter((id) => id !== clubId),
    })),
  })),
  toggleSrAlert: (clubId) => set((s) => ({
    srAlerts: s.srAlerts.includes(clubId)
      ? s.srAlerts.filter((id) => id !== clubId)
      : [...s.srAlerts, clubId],
  })),
  saveComparison: (name, clubs) => set((s) => ({
    savedComparisons: [
      { id: Date.now().toString(), name, date: new Date().toISOString(), clubs },
      ...s.savedComparisons,
    ].slice(0, 30),
  })),
  deleteSavedComparison: (id) => set((s) => ({
    savedComparisons: s.savedComparisons.filter((c) => c.id !== id),
  })),
  renameSavedComparison: (id, name) => set((s) => ({
    savedComparisons: s.savedComparisons.map((c) => c.id === id ? { ...c, name } : c),
  })),
  setStreamingMode: (streamingMode) => set({ streamingMode }),
  setCustomShortcut: (action, combo) => set((s) => ({
    customShortcuts: { ...s.customShortcuts, [action]: combo },
  })),
  resetCustomShortcuts: () => set({ customShortcuts: {} }),
  addScheduledNotification: (n) => set((s) => ({
    scheduledNotifications: [...s.scheduledNotifications, n],
  })),
  updateScheduledNotification: (id, patch) => set((s) => ({
    scheduledNotifications: s.scheduledNotifications.map((n) => n.id === id ? { ...n, ...patch } : n),
  })),
  deleteScheduledNotification: (id) => set((s) => ({
    scheduledNotifications: s.scheduledNotifications.filter((n) => n.id !== id),
  })),
  saveInterfaceProfile: (p) => set((s) => ({
    interfaceProfiles: [...s.interfaceProfiles.filter((x) => x.id !== p.id), p],
  })),
  deleteInterfaceProfile: (id) => set((s) => ({
    interfaceProfiles: s.interfaceProfiles.filter((p) => p.id !== id),
  })),
  applyInterfaceProfile: (id) => {
    const profile = get().interfaceProfiles.find((p) => p.id === id);
    if (!profile) return;
    get().setTheme(profile.theme);
    get().setDarkMode(profile.darkMode);
    get().setNavLayout(profile.navLayout as "horizontal" | "vertical" | "right" | "bottom");
    get().persistSettings();
  },
  setPublicProfileConfig: (config) => set({ publicProfileConfig: config }),

  applyProxy: async (url: string) => {
    await apiSetProxy(url.trim() || null);
    set({ proxyUrl: url });
    get().addLog(`Proxy ${url.trim() ? "activé: " + url.trim() : "désactivé"}`);
  },

  loadSettings: async () => {
    try {
      const s = await apiLoad();
      const root = document.documentElement;
      const theme = s.theme ?? "cyan";
      const palettePreset = ((s as unknown as Record<string, unknown>).palettePreset as string | null) ?? null;
      if (palettePreset) root.setAttribute("data-palette", palettePreset);
      root.setAttribute("data-theme", theme);
      // Convert old string values to numeric px
      const fsRaw = s.fontSize;
      const numFs = fsRaw === "small" ? 11 : fsRaw === "large" ? 15 : fsRaw === "medium" ? 13
        : Math.max(10, Math.min(20, Number(fsRaw) || 13));
      root.removeAttribute("data-fs");
      applyFontScale(numFs);
      // Font family
      const ff = s.fontFamily ?? "barlow";
      if (ff === "barlow") root.removeAttribute("data-font");
      else root.setAttribute("data-font", ff);
      root.toggleAttribute("data-light",   !(s.darkMode ?? true));
      root.toggleAttribute("data-no-grid", !(s.showGrid ?? true));
      root.toggleAttribute("data-no-anim", !(s.showAnimations ?? true));
      if (theme === "custom") {
        if (s.customAccent) root.style.setProperty("--accent", s.customAccent);
        if (s.customBg)      root.style.setProperty("--bg",      s.customBg);
        if (s.customSurface) root.style.setProperty("--surface",  s.customSurface);
        if (s.customCard)    root.style.setProperty("--card",     s.customCard);
      }
      set({
        history: s.history ?? [], favs: s.favs ?? [],
        tactics: s.tactics ?? [], sessions: s.sessions ?? [],
        compareHistory: s.compareHistory ?? [],
        eaProfile: s.eaProfile ?? null,
        eaProfiles: s.eaProfiles ?? [],
        syncHistory: (s.syncHistory as SyncEntry[]) ?? [],
        theme,
        customAccent:   s.customAccent   ?? "",
        customBg:       s.customBg       ?? "",
        customSurface:  s.customSurface  ?? "",
        customCard:     s.customCard     ?? "",
        darkMode:        s.darkMode        ?? true,
        showGrid:        s.showGrid        ?? true,
        showAnimations:  s.showAnimations  ?? true,
        showLogs:        s.showLogs        ?? true,
        showIdSearch:    s.showIdSearch    ?? false,
        fontSize: numFs,
        fontFamily: ff,
        language: (s.language as Lang) ?? "fr",
        onboarded: s.onboarded ?? false,
        proxyUrl: s.proxyUrl ?? "",
        matchCache: s.matchCache ?? {},
        cacheTimestamps: (s.cacheTimestamps as Record<string, number>) ?? {},
        cacheOwners: (s.cacheOwners as Record<string, string>) ?? {},
        discordWebhook: s.discordWebhook ?? "",
        autoUpdate: s.autoUpdate ?? false,
        matchAnnotations: s.matchAnnotations ?? {},
        visibleKpis: s.visibleKpis ?? ["matches", "wins", "draws", "losses", "winRate", "goals"],
        navLayout: (s.navLayout as "horizontal" | "vertical" | "right" | "bottom") ?? "horizontal",
        sessionTemplates: (s.sessionTemplates as SessionTemplate[]) ?? [],
        streamingMode: ((s as unknown as Record<string, unknown>).streamingMode as boolean) ?? false,
        customShortcuts: ((s as unknown as Record<string, unknown>).customShortcuts as Record<string, string>) ?? {},
        scheduledNotifications: ((s as unknown as Record<string, unknown>).scheduledNotifications as { id: string; time: string; days: number[]; message: string; enabled: boolean }[]) ?? [],
        interfaceProfiles: ((s as unknown as Record<string, unknown>).interfaceProfiles as { id: string; name: string; theme: string; navLayout: string; darkMode: boolean }[]) ?? [],
        favFolders: ((s as unknown as Record<string, unknown>).favFolders as { id: string; name: string; clubIds: string[] }[]) ?? [],
        srAlerts: ((s as unknown as Record<string, unknown>).srAlerts as string[]) ?? [],
        savedComparisons: ((s as unknown as Record<string, unknown>).savedComparisons as SavedComparison[]) ?? [],
        palettePreset,
        autoPostSession: ((s as unknown as Record<string, unknown>).autoPostSession as boolean) ?? false,
        personalRecords: ((s as unknown as Record<string, unknown>).personalRecords as RecordEntry[]) ?? [],
        publicProfileConfig: (s.publicProfileConfig as PublicProfileConfig) ?? null,
        settingsLoaded: true,
      });
    } catch { /* first launch */ } finally {
      set({ settingsLoaded: true });
    }
  },

  persistSettings: async () => {
    const { history, favs, tactics, sessions, compareHistory, eaProfile, eaProfiles, syncHistory,
      theme, darkMode, proxyUrl,
      showGrid, showAnimations, showLogs, showIdSearch, fontSize, fontFamily, customAccent, customBg, customSurface, customCard, language, onboarded, matchCache, cacheTimestamps, cacheOwners, discordWebhook, autoUpdate, matchAnnotations, visibleKpis, navLayout, sessionTemplates,
      streamingMode, customShortcuts, scheduledNotifications, interfaceProfiles,
      favFolders, srAlerts, savedComparisons, palettePreset, autoPostSession, personalRecords, publicProfileConfig } = get();
    const payload = {
      history, favs, tactics, sessions, compareHistory,
      eaProfile: eaProfile ?? undefined,
      eaProfiles, syncHistory,
      theme, darkMode,
      proxyUrl: proxyUrl.trim() || undefined,
      showGrid, showAnimations, showLogs, showIdSearch,
      fontSize: String(fontSize),
      fontFamily,
      customAccent:   customAccent   || undefined,
      customBg:       customBg       || undefined,
      customSurface:  customSurface  || undefined,
      customCard:     customCard     || undefined,
      language,
      onboarded,
      matchCache,
      cacheTimestamps,
      cacheOwners,
      discordWebhook: discordWebhook.trim() || undefined,
      autoUpdate,
      matchAnnotations,
      visibleKpis,
      navLayout,
      sessionTemplates,
      streamingMode,
      customShortcuts,
      scheduledNotifications,
      interfaceProfiles,
      favFolders,
      srAlerts,
      savedComparisons,
      palettePreset: palettePreset ?? undefined,
      autoPostSession,
      personalRecords,
      publicProfileConfig: publicProfileConfig ?? undefined,
    };
    // Skip the I/O write if nothing changed
    const json = JSON.stringify(payload);
    if (json === _lastSavedJson) return;
    _lastSavedJson = json;
    await apiSave(payload);
  },
}));
