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

// ── Bento Card ────────────────────────────────────────────────────────────────
function Card({
  children, className = "", style,
}: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`rounded-lg border ${className}`}
      style={{ background: "var(--card)", borderColor: "var(--border)", ...style }}
    >
      {children}
    </div>
  );
}

function CardTitle({ icon: Icon, label, color }: {
  icon: React.ElementType; label: string; color?: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon size={12} style={{ color: color ?? "var(--accent)" }} />
      <span className="category-header" style={{ marginBottom: 0 }}>{label}</span>
    </div>
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

// ── Debug console ─────────────────────────────────────────────────────────────
function DebugConsole() {
  const logs = useDiscordLogs();
  const [open, setOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, open]);

  const statusColor = (status: number | null, error: string | null) => {
    if (error) return "text-red-400";
    if (status && status >= 200 && status < 300) return "text-emerald-400";
    if (status && status >= 400) return "text-red-400";
    return "text-yellow-400";
  };

  const statusIcon = (status: number | null, error: string | null) => {
    if (error || (status && status >= 400)) return <AlertCircle size={11} className="text-red-400 shrink-0" />;
    if (status && status >= 200 && status < 300) return <CheckCircle2 size={11} className="text-emerald-400 shrink-0" />;
    return <Clock size={11} className="text-yellow-400 shrink-0" />;
  };

  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 transition-colors"
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
          <div className="px-4 py-2" style={{ background: "var(--guild-bar)", borderBottom: "1px solid var(--border)", fontSize: 10, color: "var(--muted)" }}>
            Intercepte chaque appel Discord · URL · payload · statut HTTP · erreur exacte.
            Si tu vois <span style={{ color: "var(--red)" }}>403</span> = webhook invalide/expiré.
            {" "}<span style={{ color: "var(--gold)" }}>CORS</span> n'affecte pas Tauri (utilise{" "}
            <code style={{ color: "var(--accent)" }}>@tauri-apps/plugin-http</code>, pas le navigateur).
          </div>

          {logs.length === 0 ? (
            <div className="px-4 py-6 text-center font-mono" style={{ fontSize: 11, color: "var(--muted)", background: "var(--guild-bar)" }}>
              Aucun appel Discord intercepté pour l'instant…
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto font-mono" style={{ background: "var(--guild-bar)", fontSize: 11 }}>
              {logs.map((log) => (
                <div key={log.id} className="px-3 py-2 space-y-1" style={{ borderBottom: "1px solid var(--border)" }}>
                  <div className="flex items-center gap-2">
                    {statusIcon(log.status, log.error)}
                    <span style={{ fontSize: 10, color: "var(--muted)" }}>{log.ts.slice(11, 19)}</span>
                    <span className={`font-bold ${statusColor(log.status, log.error)}`}>
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

          <div className="px-4 py-2 flex justify-between items-center" style={{ borderTop: "1px solid var(--border)" }}>
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

  // staggered animation counter
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
      { axis: "Buts/match",    value: norm(agg.totalGoals   / agg.games, 1.5) },
      { axis: "PD/match",      value: norm(agg.totalAssists / agg.games, 1.5) },
      { axis: "Note",          value: norm(agg.avgRating,                 10)  },
      { axis: "Victoires",     value: agg.winRate                              },
      { axis: "MOTM%",         value: norm(agg.totalMotm    / agg.games, 0.3)  },
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

  // ── Division ───────────────────────────────────────────────────────────
  const srNum = currentClub?.id === eaProfile?.clubId && currentClub?.skillRating
    ? Number(currentClub.skillRating) || null : null;
  const division = srNum ? getDivision(srNum) : null;

  // ── Forme (last 10) ────────────────────────────────────────────────────
  const forme = allPlayerMatches.slice(0, 10).reverse().map((m) => m.result);

  // ── Stagger helper ─────────────────────────────────────────────────────
  const tile = useCallback((delay: number) => ({
    style: {
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0)" : "translateY(12px)",
      transition: `opacity 0.4s ease ${delay}ms, transform 0.4s ease ${delay}ms`,
    },
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

  return (
    <div className="flex-1 overflow-auto px-4 py-5">
      <div className="max-w-5xl mx-auto space-y-4">

        {/* ── BENTO GRID ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 auto-rows-auto">

          {/* IDENTITY — 2 cols × 2 rows */}
          <div className="sm:col-span-2 xl:row-span-2" {...tile(0)}>
            <Card className="h-full p-5 flex flex-col gap-4">
              <div className="flex items-start gap-4">
                {/* Avatar */}
                <div
                  className="w-16 h-16 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: "var(--surface)", border: "2px solid var(--accent)", opacity: 0.9 }}
                >
                  <span className="font-['Bebas_Neue'] text-3xl" style={{ color: "var(--accent)" }}>
                    {eaProfile.gamertag[0].toUpperCase()}
                  </span>
                </div>
                {/* Name + club */}
                <div className="flex-1 min-w-0">
                  <div className="font-['Bebas_Neue'] text-2xl tracking-wide leading-none truncate" style={{ color: "var(--text)" }}>
                    {eaProfile.gamertag}
                  </div>
                  <div className="mt-1 truncate" style={{ fontSize: 12, color: "var(--muted)" }}>
                    {eaProfile.clubName} · {eaProfile.platform}
                  </div>
                  {agg && (
                    <div style={{ fontSize: 11, color: "var(--accent)", marginTop: 2 }}>{agg.games} matchs</div>
                  )}
                </div>
                {/* Division badge */}
                {division ? (
                  <div
                    className="shrink-0 px-3 py-2 rounded text-center"
                    style={{ background: division.color + "1a", border: `1px solid ${division.color}55` }}
                  >
                    <div className="font-['Bebas_Neue'] text-xl" style={{ color: division.color }}>
                      {division.div}
                    </div>
                    {srNum && <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>{srNum} SR</div>}
                  </div>
                ) : null}
              </div>

              {/* W/D/L bar */}
              {agg && agg.games > 0 && (
                <div>
                  <div className="flex h-1.5 rounded overflow-hidden gap-px">
                    <div style={{ width: `${(agg.wins / agg.games) * 100}%`, background: "var(--green)" }} />
                    <div style={{ width: `${(agg.draws / agg.games) * 100}%`, background: "var(--gold)" }} />
                    <div style={{ width: `${(agg.losses / agg.games) * 100}%`, background: "var(--red)" }} />
                  </div>
                  <div className="flex justify-between mt-1.5" style={{ fontSize: 10 }}>
                    <span style={{ color: "var(--green)" }}>{agg.wins} V</span>
                    <span style={{ color: "var(--gold)" }}>{agg.draws} N</span>
                    <span style={{ color: "var(--red)" }}>{agg.losses} D</span>
                  </div>
                </div>
              )}

              {/* Forme pills */}
              {forme.length > 0 && (
                <div>
                  <div className="category-header" style={{ marginBottom: 6 }}>Forme récente</div>
                  <div className="flex gap-1">
                    {forme.map((r, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-center rounded"
                        style={{
                          width: 22, height: 22, fontSize: 10, fontWeight: 700,
                          background: r === "W" ? "rgba(35,165,89,0.2)" : r === "L" ? "rgba(218,55,60,0.2)" : "rgba(245,158,11,0.2)",
                          color: r === "W" ? "var(--green)" : r === "L" ? "var(--red)" : "var(--gold)",
                        }}
                      >
                        {r === "W" ? "V" : r === "L" ? "D" : "N"}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* MAIN STATS — 1 col */}
          {agg && (
            <div {...tile(60)}>
              <Card className="h-full p-4">
                <CardTitle icon={Target} label="Stats clés" />
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { label: "Note",     value: agg.avgRating > 0 ? agg.avgRating.toFixed(2) : "—", color: "var(--text)" },
                    { label: "Buts",     value: agg.totalGoals,   color: "var(--green)" },
                    { label: "PD",       value: agg.totalAssists, color: "var(--accent)" },
                    { label: "MOTM",     value: agg.totalMotm,    color: "var(--gold)" },
                    { label: "Victoires",value: `${agg.winRate}%`,
                      color: agg.winRate >= 60 ? "var(--green)" : agg.winRate >= 45 ? "var(--gold)" : "var(--red)" },
                    { label: "Matchs",   value: agg.games,        color: "var(--muted)" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="rounded text-center p-2" style={{ background: "var(--surface)" }}>
                      <div className="font-['Bebas_Neue'] text-2xl leading-none" style={{ color }}>{value}</div>
                      <div className="category-header" style={{ marginBottom: 0, marginTop: 3 }}>{label}</div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {/* DERNIÈRES SESSIONS — 1 col */}
          <div {...tile(90)}>
            <Card className="h-full p-4">
              <CardTitle icon={Swords} label="Dernières sessions" color="var(--accent)" />
              {lastSessions.length === 0 ? (
                <NoData label="Aucune session trouvée" />
              ) : (
                <div className="space-y-1.5">
                  {lastSessions.map((s: Session) => {
                    let w = 0;
                    for (const m of s.matches) {
                      const c = m.clubs[s.clubId] as Record<string, unknown> | undefined;
                      if (c?.["wins"] === "1") w++;
                    }
                    const total = s.matches.length;
                    const wr = total > 0 ? Math.round((w / total) * 100) : 0;
                    const dateStr = new Date(s.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
                    return (
                      <div key={s.id} className="flex items-center gap-3 px-3 py-2 rounded" style={{ background: "var(--surface)" }}>
                        <div className="shrink-0 w-10" style={{ fontSize: 10, color: "var(--muted)" }}>{dateStr}</div>
                        <div className="flex-1 min-w-0">
                          <div className="truncate" style={{ fontSize: 12, color: "var(--text)" }}>{s.clubName}</div>
                          <div style={{ fontSize: 10, color: "var(--muted)" }}>{total} matchs</div>
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 700,
                          color: wr >= 60 ? "var(--green)" : wr >= 40 ? "var(--gold)" : "var(--red)" }}>
                          {wr}%
                        </div>
                        <div className="flex gap-0.5">
                          {[...s.matches].slice(-5).map((m, i) => {
                            const c = m.clubs[s.clubId] as Record<string, unknown> | undefined;
                            const r = c?.["wins"] === "1" ? "W" : c?.["losses"] === "1" ? "L" : "D";
                            return (
                              <div key={i} className="rounded-sm" style={{
                                width: 6, height: 16,
                                background: r === "W" ? "var(--green)" : r === "L" ? "var(--red)" : "var(--gold)",
                                opacity: 0.7,
                              }} />
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          {/* RADAR — 2 cols */}
          <div className="sm:col-span-2" {...tile(120)}>
            <Card className="p-4">
              <CardTitle icon={Activity} label="Profil de performance" />
              {radarData ? (
                <ResponsiveContainer width="100%" height={200}>
                  <RadarChart data={radarData} outerRadius={78}>
                    <PolarGrid stroke="#3f4147" />
                    <PolarAngleAxis dataKey="axis" tick={{ fill: "#949ba4", fontSize: 11 }} />
                    <Radar dataKey="value" stroke="var(--accent)" strokeWidth={2}
                      fill="var(--accent)" fillOpacity={0.15} dot={{ fill: "var(--accent)", r: 3 }} />
                  </RadarChart>
                </ResponsiveContainer>
              ) : (
                <NoData label="Pas assez de données" />
              )}
            </Card>
          </div>

          {/* RATING EVOLUTION — 2 cols */}
          <div className="sm:col-span-2" {...tile(150)}>
            <Card className="p-4">
              <CardTitle icon={TrendingUp} label={`Évolution de la note · ${ratingData.length} matchs`} color="var(--green)" />
              {ratingData.length >= 3 ? (
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={ratingData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#3f4147" />
                    <XAxis dataKey="idx" tick={{ fontSize: 10, fill: "#949ba4" }} />
                    <YAxis domain={[5, 10]} tick={{ fontSize: 10, fill: "#949ba4" }} width={28} />
                    <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 11 }} />
                    <Line type="monotone" dataKey="rating" stroke="var(--accent)" strokeWidth={2}
                      dot={({ cx, cy, payload }: { cx: number; cy: number; payload: { result: string } }) => (
                        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={3}
                          fill={payload.result === "W" ? "#23a559" : payload.result === "L" ? "#da373c" : "#f59e0b"}
                          stroke="none"
                        />
                      )}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <NoData label="Joue plus de matchs pour voir l'évolution" />
              )}
            </Card>
          </div>

          {/* BUTS & PD — 2 cols */}
          <div className="sm:col-span-2" {...tile(180)}>
            <Card className="p-4">
              <CardTitle icon={Star} label="Buts & passes D. par tranche de 5" color="var(--gold)" />
              {batchData.length >= 2 ? (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={batchData} barSize={12}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#3f4147" />
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#949ba4" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#949ba4" }} width={24} />
                    <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 11 }} />
                    <Bar dataKey="goals" fill="#23a559" name="Buts" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="assists" fill="var(--accent)" name="PD" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <NoData label="Pas assez de données" />
              )}
            </Card>
          </div>

        </div>

        {/* ── RECENT PERFORMANCES TABLE ──────────────────────────────────── */}
        {allPlayerMatches.length > 0 && (
          <div {...tile(210)}>
            <Card className="p-4">
              <CardTitle icon={Shield} label={`Dernières performances · ${Math.min(allPlayerMatches.length, 25)} matchs`} />
              <div className="overflow-x-auto">
                <table className="w-full" style={{ fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      {["Date", "Résultat", "Buts", "PD", "Note", "MOTM", "Poste"].map((h) => (
                        <th key={h} className="category-header text-center" style={{ padding: "4px 8px", fontWeight: 400, marginBottom: 0 }}>
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
                          <td className="text-center" style={{ padding: "5px 8px", color: "var(--muted)", fontSize: 11 }}>{dateStr}</td>
                          <td className="text-center" style={{ padding: "5px 8px" }}>
                            <span className="inline-flex items-center justify-center rounded" style={{
                              width: 22, height: 22, fontWeight: 700, fontSize: 10,
                              background: resColor + "22", color: resColor,
                            }}>
                              {resLabel}
                            </span>
                          </td>
                          <td className="text-center font-bold" style={{ padding: "5px 8px", color: m.goals > 0 ? "var(--green)" : "var(--muted)" }}>
                            {m.goals}
                          </td>
                          <td className="text-center font-bold" style={{ padding: "5px 8px", color: m.assists > 0 ? "var(--accent)" : "var(--muted)" }}>
                            {m.assists}
                          </td>
                          <td className="text-center" style={{ padding: "5px 8px",
                            color: m.rating >= 7.5 ? "var(--green)" : m.rating >= 6.5 ? "var(--text)" : m.rating > 0 ? "var(--red)" : "var(--muted)" }}>
                            {m.rating > 0 ? m.rating.toFixed(1) : "—"}
                          </td>
                          <td className="text-center" style={{ padding: "5px 8px" }}>
                            {m.motm && <Trophy size={12} style={{ display: "inline", color: "var(--gold)" }} />}
                          </td>
                          <td className="text-center" style={{ padding: "5px 8px", color: "var(--muted)", fontSize: 11 }}>{m.position || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* ── EMPTY STATE ────────────────────────────────────────────────── */}
        {allPlayerMatches.length === 0 && (
          <Card className="p-10 text-center space-y-3">
            <Swords size={28} style={{ margin: "0 auto", color: "var(--border)" }} />
            <p style={{ fontSize: 13, color: "var(--muted)" }}>
              Aucune donnée de match pour{" "}
              <strong style={{ color: "var(--accent)" }}>{eaProfile.gamertag}</strong>
            </p>
            <p style={{ fontSize: 11, color: "var(--muted)" }}>
              Charge ton club via "Charger mon club" dans les paramètres du profil.
            </p>
          </Card>
        )}

        {/* ── PUBLIC PLAYER CARD ─────────────────────────────────────────── */}
        <Card className="overflow-hidden" style={tile(240).style}>
          <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
            <div>
              <div className="flex items-center gap-2">
                <Zap size={12} style={{ color: "var(--accent)" }} />
                <span className="category-header" style={{ marginBottom: 0 }}>Carte Joueur Publique</span>
                <span className="rounded" style={{
                  fontSize: 9, background: "var(--surface)", color: "var(--accent)",
                  border: "1px solid var(--border)", padding: "1px 5px",
                }}>NOUVEAU</span>
              </div>
              <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                Configurez, prévisualisez et exportez pour Discord.
              </p>
            </div>
          </div>
          <div className="p-5">
            <PublicProfileSection />
          </div>
        </Card>

        {/* ── DISCORD DEBUG CONSOLE ──────────────────────────────────────── */}
        <div style={tile(270).style}>
          <DebugConsole />
        </div>

        {/* ── EXPORT LOGS ────────────────────────────────────────────────── */}
        <Card className="px-5 py-3 flex items-center justify-between" style={tile(290).style}>
          <div>
            <div className="category-header" style={{ marginBottom: 2 }}>Logs système</div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>Télécharge les logs de diagnostic pour le support.</div>
          </div>
          <button
            onClick={() => logger.downloadLogs()}
            className="flex items-center gap-2"
            style={{ padding: "5px 10px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer", color: "var(--accent)", fontSize: 11 }}
          >
            <FileText size={12} /> Exporter les logs
          </button>
        </Card>

      </div>
    </div>
  );
}
