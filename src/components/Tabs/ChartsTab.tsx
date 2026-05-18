import { useState, useMemo, useRef, useEffect, Fragment } from "react";
import { Download, TrendingUp, Target, Users, BarChart2, Activity } from "lucide-react";
import {
  PieChart, Pie, Cell, Label, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  AreaChart, Area,
} from "recharts";
import { useAppStore } from "../../store/useAppStore";
import { ExportModal } from "../Modals/ExportModal";
import { GlassCard } from "../UI/GlassCard";
import { getSeasonHistory, getLeaderboard } from "../../api/tauri";
import { useT } from "../../i18n";
import type { Match, Player } from "../../types";
import { avatarColor } from "../Modals/PlayerModal";

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function aggregateMatchPlayers(matches: Match[], clubId: string): Player[] {
  const acc: Record<string, { goals: number; assists: number; passesMade: number }> = {};
  for (const m of matches) {
    const clubPlayers = m.players[clubId] as Record<string, Record<string, string>> | undefined;
    if (!clubPlayers || typeof clubPlayers !== "object") continue;
    for (const [_id, s] of Object.entries(clubPlayers)) {
      const name = s.name || s.playername || s.playerName || _id;
      if (!acc[name]) acc[name] = { goals: 0, assists: 0, passesMade: 0 };
      acc[name].goals      += Number(s.goals)      || 0;
      acc[name].assists    += Number(s.assists)     || 0;
      acc[name].passesMade += Number(s.passesMade) || Number(s.passesmade) || 0;
    }
  }
  return Object.entries(acc).map(([name, s]) => ({
    name, goals: s.goals, assists: s.assists, passesMade: s.passesMade,
    position: "", tacklesMade: 0, motm: 0, rating: 0, gamesPlayed: 0,
  }));
}

type Mode = "last10" | "alltime";

interface SeasonRow { wins: number; losses: number; ties: number; goals: number; goalDiff: number; label: string; sr?: number }
interface LeaderRow { rank: number; name: string; wins: number; losses: number; ties: number; goals: number; sr: string }

/* ─── Shared UI primitives ────────────────────────────────────────────────── */

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <GlassCard className={className} padding="16px">
      {children}
    </GlassCard>
  );
}

/* IDs de gradient SVG uniques pour éviter les conflits de rendu ──────────── */
const GRAD_IDS = {
  radar:  "ct-radar-fill",
  poss:   "ct-poss-area",
  sr:     "ct-sr-area",
  line:   "ct-line-area",
} as const;

/* Tooltip SaaS minimaliste ─────────────────────────────────────────────────── */
const TOOLTIP_STYLE = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  fontSize: 11,
  boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="category-header">{children}</p>;
}

function NoData({ text = "Aucune donnée", icon: Icon = BarChart2 }: { text?: string; icon?: React.ElementType }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-2">
      <Icon size={26} style={{ color: "var(--border)" }} />
      <p style={{ fontSize: 11, color: "var(--muted)", textAlign: "center" }}>{text}</p>
    </div>
  );
}

const TOOLTIP_LABEL = { color: "var(--muted)" };

/* ─── Donut ───────────────────────────────────────────────────────────────── */

function DonutCenter({ viewBox, value, sub }: { viewBox?: { cx: number; cy: number }; value: number | string; sub: string }) {
  const cx = viewBox?.cx ?? 0, cy = viewBox?.cy ?? 0;
  return (
    <g>
      <text x={cx} y={cy - 4} textAnchor="middle" fill="#f1f5f9" fontFamily="'Bebas Neue', sans-serif" fontSize={28} dominantBaseline="auto">{value}</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fill="#949ba4" fontSize={9} dominantBaseline="auto">{sub}</text>
    </g>
  );
}

function DonutChart({ data, centerValue, centerSub }: {
  data: { name: string; value: number; color: string }[];
  centerValue: number | string; centerSub: string;
}) {
  const safe = data.every(d => d.value === 0) ? data.map(d => ({ ...d, value: 1 })) : data;
  return (
    <ResponsiveContainer width="100%" height={160}>
      <PieChart>
        <Pie data={safe} cx="50%" cy="50%" innerRadius={48} outerRadius={70}
          dataKey="value" startAngle={90} endAngle={-270} strokeWidth={2} stroke="var(--border)">
          {safe.map((d, i) => <Cell key={i} fill={d.color} />)}
          <Label content={(props: unknown) => {
            const p = props as { viewBox?: { cx: number; cy: number } };
            return <DonutCenter viewBox={p.viewBox} value={centerValue} sub={centerSub} />;
          }} />
        </Pie>
        <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL}
          formatter={(v: unknown, name: unknown) => [String(v), String(name)]} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function DonutLegend({ data, total }: { data: { name: string; value: number; color: string }[]; total: number }) {
  return (
    <div className="flex justify-center gap-5 mt-1">
      {data.map((d) => {
        const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
        return (
          <div key={d.name} className="flex flex-col items-center gap-0.5">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: d.color }} />
              <span className="font-['Bebas_Neue'] text-base text-white leading-none">{d.value}</span>
            </div>
            <span style={{ fontSize: 9, color: "var(--muted)" }}>{d.name}</span>
            <span className="text-[9px]" style={{ color: d.color }}>{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Horizontal Bar with Avatar ─────────────────────────────────────────── */

const ACCENT: Record<string, { bar: string; text: string }> = {
  cyan:   { bar: "from-cyan-800/60 to-cyan-400",   text: "#22d3ee" },
  orange: { bar: "from-orange-800/60 to-orange-400", text: "#fb923c" },
  purple: { bar: "from-violet-800/60 to-violet-400", text: "#a78bfa" },
};

function HBarChart({ players, valueKey, color }: {
  players: Player[]; valueKey: keyof Player; color: "cyan" | "orange" | "purple";
}) {
  const maxVal = Math.max(...players.map((p) => Number(p[valueKey]) || 0), 1);
  const ac = ACCENT[color];
  if (players.length === 0 || players.every(p => Number(p[valueKey]) === 0)) {
    return <NoData text="Aucun joueur" icon={Users} />;
  }
  return (
    <div className="flex flex-col gap-2.5">
      {players.map((p) => {
        const val = Number(p[valueKey]) || 0;
        const pct = (val / maxVal) * 100;
        const initials = p.name.split(/[\s_-]+/).map(w => w[0]?.toUpperCase() ?? "").join("").slice(0, 2) || "?";
        const bg = avatarColor(p.name);
        return (
          <div key={p.name} className="flex items-center gap-2.5 group">
            {/* Avatar */}
            <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-white font-['Bebas_Neue']"
              style={{ background: bg }}>
              {initials}
            </div>
            {/* Name + bar */}
            <div className="flex-1 min-w-0">
              <div className="text-[10px] truncate mb-1 font-medium" style={{ color: "var(--muted)" }}>{p.name}</div>
              <div className="relative h-5 rounded overflow-hidden" style={{ background: "var(--surface)" }}>
                <div
                  className={`absolute inset-y-0 left-0 bg-gradient-to-r ${ac.bar} rounded-full transition-all duration-500`}
                  style={{ width: `${pct}%`, minWidth: val > 0 ? "1.5rem" : 0 }}
                />
                {val > 0 && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold" style={{ color: ac.text }}>
                    {val}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Radar collectif ─────────────────────────────────────────────────────── */

function TeamRadarSection({ matches, clubId }: { matches: Match[]; clubId: string }) {
  const data = useMemo(() => {
    if (matches.length === 0) return [];
    let totalPoss = 0, totalShots = 0, totalPasses = 0, totalGoals = 0, totalWins = 0, possCount = 0;
    for (const m of matches) {
      const club = m.clubs[clubId] as Record<string, unknown> | undefined;
      if (!club) continue;
      const poss = Number(club["possession"] ?? club["possessionPercentage"] ?? -1);
      if (poss >= 0 && poss <= 100) { totalPoss += poss; possCount++; }
      totalShots  += Number(club["shots"]  ?? club["shotsTotal"]  ?? 0);
      totalPasses += Number(club["passesCompleted"] ?? club["passesMade"] ?? club["passesmade"] ?? 0);
      totalGoals  += Number(club["goals"]  ?? 0);
      if (club["wins"] === "1") totalWins++;
    }
    const n = matches.length;
    const clamp = (v: number, max: number) => Math.min(Math.round((v / max) * 100), 100);
    return [
      { label: "Possession", value: possCount > 0 ? Math.round(totalPoss / possCount) : 50 },
      { label: "Tirs/M",     value: clamp(totalShots  / n, 15) },
      { label: "Passes/M",   value: clamp(totalPasses / n, 200) },
      { label: "Buts/M",     value: clamp(totalGoals  / n, 4) },
      { label: "% Victoires", value: Math.round((totalWins / n) * 100) },
    ];
  }, [matches, clubId]);

  return (
    <Card>
      <SectionLabel>Radar Collectif</SectionLabel>
      {data.length === 0 ? <NoData text="Aucun match chargé" icon={Activity} /> : (
        <>
          <ResponsiveContainer width="100%" height={190}>
            <RadarChart data={data} margin={{ top: 8, right: 24, left: 24, bottom: 8 }}>
              <defs>
                <linearGradient id={GRAD_IDS.radar} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00f2ff" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#00f2ff" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <PolarGrid stroke="rgba(255,255,255,0.06)" />
              <PolarAngleAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 9, fontFamily: "'Bebas Neue', sans-serif" }} />
              <Radar name="Équipe" dataKey="value" stroke="#00f2ff" strokeWidth={2}
                fill={`url(#${GRAD_IDS.radar})`} fillOpacity={1} />
              <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL}
                formatter={(v: unknown) => [`${v} / 100`, "Score"]} />
            </RadarChart>
          </ResponsiveContainer>
          <p style={{ fontSize: 9, color: "var(--muted)", textAlign: "center", marginTop: 4 }}>Normalisé · {matches.length} match{matches.length > 1 ? "s" : ""}</p>
        </>
      )}
    </Card>
  );
}

/* ─── Possession trend ────────────────────────────────────────────────────── */

function PossessionTrendSection({ matches, clubId }: { matches: Match[]; clubId: string }) {
  const data = useMemo(() => {
    const sorted = [...matches].sort((a, b) => Number(a.timestamp) - Number(b.timestamp)).slice(-20);
    return sorted.map((m, i) => {
      const club = m.clubs[clubId] as Record<string, unknown> | undefined;
      const poss = Number(club?.["possession"] ?? club?.["possessionPercentage"] ?? -1);
      return { n: i + 1, poss: poss >= 0 && poss <= 100 ? poss : null };
    }).filter(d => d.poss !== null) as { n: number; poss: number }[];
  }, [matches, clubId]);

  const avg = data.length > 0 ? Math.round(data.reduce((s, d) => s + d.poss, 0) / data.length) : null;

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>Possession moyenne</SectionLabel>
        {avg !== null && (
          <span className={`font-['Bebas_Neue'] text-xl leading-none ${avg >= 50 ? "text-emerald-400" : "text-red-400"}`}>{avg}%</span>
        )}
      </div>
      {data.length < 3
        ? <NoData text="Données de possession non disponibles" icon={Activity} />
        : (
          <ResponsiveContainer width="100%" height={130}>
            <AreaChart data={data} margin={{ top: 4, right: 8, left: -28, bottom: 0 }}>
              <defs>
                <linearGradient id={GRAD_IDS.poss} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00f2ff" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#00f2ff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="n" tick={{ fontSize: 8, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 8, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL}
                formatter={(v: unknown) => [`${v}%`, "Possession"]} />
              <Area type="monotone" dataKey="poss" stroke="#00f2ff" strokeWidth={2}
                fill={`url(#${GRAD_IDS.poss})`}
                dot={{ fill: "#00f2ff", r: 2, strokeWidth: 0 }} activeDot={{ r: 4, fill: "#00f2ff" }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
    </Card>
  );
}

/* ─── Distribution des scores ─────────────────────────────────────────────── */

function ScoreDistSection({ matches, clubId }: { matches: Match[]; clubId: string }) {
  const data = useMemo(() => {
    const map: Record<string, { score: string; count: number; win: number; draw: number; loss: number }> = {};
    for (const m of matches) {
      const my  = m.clubs[clubId] as Record<string, unknown> | undefined;
      const opp = Object.entries(m.clubs).find(([k]) => k !== clubId)?.[1] as Record<string, unknown> | undefined;
      if (!my || !opp) continue;
      const myG  = Number(my["goals"]  ?? 0);
      const oppG = Number(opp["goals"] ?? 0);
      const key  = `${myG}-${oppG}`;
      if (!map[key]) map[key] = { score: key, count: 0, win: 0, draw: 0, loss: 0 };
      map[key].count++;
      if (my["wins"] === "1") map[key].win++;
      else if (my["losses"] === "1") map[key].loss++;
      else map[key].draw++;
    }
    return Object.values(map).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [matches, clubId]);

  return (
    <Card>
      <SectionLabel>Distribution des scores</SectionLabel>
      {data.length === 0 ? <NoData text="Aucun match chargé" icon={BarChart2} /> : (
        <ResponsiveContainer width="100%" height={155}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }} barSize={16}>
            <XAxis dataKey="score" tick={{ fontSize: 9, fill: "#949ba4", fontFamily: "'Bebas Neue', sans-serif" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 8, fill: "#949ba4" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL}
              formatter={(v: unknown, name: unknown) => [v, name === "win" ? "Victoires" : name === "draw" ? "Nuls" : "Défaites"]} />
            <Bar dataKey="win"  stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} name="win" />
            <Bar dataKey="draw" stackId="a" fill="#eab308" name="draw" />
            <Bar dataKey="loss" stackId="a" fill="#ef4444" radius={[3, 3, 0, 0]} name="loss" />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

/* ─── Heatmap Jour / Heure ────────────────────────────────────────────────── */

function DayHourHeatmapSection({ matches, clubId }: { matches: Match[]; clubId: string }) {
  const { grid, days, hours } = useMemo(() => {
    const days  = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
    const hours = ["00h", "04h", "08h", "12h", "16h", "20h"];
    const map: Record<string, { wins: number; total: number }> = {};
    for (const m of matches) {
      const ts = Number(m.timestamp);
      const d  = new Date(ts > 1e12 ? ts : ts * 1000);
      const day  = (d.getDay() + 6) % 7;
      const hour = Math.floor(d.getHours() / 4);
      const key  = `${day}-${hour}`;
      if (!map[key]) map[key] = { wins: 0, total: 0 };
      map[key].total++;
      const club = m.clubs[clubId] as Record<string, unknown> | undefined;
      if (club?.["wins"] === "1") map[key].wins++;
    }
    return { grid: map, days, hours };
  }, [matches, clubId]);

  const hasData = Object.values(grid).some(v => v.total > 0);

  return (
    <Card>
      <SectionLabel>Heatmap Jour / Heure (% Victoires)</SectionLabel>
      {!hasData ? <NoData text="Aucun match chargé" icon={Activity} /> : (
        <>
          <div className="overflow-x-auto">
            <div className="min-w-[280px]" style={{ display: "grid", gridTemplateColumns: "28px repeat(7, 1fr)", gap: 3 }}>
              {/* Day headers */}
              <div />
              {days.map(d => (
                <div key={d} className="text-center font-['Bebas_Neue'] tracking-wider pb-1" style={{ fontSize: 8, color: "var(--muted)" }}>{d}</div>
              ))}
              {/* Rows */}
              {hours.map((h, hi) => (
                <Fragment key={h}>
                  <div className="font-['Bebas_Neue'] self-center pr-1 text-right" style={{ fontSize: 8, color: "var(--muted)" }}>{h}</div>
                  {days.map((_, di) => {
                    const cell = grid[`${di}-${hi}`];
                    const wr = cell && cell.total > 0 ? cell.wins / cell.total : -1;
                    const intensity = wr < 0 ? 0 : wr;
                    return (
                      <div
                        key={di}
                        title={cell ? `${cell.wins}V / ${cell.total}M · ${Math.round(wr * 100)}%` : "Aucun match"}
                        className="rounded-sm h-6 flex items-center justify-center transition-transform hover:scale-110 cursor-default"
                        style={{
                          border: "1px solid var(--border)",
                          background: wr < 0
                            ? "var(--surface)"
                            : `rgba(34,211,238,${0.08 + intensity * 0.82})`,
                        }}
                      >
                        {cell && cell.total > 0 && (
                          <span className="text-[8px] font-bold"
                            style={{ color: wr > 0.6 ? "#ecfdf5" : wr > 0.4 ? "#fef9c3" : "#fee2e2" }}>
                            {Math.round(wr * 100)}%
                          </span>
                        )}
                      </div>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 mt-3">
            <span style={{ fontSize: 9, color: "var(--muted)" }}>Faible</span>
            <div className="flex gap-0.5">
              {[0.08, 0.27, 0.46, 0.65, 0.9].map((op, i) => (
                <div key={i} className="w-3 h-3 rounded-sm" style={{ background: `rgba(34,211,238,${op})` }} />
              ))}
            </div>
            <span style={{ fontSize: 9, color: "var(--muted)" }}>Élevé</span>
          </div>
          <p style={{ fontSize: 9, color: "var(--muted)", textAlign: "center", marginTop: 4 }}>{matches.length} match{matches.length > 1 ? "s" : ""} analysés</p>
        </>
      )}
    </Card>
  );
}

/* ─── Form Calendar (GitHub-style) ───────────────────────────────────────── */

function FormCalendarSection({ matches, clubId }: { matches: Match[]; clubId: string }) {
  const today = useMemo(() => { const d = new Date(); d.setHours(23, 59, 59, 0); return d; }, []);

  const resultMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of matches) {
      const ts = Number(m.timestamp);
      const d = new Date(ts > 1e12 ? ts : ts * 1000);
      const key = d.toISOString().slice(0, 10);
      const club = m.clubs[clubId] as Record<string, unknown> | undefined;
      if (!club) continue;
      const prev = map[key];
      const res = Number(club.wins) > 0 ? "W" : Number(club.ties) > 0 ? "D" : "L";
      if (!prev || (prev === "L" && res !== "L") || (prev === "D" && res === "W")) map[key] = res;
    }
    return map;
  }, [matches, clubId]);

  const { weeks, monthLabels } = useMemo(() => {
    const days = 91;
    const start = new Date(today);
    start.setDate(start.getDate() - days + 1);
    const dow = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - dow);
    const weeksArr: { date: Date; key: string; result: string | null }[][] = [];
    const cur = new Date(start);
    while (cur <= today) {
      const week: typeof weeksArr[number] = [];
      for (let d = 0; d < 7; d++) {
        const key = cur.toISOString().slice(0, 10);
        week.push({ date: new Date(cur), key, result: cur >= start && cur <= today ? (resultMap[key] ?? null) : null });
        cur.setDate(cur.getDate() + 1);
      }
      weeksArr.push(week);
    }
    const labels: { label: string; col: number }[] = [];
    let lastM = -1;
    weeksArr.forEach((w, ci) => {
      const mo = w[0].date.getMonth();
      if (mo !== lastM) { labels.push({ label: w[0].date.toLocaleString("fr", { month: "short" }), col: ci }); lastM = mo; }
    });
    return { weeks: weeksArr, monthLabels: labels };
  }, [today, resultMap]);

  const counts = useMemo(() => {
    const c = { W: 0, D: 0, L: 0 };
    Object.values(resultMap).forEach(r => { if (r in c) c[r as keyof typeof c]++; });
    return c;
  }, [resultMap]);

  return (
    <Card>
      <SectionLabel>Heatmap de forme — 3 mois</SectionLabel>
      {/* Month labels */}
      <div style={{ display: "grid", gridTemplateColumns: `18px repeat(${weeks.length}, 1fr)`, gap: 2, marginBottom: 2 }}>
        <div />
        {weeks.map((_, ci) => {
          const ml = monthLabels.find(m => m.col === ci);
          return (
            <div key={ci} className="font-['Bebas_Neue'] text-center overflow-hidden" style={{ fontSize: 7, color: "var(--muted)" }}>
              {ml?.label ?? ""}
            </div>
          );
        })}
      </div>
      {/* Grid */}
      <div style={{ display: "grid", gridTemplateColumns: `18px repeat(${weeks.length}, 1fr)`, gap: 2 }}>
        {(["L", "M", "M", "J", "V", "S", "D"] as const).map((dl, di) => (
          <Fragment key={di}>
            <div className="text-[7px] font-['Bebas_Neue'] text-right pr-0.5 self-center"
              style={{ color: di % 2 === 0 ? "#949ba4" : "transparent", gridRow: di + 2 }}>
              {dl}
            </div>
            {weeks.map((week, ci) => {
              const cell = week[di];
              const isFuture = cell.date > today;
              const resCls = !cell.result || isFuture ? ""
                : cell.result === "W" ? "bg-emerald-500"
                : cell.result === "D" ? "bg-yellow-500"
                : "bg-red-500";
              return (
                <div
                  key={`${ci}-${di}`}
                  title={cell.result
                    ? `${cell.key} — ${cell.result === "W" ? "Victoire" : cell.result === "D" ? "Nul" : "Défaite"}`
                    : cell.key}
                  className={`rounded-sm transition-transform hover:scale-125 cursor-default border border-white/[0.03] ${resCls}`}
                  style={{
                    height: 11,
                    background: !cell.result && !isFuture ? "var(--surface)" : isFuture ? "transparent" : undefined,
                    opacity: !cell.result && !isFuture ? 0.35 : 1,
                    gridColumn: ci + 2, gridRow: di + 2,
                  }}
                />
              );
            })}
          </Fragment>
        ))}
      </div>
      {/* Legend */}
      <div className="flex justify-end items-center gap-3 mt-3">
        {([["bg-emerald-500", `${counts.W}V`, "#22c55e"], ["bg-yellow-500", `${counts.D}N`, "#eab308"], ["bg-red-500", `${counts.L}D`, "#ef4444"]] as const).map(([cls, label, color]) => (
          <div key={label} className="flex items-center gap-1">
            <div className={`w-2.5 h-2.5 rounded-sm ${cls}`} />
            <span className="text-[9px]" style={{ color }}>{label}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ─── Season History ──────────────────────────────────────────────────────── */

function parseSeasonHistory(raw: unknown, clubId: string): SeasonRow[] {
  if (!raw || typeof raw !== "object") return [];
  const obj = raw as Record<string, unknown>;
  const seasons: unknown[] = (
    (obj[clubId] as Record<string, unknown>)?.["history"] as unknown[]
    ?? obj["history"] as unknown[]
    ?? (Array.isArray(raw) ? raw : [])
  );
  return seasons.map((s) => {
    const v = s as Record<string, string | number>;
    const w = Number(v["wins"] ?? 0), l = Number(v["losses"] ?? 0), t = Number(v["ties"] ?? 0);
    const g = Number(v["goals"] ?? 0), ga = Number(v["goalsAgainst"] ?? 0);
    const sid = String(v["seasonId"] ?? v["season"] ?? "");
    const sr = Number(v["skillRating"] ?? v["skill_rating"] ?? 0) || undefined;
    return { wins: w, losses: l, ties: t, goals: g, goalDiff: g - ga, label: sid ? `S${sid}` : "?", sr };
  }).filter((s) => s.wins + s.losses + s.ties > 0).slice(-10);
}

function SeasonHistorySection({ clubId, platform }: { clubId: string; platform: string }) {
  const t = useT();
  const [seasons, setSeasons] = useState<SeasonRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [tried, setTried] = useState(false);

  useEffect(() => { setSeasons([]); setTried(false); }, [clubId]);

  const load = () => {
    if (tried) return;
    setLoading(true); setTried(true);
    getSeasonHistory(clubId, platform)
      .then((raw) => setSeasons(parseSeasonHistory(raw, clubId)))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const srData = seasons.filter(s => s.sr && s.sr > 0).map(s => ({ label: s.label, sr: s.sr! }));

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>{t("charts.seasonHistory")}</SectionLabel>
        {!tried && (
          <button onClick={load} className="font-['Bebas_Neue'] tracking-wider cursor-pointer rounded transition-colors" style={{ fontSize: 10, padding: "3px 10px", border: "1px solid var(--border)", color: "var(--accent)", background: "transparent" }}>
            {t("charts.load")}
          </button>
        )}
      </div>
      {loading && <NoData text="Chargement…" icon={TrendingUp} />}
      {tried && !loading && seasons.length === 0 && <NoData text={t("charts.noDataClub")} icon={BarChart2} />}
      {seasons.length > 0 && (
        <div className="space-y-2">
          {seasons.map((s) => {
            const total = s.wins + s.losses + s.ties;
            const pct = total > 0 ? Math.round((s.wins / total) * 100) : 0;
            return (
              <div key={s.label} className="flex items-center gap-2">
                <span className="w-7 font-['Bebas_Neue'] flex-shrink-0" style={{ fontSize: 9, color: "var(--muted)" }}>{s.label}</span>
                <div className="flex-1 h-5 rounded overflow-hidden" style={{ background: "var(--surface)" }}>
                  <div className="h-full bg-gradient-to-r from-emerald-800 to-emerald-500 rounded-full transition-all"
                    style={{ width: `${pct}%`, minWidth: s.wins > 0 ? "4px" : 0 }} />
                </div>
                <div className="flex gap-2 text-[10px] flex-shrink-0">
                  <span className="text-emerald-400">{s.wins}V</span>
                  <span className="text-yellow-400">{s.ties}N</span>
                  <span className="text-red-400">{s.losses}D</span>
                  <span style={{ color: "var(--muted)" }}>{pct}%</span>
                </div>
              </div>
            );
          })}

          {/* SR line chart */}
          {srData.length > 1 && (
            <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
              <p className="category-header">SKILL RATING</p>
              <ResponsiveContainer width="100%" height={80}>
                <LineChart data={srData} margin={{ top: 4, right: 8, left: -28, bottom: 0 }}>
                  <XAxis dataKey="label" tick={{ fill: "#949ba4", fontSize: 8 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#949ba4", fontSize: 8 }} domain={["auto", "auto"]} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: unknown) => [v, "SR"]} />
                  <Line type="monotone" dataKey="sr" stroke="#22d3ee" strokeWidth={2}
                    dot={{ fill: "#22d3ee", r: 3 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
              <div className="flex justify-around mt-2">
                {[
                  { label: "MIN",    value: Math.min(...srData.map(s => s.sr)), color: "#ef4444" },
                  { label: "MAX",    value: Math.max(...srData.map(s => s.sr)), color: "#22c55e" },
                  { label: "ACTUEL", value: srData[srData.length - 1].sr,      color: "#22d3ee" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="text-center">
                    <div className="font-['Bebas_Neue'] text-xl leading-none" style={{ color }}>{value}</div>
                    <div style={{ fontSize: 8, color: "var(--muted)", marginTop: 2 }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/* ─── Leaderboard ─────────────────────────────────────────────────────────── */

function parseLeaderboard(raw: unknown, myClubId: string): LeaderRow[] {
  if (!raw || typeof raw !== "object") return [];
  const arr: unknown[] = Array.isArray(raw) ? raw
    : (raw as Record<string, unknown[]>)["clubs"] ?? (raw as Record<string, unknown[]>)["data"] ?? [];
  return arr.slice(0, 20).map((entry, i) => {
    const v = entry as Record<string, string | number>;
    const cid = String(v["clubId"] ?? v["id"] ?? "");
    return {
      rank: i + 1, name: String(v["name"] ?? v["clubName"] ?? `Club #${cid}`),
      wins: Number(v["wins"] ?? 0), losses: Number(v["losses"] ?? 0), ties: Number(v["ties"] ?? 0),
      goals: Number(v["goals"] ?? 0), sr: String(v["skillRating"] ?? "—"),
    };
  }).filter((r) => r.wins + r.losses + r.ties > 0 || r.name !== "Club #");
  void myClubId;
}

function LeaderboardSection({ clubId, platform }: { clubId: string; platform: string }) {
  const t = useT();
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [tried, setTried] = useState(false);

  useEffect(() => { setRows([]); setTried(false); }, [clubId]);

  const load = () => {
    if (tried) return;
    setLoading(true); setTried(true);
    getLeaderboard(platform, 25)
      .then((raw) => setRows(parseLeaderboard(raw, clubId)))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>{t("charts.leaderboardTitle")} — {platform.toUpperCase()}</SectionLabel>
        {!tried && (
          <button onClick={load} className="font-['Bebas_Neue'] tracking-wider cursor-pointer rounded transition-colors" style={{ fontSize: 10, padding: "3px 10px", border: "1px solid var(--border)", color: "var(--accent)", background: "transparent" }}>
            {t("charts.load")}
          </button>
        )}
      </div>
      {loading && <NoData text="Chargement…" icon={TrendingUp} />}
      {tried && !loading && rows.length === 0 && <NoData text={t("charts.noData")} icon={BarChart2} />}
      {rows.length > 0 && (
        <div className="space-y-1 overflow-y-auto max-h-48">
          {rows.map((r) => {
            const total = r.wins + r.ties + r.losses;
            const wr = total > 0 ? Math.round((r.wins / total) * 100) : 0;
            return (
              <div key={r.rank} className="channel-item flex items-center gap-2 px-2 py-1.5">
                <span className="w-5 text-center font-['Bebas_Neue'] text-sm flex-shrink-0" style={{ color: r.rank <= 3 ? "var(--gold)" : "var(--muted)" }}>{r.rank}</span>
                <span className="flex-1 text-xs font-medium truncate" style={{ color: "var(--text)" }}>{r.name}</span>
                <div className="flex gap-2 text-[10px] flex-shrink-0">
                  <span className="text-emerald-400">{r.wins}V</span>
                  <span style={{ color: "var(--muted)" }}>{wr}%</span>
                  <span style={{ color: "var(--muted)" }}>{r.sr}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* ─── Effectif evolution ──────────────────────────────────────────────────── */

function PlayerCountSection({ matches, clubId }: { matches: Match[]; clubId: string }) {
  const data = useMemo(() =>
    [...matches]
      .sort((a, b) => Number(a.timestamp) - Number(b.timestamp))
      .slice(-20)
      .map((m, i) => {
        const clubPlayers = m.players[clubId] as Record<string, unknown> | undefined;
        return { n: i + 1, count: clubPlayers ? Object.keys(clubPlayers).length : 0 };
      }),
  [matches, clubId]);

  const avg = data.length > 0 ? (data.reduce((s, d) => s + d.count, 0) / data.length).toFixed(1) : null;

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>Évolution de l'effectif</SectionLabel>
        {avg !== null && <span className="font-['Bebas_Neue'] text-base text-violet-400">Moy. {avg}</span>}
      </div>
      {data.length < 2 ? <NoData text="Aucun match chargé" icon={Users} /> : (
        <ResponsiveContainer width="100%" height={130}>
          <LineChart data={data} margin={{ top: 4, right: 8, left: -28, bottom: 0 }}>
            <XAxis dataKey="n" tick={{ fontSize: 8, fill: "#949ba4" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 8, fill: "#949ba4" }} axisLine={false} tickLine={false} allowDecimals={false} />
            <CartesianGrid strokeDasharray="3 3" stroke="#3f4147" />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: unknown) => [v, "Joueurs"]} />
            <Line type="monotone" dataKey="count" stroke="#a78bfa" strokeWidth={2}
              dot={{ fill: "#a78bfa", r: 3 }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

/* ─── ChartsTab ───────────────────────────────────────────────────────────── */

export function ChartsTab() {
  const t = useT();
  const [mode, setMode] = useState<Mode>("last10");
  const [exportModal, setExportModal] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const { currentClub, players, matches } = useAppStore();

  const last10 = useMemo(() => {
    if (!currentClub || matches.length === 0)
      return { wins: 0, ties: 0, losses: 0, goals: 0, assists: 0, count: 0 };
    const sorted = [...matches].sort((a, b) => Number(a.timestamp) - Number(b.timestamp)).slice(-10);
    let wins = 0, ties = 0, losses = 0, goals = 0, assists = 0;
    for (const m of sorted) {
      const c = m.clubs[currentClub.id] as Record<string, string> | undefined;
      if (!c) continue;
      if (Number(c.wins) > 0) wins++;
      else if (Number(c.ties) > 0) ties++;
      else losses++;
      goals   += Number(c.goals)   || 0;
      assists += Number(c.assists) || 0;
    }
    return { wins, ties, losses, goals, assists, count: sorted.length };
  }, [matches, currentClub]);

  const allTimeAssists = useMemo(() => players.reduce((s, p) => s + p.assists, 0), [players]);

  const wdlData = useMemo(() => {
    if (!currentClub) return [];
    const src = mode === "alltime"
      ? { wins: currentClub.wins, ties: currentClub.ties, losses: currentClub.losses }
      : last10;
    return [
      { name: t("charts.winsShort"),   value: src.wins,   color: "#22c55e" },
      { name: t("charts.drawsShort"),  value: src.ties,   color: "#eab308" },
      { name: t("charts.lossesShort"), value: src.losses, color: "#ef4444" },
    ];
  }, [currentClub, mode, last10, t]);

  const wdlTotal = wdlData.reduce((s, d) => s + d.value, 0);
  const winRate = wdlTotal > 0 ? Math.round((wdlData[0].value / wdlTotal) * 100) : 0;

  const butsData = useMemo(() => {
    if (!currentClub) return { data: [], total: 0 };
    const goals   = mode === "alltime" ? currentClub.goals : last10.goals;
    const assists = mode === "alltime" ? allTimeAssists    : last10.assists;
    return {
      data: [
        { name: t("charts.goalsShort"),   value: goals,   color: "#22d3ee" },
        { name: t("charts.assistsShort"), value: assists, color: "#22c55e" },
      ],
      total: goals + assists,
    };
  }, [currentClub, mode, last10, allTimeAssists, t]);

  const playerSource = useMemo(() => {
    if (mode === "alltime" || !currentClub) return players;
    const sorted = [...matches].sort((a, b) => Number(a.timestamp) - Number(b.timestamp)).slice(-10);
    return aggregateMatchPlayers(sorted, currentClub.id);
  }, [mode, players, matches, currentClub]);

  const topScorers = useMemo(() => [...playerSource].sort((a, b) => b.goals     - a.goals).slice(0, 5),     [playerSource]);
  const topAssists = useMemo(() => [...playerSource].sort((a, b) => b.assists    - a.assists).slice(0, 5),   [playerSource]);
  const topPasses  = useMemo(() => [...playerSource].sort((a, b) => b.passesMade - a.passesMade).slice(0, 5), [playerSource]);

  if (!currentClub) return null;

  return (
    <div className="h-full overflow-y-auto px-5 py-4" style={{ background: "var(--main-bg)" }}>

      {/* ── Header: mode switch + export ──────────────────────────── */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center p-1 gap-1 rounded" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          {(["last10", "alltime"] as Mode[]).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className="px-4 py-1.5 rounded font-['Bebas_Neue'] tracking-wider transition-all cursor-pointer"
              style={{
                fontSize: 11,
                background: mode === m ? "var(--active)" : "transparent",
                color: mode === m ? "var(--accent)" : "var(--muted)",
                border: mode === m ? "1px solid var(--border)" : "1px solid transparent",
              }}>
              {m === "last10" ? t("charts.last10") : t("charts.allTime")}
            </button>
          ))}
        </div>
        <button onClick={() => setExportModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded cursor-pointer"
          style={{ border: "1px solid var(--border)", color: "var(--muted)", fontSize: 11, background: "transparent" }}>
          <Download size={11} /> PNG
        </button>
      </div>

      <div ref={contentRef} className="space-y-4">

        {/* ── Section 1 : Core — Donuts + KPI ──────────────────────── */}
        <section>
          <h2 className="font-['Bebas_Neue'] text-sm tracking-widest mb-3 flex items-center gap-2" style={{ color: "var(--muted)" }}>
            <Target size={13} className="text-cyan-500" /> Core Performance
          </h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {/* WDL donut */}
            <Card className="col-span-1">
              <SectionLabel>{t("charts.wdl")}</SectionLabel>
              <DonutChart data={wdlData} centerValue={`${winRate}%`} centerSub={t("charts.matchesLabel")} />
              <DonutLegend data={wdlData} total={wdlTotal} />
            </Card>

            {/* Goals donut */}
            <Card className="col-span-1">
              <SectionLabel>{t("charts.goalsAssists")}</SectionLabel>
              <DonutChart data={butsData.data} centerValue={butsData.total} centerSub={t("charts.totalLabel")} />
              <DonutLegend data={butsData.data} total={butsData.total} />
            </Card>

            {/* KPI grid */}
            <Card className="col-span-2">
              <SectionLabel>Chiffres clés</SectionLabel>
              <div className="grid grid-cols-3 gap-2 h-[calc(100%-1.5rem)]">
                {[
                  { label: "Victoires",    value: wdlData[0]?.value ?? 0, color: "#22c55e" },
                  { label: "Nuls",         value: wdlData[1]?.value ?? 0, color: "#eab308" },
                  { label: "Défaites",     value: wdlData[2]?.value ?? 0, color: "#ef4444" },
                  { label: "Buts",         value: butsData.data[0]?.value ?? 0, color: "#22d3ee" },
                  { label: "Passes D.",    value: butsData.data[1]?.value ?? 0, color: "#22c55e" },
                  { label: "% Victoires",  value: `${winRate}%`,               color: winRate >= 50 ? "#22c55e" : "#ef4444" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex flex-col items-center justify-center rounded py-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                    <span className="font-['Bebas_Neue'] text-2xl leading-none" style={{ color }}>{value}</span>
                    <span className="category-header" style={{ marginBottom: 0, marginTop: 3 }}>{label}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </section>

        {/* ── Section 2 : Scoring — Top Buteurs / Passeurs / Passes ─── */}
        <section>
          <h2 className="font-['Bebas_Neue'] text-sm tracking-widest mb-3 flex items-center gap-2" style={{ color: "var(--muted)" }}>
            <TrendingUp size={13} className="text-orange-400" /> Scoring & Création
          </h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card>
              <SectionLabel>{t("charts.topScorers")}</SectionLabel>
              <HBarChart players={topScorers} valueKey="goals" color="cyan" />
            </Card>
            <Card>
              <SectionLabel>{t("charts.topAssists")}</SectionLabel>
              <HBarChart players={topAssists} valueKey="assists" color="orange" />
            </Card>
            <Card>
              <SectionLabel>{t("charts.topPasses")}</SectionLabel>
              <HBarChart players={topPasses} valueKey="passesMade" color="purple" />
            </Card>
          </div>
        </section>

        {/* ── Section 3 : Club data ─────────────────────────────────── */}
        <section>
          <h2 className="font-['Bebas_Neue'] text-sm tracking-widest mb-3 flex items-center gap-2" style={{ color: "var(--muted)" }}>
            <BarChart2 size={13} className="text-violet-400" /> Historique & Classement
          </h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <SeasonHistorySection clubId={currentClub.id} platform={currentClub.platform} />
            <LeaderboardSection   clubId={currentClub.id} platform={currentClub.platform} />
            <TeamRadarSection     matches={matches} clubId={currentClub.id} />
          </div>
        </section>

        {/* ── Section 4 : Analyse de forme ─────────────────────────── */}
        <section>
          <h2 className="font-['Bebas_Neue'] text-sm tracking-widest mb-3 flex items-center gap-2" style={{ color: "var(--muted)" }}>
            <Activity size={13} className="text-emerald-400" /> Analyse de Forme
          </h2>
          {/* Form calendar full-width */}
          <FormCalendarSection matches={matches} clubId={currentClub.id} />

          {/* Row: Score Dist + Day/Hour Heatmap + Possession + Effectif */}
          <div className="grid grid-cols-2 gap-4 mt-4 lg:grid-cols-4">
            <div className="col-span-2 lg:col-span-1">
              <ScoreDistSection matches={matches} clubId={currentClub.id} />
            </div>
            <div className="col-span-2 lg:col-span-2">
              <DayHourHeatmapSection matches={matches} clubId={currentClub.id} />
            </div>
            <div className="col-span-2 lg:col-span-1 flex flex-col gap-4">
              <PossessionTrendSection matches={matches} clubId={currentClub.id} />
              <PlayerCountSection     matches={matches} clubId={currentClub.id} />
            </div>
          </div>
        </section>

      </div>

      {exportModal && (
        <ExportModal type="png" pngSourceEl={contentRef.current}
          defaultFilename={`graphiques-${new Date().toISOString().slice(0, 10)}`}
          onClose={() => setExportModal(false)} />
      )}
    </div>
  );
}
