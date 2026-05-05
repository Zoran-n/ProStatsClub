import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Download, ChevronDown, Search, Calendar, List, ChevronLeft, ChevronRight, PenLine, Table2 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { useAppStore } from "../../store/useAppStore";
import { ExportModal } from "../Modals/ExportModal";
import { useT } from "../../i18n";
import type { Match } from "../../types";
import { MatchModal, formatDate } from "../Modals/MatchModal";
import { useDebounce } from "../../hooks/useDebounce";
import { useMatchData } from "../../hooks/useMatchData";

function matchDate(m: Match): Date {
  const n = Number(m.timestamp);
  return new Date(n > 1e12 ? n : n * 1000);
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const BTN: React.CSSProperties = {
  padding: "6px 10px", background: "var(--card)", border: "1px solid var(--border)",
  borderRadius: 6, cursor: "pointer", color: "var(--muted)", fontSize: 11,
  display: "flex", alignItems: "center", gap: 4, flexShrink: 0,
};

export function MatchesTab() {
  const { currentClub, matchAnnotations, setMatchAnnotation, persistSettings } = useAppStore();
  const lang = useAppStore((s) => s.language);
  const t    = useT();
  const locale = lang === "fr" ? "fr-FR" : lang === "es" ? "es-ES" : lang === "de" ? "de-DE" : lang === "pt" ? "pt-BR" : "en-US";

  const TYPES = [
    { value: "leagueMatch"   as const, label: t("matches.league"),   icon: "⚽" },
    { value: "playoffMatch"  as const, label: t("matches.playoff"),  icon: "🏆" },
    { value: "friendlyMatch" as const, label: t("matches.friendly"), icon: "🤝" },
  ];
  const RESULT_LABEL: Record<string, { text: string; color: string }> = {
    W: { text: t("match.win"),  color: "var(--green)" },
    D: { text: t("match.draw"), color: "#eab308" },
    L: { text: t("match.loss"), color: "var(--red)" },
  };

  const { type, setType, allList, loading, loadMore, hasMore, eaProfile } = useMatchData();

  const [selected,        setSelected]        = useState<Match | null>(null);
  const [exportModal,     setExportModal]      = useState<"png" | "csv" | null>(null);
  const [calExportModal,  setCalExportModal]   = useState(false);
  const [oppFilter,       setOppFilter]        = useState("");
  const debouncedOppFilter                     = useDebounce(oppFilter, 200);
  const [fromDate,        setFromDate]         = useState("");
  const [toDate,          setToDate]           = useState("");
  const [resultFilter,    setResultFilter]     = useState<"all" | "W" | "D" | "L">("all");
  const [viewMode,        setViewMode]         = useState<"list" | "calendar" | "opponents">("list");
  const [calMonth,        setCalMonth]         = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; });
  const [openAnnotation,  setOpenAnnotation]   = useState<string | null>(null);
  const [visibleCount,    setVisibleCount]     = useState(50);
  const contentRef   = useRef<HTMLDivElement>(null);
  const calendarRef  = useRef<HTMLDivElement>(null);
  const sentinelRef  = useRef<HTMLDivElement>(null);

  // ── Derived helpers ────────────────────────────────────────────────────────
  const getResult = useCallback((m: Match): "W" | "D" | "L" => {
    const c = m.clubs[currentClub?.id ?? ""] as Record<string, unknown> | undefined;
    if (c?.["wins"] === "1") return "W";
    if (c?.["losses"] === "1") return "L";
    return "D";
  }, [currentClub?.id]);

  const getScore = useCallback((m: Match) => {
    const myId = currentClub?.id ?? "";
    const my  = m.clubs[myId] as Record<string, unknown> | undefined;
    const opp = Object.entries(m.clubs).find(([k]) => k !== myId)?.[1] as Record<string, unknown> | undefined;
    return `${my?.["goals"] ?? "?"}-${opp?.["goals"] ?? "?"}`;
  }, [currentClub?.id]);

  const getOppName = useCallback((m: Match, fallback?: string) => {
    const myId = currentClub?.id ?? "";
    const opp = Object.entries(m.clubs).find(([k]) => k !== myId)?.[1] as Record<string, unknown> | undefined;
    const det = opp?.["details"] as Record<string, unknown> | undefined;
    return String(det?.["name"] ?? opp?.["name"] ?? (fallback || t("matches.opponent")));
  }, [currentClub?.id, t]);

  // Half-time score (if available in EA data)
  const getHalfTimeScore = useCallback((m: Match): string | null => {
    const myId = currentClub?.id ?? "";
    const my  = m.clubs[myId] as Record<string, unknown> | undefined;
    const opp = Object.entries(m.clubs).find(([k]) => k !== myId)?.[1] as Record<string, unknown> | undefined;
    if (!my || !opp) return null;
    const keys = ["goalsHT", "goalsht", "clubGoalsHT", "clubgoalsht", "htGoals", "halftimeGoals"];
    for (const k of keys) {
      const myVal  = my[k]  ?? my[k.toLowerCase()];
      const oppVal = opp[k] ?? opp[k.toLowerCase()];
      if (myVal !== undefined && oppVal !== undefined) return `${myVal}-${oppVal}`;
    }
    return null;
  }, [currentClub?.id]);

  // ── Computed ────────────────────────────────────────────────────────────────
  const oppBilan = useMemo(() => {
    if (!debouncedOppFilter.trim()) return null;
    const q = debouncedOppFilter.toLowerCase();
    const filtered = allList.filter((m) => getOppName(m).toLowerCase().includes(q));
    if (filtered.length === 0) return null;
    let w = 0, d = 0, l = 0, goalsFor = 0, goalsAgainst = 0;
    for (const m of filtered) {
      const res = getResult(m);
      if (res === "W") w++; else if (res === "L") l++; else d++;
      const myId = currentClub?.id ?? "";
      const my  = m.clubs[myId] as Record<string, unknown> | undefined;
      const opp = Object.entries(m.clubs).find(([k]) => k !== myId)?.[1] as Record<string, unknown> | undefined;
      goalsFor += Number(my?.["goals"] ?? 0);
      goalsAgainst += Number(opp?.["goals"] ?? 0);
    }
    return { w, d, l, total: filtered.length,
      avgFor: (goalsFor / filtered.length).toFixed(1),
      avgAgainst: (goalsAgainst / filtered.length).toFixed(1) };
  }, [allList, debouncedOppFilter, currentClub?.id, getResult, getOppName]);

  const formData = useMemo(() =>
    [...allList]
      .sort((a, b) => Number(a.timestamp) - Number(b.timestamp))
      .slice(-10)
      .map((m, i) => {
        const res = getResult(m);
        return { n: i + 1, v: res === "W" ? 3 : res === "D" ? 1 : 0, r: res };
      }),
  [allList, getResult]);

  // Streak indicator
  const streak = useMemo(() => {
    if (allList.length < 2) return null;
    const sorted = [...allList].sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
    const first = getResult(sorted[0]);
    let count = 1;
    for (let i = 1; i < sorted.length; i++) {
      if (getResult(sorted[i]) === first) count++; else break;
    }
    if (count < 2) return null;
    return { result: first, count };
  }, [allList, getResult]);

  const list = useMemo(() => {
    let base = allList;
    if (debouncedOppFilter.trim()) {
      const q = debouncedOppFilter.toLowerCase();
      base = base.filter((m) => getOppName(m).toLowerCase().includes(q));
    }
    if (fromDate) {
      const from = new Date(fromDate).getTime();
      base = base.filter((m) => { const n = Number(m.timestamp); return (n > 1e12 ? n : n * 1000) >= from; });
    }
    if (toDate) {
      const to = new Date(toDate).getTime() + 86400000;
      base = base.filter((m) => { const n = Number(m.timestamp); return (n > 1e12 ? n : n * 1000) <= to; });
    }
    if (resultFilter !== "all") {
      base = base.filter((m) => getResult(m) === resultFilter);
    }
    return base;
  }, [allList, debouncedOppFilter, fromDate, toDate, resultFilter, getOppName, getResult]);

  // Reset visible count when list changes
  useEffect(() => { setVisibleCount(50); }, [list.length, type]);

  // IntersectionObserver for incremental rendering
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || visibleCount >= list.length) return;
    const io = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) setVisibleCount(c => Math.min(c + 50, list.length));
    }, { threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, [visibleCount, list.length]);

  const displayedList = useMemo(() => list.slice(0, visibleCount), [list, visibleCount]);

  // Opponent analysis
  const opponentStats = useMemo(() => {
    const map: Record<string, { name: string; w: number; d: number; l: number; gf: number; ga: number }> = {};
    for (const m of allList) {
      const name = getOppName(m);
      const res = getResult(m);
      const myId = currentClub?.id ?? "";
      const my  = m.clubs[myId] as Record<string, unknown> | undefined;
      const opp = Object.entries(m.clubs).find(([k]) => k !== myId)?.[1] as Record<string, unknown> | undefined;
      if (!map[name]) map[name] = { name, w: 0, d: 0, l: 0, gf: 0, ga: 0 };
      if (res === "W") map[name].w++; else if (res === "L") map[name].l++; else map[name].d++;
      map[name].gf += Number(my?.["goals"] ?? 0);
      map[name].ga += Number(opp?.["goals"] ?? 0);
    }
    return Object.values(map).sort((a, b) => (b.w + b.d + b.l) - (a.w + a.d + a.l));
  }, [allList, getOppName, getResult, currentClub?.id]);

  const calendarDays = useMemo(() => {
    const { year, month } = calMonth;
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const offset = firstDay === 0 ? 6 : firstDay - 1;
    const days: { day: number; matches: Match[] }[] = [];
    for (let i = 0; i < offset; i++) days.push({ day: 0, matches: [] });
    for (let d = 1; d <= daysInMonth; d++) {
      const dayMatches = list.filter((m) => {
        const md = matchDate(m);
        return md.getFullYear() === year && md.getMonth() === month && md.getDate() === d;
      });
      days.push({ day: d, matches: dayMatches });
    }
    return days;
  }, [calMonth, list]);

  // CSV/Excel data
  const csvHeaders = [t("matches.date"), t("matches.opponent"), t("matches.score"), "Mi-temps", t("matches.result"), t("matches.type")];
  const csvRows    = list.map((m) => [
    formatDate(m.timestamp, locale), getOppName(m), getScore(m),
    getHalfTimeScore(m) ?? "—", RESULT_LABEL[getResult(m)].text, type,
  ]);
  const dateStr = new Date().toISOString().slice(0, 10);

  // Excel export
  const exportExcel = useCallback(() => {
    const rows = list.map(m => {
      const res = getResult(m);
      const color = res === "W" ? "#16a34a" : res === "L" ? "#dc2626" : "#ca8a04";
      const bg    = res === "W" ? "#f0fdf4"  : res === "L" ? "#fef2f2"  : "#fefce8";
      const ht = getHalfTimeScore(m);
      return `<tr>
        <td>${formatDate(m.timestamp, locale)}</td>
        <td>${escapeHtml(getOppName(m))}</td>
        <td style="font-weight:bold;text-align:center">${getScore(m)}</td>
        <td style="color:#64748b;text-align:center">${ht ?? "—"}</td>
        <td style="color:${color};background:${bg};font-weight:bold;text-align:center">${RESULT_LABEL[res].text}</td>
        <td style="color:#64748b">${type}</td>
      </tr>`;
    }).join("");
    const html = `<html><head><meta charset="UTF-8"></head><body>
    <table border="1" cellpadding="6" style="border-collapse:collapse;font-family:Arial;font-size:12px">
      <tr style="background:#1e293b;color:white;font-weight:bold">
        <th>Date</th><th>Adversaire</th><th>Score</th><th>Mi-temps</th><th>Résultat</th><th>Type</th>
      </tr>
      ${rows}
    </table></body></html>`;
    const blob = new Blob(["\ufeff" + html], { type: "application/vnd.ms-excel;charset=UTF-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `matchs-${dateStr}.xls`; a.click();
    URL.revokeObjectURL(url);
  }, [list, getResult, getScore, getOppName, getHalfTimeScore, locale, type, dateStr, RESULT_LABEL]);

  const dotColor = (v: number) => v === 3 ? "var(--green)" : v === 1 ? "#eab308" : "var(--red)";

  // auto-scroll reset when tab/filter changes
  useEffect(() => { contentRef.current?.scrollTo({ top: 0 }); }, [type, debouncedOppFilter]);

  const streakColor = streak?.result === "W" ? "var(--green)" : streak?.result === "D" ? "#eab308" : "var(--red)";
  const streakLabel = streak?.result === "W" ? "Série V" : streak?.result === "D" ? "Série N" : "Série D";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg)" }}>

      {/* Tab bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px",
        flexShrink: 0, borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, flex: 1, flexWrap: "wrap" }}>
          {TYPES.map((tp) => {
            const active = type === tp.value;
            return (
              <button key={tp.value} onClick={() => setType(tp.value)} style={{
                display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 20,
                border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                background: active ? "rgba(0,212,255,0.08)" : "transparent",
                color: active ? "var(--accent)" : "var(--muted)",
                fontFamily: "'Bebas Neue', sans-serif", fontSize: 13, letterSpacing: 1,
                cursor: "pointer", whiteSpace: "nowrap",
              }}>
                <span>{tp.icon}</span>{tp.label}
              </button>
            );
          })}
          {loading && <span style={{ fontSize: 11, color: "var(--muted)", alignSelf: "center" }}>{t("misc.loading")}</span>}
          {!loading && allList.length > 0 && (
            <span style={{ fontSize: 11, color: "var(--muted)", alignSelf: "center" }}>
              {list.length !== allList.length ? `${list.length} / ${allList.length}` : allList.length} match{allList.length > 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Search */}
        <div style={{ position: "relative", minWidth: 120 }}>
          <Search size={11} style={{ position: "absolute", left: 7, top: "50%", transform: "translateY(-50%)",
            color: "var(--muted)", pointerEvents: "none" }} />
          <input value={oppFilter} onChange={(e) => setOppFilter(e.target.value)}
            placeholder={t("matches.opponentPlaceholder")}
            style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)",
              padding: "5px 8px 5px 24px", borderRadius: 5, fontSize: 11, outline: "none", width: "100%",
              transition: "border-color 0.15s" }}
            onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
            onBlur={(e) => (e.target.style.borderColor = "var(--border)")} />
        </div>

        {/* Date filters */}
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} title="Du"
          style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)",
            padding: "5px 8px", borderRadius: 5, fontSize: 11, outline: "none", cursor: "pointer", colorScheme: "dark" }} />
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} title="Au"
          style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)",
            padding: "5px 8px", borderRadius: 5, fontSize: 11, outline: "none", cursor: "pointer", colorScheme: "dark" }} />
        {(fromDate || toDate) && (
          <button onClick={() => { setFromDate(""); setToDate(""); }}
            style={{ ...BTN, padding: "5px 8px", color: "var(--red)" }}>✕</button>
        )}

        {/* Result filter */}
        <div style={{ display: "flex", gap: 4 }}>
          {(["all", "W", "D", "L"] as const).map((rf) => {
            const labels: Record<string, string> = { all: "Tous", W: "V", D: "N", L: "D" };
            const colors: Record<string, string> = { all: "var(--muted)", W: "var(--green)", D: "#eab308", L: "var(--red)" };
            const active = resultFilter === rf;
            return (
              <button key={rf} onClick={() => setResultFilter(rf)} style={{
                ...BTN, padding: "4px 8px", fontSize: 10,
                color: active ? colors[rf] : "var(--muted)",
                borderColor: active ? colors[rf] : "var(--border)",
                background: active ? `${colors[rf]}18` : "var(--card)",
              }}>{labels[rf]}</button>
            );
          })}
        </div>

        {/* View mode */}
        <button onClick={() => setViewMode("list")}
          style={{ ...BTN, color: viewMode === "list" ? "var(--accent)" : "var(--muted)" }}>
          <List size={11} /> {t("matches.listView")}
        </button>
        <button onClick={() => setViewMode("calendar")}
          style={{ ...BTN, color: viewMode === "calendar" ? "var(--accent)" : "var(--muted)" }}>
          <Calendar size={11} /> {t("matches.calendar")}
        </button>
        <button onClick={() => setViewMode("opponents")}
          style={{ ...BTN, color: viewMode === "opponents" ? "var(--accent)" : "var(--muted)" }}>
          👥 Adversaires
        </button>

        {/* Export */}
        <button onClick={() => setExportModal("png")} style={BTN}><Download size={11} /> PNG</button>
        <button onClick={() => setExportModal("csv")} style={BTN}><Download size={11} /> CSV</button>
        <button onClick={exportExcel} style={BTN} title="Export Excel"><Table2 size={11} /> XLS</button>
      </div>

      {/* Content */}
      <div ref={contentRef} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column",
        gap: 6, padding: "10px 16px 16px" }}>

        {/* Bilan vs adversaire */}
        {oppBilan && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px",
            background: "var(--card)", border: "1px solid var(--accent)", borderRadius: 8, flexWrap: "wrap", flexShrink: 0 }}>
            <span style={{ fontSize: 12, color: "var(--accent)", fontFamily: "'Bebas Neue', sans-serif",
              letterSpacing: 1, flexShrink: 0 }}>
              Bilan vs "{debouncedOppFilter}" — {oppBilan.total} match{oppBilan.total > 1 ? "s" : ""}
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              <span style={{ padding: "2px 8px", borderRadius: 4, background: "rgba(0,255,136,0.12)",
                color: "var(--green)", fontSize: 11, fontWeight: 700 }}>{oppBilan.w}V</span>
              <span style={{ padding: "2px 8px", borderRadius: 4, background: "rgba(234,179,8,0.12)",
                color: "#eab308", fontSize: 11, fontWeight: 700 }}>{oppBilan.d}N</span>
              <span style={{ padding: "2px 8px", borderRadius: 4, background: "rgba(255,51,85,0.12)",
                color: "var(--red)", fontSize: 11, fontWeight: 700 }}>{oppBilan.l}D</span>
            </div>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>
              Moy. {oppBilan.avgFor} — {oppBilan.avgAgainst}
            </span>
          </div>
        )}

        {/* Forme + streak */}
        {formData.length >= 3 && viewMode === "list" && (
          <div style={{ padding: "12px 16px 8px", background: "var(--card)", border: "1px solid var(--border)",
            borderRadius: 8, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ fontSize: 11, color: "var(--muted)",
                fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1 }}>
                Forme — {formData.length} derniers matchs
              </div>
              {streak && (
                <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 10px",
                  borderRadius: 12, background: `${streakColor}18`, border: `1px solid ${streakColor}44` }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: streakColor,
                    fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1 }}>
                    {streakLabel}
                  </span>
                  <span style={{ fontSize: 16, fontFamily: "'Bebas Neue', sans-serif",
                    color: streakColor, lineHeight: 1 }}>{streak.count}</span>
                  <span style={{ fontSize: 9, color: streakColor, opacity: 0.7 }}>en cours</span>
                </div>
              )}
            </div>
            <ResponsiveContainer width="100%" height={60}>
              <LineChart data={formData} margin={{ top: 4, right: 8, left: -36, bottom: 0 }}>
                <XAxis dataKey="n" tick={{ fontSize: 9, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 3]} ticks={[0, 1, 3]} tick={{ fontSize: 9, fill: "var(--muted)" }}
                  axisLine={false} tickLine={false} />
                <ReferenceLine y={1} stroke="var(--border)" strokeDasharray="3 3" />
                <Tooltip content={({ payload }: { payload?: any[] }) => {
                  if (!payload?.length) return null;
                  const p = payload[0].payload as { r: string; v: number };
                  const label = p.r === "W" ? t("match.win") : p.r === "D" ? t("match.draw") : t("match.loss");
                  return (
                    <div style={{ background: "var(--card)", border: "1px solid var(--border)",
                      borderRadius: 4, padding: "3px 8px", fontSize: 10, color: dotColor(p.v) }}>{label}</div>
                  );
                }} />
                <Line type="monotone" dataKey="v" stroke="var(--accent)" strokeWidth={2}
                  dot={(props: any) => {
                    const { cx, cy, payload } = props as { cx: number; cy: number; payload: { v: number; n: number } };
                    return <circle key={`dot-${payload.n}`} cx={cx} cy={cy} r={4}
                      fill={dotColor(payload.v)} stroke="var(--bg)" strokeWidth={1} />;
                  }}
                  activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {viewMode === "opponents" ? (
          /* Opponents analysis */
          <div>
            {opponentStats.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>Aucun match chargé</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      {["Adversaire", "MJ", "V", "N", "D", "% V", "BF", "BC", "Diff"].map((h) => (
                        <th key={h} style={{ padding: "6px 10px", textAlign: h === "Adversaire" ? "left" : "center",
                          fontSize: 10, color: "var(--muted)", fontWeight: "normal",
                          fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {opponentStats.map((opp) => {
                      const mj = opp.w + opp.d + opp.l;
                      const wr = Math.round((opp.w / mj) * 100);
                      const diff = opp.gf - opp.ga;
                      return (
                        <tr key={opp.name} style={{ borderBottom: "1px solid var(--border)" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                          <td style={{ padding: "7px 10px", color: "var(--text)", fontWeight: 600 }}>{opp.name}</td>
                          <td style={{ padding: "7px 10px", textAlign: "center", color: "var(--muted)" }}>{mj}</td>
                          <td style={{ padding: "7px 10px", textAlign: "center", color: "var(--green)", fontWeight: 700 }}>{opp.w}</td>
                          <td style={{ padding: "7px 10px", textAlign: "center", color: "#eab308" }}>{opp.d}</td>
                          <td style={{ padding: "7px 10px", textAlign: "center", color: "var(--red)" }}>{opp.l}</td>
                          <td style={{ padding: "7px 10px", textAlign: "center", color: wr >= 60 ? "var(--green)" : wr >= 40 ? "#eab308" : "var(--red)", fontWeight: 700 }}>{wr}%</td>
                          <td style={{ padding: "7px 10px", textAlign: "center", color: "var(--text)" }}>{opp.gf}</td>
                          <td style={{ padding: "7px 10px", textAlign: "center", color: "var(--text)" }}>{opp.ga}</td>
                          <td style={{ padding: "7px 10px", textAlign: "center", color: diff > 0 ? "var(--green)" : diff < 0 ? "var(--red)" : "var(--muted)", fontWeight: 700 }}>{diff > 0 ? "+" : ""}{diff}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : viewMode === "list" ? (
          <>
            {!loading && list.length === 0 && (
              <div style={{ padding: 40, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
                {t("matches.noMatches")}
              </div>
            )}

            {displayedList.map((m) => {
              const res = getResult(m);
              const rl  = RESULT_LABEL[res];
              const annotation = matchAnnotations[m.matchId] ?? "";
              const isOpen = openAnnotation === m.matchId;
              const htScore = getHalfTimeScore(m);
              return (
                <div key={m.matchId} style={{
                  display: "flex", flexDirection: "column",
                  background: "var(--card)", border: `1px solid ${isOpen ? "var(--accent)" : "var(--border)"}`,
                  borderRadius: 8, transition: "border-color 0.15s", flexShrink: 0,
                }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = isOpen ? "var(--accent)" : "var(--border)")}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 18px" }}>
                    <div style={{ display: "flex", flexDirection: "column", minWidth: 60, flexShrink: 0 }}>
                      <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26,
                        color: "#eab308", letterSpacing: 1, lineHeight: 1 }}>
                        {getScore(m)}
                      </span>
                      {htScore && (
                        <span style={{ fontSize: 9, color: "var(--muted)", marginTop: 2 }}>
                          HT {htScore}
                        </span>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, color: "var(--text)", fontWeight: 600,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        vs {getOppName(m)}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                        {formatDate(m.timestamp, locale)}
                        {annotation && !isOpen && (
                          <span style={{ marginLeft: 8, color: "var(--accent)", fontStyle: "italic" }}>
                            "{annotation.length > 40 ? annotation.slice(0, 40) + "…" : annotation}"
                          </span>
                        )}
                      </div>
                    </div>
                    <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 14,
                      color: rl.color, letterSpacing: 1, minWidth: 72, textAlign: "center" }}>
                      {rl.text}
                    </span>
                    <button
                      onClick={() => setOpenAnnotation(isOpen ? null : m.matchId)}
                      title="Annotation"
                      style={{ background: "none", border: "none", cursor: "pointer", padding: "4px",
                        borderRadius: 4, display: "flex", alignItems: "center",
                        color: annotation ? "var(--accent)" : "var(--muted)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = annotation ? "var(--accent)" : "var(--muted)")}
                    >
                      <PenLine size={13} />
                    </button>
                    <button onClick={() => setSelected(m)}
                      style={{ background: "none", border: "none", color: "var(--muted)",
                        fontSize: 12, cursor: "pointer", whiteSpace: "nowrap", padding: "4px 8px", borderRadius: 4 }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text)")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted)")}
                    >
                      {"▶ " + t("matches.details")}
                    </button>
                  </div>
                  {isOpen && (
                    <div style={{ padding: "0 18px 12px" }}>
                      <textarea
                        value={annotation}
                        onChange={(e) => setMatchAnnotation(m.matchId, e.target.value)}
                        placeholder="Ajouter une note sur ce match…"
                        rows={2}
                        style={{ width: "100%", background: "var(--bg)", border: "1px solid var(--border)",
                          borderRadius: 6, color: "var(--text)", fontSize: 12, padding: "8px 10px",
                          resize: "vertical", outline: "none", fontFamily: "inherit",
                          boxSizing: "border-box", transition: "border-color 0.15s" }}
                        onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                        onBlur={(e) => { e.target.style.borderColor = "var(--border)"; persistSettings(); }}
                      />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Incremental rendering sentinel */}
            {visibleCount < list.length && (
              <div ref={sentinelRef} style={{ textAlign: "center", padding: "8px 0", flexShrink: 0 }}>
                <span style={{ fontSize: 11, color: "var(--muted)" }}>
                  {visibleCount} / {list.length} matchs affichés…
                </span>
              </div>
            )}

            {hasMore && !eaProfile && (
              <button onClick={loadMore}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--muted)"; }}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  padding: "10px", background: "var(--card)", border: "1px dashed var(--border)",
                  borderRadius: 8, cursor: "pointer", color: "var(--muted)", fontSize: 12,
                  marginTop: 4, width: "100%", flexShrink: 0 }}>
                <ChevronDown size={14} /> {t("matches.loadMore")}
              </button>
            )}
            {hasMore && eaProfile && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                padding: "10px", color: "var(--muted)", fontSize: 11 }}>
                <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%",
                  background: "var(--accent)", animation: "pulse 1.5s ease-in-out infinite" }} />
                Chargement automatique en cours…
              </div>
            )}
            {!hasMore && !loading && list.length > 0 && visibleCount >= list.length && (
              <div style={{ textAlign: "center", fontSize: 11, color: "var(--muted)", padding: "8px 0" }}>
                {t("matches.allShown")}
              </div>
            )}
          </>
        ) : (
          /* Calendar view */
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button onClick={() => setCalMonth((c) => {
                  const d = new Date(c.year, c.month - 1, 1);
                  return { year: d.getFullYear(), month: d.getMonth() };
                })} style={BTN}><ChevronLeft size={13} /></button>
                <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: "var(--text)",
                  letterSpacing: "0.06em", minWidth: 160, textAlign: "center" }}>
                  {t(`months.${calMonth.month}`)} {calMonth.year}
                </span>
                <button onClick={() => setCalMonth((c) => {
                  const d = new Date(c.year, c.month + 1, 1);
                  return { year: d.getFullYear(), month: d.getMonth() };
                })} style={BTN}><ChevronRight size={13} /></button>
              </div>
              <button onClick={() => setCalExportModal(true)} style={BTN}>
                <Download size={11} /> PNG Calendrier
              </button>
            </div>

            <div ref={calendarRef}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
                {[t("days.mon"), t("days.tue"), t("days.wed"), t("days.thu"), t("days.fri"), t("days.sat"), t("days.sun")].map((d) => (
                  <div key={d} style={{ textAlign: "center", fontSize: 9, color: "var(--muted)",
                    fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.06em", padding: 4 }}>{d}</div>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
                {calendarDays.map((cell, i) => (
                  <div key={i} style={{
                    minHeight: 64, padding: 4, borderRadius: 4,
                    background: cell.day === 0 ? "transparent" : "var(--card)",
                    border: cell.day === 0 ? "none" : "1px solid var(--border)",
                  }}>
                    {cell.day > 0 && (
                      <>
                        <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 2 }}>{cell.day}</div>
                        {cell.matches.map((m) => {
                          const res   = getResult(m);
                          const color = RESULT_LABEL[res].color;
                          return (
                            <div key={m.matchId} onClick={() => setSelected(m)}
                              style={{ fontSize: 9, padding: "1px 3px", borderRadius: 3, marginBottom: 1,
                                background: `${color}22`, color, cursor: "pointer", fontWeight: 600,
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {getScore(m)}
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {selected && <MatchModal match={selected} clubId={currentClub?.id ?? ""} onClose={() => setSelected(null)} />}
      {exportModal === "png" && (
        <ExportModal type="png" pngSourceEl={contentRef.current}
          defaultFilename={`matchs-${dateStr}`} onClose={() => setExportModal(null)} />
      )}
      {exportModal === "csv" && (
        <ExportModal type="csv" csvHeaders={csvHeaders} csvRows={csvRows}
          defaultFilename={`matchs-${dateStr}`} onClose={() => setExportModal(null)} />
      )}
      {calExportModal && (
        <ExportModal type="png" pngSourceEl={calendarRef.current}
          defaultFilename={`calendrier-${dateStr}`} onClose={() => setCalExportModal(false)} />
      )}
    </div>
  );
}
