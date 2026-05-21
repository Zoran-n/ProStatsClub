import { useState, useMemo, useRef } from "react";
import { Download, TrendingUp, Target, Users, BarChart2 } from "lucide-react";
import {
  PieChart, Pie, Cell, Label, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { useAppStore } from "../../store/useAppStore";
import { ExportModal } from "../Modals/ExportModal";
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

type Mode = "last10" | "last20" | "last50" | "alltime";
const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: "last10",  label: "10 DERNIERS" },
  { value: "last20",  label: "20 DERNIERS" },
  { value: "last50",  label: "50 DERNIERS" },
  { value: "alltime", label: "ALL TIME"    },
];
const modeCount = (m: Mode) => m === "last10" ? 10 : m === "last20" ? 20 : m === "last50" ? 50 : Infinity;

/* ─── Shared UI primitives ────────────────────────────────────────────────── */

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={className} style={{
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: 10,
      padding: 16,
    }}>
      {children}
    </div>
  );
}

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
  cyan:   { bar: "from-cyan-800/60 to-cyan-400",    text: "#22d3ee" },
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
    <div className="flex flex-col gap-3">
      {players.map((p) => {
        const val = Number(p[valueKey]) || 0;
        const pct = (val / maxVal) * 100;
        const initials = p.name.split(/[\s_-]+/).map(w => w[0]?.toUpperCase() ?? "").join("").slice(0, 2) || "?";
        const bg = avatarColor(p.name);
        return (
          <div key={p.name} className="flex items-center gap-2.5">
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
              </div>
            </div>
            {/* Valeur hors barre — toujours visible */}
            <span className="flex-shrink-0 font-['Bebas_Neue'] text-sm text-right" style={{ color: ac.text, minWidth: 36 }}>
              {val > 0 ? val : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Top MOTM ────────────────────────────────────────────────────────────── */

function TopMotmSection({ matches, storePlayers, clubId, mode }: {
  matches: Match[]; storePlayers: Player[]; clubId: string; mode: Mode;
}) {
  const players = useMemo(() => {
    if (mode === "alltime") {
      // Utilise les données joueurs du store (agrégation API all-time)
      return storePlayers
        .filter(p => p.motm > 0)
        .map(p => ({ name: p.name, motm: p.motm, rating: p.rating, games: p.gamesPlayed }))
        .sort((a, b) =>
          b.motm - a.motm ||
          (b.games > 0 ? b.rating / b.games : 0) - (a.games > 0 ? a.rating / a.games : 0)
        )
        .slice(0, 8);
    }
    // last10 : calcul depuis les 10 derniers matchs chargés
    const src = [...matches].sort((a, b) => Number(a.timestamp) - Number(b.timestamp)).slice(-10);
    const acc: Record<string, { name: string; motm: number; rating: number; games: number }> = {};
    for (const m of src) {
      const clubPlayers = m.players[clubId] as Record<string, Record<string, unknown>> | undefined;
      if (!clubPlayers) continue;
      for (const [_id, p] of Object.entries(clubPlayers)) {
        const name = String(p["name"] ?? p["playername"] ?? p["playerName"] ?? _id);
        if (!acc[name]) acc[name] = { name, motm: 0, rating: 0, games: 0 };
        if (p["mom"] === "1" || p["manofthematch"] === "1") acc[name].motm++;
        const r = Number(p["rating"] ?? 0);
        if (r > 0) { acc[name].rating += r; acc[name].games++; }
      }
    }
    return Object.values(acc)
      .filter(p => p.motm > 0)
      .sort((a, b) =>
        b.motm - a.motm ||
        (b.games > 0 ? b.rating / b.games : 0) - (a.games > 0 ? a.rating / a.games : 0)
      )
      .slice(0, 8);
  }, [matches, storePlayers, clubId, mode]);

  const maxMotm = players.length > 0 ? players[0].motm : 1;

  return (
    <Card>
      <SectionLabel>Top MOTM</SectionLabel>
      {players.length === 0 ? <NoData text="Aucun MOTM enregistré" icon={Users} /> : (
        <div className="flex flex-col gap-3">
          {players.map((p, i) => {
            const initials = p.name.split(/[\s_-]+/).map(w => w[0]?.toUpperCase() ?? "").join("").slice(0, 2) || "?";
            const bg = avatarColor(p.name);
            const avg = p.games > 0 ? (p.rating / p.games).toFixed(1) : "—";
            const pct = (p.motm / maxMotm) * 100;
            return (
              <div key={p.name} className="flex items-center gap-2.5">
                {/* Rang */}
                <span className="w-4 text-center font-['Bebas_Neue'] text-sm flex-shrink-0"
                  style={{ color: i < 3 ? "var(--gold)" : "var(--muted)" }}>
                  {i + 1}
                </span>
                {/* Avatar */}
                <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-white font-['Bebas_Neue']"
                  style={{ background: bg }}>
                  {initials}
                </div>
                {/* Nom + barre MOTM */}
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] truncate mb-1 font-medium" style={{ color: "var(--muted)" }}>{p.name}</div>
                  <div className="relative h-5 rounded overflow-hidden" style={{ background: "var(--surface)" }}>
                    <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                      style={{
                        width: `${pct}%`,
                        minWidth: p.motm > 0 ? "1.5rem" : 0,
                        background: "linear-gradient(to right, rgba(250,168,26,0.35), #faa81a)",
                      }} />
                  </div>
                </div>
                {/* MOTM count */}
                <span className="flex-shrink-0 font-['Bebas_Neue'] text-sm text-right" style={{ color: "#faa81a", minWidth: 28 }}>
                  ★{p.motm}
                </span>
                {/* Note moyenne */}
                <div className="flex-shrink-0 text-right" style={{ minWidth: 40 }}>
                  <div className="font-['Bebas_Neue'] text-lg leading-none" style={{ color: "var(--accent)" }}>{avg}</div>
                  <div className="text-[8px]" style={{ color: "var(--muted)" }}>moy.</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* ─── Courbe de forme ─────────────────────────────────────────────────────── */

function FormCurveSection({ matches, clubId }: { matches: Match[]; clubId: string }) {
  const { rateData, formPills, totals } = useMemo(() => {
    const sorted = [...matches].sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
    let w = 0, d = 0, l = 0;
    const pts = sorted.map((m) => {
      const club = m.clubs[clubId] as Record<string, unknown> | undefined;
      const result = !club ? "L" : Number(club.wins) > 0 ? "W" : Number(club.ties) > 0 ? "D" : "L";
      if (result === "W") w++; else if (result === "D") d++; else l++;
      return result;
    });
    const rateData = pts.map((_, i) => {
      const slice = pts.slice(Math.max(0, i - 4), i + 1);
      const wins = slice.filter(r => r === "W").length;
      return { n: i + 1, rate: Math.round((wins / slice.length) * 100) };
    });
    return { rateData, formPills: pts.slice(-10), totals: { w, d, l } };
  }, [matches, clubId]);

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <SectionLabel>Courbe de forme</SectionLabel>
        <div className="flex gap-4" style={{ fontSize: 11 }}>
          <span className="font-['Bebas_Neue']" style={{ color: "#22c55e" }}>{totals.w}<span style={{ fontSize: 8, color: "var(--muted)", marginLeft: 2 }}>V</span></span>
          <span className="font-['Bebas_Neue']" style={{ color: "#eab308" }}>{totals.d}<span style={{ fontSize: 8, color: "var(--muted)", marginLeft: 2 }}>N</span></span>
          <span className="font-['Bebas_Neue']" style={{ color: "#ef4444" }}>{totals.l}<span style={{ fontSize: 8, color: "var(--muted)", marginLeft: 2 }}>D</span></span>
        </div>
      </div>

      {rateData.length < 2 ? <NoData text="Pas assez de matchs" icon={TrendingUp} /> : (
        <>
          {/* % victoires glissant 5 matchs */}
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={rateData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="ct-form-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="n" tick={{ fontSize: 8, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 8, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL}
                formatter={(v: unknown) => [`${v}%`, "Win rate (5M)"]} />
              <Area type="monotone" dataKey="rate" stroke="var(--accent)" strokeWidth={2}
                fill="url(#ct-form-grad)" dot={false} activeDot={{ r: 4, fill: "var(--accent)" }} />
            </AreaChart>
          </ResponsiveContainer>

          {/* Pills forme 10 derniers matchs */}
          <div className="flex gap-1.5 mt-3 flex-wrap">
            {formPills.map((result, i) => {
              const color = result === "W" ? "#22c55e" : result === "D" ? "#eab308" : "#ef4444";
              const label = result === "W" ? "V" : result === "D" ? "N" : "D";
              return (
                <div key={i} className="w-7 h-7 rounded flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                  style={{ background: color + "22", border: `1px solid ${color}44`, color }}>
                  {label}
                </div>
              );
            })}
          </div>

          {/* Légende */}
          <p style={{ fontSize: 9, color: "var(--muted)", marginTop: 8, textAlign: "center" }}>
            % victoires glissant sur 5 matchs · {matches.length} match{matches.length > 1 ? "s" : ""} total
          </p>
        </>
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

  const lastNData = useMemo(() => {
    if (mode === "alltime" || !currentClub || matches.length === 0)
      return { wins: 0, ties: 0, losses: 0, goals: 0, assists: 0, count: 0 };
    const n = modeCount(mode);
    const sorted = [...matches].sort((a, b) => Number(a.timestamp) - Number(b.timestamp)).slice(-n);
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
  }, [mode, matches, currentClub]);

  const allTimeAssists = useMemo(() => players.reduce((s, p) => s + p.assists, 0), [players]);

  const wdlData = useMemo(() => {
    if (!currentClub) return [];
    const src = mode === "alltime"
      ? { wins: currentClub.wins, ties: currentClub.ties, losses: currentClub.losses }
      : lastNData;
    return [
      { name: t("charts.winsShort"),   value: src.wins,   color: "#22c55e" },
      { name: t("charts.drawsShort"),  value: src.ties,   color: "#eab308" },
      { name: t("charts.lossesShort"), value: src.losses, color: "#ef4444" },
    ];
  }, [currentClub, mode, lastNData, t]);

  const wdlTotal = wdlData.reduce((s, d) => s + d.value, 0);
  const winRate = wdlTotal > 0 ? Math.round((wdlData[0].value / wdlTotal) * 100) : 0;

  const butsData = useMemo(() => {
    if (!currentClub) return { data: [], total: 0 };
    const goals   = mode === "alltime" ? currentClub.goals : lastNData.goals;
    const assists = mode === "alltime" ? allTimeAssists    : lastNData.assists;
    return {
      data: [
        { name: t("charts.goalsShort"),   value: goals,   color: "#22d3ee" },
        { name: t("charts.assistsShort"), value: assists, color: "#22c55e" },
      ],
      total: goals + assists,
    };
  }, [currentClub, mode, lastNData, allTimeAssists, t]);

  const playerSource = useMemo(() => {
    if (mode === "alltime" || !currentClub) return players;
    const n = modeCount(mode);
    const sorted = [...matches].sort((a, b) => Number(a.timestamp) - Number(b.timestamp)).slice(-n);
    return aggregateMatchPlayers(sorted, currentClub.id);
  }, [mode, players, matches, currentClub]);

  const topScorers = useMemo(() => [...playerSource].sort((a, b) => b.goals      - a.goals).slice(0, 5),     [playerSource]);
  const topAssists = useMemo(() => [...playerSource].sort((a, b) => b.assists     - a.assists).slice(0, 5),   [playerSource]);
  const topPasses  = useMemo(() => [...playerSource].sort((a, b) => b.passesMade  - a.passesMade).slice(0, 5), [playerSource]);

  if (!currentClub) return null;

  return (
    <div className="h-full overflow-y-auto px-5 py-4" style={{ background: "var(--bg)" }}>

      {/* ── Header: mode switch + export ──────────────────────────── */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-1.5">
          {MODE_OPTIONS.map(({ value: m, label }) => {
            const active = mode === m;
            return (
              <button key={m} onClick={() => setMode(m)}
                className="px-3 py-1.5 rounded-lg font-['Bebas_Neue'] tracking-widest transition-all cursor-pointer"
                style={{
                  fontSize: 11,
                  letterSpacing: "0.1em",
                  background: active ? "var(--accent)" : "var(--surface)",
                  color: active ? "#000" : "var(--muted)",
                  border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
                  fontWeight: active ? 700 : 400,
                }}>
                {label}
              </button>
            );
          })}
        </div>

        <button onClick={() => setExportModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer transition-colors"
          style={{ border: "1px solid var(--border)", color: "var(--muted)", fontSize: 11, background: "transparent" }}>
          <Download size={11} /> PNG
        </button>
      </div>

      <div ref={contentRef} className="space-y-4">

        {/* ── Section 1 : Core ─────────────────────────────────────── */}
        <section>
          <h2 className="font-['Bebas_Neue'] text-sm tracking-widest mb-3 flex items-center gap-2" style={{ color: "var(--muted)" }}>
            <Target size={13} className="text-cyan-500" /> Core Performance
          </h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <SectionLabel>{t("charts.wdl")}</SectionLabel>
              <DonutChart data={wdlData} centerValue={`${winRate}%`} centerSub={t("charts.matchesLabel")} />
              <DonutLegend data={wdlData} total={wdlTotal} />
            </Card>
            <Card>
              <SectionLabel>{t("charts.goalsAssists")}</SectionLabel>
              <DonutChart data={butsData.data} centerValue={butsData.total} centerSub={t("charts.totalLabel")} />
              <DonutLegend data={butsData.data} total={butsData.total} />
            </Card>
          </div>
        </section>

        {/* ── Section 2 : Scoring ───────────────────────────────────── */}
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

        {/* ── Section 3 : MOTM & Forme ─────────────────────────────── */}
        <section>
          <h2 className="font-['Bebas_Neue'] text-sm tracking-widest mb-3 flex items-center gap-2" style={{ color: "var(--muted)" }}>
            <Users size={13} className="text-yellow-400" /> MOTM & Forme
          </h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TopMotmSection matches={matches} storePlayers={players} clubId={currentClub.id} mode={mode} />
            <FormCurveSection matches={matches} clubId={currentClub.id} />
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
