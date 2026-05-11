import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import {
  Trophy, Target, Star, TrendingUp, Shield, Swords, FileText,
  Zap, Activity, Terminal, Trash2, ChevronDown, ChevronUp,
  AlertCircle, CheckCircle2, Clock,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, RadarChart, Radar,
  PolarGrid, PolarAngleAxis,
} from "recharts";
import { useAppStore } from "../../store/useAppStore";
import { logger } from "../../utils/logger";
import type { Match, Session } from "../../types";
import { PublicProfileSection } from "../profile/PublicProfileSection";

// ── Discord log interceptor ────────────────────────────────────────────────────
export interface DiscordLog {
  id: number;
  ts: string;
  url: string;
  payload: string;
  status: number | null;
  error: string | null;
}

let _logId = 0;
const _discordLogs: DiscordLog[] = [];
const _listeners = new Set<() => void>();

export function addDiscordLog(entry: Omit<DiscordLog, "id" | "ts">) {
  _discordLogs.unshift({ ...entry, id: ++_logId, ts: new Date().toISOString() });
  if (_discordLogs.length > 50) _discordLogs.pop();
  _listeners.forEach((fn) => fn());
}

export function useDiscordLogs() {
  const [, tick] = useState(0);
  useEffect(() => {
    const fn = () => tick((n) => n + 1);
    _listeners.add(fn);
    return () => { _listeners.delete(fn); };
  }, []);
  return _discordLogs;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getDivision(sr: number): { div: string; color: string } {
  if (sr >= 3000) return { div: "Elite",  color: "#f59e0b" };
  if (sr >= 2700) return { div: "Div 1",  color: "#f59e0b" };
  if (sr >= 2400) return { div: "Div 2",  color: "#f59e0b" };
  if (sr >= 2100) return { div: "Div 3",  color: "#a855f7" };
  if (sr >= 1800) return { div: "Div 4",  color: "#a855f7" };
  if (sr >= 1500) return { div: "Div 5",  color: "#3b82f6" };
  if (sr >= 1300) return { div: "Div 6",  color: "#3b82f6" };
  if (sr >= 1100) return { div: "Div 7",  color: "#22c55e" };
  if (sr >= 900)  return { div: "Div 8",  color: "#22c55e" };
  if (sr >= 700)  return { div: "Div 9",  color: "#6b7280" };
  return              { div: "Div 10", color: "#6b7280" };
}

interface PerMatchStat {
  matchId: string;
  date: string;
  goals: number;
  assists: number;
  rating: number;
  motm: boolean;
  result: "W" | "D" | "L";
  position: string;
}

// ── Shared card ───────────────────────────────────────────────────────────────
function Card({
  children, className = "", style,
}: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`rounded-lg ${className}`}
      style={{ background: "var(--card)", border: "1px solid var(--border)", ...style }}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="category-header" style={{ marginBottom: 12 }}>{children}</p>
  );
}

function NoData({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-2">
      <Activity size={24} style={{ color: "var(--border)" }} />
      <span style={{ fontSize: 11, color: "var(--muted)" }}>{label}</span>
    </div>
  );
}

const TOOLTIP_STYLE = {
  background: "var(--card)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 11,
};

// ── Debug console ─────────────────────────────────────────────────────────────
function DebugConsole() {
  const logs = useDiscordLogs();
  const [open, setOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, open]);

  const statusColor = (status: number | null, error: string | null) => {
    if (error) return "var(--red)";
    if (status && status >= 200 && status < 300) return "var(--green)";
    if (status && status >= 400) return "var(--red)";
    return "var(--gold)";
  };

  const statusIcon = (status: number | null, error: string | null) => {
    if (error || (status && status >= 400)) return <AlertCircle size={11} style={{ color: "var(--red)", flexShrink: 0 }} />;
    if (status && status >= 200 && status < 300) return <CheckCircle2 size={11} style={{ color: "var(--green)", flexShrink: 0 }} />;
    return <Clock size={11} style={{ color: "var(--gold)", flexShrink: 0 }} />;
  };

  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 transition-colors"
        style={{ background: "transparent" }}
        onMouseEnter={e => (e.currentTarget.style.background = "var(--hover)")}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
      >
        <div className="flex items-center gap-2">
          <Terminal size={12} style={{ color: "var(--accent)" }} />
          <span className="category-header" style={{ marginBottom: 0 }}>Discord Debug Console</span>
          {logs.length > 0 && (
            <span style={{ fontSize: 10, background: "var(--surface)", color: "var(--muted)", borderRadius: 4, padding: "1px 6px" }}>
              {logs.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {logs.some((l) => l.error || (l.status && l.status >= 400)) && (
            <span style={{ fontSize: 10, color: "var(--red)", fontWeight: 600 }}>erreurs détectées</span>
          )}
          {open
            ? <ChevronUp size={12} style={{ color: "var(--muted)" }} />
            : <ChevronDown size={12} style={{ color: "var(--muted)" }} />}
        </div>
      </button>

      {open && (
        <div style={{ borderTop: "1px solid var(--border)" }}>
          <div className="px-5 py-2" style={{ background: "var(--guild-bar)", borderBottom: "1px solid var(--border)", fontSize: 10, color: "var(--muted)" }}>
            Intercepte chaque appel Discord · URL · payload · statut HTTP · erreur exacte.
            Si tu vois <span style={{ color: "var(--red)" }}>403</span> = webhook invalide/expiré.
            {" "}<span style={{ color: "var(--gold)" }}>CORS</span> n'affecte pas Tauri (utilise{" "}
            <code style={{ color: "var(--accent)" }}>@tauri-apps/plugin-http</code>).
          </div>

          {logs.length === 0 ? (
            <div className="px-5 py-8 text-center font-mono" style={{ fontSize: 11, color: "var(--muted)", background: "var(--guild-bar)" }}>
              Aucun appel Discord intercepté pour l'instant…
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto font-mono" style={{ background: "var(--guild-bar)", fontSize: 11 }}>
              {logs.map((log) => (
                <div key={log.id} className="px-4 py-2 space-y-1" style={{ borderBottom: "1px solid var(--border)" }}>
                  <div className="flex items-center gap-2">
                    {statusIcon(log.status, log.error)}
                    <span style={{ fontSize: 10, color: "var(--muted)" }}>{log.ts.slice(11, 19)}</span>
                    <span style={{ fontWeight: 700, color: statusColor(log.status, log.error) }}>
                      {log.status ?? "—"}
                    </span>
                    <span style={{ color: "var(--text)", opacity: 0.7 }} className="truncate">
                      {log.url.slice(0, 60)}{log.url.length > 60 ? "…" : ""}
                    </span>
                  </div>
                  {log.error && (
                    <div className="pl-4 text-[10px] leading-relaxed" style={{ color: "var(--red)" }}>{log.error}</div>
                  )}
                  <details className="pl-4">
                    <summary className="cursor-pointer text-[10px]" style={{ color: "var(--muted)" }}>payload</summary>
                    <pre className="text-[9px] whitespace-pre-wrap break-all mt-1 max-h-32 overflow-y-auto" style={{ color: "var(--green)" }}>
                      {log.payload}
                    </pre>
                  </details>
                </div>
              ))}
              <div ref={endRef} />
            </div>
          )}

          <div className="px-5 py-2 flex justify-between items-center" style={{ borderTop: "1px solid var(--border)" }}>
            <button
              onClick={() => logger.downloadLogs()}
              className="flex items-center gap-1.5 channel-item"
              style={{ fontSize: 10, padding: "2px 4px" }}
            >
              <FileText size={11} /> Télécharger tous les logs
            </button>
            <button
              onClick={() => { _discordLogs.splice(0); _listeners.forEach((fn) => fn()); }}
              className="flex items-center gap-1.5 channel-item"
              style={{ fontSize: 10, padding: "2px 4px" }}
            >
              <Trash2 size={11} /> Vider
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export function MyProfilePage() {
  const { eaProfile, currentClub, players, sessions, matches, matchCache } = useAppStore();

  const [visible, setVisible] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVisible(true), 60); return () => clearTimeout(t); }, []);

  // ── Season stats ───────────────────────────────────────────────────────
  const seasonPlayer = useMemo(() => {
    if (!eaProfile?.gamertag) return null;
    return players.find((p) => p.name.toLowerCase() === eaProfile.gamertag.toLowerCase()) ?? null;
  }, [eaProfile, players]);

  // ── All match appearances ──────────────────────────────────────────────
  const allPlayerMatches = useMemo(() => {
    if (!eaProfile?.gamertag || !eaProfile?.clubId) return [];
    const gt = eaProfile.gamertag.toLowerCase();
    const cid = eaProfile.clubId;
    const seen = new Set<string>();
    const result: PerMatchStat[] = [];

    const processMatch = (m: Match) => {
      if (seen.has(m.matchId)) return;
      const clubPlayers = m.players?.[cid] as Record<string, Record<string, unknown>> | undefined;
      if (!clubPlayers) return;
      const entry = Object.entries(clubPlayers).find(([, v]) => {
        const name = String(v["name"] ?? v["playername"] ?? v["playerName"] ?? "").toLowerCase();
        return name === gt;
      });
      if (!entry) return;
      seen.add(m.matchId);
      const p = entry[1];
      const myClub = m.clubs?.[cid] as Record<string, unknown> | undefined;
      const res = myClub?.["wins"] === "1" ? "W" : myClub?.["losses"] === "1" ? "L" : "D";
      result.push({
        matchId: m.matchId,
        date: m.timestamp,
        goals: Number(p["goals"] ?? 0),
        assists: Number(p["assists"] ?? 0),
        rating: Number(p["rating"] ?? p["ratingAve"] ?? 0),
        motm: p["mom"] === "1" || p["manofthematch"] === "1",
        result: res,
        position: String(p["vproPos"] ?? p["favoritePosition"] ?? ""),
      });
    };

    for (const s of sessions) {
      if (s.clubId === cid) s.matches.forEach(processMatch);
    }
    matches.forEach(processMatch);
    for (const key of Object.keys(matchCache)) {
      if (key.startsWith(`${cid}_`)) matchCache[key]?.forEach(processMatch);
    }
    result.sort((a, b) => {
      const ta = Number(a.date) || new Date(a.date).getTime();
      const tb = Number(b.date) || new Date(b.date).getTime();
      return tb - ta;
    });
    return result;
  }, [eaProfile, sessions, matches, matchCache]);

  // ── Aggregated stats ───────────────────────────────────────────────────
  const matchWins   = allPlayerMatches.filter((m) => m.result === "W").length;
  const matchDraws  = allPlayerMatches.filter((m) => m.result === "D").length;
  const matchLosses = allPlayerMatches.filter((m) => m.result === "L").length;

  const agg = useMemo(() => {
    if (seasonPlayer) {
      const sp = seasonPlayer;
      const clubW = currentClub?.wins ?? matchWins;
      const clubD = currentClub?.ties ?? matchDraws;
      const clubL = currentClub?.losses ?? matchLosses;
      const clubTotal = clubW + clubD + clubL;
      return {
        games: sp.gamesPlayed, totalGoals: sp.goals, totalAssists: sp.assists,
        totalMotm: sp.motm, avgRating: sp.rating,
        wins: clubW, draws: clubD, losses: clubL,
        winRate: clubTotal > 0 ? Math.round((clubW / clubTotal) * 100) : 0,
        passesMade: sp.passesMade, tacklesMade: sp.tacklesMade,
        source: "season" as const,
      };
    }
    const ms = allPlayerMatches;
    if (!ms.length) return null;
    const rated = ms.filter((m) => m.rating > 0);
    const avgRating = rated.length ? rated.reduce((s, m) => s + m.rating, 0) / rated.length : 0;
    return {
      games: ms.length,
      totalGoals: ms.reduce((s, m) => s + m.goals, 0),
      totalAssists: ms.reduce((s, m) => s + m.assists, 0),
      totalMotm: ms.filter((m) => m.motm).length,
      avgRating,
      wins: matchWins, draws: matchDraws, losses: matchLosses,
      winRate: ms.length > 0 ? Math.round((matchWins / ms.length) * 100) : 0,
      passesMade: 0, tacklesMade: 0,
      source: "matches" as const,
    };
  }, [seasonPlayer, currentClub, allPlayerMatches, matchWins, matchDraws, matchLosses]);

  // ── Charts data ────────────────────────────────────────────────────────
  const ratingData = useMemo(() =>
    allPlayerMatches.slice(0, 40).reverse()
      .filter((m) => m.rating > 0)
      .map((m, i) => ({ idx: i + 1, rating: Number(m.rating.toFixed(2)), result: m.result })),
  [allPlayerMatches]);

  const batchData = useMemo(() => {
    const reversed = [...allPlayerMatches].reverse();
    const batches: { label: string; goals: number; assists: number }[] = [];
    for (let i = 0; i < Math.min(reversed.length, 50); i += 5) {
      const chunk = reversed.slice(i, i + 5);
      batches.push({
        label: `${i + 1}-${i + chunk.length}`,
        goals: chunk.reduce((s, m) => s + m.goals, 0),
        assists: chunk.reduce((s, m) => s + m.assists, 0),
      });
    }
    return batches;
  }, [allPlayerMatches]);

  // ── Radar data ─────────────────────────────────────────────────────────
  const radarData = useMemo(() => {
    if (!agg || !agg.games) return null;
    const norm = (v: number, max: number) => Math.min(100, Math.round((v / max) * 100));
    return [
      { axis: "Buts/match",  value: norm(agg.totalGoals   / agg.games, 1.5) },
      { axis: "PD/match",    value: norm(agg.totalAssists / agg.games, 1.5) },
      { axis: "Note",        value: norm(agg.avgRating,                 10)  },
      { axis: "Victoires",   value: agg.winRate                              },
      { axis: "MOTM%",       value: norm(agg.totalMotm    / agg.games, 0.3)  },
    ];
  }, [agg]);

  // ── Last 3 sessions ────────────────────────────────────────────────────
  const lastSessions = useMemo(() => {
    if (!eaProfile?.clubId) return [];
    return [...sessions]
      .filter((s) => s.clubId === eaProfile.clubId && !s.archived)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 3);
  }, [sessions, eaProfile]);

  // ── Division & forme ───────────────────────────────────────────────────
  const srNum = currentClub?.id === eaProfile?.clubId && currentClub?.skillRating
    ? Number(currentClub.skillRating) || null : null;
  const division = srNum ? getDivision(srNum) : null;
  const forme = allPlayerMatches.slice(0, 10).reverse().map((m) => m.result);

  // ── Fade-in helper ─────────────────────────────────────────────────────
  const fade = useCallback((delay: number): React.CSSProperties => ({
    opacity: visible ? 1 : 0,
    transform: visible ? "translateY(0)" : "translateY(10px)",
    transition: `opacity 0.35s ease ${delay}ms, transform 0.35s ease ${delay}ms`,
  }), [visible]);

  // ── Empty state ────────────────────────────────────────────────────────
  if (!eaProfile?.clubId) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3 p-8">
          <Swords size={32} style={{ margin: "0 auto", color: "var(--border)" }} />
          <p style={{ fontSize: 13, color: "var(--muted)" }}>Lie un profil EA pour voir tes statistiques personnelles.</p>
        </div>
      </div>
    );
  }

  const ratingColor = (r: number) =>
    r >= 7.5 ? "var(--green)" : r >= 6.5 ? "var(--text)" : r > 0 ? "var(--red)" : "var(--muted)";

  return (
    <div className="flex-1 overflow-auto" style={{ background: "var(--main-bg)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* ── TWO-COLUMN LAYOUT ─────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 20, alignItems: "start" }}
          className="profile-grid">

          {/* ── LEFT COLUMN ─────────────────────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* IDENTITY CARD */}
            <Card style={fade(0)}>
              <div style={{ padding: "20px 20px 16px" }}>
                {/* Avatar + name */}
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: 8, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "var(--surface)", border: "2px solid var(--accent)",
                  }}>
                    <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: "var(--accent)", lineHeight: 1 }}>
                      {eaProfile.gamertag[0].toUpperCase()}
                    </span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: "var(--text)", letterSpacing: 1, lineHeight: 1.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {eaProfile.gamertag}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {eaProfile.clubName} · {eaProfile.platform}
                    </div>
                  </div>
                </div>

                {/* Division badge */}
                {division && (
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "8px 12px", borderRadius: 6, marginBottom: 14,
                    background: division.color + "15", border: `1px solid ${division.color}44`,
                  }}>
                    <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: division.color, letterSpacing: 1 }}>
                      {division.div}
                    </span>
                    {srNum && <span style={{ fontSize: 12, color: "var(--muted)" }}>{srNum} SR</span>}
                  </div>
                )}

                {/* W/D/L bar */}
                {agg && agg.games > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", gap: 2 }}>
                      <div style={{ flex: agg.wins,   background: "var(--green)", borderRadius: 3 }} />
                      <div style={{ flex: agg.draws,  background: "var(--gold)",  borderRadius: 3 }} />
                      <div style={{ flex: agg.losses, background: "var(--red)",   borderRadius: 3 }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11 }}>
                      <span style={{ color: "var(--green)" }}>{agg.wins} V</span>
                      <span style={{ color: "var(--muted)", fontSize: 10 }}>{agg.games} matchs · {agg.winRate}% victoires</span>
                      <span style={{ color: "var(--red)" }}>{agg.losses} D</span>
                    </div>
                  </div>
                )}

                {/* Forme pills */}
                {forme.length > 0 && (
                  <div>
                    <SectionLabel>Forme récente</SectionLabel>
                    <div style={{ display: "flex", gap: 4 }}>
                      {forme.map((r, i) => (
                        <div key={i} style={{
                          width: 24, height: 24, borderRadius: 4,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 10, fontWeight: 700,
                          background: r === "W" ? "rgba(35,165,89,0.2)" : r === "L" ? "rgba(218,55,60,0.2)" : "rgba(245,158,11,0.15)",
                          color: r === "W" ? "var(--green)" : r === "L" ? "var(--red)" : "var(--gold)",
                        }}>
                          {r === "W" ? "V" : r === "L" ? "D" : "N"}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>

            {/* KEY STATS */}
            {agg && (
              <Card style={fade(60)}>
                <div style={{ padding: "16px 20px" }}>
                  <SectionLabel>Stats clés</SectionLabel>

                  {/* Big rating */}
                  {agg.avgRating > 0 && (
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "10px 14px", borderRadius: 6, marginBottom: 12,
                      background: "var(--surface)",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Star size={14} style={{ color: "var(--gold)" }} />
                        <span style={{ fontSize: 12, color: "var(--muted)" }}>Note moyenne</span>
                      </div>
                      <span style={{
                        fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, lineHeight: 1,
                        color: ratingColor(agg.avgRating),
                      }}>
                        {agg.avgRating.toFixed(2)}
                      </span>
                    </div>
                  )}

                  {/* Stats grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {[
                      { label: "Buts",      value: agg.totalGoals,               color: "var(--green)"  },
                      { label: "Passes D.", value: agg.totalAssists,             color: "var(--accent)" },
                      { label: "MOTM",      value: agg.totalMotm,                color: "var(--gold)"   },
                      { label: "Matchs",    value: agg.games,                    color: "var(--text)"   },
                    ].map(({ label, value, color }) => (
                      <div key={label} style={{ padding: "10px 12px", borderRadius: 6, background: "var(--surface)", textAlign: "center" }}>
                        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, lineHeight: 1, color }}>{value}</div>
                        <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            )}

            {/* LAST SESSIONS */}
            <Card style={fade(90)}>
              <div style={{ padding: "16px 20px" }}>
                <SectionLabel>Dernières sessions</SectionLabel>
                {lastSessions.length === 0 ? (
                  <NoData label="Aucune session trouvée" />
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {lastSessions.map((s: Session) => {
                      let w = 0;
                      for (const m of s.matches) {
                        const c = m.clubs[s.clubId] as Record<string, unknown> | undefined;
                        if (c?.["wins"] === "1") w++;
                      }
                      const total = s.matches.length;
                      const wr = total > 0 ? Math.round((w / total) * 100) : 0;
                      const wrColor = wr >= 60 ? "var(--green)" : wr >= 40 ? "var(--gold)" : "var(--red)";
                      const dateStr = new Date(s.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
                      return (
                        <div key={s.id} style={{
                          display: "flex", alignItems: "center", gap: 10,
                          padding: "8px 12px", borderRadius: 6, background: "var(--surface)",
                        }}>
                          <div style={{ fontSize: 10, color: "var(--muted)", flexShrink: 0, width: 36 }}>{dateStr}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.clubName}</div>
                            <div style={{ fontSize: 10, color: "var(--muted)" }}>{total} matchs</div>
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: wrColor, flexShrink: 0 }}>{wr}%</div>
                          <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                            {[...s.matches].slice(-5).map((m, i) => {
                              const c = m.clubs[s.clubId] as Record<string, unknown> | undefined;
                              const r = c?.["wins"] === "1" ? "W" : c?.["losses"] === "1" ? "L" : "D";
                              return (
                                <div key={i} style={{
                                  width: 4, height: 18, borderRadius: 2,
                                  background: r === "W" ? "var(--green)" : r === "L" ? "var(--red)" : "var(--gold)",
                                  opacity: 0.8,
                                }} />
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* ── RIGHT COLUMN ────────────────────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* RADAR */}
            <Card style={fade(60)}>
              <div style={{ padding: "16px 20px" }}>
                <SectionLabel>Profil de performance</SectionLabel>
                {radarData ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <RadarChart data={radarData} outerRadius={90} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
                      <PolarGrid stroke="var(--border)" />
                      <PolarAngleAxis dataKey="axis" tick={{ fill: "var(--muted)", fontSize: 12 }} />
                      <Radar dataKey="value" stroke="var(--accent)" strokeWidth={2}
                        fill="var(--accent)" fillOpacity={0.15}
                        dot={{ fill: "var(--accent)", r: 4 }} />
                    </RadarChart>
                  </ResponsiveContainer>
                ) : (
                  <NoData label="Pas assez de données" />
                )}
              </div>
            </Card>

            {/* RATING EVOLUTION */}
            <Card style={fade(90)}>
              <div style={{ padding: "16px 20px" }}>
                <SectionLabel>Évolution de la note · {ratingData.length} matchs</SectionLabel>
                {ratingData.length >= 3 ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={ratingData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="idx" tick={{ fontSize: 10, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
                      <YAxis domain={[5, 10]} tick={{ fontSize: 10, fill: "var(--muted)" }} width={28} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Line type="monotone" dataKey="rating" stroke="var(--accent)" strokeWidth={2}
                        dot={({ cx, cy, payload }: { cx: number; cy: number; payload: { result: string } }) => (
                          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={3}
                            fill={payload.result === "W" ? "var(--green)" : payload.result === "L" ? "var(--red)" : "var(--gold)"}
                            stroke="none"
                          />
                        )}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <NoData label="Joue plus de matchs pour voir l'évolution" />
                )}
              </div>
            </Card>

            {/* GOALS & ASSISTS */}
            <Card style={fade(120)}>
              <div style={{ padding: "16px 20px" }}>
                <SectionLabel>Buts & passes D. par tranche de 5</SectionLabel>
                {batchData.length >= 2 ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={batchData} barSize={14} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="label" tick={{ fontSize: 9, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "var(--muted)" }} width={24} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Bar dataKey="goals" fill="var(--green)" name="Buts" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="assists" fill="var(--accent)" name="PD" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <NoData label="Pas assez de données" />
                )}
              </div>
            </Card>
          </div>
        </div>

        {/* ── RECENT PERFORMANCES TABLE ──────────────────────────────────── */}
        {allPlayerMatches.length > 0 && (
          <Card style={fade(150)}>
            <div style={{ padding: "16px 20px" }}>
              <SectionLabel>Dernières performances · {Math.min(allPlayerMatches.length, 25)} matchs</SectionLabel>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      {["Date", "Résultat", "Buts", "PD", "Note", "MOTM", "Poste"].map((h) => (
                        <th key={h} style={{ padding: "6px 10px", textAlign: "center", fontSize: 9, color: "var(--muted)", fontWeight: 400, textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {allPlayerMatches.slice(0, 25).map((m: PerMatchStat) => {
                      const ts = Number(m.date) ? new Date(Number(m.date) * 1000) : new Date(m.date);
                      const dateStr = ts.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
                      const resColor = m.result === "W" ? "var(--green)" : m.result === "L" ? "var(--red)" : "var(--gold)";
                      const resLabel = m.result === "W" ? "V" : m.result === "L" ? "D" : "N";
                      return (
                        <tr key={m.matchId} className="player-row" style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "7px 10px", color: "var(--muted)", fontSize: 11, textAlign: "center" }}>{dateStr}</td>
                          <td style={{ padding: "7px 10px", textAlign: "center" }}>
                            <span style={{
                              display: "inline-flex", alignItems: "center", justifyContent: "center",
                              width: 22, height: 22, borderRadius: 4, fontWeight: 700, fontSize: 10,
                              background: resColor + "22", color: resColor,
                            }}>
                              {resLabel}
                            </span>
                          </td>
                          <td style={{ padding: "7px 10px", textAlign: "center", fontWeight: 700, color: m.goals > 0 ? "var(--green)" : "var(--muted)" }}>
                            {m.goals}
                          </td>
                          <td style={{ padding: "7px 10px", textAlign: "center", fontWeight: 700, color: m.assists > 0 ? "var(--accent)" : "var(--muted)" }}>
                            {m.assists}
                          </td>
                          <td style={{ padding: "7px 10px", textAlign: "center", fontWeight: m.rating >= 7.5 ? 700 : 400, color: ratingColor(m.rating) }}>
                            {m.rating > 0 ? m.rating.toFixed(1) : "—"}
                          </td>
                          <td style={{ padding: "7px 10px", textAlign: "center" }}>
                            {m.motm && <Trophy size={12} style={{ display: "inline", color: "var(--gold)" }} />}
                          </td>
                          <td style={{ padding: "7px 10px", textAlign: "center", color: "var(--muted)", fontSize: 11 }}>{m.position || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
        )}

        {/* EMPTY STATE */}
        {allPlayerMatches.length === 0 && (
          <Card style={{ padding: 40, textAlign: "center", ...fade(150) }}>
            <Swords size={28} style={{ margin: "0 auto 12px", color: "var(--border)" }} />
            <p style={{ fontSize: 13, color: "var(--muted)" }}>
              Aucune donnée de match pour{" "}
              <strong style={{ color: "var(--accent)" }}>{eaProfile.gamertag}</strong>
            </p>
            <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
              Charge ton club via "Charger mon club" dans les paramètres du profil.
            </p>
          </Card>
        )}

        {/* PUBLIC PLAYER CARD */}
        <Card style={{ overflow: "hidden", ...fade(180) }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
            <Zap size={12} style={{ color: "var(--accent)" }} />
            <span className="category-header" style={{ marginBottom: 0 }}>Carte Joueur Publique</span>
            <span style={{ fontSize: 9, background: "var(--surface)", color: "var(--accent)", border: "1px solid var(--border)", borderRadius: 3, padding: "1px 5px" }}>NOUVEAU</span>
          </div>
          <div style={{ padding: 20 }}>
            <PublicProfileSection />
          </div>
        </Card>

        {/* DISCORD DEBUG CONSOLE */}
        <div style={fade(200)}>
          <DebugConsole />
        </div>

        {/* EXPORT LOGS */}
        <Card style={{ padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", ...fade(210) }}>
          <div>
            <div className="category-header" style={{ marginBottom: 2 }}>Logs système</div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>Télécharge les logs de diagnostic pour le support.</div>
          </div>
          <button
            onClick={() => logger.downloadLogs()}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer", color: "var(--accent)", fontSize: 11 }}
          >
            <FileText size={12} /> Exporter les logs
          </button>
        </Card>

      </div>
    </div>
  );
}
