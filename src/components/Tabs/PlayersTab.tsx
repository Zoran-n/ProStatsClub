import { useState, useMemo, useCallback } from "react";
import { List, useListRef } from "react-window";
import { Search, Download, ChevronUp, ChevronDown, Users, Filter, AlertTriangle, LayoutGrid, Trophy, Globe } from "lucide-react";
import { detectPerformanceAnomaly } from "../../utils/aiEngine";
import { useAppStore } from "../../store/useAppStore";
import { ExportModal } from "../Modals/ExportModal";
import { useT } from "../../i18n";
import type { Player, Match } from "../../types";
import { PlayerModal, POS_LABELS, PlayerAvatar, ratingColor } from "../Modals/PlayerModal";
import { CompareModal } from "../Modals/CompareModal";
import { CrossClubsModal } from "../Modals/CrossClubsModal";
import { useDebounce } from "../../hooks/useDebounce";

type SortKey = keyof Player | "score";

function compositeScore(p: Player) {
  return p.goals * 3 + p.assists * 2 + p.motm * 5 + Math.round(p.rating * 10);
}

function MiniSparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const W = 52, H = 18;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - ((v - min) / range) * (H - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const last = values[values.length - 1];
  const dotColor = last >= 7.5 ? "var(--green)" : last >= 6.5 ? "#eab308" : "var(--red)";
  const lastX = W, lastY = H - ((last - min) / range) * (H - 2) - 1;
  return (
    <svg width={W} height={H} style={{ overflow: "visible", flexShrink: 0 }}>
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth={1.5}
        strokeLinejoin="round" opacity={0.7} />
      <circle cx={lastX} cy={lastY} r={3} fill={dotColor} />
    </svg>
  );
}

function RatingBadge({ r }: { r: number }) {
  const color = ratingColor(r);
  if (r === 0) return <span style={{ color: "var(--muted)", fontSize: 12 }}>—</span>;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      minWidth: 42, padding: "3px 8px", borderRadius: 12,
      background: `${color}18`, border: `1px solid ${color}55`,
      color, fontSize: 13, fontWeight: 700, fontFamily: "'Bebas Neue', sans-serif",
      letterSpacing: "0.04em",
    }}>{r.toFixed(1)}</span>
  );
}

const BTN: React.CSSProperties = {
  padding: "6px 10px", background: "var(--card)", border: "1px solid var(--border)",
  borderRadius: 6, cursor: "pointer", color: "var(--muted)", fontSize: 11,
  display: "flex", alignItems: "center", gap: 4, flexShrink: 0,
};

const COMPARE_COLORS = ["var(--accent)", "#8b5cf6", "#ff6b35", "#57f287"];

// ─── Row props ────────────────────────────────────────────────────────────────
interface PlayerRowProps {
  sorted: Player[];
  compactMode: boolean;
  compareMode: boolean;
  compareSelected: Player[];
  sortKey: SortKey;
  t: ReturnType<typeof useT>;
  sparklineFor: (name: string) => number[];
  isUnderperforming: (name: string) => boolean;
  handleCardClick: (p: Player) => void;
  presenceFor: (name: string) => number;
  showPresence: boolean;
}

// ─── Row component ────────────────────────────────────────────────────────────
function PlayerRow({
  index, style, ariaAttributes,
  sorted, compactMode, compareMode, compareSelected, sortKey, t,
  sparklineFor, isUnderperforming, handleCardClick, presenceFor, showPresence,
}: {
  index: number;
  style: React.CSSProperties;
  ariaAttributes: { "aria-posinset": number; "aria-setsize": number; role: "listitem" };
} & PlayerRowProps) {
  const p = sorted[index];
  if (!p) return null;

  const posLabel  = POS_LABELS[p.position] || p.position || "—";
  const cIdx      = compareSelected.findIndex((pp) => pp.name === p.name);
  const sel       = compareMode && cIdx >= 0;
  const sparkline = sparklineFor(p.name);
  const alert     = isUnderperforming(p.name);
  const score     = compositeScore(p);
  const presence  = presenceFor(p.name);

  return (
    <div style={{ ...style, paddingLeft: 16, paddingRight: 16, paddingTop: 3, paddingBottom: 3,
      boxSizing: "border-box" }} {...ariaAttributes}>
      <div
        className="compact-row"
        onClick={() => handleCardClick(p)}
        style={{
          display: "flex", alignItems: "center", gap: compactMode ? 8 : 12,
          padding: compactMode ? "6px 10px" : "12px 16px",
          background: sel ? `${COMPARE_COLORS[cIdx]}08` : "var(--card)",
          border: `1px solid ${sel ? COMPARE_COLORS[cIdx] : alert ? "rgba(218,55,60,0.35)" : "var(--border)"}`,
          borderRadius: 8, cursor: "pointer", transition: "border-color 0.15s",
          height: "calc(100% - 6px)", boxSizing: "border-box",
        }}
        onMouseEnter={(e) => { if (!sel) e.currentTarget.style.borderColor = "var(--accent)"; }}
        onMouseLeave={(e) => { if (!sel) e.currentTarget.style.borderColor = alert ? "rgba(218,55,60,0.35)" : "var(--border)"; }}
      >
        <span style={{
          fontSize: 11, fontWeight: 700,
          color: index === 0 ? "#f59e0b" : index === 1 ? "#94a3b8" : index === 2 ? "#cd7c3b" : "var(--muted)",
          width: 18, textAlign: "center", flexShrink: 0,
        }}>{index + 1}</span>
        <PlayerAvatar name={p.name} size={32} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
            {alert && <span title="Performance inhabituelle (écart-type élevé)"><AlertTriangle size={11} style={{ color: "var(--red)", flexShrink: 0 }} /></span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
            <span style={{ padding: "1px 6px", borderRadius: 3, background: "var(--bg)",
              border: "1px solid var(--border)", fontSize: 9, color: "var(--muted)",
              fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.04em" }}>{posLabel}</span>
            {showPresence && presence > 0 && (
              <span style={{ fontSize: 9, color: presence >= 70 ? "var(--green)" : presence >= 40 ? "#eab308" : "var(--muted)" }}>
                {presence}% présence
              </span>
            )}
          </div>
        </div>

        {sparkline.length >= 2 && (
          <div style={{ flexShrink: 0 }} title={`Dernières notes: ${sparkline.map(v => v.toFixed(1)).join(", ")}`}>
            <MiniSparkline values={sparkline} />
          </div>
        )}

        <div style={{ display: "flex", gap: 14, alignItems: "center", flexShrink: 0 }}>
          {[
            { label: t("players.gp"),          value: p.gamesPlayed,              color: "var(--text)" },
            { label: t("players.goalsShort"),   value: p.goals    || "—",          color: "var(--accent)" },
            { label: t("players.assistsShort"), value: p.assists  || "—",          color: "var(--text)" },
            { label: t("session.motm"),         value: p.motm > 0 ? p.motm : "—", color: "#ffd700" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ textAlign: "center", minWidth: 30 }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 17, color, lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.06em", marginTop: 2 }}>{label}</div>
            </div>
          ))}
          <RatingBadge r={p.rating} />
          {sortKey === "score" && (
            <div style={{ textAlign: "center", minWidth: 36 }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 15, color: "#ffd700", lineHeight: 1 }}>{score}</div>
              <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.06em", marginTop: 2 }}>Score</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Heatmap de présence ──────────────────────────────────────────────────────

function HeatmapView({ players, matchCache, currentClub }: {
  players: Player[];
  matchCache: Record<string, unknown[]>;
  currentClub: { id: string; platform: string };
}) {
  const key = `${currentClub.id}_${currentClub.platform}_leagueMatch`;
  const allMatches = (matchCache[key] ?? []) as {
    timestamp: string;
    clubs: Record<string, unknown>;
    players: Record<string, Record<string, { name?: string; playername?: string; playerName?: string }>>;
  }[];

  const recent = [...allMatches]
    .sort((a, b) => Number(b.timestamp) - Number(a.timestamp))
    .slice(0, 20)
    .reverse();

  if (recent.length === 0) return (
    <div style={{ padding: 40, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
      Aucun match en cache — charge les matchs d'abord
    </div>
  );

  const matchPlayerSets: Set<string>[] = recent.map((m) => {
    const clubPlayers = m.players[currentClub.id] ?? {};
    const names = new Set<string>();
    for (const p of Object.values(clubPlayers)) {
      const name = p.name ?? p.playername ?? p.playerName ?? "";
      if (name) names.add(name.toLowerCase());
    }
    return names;
  });

  const matchResults = recent.map((m) => {
    const c = m.clubs[currentClub.id] as Record<string, string> | undefined;
    if (!c) return "D";
    if (Number(c.wins) > 0) return "W";
    if (Number(c.losses) > 0) return "L";
    return "D";
  });

  const sorted = [...players].sort((a, b) => b.gamesPlayed - a.gamesPlayed);
  const CELL = 16;
  const resultColor = (r: string) => r === "W" ? "var(--green)" : r === "L" ? "var(--red)" : "#eab308";

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "12px 16px" }}>
      <div style={{ display: "inline-block", minWidth: "100%" }}>
        <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 4, paddingLeft: 148 }}>
          {recent.map((m, i) => (
            <div key={m.timestamp} style={{ width: CELL + 4, flexShrink: 0, textAlign: "center" }}>
              <div style={{ width: CELL, height: 6, borderRadius: 2, margin: "0 2px",
                background: resultColor(matchResults[i]) }} title={matchResults[i]} />
            </div>
          ))}
          <div style={{ fontSize: 9, color: "var(--muted)", paddingLeft: 6 }}>{recent.length} matchs</div>
        </div>
        {sorted.map((player) => {
          const nameLower = player.name.toLowerCase();
          const presenceCount = matchPlayerSets.filter((s) => s.has(nameLower)).length;
          const pct = recent.length > 0 ? Math.round((presenceCount / recent.length) * 100) : 0;
          return (
            <div key={player.name} style={{ display: "flex", alignItems: "center", marginBottom: 3 }}>
              <div style={{ width: 120, fontSize: 11, color: "var(--text)", overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0, paddingRight: 8 }}
                title={player.name}>{player.name}</div>
              <div style={{ width: 28, fontSize: 9, color: pct >= 70 ? "var(--green)" : pct >= 40 ? "#eab308" : "var(--muted)",
                textAlign: "right", paddingRight: 8, flexShrink: 0 }}>{pct}%</div>
              {matchPlayerSets.map((s, i) => {
                const played = s.has(nameLower);
                return (
                  <div key={i} style={{
                    width: CELL, height: CELL, borderRadius: 2, margin: "0 2px", flexShrink: 0,
                    background: played ? resultColor(matchResults[i]) : "var(--border)",
                    opacity: played ? 0.85 : 0.3, transition: "opacity 0.1s",
                  }} title={played ? `Présent — ${matchResults[i]}` : "Absent"} />
                );
              })}
            </div>
          );
        })}
        <div style={{ display: "flex", gap: 12, marginTop: 12, fontSize: 9, color: "var(--muted)", paddingLeft: 148 }}>
          {[{ color: "var(--green)", label: "Victoire" }, { color: "#eab308", label: "Nul" }, { color: "var(--red)", label: "Défaite" }, { color: "var(--border)", label: "Absent" }]
            .map(({ color, label }) => (
              <span key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: "inline-block" }} />
                {label}
              </span>
            ))}
        </div>
      </div>
    </div>
  );
}

// ─── Podium ───────────────────────────────────────────────────────────────────

const MEDAL = ["#f59e0b", "#94a3b8", "#cd7c3b"];
const MEDAL_LABEL = ["🥇", "🥈", "🥉"];

function PodiumCategory({ title, entries, valueLabel }: {
  title: string; entries: { name: string; value: number }[]; valueLabel: string;
}) {
  const top3 = entries.slice(0, 3);
  return (
    <div style={{ background: "var(--card)", borderRadius: 8, padding: "12px 14px" }}>
      <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.12em",
        fontFamily: "'Bebas Neue', sans-serif", marginBottom: 10 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {top3.map((e, i) => (
          <div key={e.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 6,
            background: i === 0 ? "rgba(245,158,11,0.08)" : "var(--bg)",
            border: `1px solid ${i === 0 ? "rgba(245,158,11,0.25)" : "var(--border)"}` }}>
            <span style={{ fontSize: 14, flexShrink: 0 }}>{MEDAL_LABEL[i]}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: MEDAL[i], lineHeight: 1 }}>{e.value}</div>
              <div style={{ fontSize: 8, color: "var(--muted)", letterSpacing: "0.06em" }}>{valueLabel}</div>
            </div>
          </div>
        ))}
        {top3.length === 0 && (
          <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", padding: 8 }}>—</div>
        )}
      </div>
    </div>
  );
}

function PodiumView({ players }: { players: Player[] }) {
  const sorted = (key: keyof Player) =>
    [...players].filter((p) => Number(p[key]) > 0).sort((a, b) => Number(b[key]) - Number(a[key]))
      .map((p) => ({ name: p.name, value: Number(p[key]) }));
  const ratingEntries = [...players].filter((p) => p.gamesPlayed >= 3 && p.rating > 0)
    .sort((a, b) => b.rating - a.rating).map((p) => ({ name: p.name, value: Number(p.rating.toFixed(2)) }));
  return (
    <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
        <PodiumCategory title="⚽ BUTEURS"    entries={sorted("goals")}       valueLabel="BUTS" />
        <PodiumCategory title="🎯 PASSEURS"   entries={sorted("assists")}     valueLabel="PD" />
        <PodiumCategory title="🛡️ DÉFENSEURS" entries={sorted("tacklesMade")} valueLabel="TACLES" />
        <PodiumCategory title="⭐ MOTM"        entries={sorted("motm")}        valueLabel="MOTM" />
        <PodiumCategory title="📊 MOYENNE"    entries={ratingEntries}         valueLabel="NOTE" />
        <PodiumCategory title="🎮 PRÉSENCE"   entries={sorted("gamesPlayed")} valueLabel="MATCHS" />
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PlayersTab() {
  const t = useT();
  const players     = useAppStore((s) => s.players);
  const matchCache  = useAppStore((s) => s.matchCache);
  const currentClub = useAppStore((s) => s.currentClub);
  const compactMode = useAppStore((s) => s.compactMode);

  const listRef = useListRef(null);

  const [sortKey, setSortKey]     = useState<SortKey>("goals");
  const [sortDir, setSortDir]     = useState<"asc" | "desc">("desc");
  const [selected, setSelected]   = useState<Player | null>(null);
  const [filter, setFilter]       = useState("");
  const debouncedFilter           = useDebounce(filter, 200);
  const [filterPos, setFilterPos] = useState<string>("all");
  const [filterMinRating, setFilterMinRating]   = useState<number>(0);
  const [filterMinGames, setFilterMinGames]     = useState<number>(0);
  const [filterAlertsOnly, setFilterAlertsOnly] = useState(false);
  const [filterMinPresence, setFilterMinPresence] = useState<number>(0);
  const [fromDate, setFromDate]   = useState("");
  const [toDate, setToDate]       = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [exportModal, setExportModal] = useState<"png" | "csv" | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareSelected, setCompareSelected] = useState<Player[]>([]);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [showCrossClubs, setShowCrossClubs] = useState(false);
  const [viewMode, setViewMode]   = useState<"list" | "heatmap" | "podium">("list");

  const ITEM_HEIGHT = compactMode ? 50 : 80;

  const COLS: { key: SortKey; label: string }[] = useMemo(() => [
    { key: "score",       label: "🏆 Score" },
    { key: "gamesPlayed", label: t("players.games") },
    { key: "goals",       label: t("players.goals") },
    { key: "assists",     label: t("players.assists") },
    { key: "passesMade",  label: t("players.passes") },
    { key: "tacklesMade", label: t("players.tackles") },
    { key: "motm",        label: t("session.motm") },
    { key: "rating",      label: t("players.rating") },
  ], [t]);

  const positions = useMemo(() => {
    const set = new Set(players.map((p) => POS_LABELS[p.position] || p.position || "—"));
    return Array.from(set).sort();
  }, [players]);

  // ── Recent ratings per player (sparkline + underperf detection) ────────────
  const playerRecentRatings = useMemo(() => {
    if (!currentClub) return new Map<string, number[]>();
    const key = `${currentClub.id}_${currentClub.platform}_leagueMatch`;
    const cached = matchCache[key] ?? [];
    const byTime = [...cached].sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
    const map = new Map<string, number[]>();
    for (const m of byTime) {
      const clubPlayers = m.players[currentClub.id] as Record<string, Record<string, unknown>> | undefined;
      if (!clubPlayers) continue;
      for (const p of Object.values(clubPlayers)) {
        const name = String(p["name"] ?? p["playername"] ?? p["playerName"] ?? "");
        if (!name) continue;
        const rating = Number(p["rating"] ?? p["ratingAve"] ?? 0);
        if (!rating) continue;
        if (!map.has(name)) map.set(name, []);
        const arr = map.get(name)!;
        if (arr.length < 10) arr.push(rating);
      }
    }
    return map;
  }, [matchCache, currentClub?.id]);

  // ── Presence map (last 20 league matches) ─────────────────────────────────
  const playerPresenceMap = useMemo(() => {
    if (!currentClub) return new Map<string, number>();
    const key = `${currentClub.id}_${currentClub.platform}_leagueMatch`;
    const cached = (matchCache[key] ?? []) as Match[];
    const recent = [...cached]
      .sort((a, b) => Number(b.timestamp) - Number(a.timestamp))
      .slice(0, 20);
    if (recent.length === 0) return new Map<string, number>();
    const countMap = new Map<string, number>();
    for (const m of recent) {
      const clubPlayers = m.players[currentClub.id] as Record<string, Record<string, unknown>> | undefined;
      if (!clubPlayers) continue;
      for (const p of Object.values(clubPlayers)) {
        const name = String(p["name"] ?? p["playername"] ?? p["playerName"] ?? "");
        if (!name) continue;
        countMap.set(name, (countMap.get(name) ?? 0) + 1);
      }
    }
    const pctMap = new Map<string, number>();
    countMap.forEach((count, name) => pctMap.set(name, Math.round((count / recent.length) * 100)));
    return pctMap;
  }, [matchCache, currentClub?.id]);

  // ── Players computed from match cache for date-range filter ───────────────
  const periodFilteredPlayers = useMemo((): Player[] | null => {
    if (!fromDate && !toDate) return null;
    if (!currentClub) return null;
    const allMatches: Match[] = [];
    for (const type of ["leagueMatch", "playoffMatch", "friendlyMatch"]) {
      const key = `${currentClub.id}_${currentClub.platform}_${type}`;
      allMatches.push(...(matchCache[key] ?? []));
    }
    const from = fromDate ? new Date(fromDate).getTime() : 0;
    const to   = toDate   ? new Date(toDate).getTime() + 86_400_000 : Infinity;
    const filtered = allMatches.filter((m) => {
      const ts = Number(m.timestamp);
      const t  = ts > 1e12 ? ts : ts * 1000;
      return t >= from && t <= to;
    });
    if (filtered.length === 0) return [];
    const playerMap = new Map<string, Player & { _ratingSum: number; _ratingCount: number }>();
    for (const m of filtered) {
      const clubPlayers = m.players[currentClub.id] as Record<string, Record<string, unknown>> | undefined;
      if (!clubPlayers) continue;
      for (const p of Object.values(clubPlayers)) {
        const name = String(p["name"] ?? p["playername"] ?? p["playerName"] ?? "");
        if (!name) continue;
        if (!playerMap.has(name)) {
          playerMap.set(name, {
            name,
            position: String(p["position"] ?? ""),
            goals: 0, assists: 0, passesMade: 0, tacklesMade: 0,
            motm: 0, rating: 0, gamesPlayed: 0,
            _ratingSum: 0, _ratingCount: 0,
          });
        }
        const pl = playerMap.get(name)!;
        pl.goals       += Number(p["goals"] ?? 0);
        pl.assists     += Number(p["assists"] ?? 0);
        pl.passesMade  += Number(p["passesMade"] ?? p["passesmade"] ?? 0);
        pl.tacklesMade += Number(p["tacklesMade"] ?? p["tacklesmade"] ?? 0);
        if (p["mom"] === "1" || p["manofthematch"] === "1") pl.motm += 1;
        const r = Number(p["rating"] ?? p["ratingAve"] ?? 0);
        if (r > 0) { pl._ratingSum += r; pl._ratingCount += 1; }
        pl.gamesPlayed += 1;
      }
    }
    return Array.from(playerMap.values()).map((pl) => ({
      ...pl,
      rating: pl._ratingCount > 0 ? Math.round((pl._ratingSum / pl._ratingCount) * 10) / 10 : 0,
    }));
  }, [matchCache, currentClub?.id, fromDate, toDate]);

  const activePlayers = periodFilteredPlayers ?? players;
  const isPeriodActive = !!(fromDate || toDate);

  const sparklineFor = useCallback((name: string): number[] =>
    [...(playerRecentRatings.get(name) ?? [])].reverse(),
  [playerRecentRatings]);

  const isUnderperforming = useCallback((name: string): boolean => {
    const arr = playerRecentRatings.get(name) ?? [];
    if (arr.length < 5) return false;
    const matches = arr.map(rating => ({ rating }));
    return detectPerformanceAnomaly(matches) === 'slump';
  }, [playerRecentRatings]);

  const presenceFor = useCallback((name: string): number =>
    playerPresenceMap.get(name) ?? 0,
  [playerPresenceMap]);

  const sorted = useMemo(() => [...activePlayers]
    .filter((p) => {
      if (!p.name.toLowerCase().includes(debouncedFilter.toLowerCase())) return false;
      if (filterPos !== "all" && (POS_LABELS[p.position] || p.position || "—") !== filterPos) return false;
      if (filterMinRating > 0 && p.rating < filterMinRating) return false;
      if (filterMinGames > 0 && p.gamesPlayed < filterMinGames) return false;
      if (filterAlertsOnly && !isUnderperforming(p.name)) return false;
      if (filterMinPresence > 0 && presenceFor(p.name) < filterMinPresence) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortKey === "score") {
        const sa = compositeScore(a), sb = compositeScore(b);
        return sortDir === "desc" ? sb - sa : sa - sb;
      }
      const av = a[sortKey as keyof Player], bv = b[sortKey as keyof Player];
      if (typeof av === "number" && typeof bv === "number") return sortDir === "desc" ? bv - av : av - bv;
      return sortDir === "desc" ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv));
    }),
  [activePlayers, sortKey, sortDir, debouncedFilter, filterPos, filterMinRating, filterMinGames,
   filterAlertsOnly, filterMinPresence, isUnderperforming, presenceFor]);

  const csvHeaders = [t("players.playerCount"), t("players.pos"), t("players.gp"), t("players.goals"), t("players.assistsShort"), t("players.passes"), t("players.tackles"), t("session.motm"), t("players.rating"), "Score"];
  const csvRows    = sorted.map((p) => [
    p.name, POS_LABELS[p.position] || p.position || "—",
    p.gamesPlayed, p.goals, p.assists, p.passesMade, p.tacklesMade, p.motm,
    p.rating.toFixed(1), compositeScore(p),
  ]);
  const dateStr = new Date().toISOString().slice(0, 10);

  const handleCardClick = useCallback((p: Player) => {
    if (compareMode) {
      setCompareSelected((prev) => {
        if (prev.some((pp) => pp.name === p.name)) return prev.filter((pp) => pp.name !== p.name);
        if (prev.length >= 4) return [...prev.slice(1), p];
        return [...prev, p];
      });
    } else {
      setSelected(p);
    }
  }, [compareMode]);

  const hasFilters = filterPos !== "all" || filterMinRating > 0 || filterMinGames > 0 || filterAlertsOnly || filterMinPresence > 0 || isPeriodActive;

  const rowProps: PlayerRowProps = useMemo(() => ({
    sorted, compactMode, compareMode, compareSelected, sortKey, t,
    sparklineFor, isUnderperforming, handleCardClick, presenceFor,
    showPresence: filterMinPresence > 0,
  }), [sorted, compactMode, compareMode, compareSelected, sortKey, t,
      sparklineFor, isUnderperforming, handleCardClick, presenceFor, filterMinPresence]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* Header bar */}
      <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0,
        display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 140px", minWidth: 120 }}>
          <Search size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)",
            color: "var(--muted)", pointerEvents: "none" }} />
          <input value={filter} onChange={(e) => setFilter(e.target.value)}
            placeholder={t("players.filterPlaceholder")}
            style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)",
              padding: "6px 10px 6px 28px", borderRadius: 6, fontSize: 12, outline: "none", width: "100%",
              transition: "border-color 0.15s" }}
            onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
            onBlur={(e) => (e.target.style.borderColor = "var(--border)")} />
        </div>

        <span style={{ fontSize: 11, color: "var(--muted)", flexShrink: 0 }}>
          {sorted.length} {t("players.playerCount")}
          {isPeriodActive && (
            <span style={{ marginLeft: 4, color: "var(--accent)", fontWeight: 700 }}>· Période</span>
          )}
        </span>

        <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}
          style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)",
            padding: "6px 8px", borderRadius: 6, fontSize: 11, outline: "none", cursor: "pointer", flexShrink: 0 }}>
          {COLS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <button onClick={() => setSortDir((d) => d === "desc" ? "asc" : "desc")}
          style={{ ...BTN, color: "var(--accent)" }}>
          {sortDir === "desc" ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
        </button>

        <button onClick={() => setShowFilters((v) => !v)}
          style={{ ...BTN,
            color: hasFilters || showFilters ? "var(--accent)" : "var(--muted)",
            borderColor: hasFilters || showFilters ? "var(--accent)" : "var(--border)" }}>
          <Filter size={11} /> {t("players.filter")}
          {hasFilters && <span style={{ background: "var(--accent)", color: "#000", borderRadius: "50%",
            width: 14, height: 14, fontSize: 8, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
            {[filterPos !== "all", filterMinRating > 0, filterMinGames > 0, filterAlertsOnly, filterMinPresence > 0, isPeriodActive].filter(Boolean).length}
          </span>}
        </button>

        <button onClick={() => { setCompareMode(!compareMode); setCompareSelected([]); setShowCompareModal(false); }}
          style={{ ...BTN, color: compareMode ? "#000" : "var(--muted)",
            background: compareMode ? "var(--accent)" : "var(--card)",
            borderColor: compareMode ? "var(--accent)" : "var(--border)" }}>
          <Users size={11} /> {t("players.compare")}
        </button>

        <button onClick={() => setShowCrossClubs(true)}
          title="Classement cross-clubs"
          style={{ ...BTN, color: "var(--muted)" }}>
          <Globe size={11} /> Cross-clubs
        </button>

        <button onClick={() => setExportModal("png")} style={BTN}><Download size={11} /> PNG</button>
        <button onClick={() => setExportModal("csv")} style={BTN}><Download size={11} /> CSV</button>

        {/* View mode */}
        <div style={{ display: "flex", gap: 2, marginLeft: "auto", flexShrink: 0,
          background: "var(--bg)", borderRadius: 6, padding: 2 }}>
          {([
            { mode: "list",    icon: <ChevronDown size={11} />, title: "Liste" },
            { mode: "heatmap", icon: <LayoutGrid size={11} />,  title: "Heatmap présence" },
            { mode: "podium",  icon: <Trophy size={11} />,      title: "Classement interne" },
          ] as const).map(({ mode, icon, title }) => (
            <button key={mode} onClick={() => setViewMode(mode)} title={title}
              style={{ ...BTN, padding: "5px 8px", borderRadius: 4,
                background: viewMode === mode ? "var(--accent)" : "none",
                color: viewMode === mode ? "#000" : "var(--muted)", border: "none" }}>
              {icon}
            </button>
          ))}
        </div>
      </div>

      {/* Compare banner */}
      {compareMode && (
        <div style={{ padding: "6px 16px", background: "var(--card)", borderBottom: "1px solid var(--border)",
          fontSize: 11, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Users size={11} style={{ color: "var(--accent)", flexShrink: 0 }} />
          {compareSelected.length === 0 && <span style={{ color: "var(--muted)" }}>Sélectionne 2 à 4 joueurs à comparer</span>}
          {compareSelected.map((p, i) => (
            <span key={p.name} style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700,
              background: `${COMPARE_COLORS[i]}18`, border: `1px solid ${COMPARE_COLORS[i]}55`,
              color: COMPARE_COLORS[i] }}>{p.name}</span>
          ))}
          {compareSelected.length >= 2 && (
            <button onClick={() => setShowCompareModal(true)}
              style={{ ...BTN, color: "#000", background: "var(--accent)",
                borderColor: "var(--accent)", padding: "4px 10px", fontSize: 11, marginLeft: "auto" }}>
              <Users size={11} /> Comparer ({compareSelected.length})
            </button>
          )}
        </div>
      )}

      {/* Filters panel */}
      {showFilters && (
        <div style={{ padding: "10px 16px", background: "var(--card)", borderBottom: "1px solid var(--border)",
          display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>

          {/* Poste */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 10, color: "var(--muted)" }}>{t("players.pos")}</span>
            <select value={filterPos} onChange={(e) => setFilterPos(e.target.value)}
              style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)",
                padding: "4px 6px", borderRadius: 4, fontSize: 11, outline: "none", cursor: "pointer" }}>
              <option value="all">{t("players.allPositions")}</option>
              {positions.map((pos) => <option key={pos} value={pos}>{pos}</option>)}
            </select>
          </div>

          {/* Note min */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 10, color: "var(--muted)" }}>{t("players.minRating")}</span>
            <input type="number" min={0} max={10} step={0.5} value={filterMinRating || ""} placeholder="0"
              onChange={(e) => setFilterMinRating(Number(e.target.value) || 0)}
              style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)",
                padding: "4px 6px", borderRadius: 4, fontSize: 11, outline: "none", width: 50 }} />
          </div>

          {/* MJ min */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 10, color: "var(--muted)" }}>{t("players.minGames")}</span>
            <input type="number" min={0} step={1} value={filterMinGames || ""} placeholder="0"
              onChange={(e) => setFilterMinGames(Number(e.target.value) || 0)}
              style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)",
                padding: "4px 6px", borderRadius: 4, fontSize: 11, outline: "none", width: 50 }} />
          </div>

          {/* Présence min */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 10, color: "var(--muted)" }}>Présence min (%)</span>
              <span style={{ fontSize: 10, fontWeight: 700,
                color: filterMinPresence > 0 ? "var(--accent)" : "var(--muted)" }}>
                {filterMinPresence > 0 ? `${filterMinPresence}%` : "—"}
              </span>
            </div>
            <input type="range" min={0} max={100} step={5} value={filterMinPresence}
              onChange={(e) => setFilterMinPresence(Number(e.target.value))}
              style={{ width: 100, accentColor: "var(--accent)", cursor: "pointer" }} />
            <span style={{ fontSize: 9, color: "var(--muted)" }}>20 derniers matchs</span>
          </div>

          {/* Période custom */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10, color: isPeriodActive ? "var(--accent)" : "var(--muted)",
              fontWeight: isPeriodActive ? 700 : 400 }}>
              Période {isPeriodActive && "— stats calculées depuis le cache"}
            </span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 9, color: "var(--muted)" }}>Du</span>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
                style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)",
                  padding: "3px 6px", borderRadius: 4, fontSize: 10, outline: "none", cursor: "pointer" }} />
              <span style={{ fontSize: 9, color: "var(--muted)" }}>Au</span>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
                style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)",
                  padding: "3px 6px", borderRadius: 4, fontSize: 10, outline: "none", cursor: "pointer" }} />
              {isPeriodActive && (
                <button onClick={() => { setFromDate(""); setToDate(""); }}
                  style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 11 }}>✕</button>
              )}
            </div>
            {isPeriodActive && periodFilteredPlayers !== null && (
              <span style={{ fontSize: 9, color: "var(--muted)" }}>
                {periodFilteredPlayers.length} joueurs · stats calculées sur {
                  (() => {
                    let count = 0;
                    for (const type of ["leagueMatch", "playoffMatch", "friendlyMatch"]) {
                      if (!currentClub) break;
                      const key = `${currentClub.id}_${currentClub.platform}_${type}`;
                      const matches = (matchCache[key] ?? []) as Match[];
                      const from2 = fromDate ? new Date(fromDate).getTime() : 0;
                      const to2   = toDate   ? new Date(toDate).getTime() + 86_400_000 : Infinity;
                      count += matches.filter((m) => {
                        const ts = Number(m.timestamp);
                        const t2 = ts > 1e12 ? ts : ts * 1000;
                        return t2 >= from2 && t2 <= to2;
                      }).length;
                    }
                    return count;
                  })()
                } matchs
              </span>
            )}
          </div>

          {/* Alertes */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <AlertTriangle size={11} style={{ color: "var(--red)" }} />
            <span style={{ fontSize: 10, color: "var(--muted)" }}>Alertes seulement</span>
            <div onClick={() => setFilterAlertsOnly((v) => !v)} style={{
              width: 32, height: 18, borderRadius: 9, cursor: "pointer", flexShrink: 0,
              background: filterAlertsOnly ? "var(--red)" : "var(--border)",
              position: "relative", transition: "background 0.15s",
            }}>
              <div style={{ position: "absolute", top: 2, left: filterAlertsOnly ? 15 : 2,
                width: 14, height: 14, borderRadius: "50%", background: "#fff", transition: "left 0.15s" }} />
            </div>
          </div>

          {/* Reset */}
          {hasFilters && (
            <button onClick={() => {
              setFilterPos("all"); setFilterMinRating(0); setFilterMinGames(0);
              setFilterAlertsOnly(false); setFilterMinPresence(0);
              setFromDate(""); setToDate("");
            }} style={{ ...BTN, fontSize: 10, color: "var(--red)" }}>{t("players.reset")}</button>
          )}
        </div>
      )}

      {/* Heatmap / Podium views */}
      {viewMode === "heatmap" && currentClub && (
        <HeatmapView players={players} matchCache={matchCache} currentClub={currentClub} />
      )}
      {viewMode === "podium" && <PodiumView players={activePlayers} />}

      {/* Virtualized list */}
      <div style={{ flex: 1, overflow: "hidden", display: viewMode === "list" ? undefined : "none" }}>
        {sorted.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
            {t("players.noPlayers")}
          </div>
        ) : (
          <List
            listRef={listRef}
            rowComponent={PlayerRow}
            rowProps={rowProps}
            rowCount={sorted.length}
            rowHeight={ITEM_HEIGHT}
            style={{ overflowX: "hidden" }}
          />
        )}
      </div>

      {selected && <PlayerModal player={selected} onClose={() => setSelected(null)} />}
      {showCompareModal && compareSelected.length >= 2 && (
        <CompareModal players={compareSelected} allPlayers={players} onClose={() => setShowCompareModal(false)} />
      )}
      {showCrossClubs && <CrossClubsModal onClose={() => setShowCrossClubs(false)} />}
      {exportModal === "png" && (
        <ExportModal type="png" pngSourceEl={listRef.current?.element ?? null}
          defaultFilename={`joueurs-${dateStr}`} onClose={() => setExportModal(null)} />
      )}
      {exportModal === "csv" && (
        <ExportModal type="csv" csvHeaders={csvHeaders} csvRows={csvRows}
          defaultFilename={`joueurs-${dateStr}`} onClose={() => setExportModal(null)} />
      )}
    </div>
  );
}
