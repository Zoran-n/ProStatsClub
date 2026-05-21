import { useState, useEffect, useRef, useMemo } from "react";
import {
  Search, Download, Trash2, Clock, Users, Plus, X, BarChart3,
  GitCompare, Activity, Swords, Save, BookOpen, Bell, BellOff, Pencil, Check,
} from "lucide-react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Legend, ResponsiveContainer,
} from "recharts";
import { searchClub, loadClub, getLogo, getMatches, getSeasonHistory } from "../../api/tauri";
import { useAppStore } from "../../store/useAppStore";
import { ExportModal } from "../Modals/ExportModal";
import type { Club, ClubData, Player, Match } from "../../types";

// ─── Position helpers ─────────────────────────────────────────────────────────
const POS_LABELS: Record<string, string> = {
  "0":"GK","1":"RB","2":"RB","3":"CB","4":"CB","5":"LB","6":"LB",
  "7":"CDM","8":"CM","9":"CM","10":"CAM","11":"RM","12":"LM",
  "13":"RW","14":"LW","15":"RF","16":"CF","17":"LF","18":"ST","19":"ST",
  "20":"ST","25":"CF","26":"CAM",
};
const POS_GROUPS: Record<string, string[]> = {
  GK:  ["GK"],
  DEF: ["RB","CB","LB"],
  MIL: ["CDM","CM","CAM","RM","LM"],
  ATT: ["RW","LW","RF","CF","LF","ST"],
};
const GROUP_LABELS: Record<string, string> = { GK:"Gardien", DEF:"Défenseur", MIL:"Milieu", ATT:"Attaquant" };

const COLORS     = ["var(--accent)", "#8b5cf6", "#ff6b35", "#57f287"] as const;
const COLORS_HEX = ["#00d4ff",       "#8b5cf6", "#ff6b35", "#57f287"] as const;
const MAX_CLUBS = 4;

// ─── Season shape ─────────────────────────────────────────────────────────────
interface SeasonData {
  seasonId: string;
  wins: number;
  losses: number;
  ties: number;
  goals: number;
  goalsAgainst?: number;
  skillRating?: string;
}

// ─── ClubLogo ─────────────────────────────────────────────────────────────────
function ClubLogo({ club, size = 32 }: { club: Club; size?: number }) {
  const [logo, setLogo] = useState<string | null>(null);
  useEffect(() => {
    if (club.crestAssetId) getLogo(club.crestAssetId).then(setLogo).catch(() => {});
  }, [club.crestAssetId]);
  const initial = (club.name || "?")[0].toUpperCase();
  return (
    <div style={{ width: size, height: size, borderRadius: 6, background: "var(--bg)",
      border: "1px solid var(--border)", flexShrink: 0, overflow: "hidden",
      display: "flex", alignItems: "center", justifyContent: "center" }}>
      {logo
        ? <img src={logo} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        : <span style={{ fontFamily: "'Bebas Neue', sans-serif",
            fontSize: size * 0.42, color: "var(--accent)", lineHeight: 1 }}>{initial}</span>}
    </div>
  );
}

// ─── Types ───────────────────────────────────────────────────────────────────
interface ClubSlot {
  query: string;
  results: Club[];
  data: ClubData | null;
  loading: boolean;
  seasons: SeasonData[];
  selectedSeasonId: string | null; // null = current
}
const initSlot = (): ClubSlot => ({ query: "", results: [], data: null, loading: false, seasons: [], selectedSeasonId: null });
type Section = "stats" | "radar" | "h2h" | "players" | "battle";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getPlayerPos(p: Player) { return POS_LABELS[p.position] || p.position || "—"; }
function getPlayerGroup(p: Player): string {
  const pos = getPlayerPos(p);
  for (const [group, positions] of Object.entries(POS_GROUPS)) {
    if (positions.includes(pos)) return group;
  }
  return "ATT";
}

function getClubStatsForSlot(slot: ClubSlot): { wins: number; losses: number; ties: number; goals: number; skillRating?: string } | null {
  if (!slot.data) return null;
  if (!slot.selectedSeasonId) return slot.data.club;
  const s = slot.seasons.find(s => s.seasonId === slot.selectedSeasonId);
  if (!s) return slot.data.club;
  return { wins: s.wins, losses: s.losses, ties: s.ties, goals: s.goals, skillRating: s.skillRating };
}

function computeClubRadarStats(slot: ClubSlot) {
  const stats = getClubStatsForSlot(slot);
  if (!stats || !slot.data) return { winPct: 0, goalsPerGame: 0, avgAssists: 0, avgTackles: 0, avgRating: 0, totalMotm: 0 };
  const totalGames = stats.wins + stats.losses + stats.ties;
  const n = slot.data.players.length;
  return {
    winPct:       totalGames > 0 ? (stats.wins / totalGames) * 100 : 0,
    goalsPerGame: totalGames > 0 ? stats.goals / totalGames : 0,
    avgAssists:   n > 0 ? slot.data.players.reduce((s, p) => s + p.assists,     0) / n : 0,
    avgTackles:   n > 0 ? slot.data.players.reduce((s, p) => s + p.tacklesMade, 0) / n : 0,
    avgRating:    n > 0 ? slot.data.players.reduce((s, p) => s + p.rating,      0) / n : 0,
    totalMotm:         slot.data.players.reduce((s, p) => s + p.motm, 0),
  };
}

const BTN: React.CSSProperties = {
  padding: "5px 9px", background: "var(--card)", border: "1px solid var(--border)",
  borderRadius: 5, cursor: "pointer", color: "var(--muted)", fontSize: 11,
  display: "flex", alignItems: "center", gap: 4,
};

// ─── Component ───────────────────────────────────────────────────────────────
export function CompareTab() {
  const {
    compareHistory, addCompareEntry, deleteCompareEntry,
    savedComparisons, saveComparison, deleteSavedComparison, renameSavedComparison,
    srAlerts, toggleSrAlert,
    persistSettings, addToast,
  } = useAppStore();

  const [slots, setSlots]       = useState<ClubSlot[]>([initSlot(), initSlot()]);
  const [section, setSection]   = useState<Section>("stats");
  const [h2hMatches, setH2h]    = useState<Match[] | null>(null);
  const [h2hLoading, setH2hLoading] = useState(false);
  const [exportModal, setExportModal] = useState<"png" | "csv" | null>(null);
  const [savePrompt, setSavePrompt]   = useState(false);
  const [saveName, setSaveName]       = useState("");
  const [showSaved, setShowSaved]     = useState(false);
  const [renamingId, setRenamingId]   = useState<string | null>(null);
  const [renameVal, setRenameVal]     = useState("");
  // Battle votes: stat label → club index voted as winner
  const [battleVotes, setBattleVotes] = useState<Record<string, number>>({});
  const contentRef = useRef<HTMLDivElement>(null);

  // Derived: loaded slots
  const loadedSlots   = slots.filter(s => s.data);
  const loadedData    = loadedSlots.map(s => s.data!);
  const loadedIds     = loadedData.map(d => d.club.id).join(",");

  // ── Slot mutations ──────────────────────────────────────────────────────────
  const updateSlot = (idx: number, patch: Partial<ClubSlot>) =>
    setSlots(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));

  const doSearch = async (idx: number) => {
    const q = slots[idx].query.trim();
    if (!q) return;
    const clubs = await searchClub(q).catch(() => [] as Club[]);
    const seen = new Set<string>();
    updateSlot(idx, { results: clubs.filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; }) });
  };

  const pick = async (club: Club, idx: number) => {
    updateSlot(idx, { results: [], loading: true });
    const data = await loadClub(club.id, club.platform).catch(() => null);

    // ── SR Alert check ──────────────────────────────────────────────────────
    if (data && srAlerts.includes(club.id) && data.club.skillRating) {
      const favs = useAppStore.getState().favs;
      const fav = favs.find(f => f.id === club.id);
      if (fav?.skillRating && fav.skillRating !== data.club.skillRating) {
        addToast(`📊 SR mis à jour — ${club.name}: ${fav.skillRating} → ${data.club.skillRating}`, "info");
      }
    }

    // Load season history
    let seasons: SeasonData[] = [];
    if (data) {
      try {
        const raw = await getSeasonHistory(data.club.id, data.club.platform);
        if (Array.isArray(raw)) seasons = raw as SeasonData[];
      } catch { /* season history unavailable */ }
    }

    updateSlot(idx, { data, loading: false, seasons, selectedSeasonId: null });
  };

  const resetSlot  = (idx: number) => updateSlot(idx, initSlot());
  const addSlot    = () => { if (slots.length < MAX_CLUBS) setSlots(p => [...p, initSlot()]); };
  const removeSlot = (idx: number) => { if (slots.length > 2) setSlots(p => p.filter((_, i) => i !== idx)); };

  // ── Save compare history (2-club only) ────────────────────────────────────
  useEffect(() => {
    if (loadedData.length !== 2) return;
    const [dA, dB] = loadedData;
    addCompareEntry({
      id: [dA.club.id, dB.club.id].sort().join("-"),
      date: new Date().toISOString(),
      clubA: { id: dA.club.id, name: dA.club.name, platform: dA.club.platform },
      clubB: { id: dB.club.id, name: dB.club.name, platform: dB.club.platform },
    });
    persistSettings();
    setBattleVotes({});
   
  }, [loadedIds]);

  // ── H2H ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (loadedData.length !== 2) { setH2h(null); return; }
    const [dA, dB] = loadedData;
    setH2hLoading(true);
    setH2h(null);
    getMatches(dA.club.id, dA.club.platform, "leagueMatch")
      .then(matches => setH2h(matches.filter(m => dB.club.id in m.clubs)))
      .catch(() => setH2h([]))
      .finally(() => setH2hLoading(false));
   
  }, [loadedIds]);

  // ── Radar data ────────────────────────────────────────────────────────────
  const radarData = useMemo(() => {
    if (loadedSlots.length < 2) return null;
    const statsList = loadedSlots.map(computeClubRadarStats);
    const STAT_KEYS: { key: keyof ReturnType<typeof computeClubRadarStats>; label: string }[] = [
      { key: "winPct",       label: "V%" },
      { key: "goalsPerGame", label: "Buts/Match" },
      { key: "avgAssists",   label: "Passes/J" },
      { key: "avgTackles",   label: "Tacles/J" },
      { key: "avgRating",    label: "Note Moy" },
      { key: "totalMotm",    label: "MOTM" },
    ];
    return STAT_KEYS.map(({ key, label }) => {
      const rawVals = statsList.map(s => s[key] as number);
      const maxVal  = Math.max(...rawVals);
      const row: Record<string, unknown> = { stat: label };
      loadedSlots.forEach((_, i) => { row[`c${i}`] = maxVal > 0 ? Math.round((rawVals[i] / maxVal) * 100) : 0; });
      return row;
    });
   
  }, [loadedIds, slots.map(s => s.selectedSeasonId).join(",")]);

  // ── Best players by position ──────────────────────────────────────────────
  const bestByPosition = useMemo(() => {
    if (loadedData.length < 2) return null;
    const groups: Record<string, (Player | null)[]> = {};
    for (const group of Object.keys(POS_GROUPS)) {
      groups[group] = loadedData.map(d => {
        const filtered = d.players.filter(p => getPlayerGroup(p) === group);
        return filtered.length > 0 ? filtered.reduce((best, p) => p.rating > best.rating ? p : best) : null;
      });
    }
    return groups;
   
  }, [loadedIds]);

  // ── Stat table rows ────────────────────────────────────────────────────────
  type StatRowDef = [string, (slot: ClubSlot) => string | number, boolean?];
  const statRowDefs: StatRowDef[] = [
    ["SR",        slot => getClubStatsForSlot(slot)?.skillRating ?? "—"],
    ["VICTOIRES", slot => getClubStatsForSlot(slot)?.wins ?? "—"],
    ["NULS",      slot => getClubStatsForSlot(slot)?.ties ?? "—"],
    ["DÉFAITES",  slot => getClubStatsForSlot(slot)?.losses ?? "—", true],
    ["V%",        slot => {
      const s = getClubStatsForSlot(slot);
      if (!s) return "—";
      const t = s.wins + s.losses + s.ties;
      return t > 0 ? ((s.wins / t) * 100).toFixed(1) + "%" : "—";
    }],
    ["BUTS",      slot => getClubStatsForSlot(slot)?.goals ?? "—"],
    ["JOUEURS",   slot => slot.data?.players.length ?? "—"],
  ];

  // ── Battle stat rows ───────────────────────────────────────────────────────
  const battleRows: { label: string; values: number[] }[] = loadedSlots.length >= 2 ? [
    { label: "V%",         values: loadedSlots.map(slot => { const s = getClubStatsForSlot(slot); if (!s) return 0; const t = s.wins+s.losses+s.ties; return t > 0 ? (s.wins/t)*100 : 0; }) },
    { label: "Victoires",  values: loadedSlots.map(slot => getClubStatsForSlot(slot)?.wins ?? 0) },
    { label: "Buts",       values: loadedSlots.map(slot => getClubStatsForSlot(slot)?.goals ?? 0) },
    { label: "Buts/Match", values: loadedSlots.map(slot => { const s = getClubStatsForSlot(slot); if (!s) return 0; const t = s.wins+s.losses+s.ties; return t > 0 ? s.goals/t : 0; }) },
    { label: "Joueurs",    values: loadedSlots.map(slot => slot.data?.players.length ?? 0) },
    { label: "Note moy.",  values: loadedSlots.map(slot => { if (!slot.data) return 0; const n = slot.data.players.length; return n > 0 ? slot.data.players.reduce((s,p)=>s+p.rating,0)/n : 0; }) },
    { label: "MOTM",       values: loadedSlots.map(slot => slot.data?.players.reduce((s,p)=>s+p.motm,0) ?? 0) },
  ] : [];

  const battleScores = loadedSlots.map((_, ci) =>
    Object.values(battleVotes).filter(v => v === ci).length
  );

  // ── Load from history / saved ──────────────────────────────────────────────
  const loadFromHistory = async (entry: typeof compareHistory[0]) => {
    setSlots([initSlot(), initSlot()].map(s => ({ ...s, loading: true })));
    const [dataA, dataB] = await Promise.all([
      loadClub(entry.clubA.id, entry.clubA.platform).catch(() => null),
      loadClub(entry.clubB.id, entry.clubB.platform).catch(() => null),
    ]);
    setSlots([
      { query: "", results: [], data: dataA, loading: false, seasons: [], selectedSeasonId: null },
      { query: "", results: [], data: dataB, loading: false, seasons: [], selectedSeasonId: null },
    ]);
  };

  const loadFromSaved = async (saved: typeof savedComparisons[0]) => {
    const newSlots = saved.clubs.map(() => ({ ...initSlot(), loading: true }));
    setSlots(newSlots);
    const results = await Promise.all(
      saved.clubs.map(c => loadClub(c.id, c.platform).catch(() => null))
    );
    setSlots(results.map(data => ({
      query: "", results: [], data, loading: false, seasons: [], selectedSeasonId: null,
    })));
    setShowSaved(false);
  };


  // ── Save named comparison ──────────────────────────────────────────────────
  const handleSave = () => {
    if (!saveName.trim() || loadedData.length < 2) return;
    saveComparison(saveName.trim(), loadedData.map(d => ({
      id: d.club.id, name: d.club.name, platform: d.club.platform,
    })));
    persistSettings();
    setSavePrompt(false);
    setSaveName("");
    addToast(`✅ Comparaison "${saveName.trim()}" sauvegardée`, "success");
  };

  // ── CSV ────────────────────────────────────────────────────────────────────
  const dateStr    = new Date().toISOString().slice(0, 10);
  const csvHeaders = ["Stat", ...loadedData.map(d => d.club.name)];
  const csvRows    = loadedSlots.length >= 2 ? [
    ["SR",        ...loadedSlots.map(s => getClubStatsForSlot(s)?.skillRating ?? "—")],
    ["Victoires", ...loadedSlots.map(s => String(getClubStatsForSlot(s)?.wins ?? "—"))],
    ["Nuls",      ...loadedSlots.map(s => String(getClubStatsForSlot(s)?.ties ?? "—"))],
    ["Défaites",  ...loadedSlots.map(s => String(getClubStatsForSlot(s)?.losses ?? "—"))],
    ["V%",        ...loadedSlots.map(s => { const st = getClubStatsForSlot(s); if (!st) return "—"; const t = st.wins+st.losses+st.ties; return t > 0 ? ((st.wins/t)*100).toFixed(1)+"%" : "—"; })],
    ["Buts",      ...loadedSlots.map(s => String(getClubStatsForSlot(s)?.goals ?? "—"))],
    ["Joueurs",   ...loadedSlots.map(s => String(s.data?.players.length ?? "—"))],
  ] : [];

  // ── Section tabs ───────────────────────────────────────────────────────────
  const sectionTabs: { id: Section; label: string; icon: React.ReactNode; disabled?: boolean }[] = [
    { id: "stats",   label: "Stats",   icon: <BarChart3   size={11} /> },
    { id: "radar",   label: "Radar",   icon: <Activity    size={11} /> },
    { id: "h2h",     label: "H2H",     icon: <GitCompare  size={11} />, disabled: loadedData.length !== 2 },
    { id: "battle",  label: "Battle",  icon: <Swords      size={11} />, disabled: loadedData.length < 2 },
    { id: "players", label: "Joueurs", icon: <Users       size={11} />, disabled: loadedData.length < 2 },
  ];

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div ref={contentRef} style={{ flex: 1, overflowY: "auto", padding: 16,
      display: "flex", flexDirection: "column", gap: 14 }}>

      {/* ── Club selection row ── */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "stretch" }}>
        {slots.map((slot, idx) => (
          <div key={idx} style={{ flex: "1 1 170px", minWidth: 155, background: "var(--card)",
            border: "1px solid var(--border)", borderRadius: 10, padding: 13,
            display: "flex", flexDirection: "column", gap: 8 }}>

            {/* Slot header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <p style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 13,
                letterSpacing: "0.1em", color: COLORS[idx], margin: 0 }}>CLUB {idx + 1}</p>
              {slots.length > 2 && (
                <button onClick={() => removeSlot(idx)}
                  style={{ background: "none", border: "none", cursor: "pointer",
                    color: "var(--muted)", padding: 2, lineHeight: 1 }}
                  onMouseEnter={e => (e.currentTarget.style.color = "#ef4444")}
                  onMouseLeave={e => (e.currentTarget.style.color = "var(--muted)")}>
                  <X size={12} />
                </button>
              )}
            </div>

            {slot.data ? (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <ClubLogo club={slot.data.club} size={32} />
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", margin: 0,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {slot.data.club.name}
                    </p>
                    <p style={{ fontSize: 10, color: "var(--muted)", margin: 0 }}>
                      SR {slot.data.club.skillRating ?? "—"}
                    </p>
                  </div>
                  {/* SR alert toggle */}
                  <button
                    onClick={() => { toggleSrAlert(slot.data!.club.id); persistSettings(); }}
                    title={srAlerts.includes(slot.data.club.id) ? "Désactiver alerte SR" : "Activer alerte SR"}
                    style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer",
                      color: srAlerts.includes(slot.data.club.id) ? "var(--gold)" : "var(--muted)",
                      padding: 2, flexShrink: 0 }}>
                    {srAlerts.includes(slot.data.club.id) ? <Bell size={12} /> : <BellOff size={12} />}
                  </button>
                </div>

                {/* Season selector */}
                {slot.seasons.length > 0 && (
                  <select
                    value={slot.selectedSeasonId ?? ""}
                    onChange={e => updateSlot(idx, { selectedSeasonId: e.target.value || null })}
                    style={{
                      width: "100%", background: "var(--bg)", border: "1px solid var(--border)",
                      color: "var(--text)", padding: "4px 6px", borderRadius: 5,
                      fontSize: 10, outline: "none", cursor: "pointer", marginBottom: 4,
                    }}>
                    <option value="">Saison actuelle</option>
                    {slot.seasons.map(s => (
                      <option key={s.seasonId} value={s.seasonId}>
                        Saison {s.seasonId}{s.skillRating ? ` · SR ${s.skillRating}` : ""}
                      </option>
                    ))}
                  </select>
                )}

                <button onClick={() => resetSlot(idx)} style={{ fontSize: 10, color: "var(--muted)",
                  background: "none", border: "1px solid var(--border)", borderRadius: 4,
                  cursor: "pointer", padding: "2px 7px" }}>Changer</button>
              </div>
            ) : slot.loading ? (
              <p style={{ fontSize: 11, color: "var(--muted)" }}>Chargement…</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <input value={slot.query}
                  onChange={e => updateSlot(idx, { query: e.target.value })}
                  onKeyDown={e => e.key === "Enter" && doSearch(idx)}
                  placeholder="Nom du club…"
                  style={{ background: "var(--bg)", border: "1px solid var(--border)",
                    color: "var(--text)", padding: "6px 9px", borderRadius: 5, fontSize: 12, outline: "none" }}
                  onFocus={e => (e.target.style.borderColor = COLORS[idx])}
                  onBlur={e => (e.target.style.borderColor = "var(--border)")}
                />
                <button onClick={() => doSearch(idx)} style={{ padding: "7px",
                  background: COLORS[idx], color: "#000", border: "none", borderRadius: 5,
                  fontFamily: "'Bebas Neue', sans-serif", fontSize: 12, letterSpacing: "0.08em",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                  <Search size={11} /> RECHERCHER
                </button>
                {slot.results.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 130, overflowY: "auto" }}>
                    {slot.results.map(c => (
                      <div key={c.id} onClick={() => pick(c, idx)} style={{
                        display: "flex", alignItems: "center", gap: 8, padding: "5px 8px",
                        borderRadius: 5, cursor: "pointer", background: "var(--bg)",
                        border: "1px solid var(--border)", transition: "border-color 0.12s" }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = COLORS[idx])}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}>
                        <ClubLogo club={c} size={22} />
                        <span style={{ fontSize: 12, color: "var(--text)", fontWeight: 600,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c.name || `#${c.id}`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Add club button */}
        {slots.length < MAX_CLUBS && (
          <button onClick={addSlot} style={{ flex: "0 0 52px", minWidth: 52,
            background: "var(--card)", border: "1px dashed var(--border)", borderRadius: 10,
            cursor: "pointer", color: "var(--muted)",
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", gap: 4, padding: 12 }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--muted)"; }}>
            <Plus size={18} />
            <span style={{ fontSize: 9, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.08em" }}>AJOUTER</span>
          </button>
        )}
      </div>

      {/* ── Sections (2+ clubs loaded) ── */}
      {loadedData.length >= 2 && (
        <>
          {/* Section tab bar + actions */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 2, background: "var(--surface)",
              borderRadius: 8, padding: 3, border: "1px solid var(--border)" }}>
              {sectionTabs.map(tab => (
                <button key={tab.id} onClick={() => !tab.disabled && setSection(tab.id)}
                  disabled={tab.disabled}
                  style={{ display: "flex", alignItems: "center", gap: 5,
                    padding: "5px 10px", borderRadius: 6, border: "none",
                    cursor: tab.disabled ? "default" : "pointer",
                    fontSize: 11, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.07em",
                    background: section === tab.id ? "var(--card)" : "transparent",
                    color: tab.disabled ? "var(--muted)" : section === tab.id ? "var(--accent)" : "var(--muted)",
                    opacity: tab.disabled ? 0.4 : 1,
                    boxShadow: section === tab.id ? "0 1px 3px rgba(0,0,0,0.2)" : "none",
                    transition: "all 0.12s ease" }}>
                  {tab.icon} {tab.label}
                  {tab.id === "battle" && Object.keys(battleVotes).length > 0 && (
                    <span style={{ marginLeft: 2, fontSize: 9, background: "var(--accent)",
                      color: "#000", borderRadius: 8, padding: "0 4px" }}>
                      {Object.keys(battleVotes).length}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {/* Save named comparison */}
              <button
                onClick={() => setSavePrompt(v => !v)}
                title="Sauvegarder cette comparaison"
                style={{ ...BTN, color: savePrompt ? "var(--accent)" : "var(--muted)",
                  borderColor: savePrompt ? "var(--accent)" : "var(--border)" }}>
                <Save size={11} /> Sauvegarder
              </button>
              {/* Show saved */}
              <button
                onClick={() => setShowSaved(v => !v)}
                title="Comparaisons sauvegardées"
                style={{ ...BTN, color: showSaved ? "var(--accent)" : "var(--muted)",
                  borderColor: showSaved ? "var(--accent)" : "var(--border)" }}>
                <BookOpen size={11} /> Sauvegardées {savedComparisons.length > 0 && `(${savedComparisons.length})`}
              </button>
              <button onClick={() => setExportModal("png")} style={BTN}><Download size={11} /> PNG</button>
              <button onClick={() => setExportModal("csv")} style={BTN}><Download size={11} /> CSV</button>
            </div>
          </div>

          {/* ── Save prompt ── */}
          {savePrompt && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "8px 12px",
              background: "var(--card)", border: "1px solid var(--accent)", borderRadius: 8 }}>
              <Save size={13} style={{ color: "var(--accent)", flexShrink: 0 }} />
              <input
                autoFocus
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSave()}
                placeholder='Nom de la comparaison…  ex: "Finale div 2"'
                style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--border)",
                  color: "var(--text)", padding: "5px 9px", borderRadius: 5, fontSize: 12, outline: "none" }}
              />
              <button onClick={handleSave} disabled={!saveName.trim()}
                style={{ padding: "5px 12px", background: "var(--accent)", color: "#000",
                  border: "none", borderRadius: 5, cursor: saveName.trim() ? "pointer" : "default",
                  fontFamily: "'Bebas Neue', sans-serif", fontSize: 12, opacity: saveName.trim() ? 1 : 0.5 }}>
                OK
              </button>
              <button onClick={() => setSavePrompt(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 4 }}>
                <X size={13} />
              </button>
            </div>
          )}

          {/* ── Saved comparisons panel ── */}
          {showSaved && (
            <div style={{ background: "var(--card)", border: "1px solid var(--border)",
              borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 9, color: "var(--muted)", fontFamily: "'Bebas Neue', sans-serif",
                letterSpacing: "0.12em", marginBottom: 8 }}>COMPARAISONS SAUVEGARDÉES</div>
              {savedComparisons.length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>Aucune comparaison sauvegardée</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {savedComparisons.map(saved => (
                    <div key={saved.id} style={{ display: "flex", alignItems: "center", gap: 8,
                      padding: "7px 10px", background: "var(--bg)", border: "1px solid var(--border)",
                      borderRadius: 6, cursor: "pointer", transition: "border-color 0.15s" }}
                      onClick={() => loadFromSaved(saved)}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--accent)")}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {renamingId === saved.id ? (
                          <input autoFocus value={renameVal}
                            onChange={e => setRenameVal(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter") { renameSavedComparison(saved.id, renameVal.trim() || saved.name); persistSettings(); setRenamingId(null); }
                              if (e.key === "Escape") setRenamingId(null);
                            }}
                            onClick={e => e.stopPropagation()}
                            style={{ width: "100%", background: "var(--surface)", border: "1px solid var(--accent)",
                              color: "var(--text)", padding: "2px 6px", borderRadius: 4, fontSize: 12, outline: "none" }}
                          />
                        ) : (
                          <div style={{ fontSize: 12, color: "var(--text)", fontWeight: 600,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {saved.name}
                          </div>
                        )}
                        <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 1 }}>
                          {saved.clubs.map(c => c.name).join(" vs ")} · {new Date(saved.date).toLocaleDateString()}
                        </div>
                      </div>
                      {renamingId === saved.id ? (
                        <button onClick={e => { e.stopPropagation(); renameSavedComparison(saved.id, renameVal.trim() || saved.name); persistSettings(); setRenamingId(null); }}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", padding: 4 }}>
                          <Check size={12} />
                        </button>
                      ) : (
                        <button onClick={e => { e.stopPropagation(); setRenamingId(saved.id); setRenameVal(saved.name); }}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 4 }}
                          onMouseEnter={e => (e.currentTarget.style.color = "var(--text)")}
                          onMouseLeave={e => (e.currentTarget.style.color = "var(--muted)")}>
                          <Pencil size={11} />
                        </button>
                      )}
                      <button onClick={e => { e.stopPropagation(); deleteSavedComparison(saved.id); persistSettings(); }}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 4 }}
                        onMouseEnter={e => (e.currentTarget.style.color = "#ef4444")}
                        onMouseLeave={e => (e.currentTarget.style.color = "var(--muted)")}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── STATS TABLE ── */}
          {section === "stats" && (
            <div style={{ background: "var(--card)", border: "1px solid var(--border)",
              borderRadius: 10, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
                    <th style={{ padding: "9px 12px", fontSize: 10, color: "var(--muted)",
                      fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.06em",
                      textAlign: "left", minWidth: 72 }}>STAT</th>
                    {loadedSlots.map((slot, i) => (
                      <th key={i} style={{ textAlign: "center", padding: "9px 10px",
                        fontSize: 12, color: COLORS[i],
                        fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.06em" }}>
                        <div>{slot.data?.club.name}</div>
                        {slot.selectedSeasonId && (
                          <div style={{ fontSize: 8, opacity: 0.7 }}>Saison {slot.selectedSeasonId}</div>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {statRowDefs.map(([label, getter, lowerBetter]) => {
                    const values = loadedSlots.map(slot => getter(slot));
                    const nums   = values.map(v => parseFloat(String(v).replace("%", "")));
                    const allNum = nums.every(n => !isNaN(n));
                    const maxVal = allNum ? Math.max(...nums) : null;
                    const minVal = allNum ? Math.min(...nums) : null;
                    return (
                      <tr key={String(label)} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "5px 12px", color: "var(--muted)", fontSize: 10,
                          fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.06em",
                          background: "var(--surface)", whiteSpace: "nowrap" }}>{String(label)}</td>
                        {values.map((v, i) => {
                          const n = nums[i];
                          const wins = allNum && !isNaN(n) && maxVal !== minVal && (
                            lowerBetter ? n === minVal : n === maxVal
                          );
                          return (
                            <td key={i} style={{ textAlign: "center", padding: "5px 10px",
                              fontSize: 13, color: wins ? COLORS[i] : "var(--text)",
                              fontWeight: wins ? 700 : "normal" }}>{v}</td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── RADAR CHART ── */}
          {section === "radar" && radarData && (
            <div style={{ background: "var(--card)", border: "1px solid var(--border)",
              borderRadius: 10, padding: 14 }}>
              <p style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.12em",
                fontFamily: "'Bebas Neue', sans-serif", margin: "0 0 10px" }}>
                RADAR — STATS CLÉS (normalisées sur 100)
              </p>
              <ResponsiveContainer width="100%" height={280}>
                <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="72%">
                  <PolarGrid stroke="var(--border)" />
                  <PolarAngleAxis dataKey="stat"
                    tick={{ fill: "var(--muted)", fontSize: 10, fontFamily: "'Bebas Neue', sans-serif" }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                  {loadedSlots.map((slot, i) => (
                    <Radar key={slot.data!.club.id} name={slot.data!.club.name} dataKey={`c${i}`}
                      stroke={COLORS_HEX[i]} fill={COLORS_HEX[i]} fillOpacity={0.18} />
                  ))}
                  <Legend wrapperStyle={{ fontSize: 11, fontFamily: "'Bebas Neue', sans-serif" }}
                    formatter={(value: string) => (
                      <span style={{ color: "var(--text)" }}>{value}</span>
                    )} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── H2H ── */}
          {section === "h2h" && loadedData.length === 2 && (
            <div style={{ background: "var(--card)", border: "1px solid var(--border)",
              borderRadius: 10, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                <GitCompare size={13} style={{ color: "var(--accent)" }} />
                <span style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.12em",
                  fontFamily: "'Bebas Neue', sans-serif" }}>
                  CONFRONTATIONS — {loadedData[0].club.name} vs {loadedData[1].club.name}
                </span>
              </div>

              {h2hLoading ? (
                <p style={{ fontSize: 12, color: "var(--muted)", textAlign: "center" }}>Chargement…</p>
              ) : !h2hMatches ? (
                <p style={{ fontSize: 12, color: "var(--muted)", textAlign: "center" }}>—</p>
              ) : h2hMatches.length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--muted)", textAlign: "center" }}>
                  Aucune confrontation directe trouvée
                </p>
              ) : (
                <>
                  {(() => {
                    const aId = loadedData[0].club.id;
                    const bId = loadedData[1].club.id;
                    let wins = 0, losses = 0, draws = 0;
                    h2hMatches.forEach(m => {
                      const gA = parseInt((m.clubs[aId]?.goals as string) ?? "0") || 0;
                      const gB = parseInt((m.clubs[bId]?.goals as string) ?? "0") || 0;
                      if (gA > gB) wins++;
                      else if (gA < gB) losses++;
                      else draws++;
                    });
                    return (
                      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                        {[
                          { label: "VICTOIRES",  val: wins,   color: "var(--green)" },
                          { label: "NULS",       val: draws,  color: "var(--muted)" },
                          { label: "DÉFAITES",   val: losses, color: "var(--red)" },
                          { label: "MATCHS",     val: h2hMatches.length, color: "var(--accent)" },
                        ].map(({ label, val, color }) => (
                          <div key={label} style={{ flex: 1, textAlign: "center", padding: "8px 4px",
                            background: "var(--bg)", borderRadius: 6, border: "1px solid var(--border)" }}>
                            <div style={{ fontSize: 22, fontFamily: "'Bebas Neue', sans-serif", color }}>{val}</div>
                            <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.07em" }}>{label}</div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                  <div style={{ display: "flex", flexDirection: "column", gap: 4,
                    maxHeight: 300, overflowY: "auto" }}>
                    {[...h2hMatches]
                      .sort((a, b) => parseInt(b.timestamp) - parseInt(a.timestamp))
                      .map(m => {
                        const aId = loadedData[0].club.id;
                        const bId = loadedData[1].club.id;
                        const gA = parseInt((m.clubs[aId]?.goals as string) ?? "0") || 0;
                        const gB = parseInt((m.clubs[bId]?.goals as string) ?? "0") || 0;
                        const result      = gA > gB ? "V" : gA < gB ? "D" : "N";
                        const resultColor = result === "V" ? "var(--green)" : result === "D" ? "var(--red)" : "var(--muted)";
                        const ts   = parseInt(m.timestamp);
                        const date = !isNaN(ts) ? new Date(ts * 1000).toLocaleDateString() : new Date(m.timestamp).toLocaleDateString();
                        return (
                          <div key={m.matchId} style={{ display: "grid",
                            gridTemplateColumns: "1fr 60px 1fr 36px",
                            gap: 6, padding: "7px 10px",
                            background: "var(--bg)", borderRadius: 6,
                            border: "1px solid var(--border)", alignItems: "center" }}>
                            <div style={{ fontSize: 12, fontWeight: 600,
                              color: COLORS[0], textAlign: "right",
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {loadedData[0].club.name}
                            </div>
                            <div style={{ textAlign: "center",
                              fontFamily: "'Bebas Neue', sans-serif", fontSize: 16,
                              color: "var(--text)", letterSpacing: "0.05em" }}>
                              {gA} – {gB}
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 600,
                              color: COLORS[1],
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {loadedData[1].club.name}
                            </div>
                            <div style={{ textAlign: "center" }}>
                              <div style={{ fontSize: 12, fontFamily: "'Bebas Neue', sans-serif",
                                color: resultColor }}>{result}</div>
                              <div style={{ fontSize: 9, color: "var(--muted)" }}>{date}</div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── BATTLE MODE ── */}
          {section === "battle" && (
            <div style={{ background: "var(--card)", border: "1px solid var(--border)",
              borderRadius: 10, padding: 14 }}>
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <Swords size={15} style={{ color: "var(--accent)" }} />
                <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 14,
                  color: "var(--accent)", letterSpacing: "0.1em" }}>MODE BATTLE</span>
                <span style={{ fontSize: 10, color: "var(--muted)", marginLeft: 4 }}>
                  Vote sur chaque stat — qui est supérieur ?
                </span>
                {Object.keys(battleVotes).length > 0 && (
                  <button onClick={() => setBattleVotes({})}
                    style={{ marginLeft: "auto", fontSize: 10, color: "var(--muted)",
                      background: "none", border: "1px solid var(--border)", borderRadius: 4,
                      cursor: "pointer", padding: "2px 7px" }}>
                    Réinitialiser
                  </button>
                )}
              </div>

              {/* Battle rows */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {battleRows.map(({ label, values }) => {
                  const voted = battleVotes[label] ?? -1;
                  const maxV = Math.max(...values);
                  const autoWinner = values.filter(v => v === maxV).length === 1
                    ? values.indexOf(maxV) : -1;
                  return (
                    <div key={label} style={{ display: "grid",
                      gridTemplateColumns: `repeat(${loadedSlots.length}, 1fr) 80px`,
                      gap: 6, alignItems: "center" }}>
                      {loadedSlots.map((slot, ci) => {
                        const isVoted = voted === ci;
                        const isAuto = autoWinner === ci;
                        return (
                          <button key={ci} onClick={() => setBattleVotes(prev => ({ ...prev, [label]: ci }))}
                            style={{
                              padding: "8px 6px", borderRadius: 7, cursor: "pointer",
                              border: `2px solid ${isVoted ? COLORS[ci] : isAuto ? `${COLORS_HEX[ci]}44` : "var(--border)"}`,
                              background: isVoted ? `${COLORS_HEX[ci]}22` : "var(--bg)",
                              transition: "all 0.12s",
                              display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                            }}>
                            <div style={{ fontSize: 9, color: COLORS[ci], fontFamily: "'Bebas Neue', sans-serif",
                              letterSpacing: "0.06em", overflow: "hidden", textOverflow: "ellipsis",
                              whiteSpace: "nowrap", maxWidth: "100%" }}>
                              {slot.data?.club.name}
                            </div>
                            <div style={{ fontSize: 16, fontFamily: "'Bebas Neue', sans-serif",
                              color: isVoted ? COLORS[ci] : isAuto ? COLORS[ci] : "var(--text)",
                              fontWeight: 700 }}>
                              {typeof values[ci] === "number" && values[ci] % 1 !== 0
                                ? values[ci].toFixed(2) : values[ci]}
                            </div>
                          </button>
                        );
                      })}
                      <div style={{ fontSize: 10, color: "var(--muted)", textAlign: "center",
                        fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.05em" }}>
                        {label}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Battle result */}
              {Object.keys(battleVotes).length > 0 && (
                <div style={{ marginTop: 16, padding: "12px 14px",
                  background: "var(--surface)", borderRadius: 8, border: "1px solid var(--border)" }}>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 12,
                    color: "var(--muted)", letterSpacing: "0.1em", marginBottom: 8 }}>
                    RÉSULTAT DU BATTLE
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {loadedSlots.map((slot, ci) => {
                      const score = battleScores[ci];
                      const isWinner = score === Math.max(...battleScores) && score > 0;
                      return (
                        <div key={ci} style={{
                          flex: "1 1 100px", padding: "10px 12px", borderRadius: 8, textAlign: "center",
                          background: isWinner ? `${COLORS_HEX[ci]}18` : "var(--bg)",
                          border: `1px solid ${isWinner ? COLORS[ci] : "var(--border)"}`,
                          transition: "all 0.15s",
                        }}>
                          <div style={{ fontSize: 11, color: COLORS[ci], fontFamily: "'Bebas Neue', sans-serif",
                            letterSpacing: "0.06em", marginBottom: 4 }}>
                            {isWinner ? "🏆 " : ""}{slot.data?.club.name}
                          </div>
                          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: COLORS[ci] }}>
                            {score}
                          </div>
                          <div style={{ fontSize: 9, color: "var(--muted)" }}>
                            stat{score > 1 ? "s" : ""} gagnée{score > 1 ? "s" : ""}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── BEST PLAYERS BY POSITION ── */}
          {section === "players" && bestByPosition && (
            <div style={{ background: "var(--card)", border: "1px solid var(--border)",
              borderRadius: 10, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                <Users size={13} style={{ color: "var(--accent)" }} />
                <span style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.12em",
                  fontFamily: "'Bebas Neue', sans-serif" }}>MEILLEURS JOUEURS PAR POSTE</span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 400 }}>
                  <thead>
                    <tr style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
                      <th style={{ padding: "7px 10px", fontSize: 10, color: "var(--muted)",
                        fontFamily: "'Bebas Neue', sans-serif", textAlign: "left", width: 80 }}>POSTE</th>
                      {loadedData.map((d, i) => (
                        <th key={i} style={{ padding: "7px 10px", fontSize: 11, color: COLORS[i],
                          fontFamily: "'Bebas Neue', sans-serif", textAlign: "center" }}>
                          {d.club.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(bestByPosition).map(([group, players]) => {
                      const ratings  = players.map(p => p?.rating ?? 0);
                      const maxRating = Math.max(...ratings);
                      return (
                        <tr key={group} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "6px 10px", fontSize: 10, color: "var(--muted)",
                            fontFamily: "'Bebas Neue', sans-serif", background: "var(--surface)",
                            whiteSpace: "nowrap" }}>{GROUP_LABELS[group].toUpperCase()}</td>
                          {players.map((p, i) => {
                            const isWinner = p !== null && p.rating === maxRating && maxRating > 0 &&
                              ratings.filter(r => r === maxRating).length === 1;
                            return (
                              <td key={i} style={{ padding: "6px 10px", textAlign: "center" }}>
                                {p ? (
                                  <>
                                    <div style={{ fontSize: 12, fontWeight: 600,
                                      color: isWinner ? COLORS[i] : "var(--text)" }}>{p.name}</div>
                                    <div style={{ fontSize: 10, color: "var(--muted)" }}>
                                      {getPlayerPos(p)} · {p.rating > 0 ? p.rating.toFixed(1) : "—"} · {p.goals}G {p.assists}PD
                                    </div>
                                  </>
                                ) : <span style={{ fontSize: 11, color: "var(--muted)" }}>—</span>}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Prompt when only one club loaded */}
      {loadedData.length === 1 && (
        <p style={{ textAlign: "center", color: "var(--muted)", fontSize: 12, margin: 0 }}>
          Sélectionnez un deuxième club pour comparer
        </p>
      )}

      {/* ── Compare history ── */}
      {compareHistory.length > 0 && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <Clock size={13} style={{ color: "var(--muted)" }} />
            <span style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.12em",
              fontFamily: "'Bebas Neue', sans-serif" }}>COMPARAISONS RÉCENTES</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {compareHistory.map(entry => (
              <div key={entry.id} style={{ display: "flex", alignItems: "center", gap: 8,
                padding: "8px 10px", background: "var(--card)", border: "1px solid var(--border)",
                borderRadius: 6, cursor: "pointer", transition: "border-color 0.15s" }}
                onClick={() => loadFromHistory(entry)}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--accent)")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: "var(--text)", fontWeight: 600,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {entry.clubA.name} <span style={{ color: "var(--muted)", fontWeight: 400 }}>vs</span> {entry.clubB.name}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
                    {new Date(entry.date).toLocaleDateString()}
                  </div>
                </div>
                <button onClick={e => { e.stopPropagation(); deleteCompareEntry(entry.id); persistSettings(); }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 4 }}
                  onMouseEnter={e => (e.currentTarget.style.color = "#ef4444")}
                  onMouseLeave={e => (e.currentTarget.style.color = "var(--muted)")}>
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Export modals ── */}
      {exportModal === "png" && (
        <ExportModal type="png" pngSourceEl={contentRef.current}
          defaultFilename={`comparaison-${dateStr}`} onClose={() => setExportModal(null)} />
      )}
      {exportModal === "csv" && (
        <ExportModal type="csv" csvHeaders={csvHeaders} csvRows={csvRows}
          defaultFilename={`comparaison-${dateStr}`} onClose={() => setExportModal(null)} />
      )}
    </div>
  );
}
