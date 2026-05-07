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
      className={`rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur-sm ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

function CardTitle({ icon: Icon, label, accent = "text-slate-400" }: {
  icon: React.ElementType; label: string; accent?: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon size={13} className={accent} />
      <span className="text-[10px] tracking-[0.12em] font-semibold text-slate-500 uppercase">{label}</span>
    </div>
  );
}

function NoData({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-2">
      <Activity size={26} className="text-slate-700" />
      <span className="text-xs text-slate-600">{label}</span>
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
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Terminal size={13} className="text-cyan-400" />
          <span className="text-[10px] tracking-[0.12em] font-semibold text-slate-400 uppercase">
            Discord Debug Console
          </span>
          {logs.length > 0 && (
            <span className="text-[10px] bg-slate-800 text-slate-400 rounded px-1.5 py-0.5">
              {logs.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {logs.some((l) => l.error || (l.status && l.status >= 400)) && (
            <span className="text-[10px] text-red-400 font-medium">erreurs détectées</span>
          )}
          {open ? <ChevronUp size={13} className="text-slate-500" /> : <ChevronDown size={13} className="text-slate-500" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-800/60">
          {/* Explanation banner */}
          <div className="px-4 py-2 bg-slate-950/60 border-b border-slate-800/40 text-[10px] text-slate-500">
            Intercepte chaque appel Discord · URL · payload · statut HTTP · erreur exacte.
            Si tu vois <span className="text-red-400">403</span> = webhook invalide/expiré.
            <span className="text-yellow-400"> CORS</span> n'affecte pas Tauri (utilise{" "}
            <code className="text-cyan-400">@tauri-apps/plugin-http</code>, pas le navigateur).
          </div>

          {logs.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-slate-600 font-mono">
              Aucun appel Discord intercepté pour l'instant…
            </div>
          ) : (
            <div className="bg-black/80 max-h-64 overflow-y-auto font-mono text-[11px]">
              {logs.map((log) => (
                <div key={log.id} className="border-b border-slate-900 px-3 py-2 space-y-1">
                  <div className="flex items-center gap-2">
                    {statusIcon(log.status, log.error)}
                    <span className="text-slate-600 text-[10px]">{log.ts.slice(11, 19)}</span>
                    <span className={`font-bold ${statusColor(log.status, log.error)}`}>
                      {log.status ?? "—"}
                    </span>
                    <span className="text-slate-400 truncate">{log.url.slice(0, 60)}{log.url.length > 60 ? "…" : ""}</span>
                  </div>
                  {log.error && (
                    <div className="text-red-400 pl-4 text-[10px] leading-relaxed">{log.error}</div>
                  )}
                  <details className="pl-4">
                    <summary className="text-slate-600 cursor-pointer hover:text-slate-400 text-[10px]">payload</summary>
                    <pre className="text-green-400 text-[9px] whitespace-pre-wrap break-all mt-1 max-h-32 overflow-y-auto">
                      {log.payload}
                    </pre>
                  </details>
                </div>
              ))}
              <div ref={endRef} />
            </div>
          )}

          <div className="px-4 py-2 border-t border-slate-800/40 flex justify-between items-center">
            <button
              onClick={() => logger.downloadLogs()}
              className="flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-cyan-400 transition-colors"
            >
              <FileText size={11} /> Télécharger tous les logs
            </button>
            <button
              onClick={() => { _discordLogs.splice(0); _listeners.forEach((fn) => fn()); }}
              className="flex items-center gap-1.5 text-[10px] text-slate-600 hover:text-red-400 transition-colors"
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
          <Swords size={36} className="mx-auto text-slate-700" />
          <p className="text-sm text-slate-500">Lie un profil EA pour voir tes statistiques personnelles.</p>
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
                  className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 border-2 border-cyan-500/30"
                  style={{ background: "linear-gradient(135deg, #0e7490 0%, #164e63 100%)" }}
                >
                  <span className="font-['Bebas_Neue'] text-3xl text-white">
                    {eaProfile.gamertag[0].toUpperCase()}
                  </span>
                </div>
                {/* Name + club */}
                <div className="flex-1 min-w-0">
                  <div className="font-['Bebas_Neue'] text-2xl text-white tracking-wide leading-none truncate">
                    {eaProfile.gamertag}
                  </div>
                  <div className="text-xs text-slate-400 mt-1 truncate">
                    {eaProfile.clubName} · <span className="text-slate-500">{eaProfile.platform}</span>
                  </div>
                  {agg && (
                    <div className="text-xs text-cyan-400 mt-1">{agg.games} matchs</div>
                  )}
                </div>
                {/* Division badge */}
                {division ? (
                  <div
                    className="shrink-0 px-3 py-2 rounded-xl text-center border"
                    style={{ background: division.color + "1a", borderColor: division.color + "44" }}
                  >
                    <div className="font-['Bebas_Neue'] text-xl" style={{ color: division.color }}>
                      {division.div}
                    </div>
                    {srNum && <div className="text-[10px] text-slate-500 mt-0.5">{srNum} SR</div>}
                  </div>
                ) : null}
              </div>

              {/* W/D/L bar */}
              {agg && agg.games > 0 && (
                <div>
                  <div className="flex h-2 rounded-full overflow-hidden gap-0.5">
                    <div style={{ width: `${(agg.wins / agg.games) * 100}%` }} className="bg-emerald-500 rounded-l-full" />
                    <div style={{ width: `${(agg.draws / agg.games) * 100}%` }} className="bg-amber-400" />
                    <div style={{ width: `${(agg.losses / agg.games) * 100}%` }} className="bg-red-500 rounded-r-full" />
                  </div>
                  <div className="flex justify-between mt-1.5 text-[10px]">
                    <span className="text-emerald-400">{agg.wins} V</span>
                    <span className="text-amber-400">{agg.draws} N</span>
                    <span className="text-red-400">{agg.losses} D</span>
                  </div>
                </div>
              )}

              {/* Forme pills */}
              {forme.length > 0 && (
                <div>
                  <div className="text-[10px] text-slate-600 uppercase tracking-widest mb-1.5">Forme récente</div>
                  <div className="flex gap-1">
                    {forme.map((r, i) => (
                      <div
                        key={i}
                        className={`w-6 h-6 rounded text-[10px] font-bold flex items-center justify-center ${
                          r === "W" ? "bg-emerald-500/20 text-emerald-400" :
                          r === "L" ? "bg-red-500/20 text-red-400" :
                          "bg-amber-500/20 text-amber-400"
                        }`}
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
                <CardTitle icon={Target} label="Stats clés" accent="text-cyan-400" />
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Note", value: agg.avgRating > 0 ? agg.avgRating.toFixed(2) : "—", color: "text-white" },
                    { label: "Buts", value: agg.totalGoals, color: "text-emerald-400" },
                    { label: "PD", value: agg.totalAssists, color: "text-cyan-400" },
                    { label: "MOTM", value: agg.totalMotm, color: "text-amber-400" },
                    { label: "Victoires", value: `${agg.winRate}%`,
                      color: agg.winRate >= 60 ? "text-emerald-400" : agg.winRate >= 45 ? "text-amber-400" : "text-red-400" },
                    { label: "Matchs", value: agg.games, color: "text-slate-300" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-slate-800/40 rounded-xl p-2.5 text-center">
                      <div className={`font-['Bebas_Neue'] text-2xl leading-none ${color}`}>{value}</div>
                      <div className="text-[9px] text-slate-600 uppercase tracking-widest mt-1">{label}</div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {/* DERNIÈRES SESSIONS — 1 col */}
          <div {...tile(90)}>
            <Card className="h-full p-4">
              <CardTitle icon={Swords} label="Dernières sessions" accent="text-violet-400" />
              {lastSessions.length === 0 ? (
                <NoData label="Aucune session trouvée" />
              ) : (
                <div className="space-y-2">
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
                      <div key={s.id} className="flex items-center gap-3 bg-slate-800/30 rounded-xl px-3 py-2">
                        <div className="text-[10px] text-slate-500 shrink-0 w-12">{dateStr}</div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-slate-300 truncate">{s.clubName}</div>
                          <div className="text-[10px] text-slate-600">{total} matchs</div>
                        </div>
                        <div className={`text-[11px] font-bold ${
                          wr >= 60 ? "text-emerald-400" : wr >= 40 ? "text-amber-400" : "text-red-400"
                        }`}>{wr}%</div>
                        <div className="flex gap-0.5">
                          {[...s.matches].slice(-5).map((m, i) => {
                            const c = m.clubs[s.clubId] as Record<string, unknown> | undefined;
                            const r = c?.["wins"] === "1" ? "W" : c?.["losses"] === "1" ? "L" : "D";
                            return (
                              <div key={i} className={`w-2 h-4 rounded-sm ${
                                r === "W" ? "bg-emerald-500/70" : r === "L" ? "bg-red-500/70" : "bg-amber-400/70"
                              }`} />
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
              <CardTitle icon={Activity} label="Profil de performance" accent="text-cyan-400" />
              {radarData ? (
                <ResponsiveContainer width="100%" height={200}>
                  <RadarChart data={radarData} outerRadius={78}>
                    <defs>
                      <linearGradient id="profileRadarFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <PolarGrid stroke="#1e293b" />
                    <PolarAngleAxis dataKey="axis" tick={{ fill: "#64748b", fontSize: 11 }} />
                    <Radar dataKey="value" stroke="#22d3ee" strokeWidth={2}
                      fill="url(#profileRadarFill)" dot={{ fill: "#22d3ee", r: 3 }} />
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
              <CardTitle icon={TrendingUp} label={`Évolution de la note · ${ratingData.length} matchs`} accent="text-emerald-400" />
              {ratingData.length >= 3 ? (
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={ratingData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="idx" tick={{ fontSize: 10, fill: "#475569" }} />
                    <YAxis domain={[5, 10]} tick={{ fontSize: 10, fill: "#475569" }} width={28} />
                    <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 11 }} />
                    <Line type="monotone" dataKey="rating" stroke="#22d3ee" strokeWidth={2}
                      dot={({ cx, cy, payload }: { cx: number; cy: number; payload: { result: string } }) => (
                        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={3}
                          fill={payload.result === "W" ? "#22c55e" : payload.result === "L" ? "#ef4444" : "#f59e0b"}
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
              <CardTitle icon={Star} label="Buts & passes D. par tranche de 5" accent="text-amber-400" />
              {batchData.length >= 2 ? (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={batchData} barSize={12}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#475569" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#475569" }} width={24} />
                    <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 11 }} />
                    <Bar dataKey="goals" fill="#22c55e" name="Buts" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="assists" fill="#22d3ee" name="PD" radius={[3, 3, 0, 0]} />
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
              <CardTitle icon={Shield} label={`Dernières performances · ${Math.min(allPlayerMatches.length, 25)} matchs`} accent="text-slate-400" />
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-800/60">
                      {["Date", "Résultat", "Buts", "PD", "Note", "MOTM", "Poste"].map((h) => (
                        <th key={h} className="px-2 py-1.5 text-center text-[10px] text-slate-600 font-['Bebas_Neue'] tracking-widest font-normal">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {allPlayerMatches.slice(0, 25).map((m: PerMatchStat) => {
                      const ts = Number(m.date) ? new Date(Number(m.date) * 1000) : new Date(m.date);
                      const dateStr = ts.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
                      const resColor = m.result === "W" ? "text-emerald-400 bg-emerald-500/10" :
                        m.result === "L" ? "text-red-400 bg-red-500/10" : "text-amber-400 bg-amber-400/10";
                      const resLabel = m.result === "W" ? "V" : m.result === "L" ? "D" : "N";
                      return (
                        <tr key={m.matchId} className="border-b border-slate-800/30 hover:bg-slate-800/20 transition-colors">
                          <td className="px-2 py-1.5 text-center text-slate-500 text-[11px]">{dateStr}</td>
                          <td className="px-2 py-1.5 text-center">
                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded font-bold text-[10px] ${resColor}`}>
                              {resLabel}
                            </span>
                          </td>
                          <td className={`px-2 py-1.5 text-center font-bold ${m.goals > 0 ? "text-emerald-400" : "text-slate-600"}`}>
                            {m.goals}
                          </td>
                          <td className={`px-2 py-1.5 text-center font-bold ${m.assists > 0 ? "text-cyan-400" : "text-slate-600"}`}>
                            {m.assists}
                          </td>
                          <td className={`px-2 py-1.5 text-center ${
                            m.rating >= 7.5 ? "text-emerald-400" : m.rating >= 6.5 ? "text-white" :
                            m.rating > 0 ? "text-red-400" : "text-slate-600"
                          }`}>
                            {m.rating > 0 ? m.rating.toFixed(1) : "—"}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            {m.motm && <Trophy size={12} className="inline text-amber-400" />}
                          </td>
                          <td className="px-2 py-1.5 text-center text-slate-500 text-[11px]">{m.position || "—"}</td>
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
            <Swords size={32} className="mx-auto text-slate-700" />
            <p className="text-sm text-slate-500">
              Aucune donnée de match pour{" "}
              <strong className="text-cyan-400">{eaProfile.gamertag}</strong>
            </p>
            <p className="text-xs text-slate-600">
              Charge ton club via "Charger mon club" dans les paramètres du profil.
            </p>
          </Card>
        )}

        {/* ── PUBLIC PLAYER CARD ─────────────────────────────────────────── */}
        <Card className="overflow-hidden" style={tile(240).style}>
          <div className="px-5 py-4 border-b border-slate-800/60 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Zap size={13} className="text-cyan-400" />
                <span className="text-[10px] tracking-[0.12em] font-semibold text-slate-400 uppercase">
                  Carte Joueur Publique
                </span>
                <span className="text-[9px] bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded px-1.5 py-0.5">
                  NOUVEAU
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
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
            <div className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Logs système</div>
            <div className="text-xs text-slate-600 mt-0.5">Télécharge les logs de diagnostic pour le support.</div>
          </div>
          <button
            onClick={() => logger.downloadLogs()}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30
              text-cyan-400 text-xs hover:bg-cyan-500/20 transition-colors font-['Bebas_Neue'] tracking-wider"
          >
            <FileText size={13} /> Exporter les logs
          </button>
        </Card>

      </div>
    </div>
  );
}
