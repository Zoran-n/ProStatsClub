import { useRef, useState, useMemo } from "react";
import {
  Play, Square, Trash2, Archive, Download,
  Send, Info, X, Tag, FileText, Flag, TrendingUp,
  Merge, AlertTriangle, Layers,
} from "lucide-react";
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import { useAppStore } from "../../store/useAppStore";
import { useSession } from "../../hooks/useSession";
import { Badge } from "../UI/Badge";
import { ExportModal } from "../Modals/ExportModal";
import { PdfSaveModal } from "../Modals/PdfSaveModal";
import type { Match, Session as SessionType } from "../../types";
import { generateSessionPdf, getSessionPdfFilename, generateWeeklyReport } from "../../utils/pdfExport";
import { generateSessionSummary } from "../../utils/aiEngine";
import { AIPanel } from "../AI/AIPanel";
import { sendDiscordWebhook } from "../../api/discord";
import { useT } from "../../i18n";

// ── Helpers ────────────────────────────────────────────────────────────────

function matchResult(m: Match, clubId: string): "W" | "L" | "D" {
  const c = m.clubs[clubId] as Record<string, unknown> | undefined;
  if (c?.["wins"] === "1" || c?.["wins"] === 1) return "W";
  if (c?.["losses"] === "1" || c?.["losses"] === 1) return "L";
  return "D";
}

function sessionWLD(matches: Match[], clubId: string) {
  let w = 0, l = 0, d = 0;
  for (const m of matches) {
    const r = matchResult(m, clubId);
    if (r === "W") w++; else if (r === "L") l++; else d++;
  }
  return { w, l, d };
}

function sessionKpis(matches: Match[], clubId: string) {
  let goals = 0, assists = 0, passes = 0, tackles = 0, motm = 0;
  for (const m of matches) {
    const clubPlayers = m.players[clubId] as Record<string, Record<string, unknown>> | undefined;
    if (!clubPlayers) continue;
    for (const p of Object.values(clubPlayers)) {
      goals   += Number(p["goals"]      ?? 0);
      assists += Number(p["assists"]    ?? 0);
      passes  += Number(p["passesMade"] ?? p["passesmade"] ?? 0);
      tackles += Number(p["tacklesMade"] ?? p["tacklesmade"] ?? 0);
      if (p["mom"] === "1" || p["manofthematch"] === "1") motm++;
    }
  }
  return { goals, assists, passes, tackles, motm };
}

interface PlayerMvp { name: string; goals: number; assists: number; motm: number; rating: number; games: number }

function sessionMvpStats(matches: Match[], clubId?: string) {
  const acc: Record<string, PlayerMvp> = {};
  for (const m of matches) {
    const clubIds = clubId ? [clubId] : Object.keys(m.players);
    for (const cid of clubIds) {
      const players = m.players[cid] as Record<string, Record<string, unknown>> | undefined;
      if (!players) continue;
      for (const [pid, p] of Object.entries(players)) {
        const name = String(p["name"] ?? p["playername"] ?? p["playerName"] ?? pid);
        if (!acc[name]) acc[name] = { name, goals: 0, assists: 0, motm: 0, rating: 0, games: 0 };
        acc[name].goals   += Number(p["goals"] ?? 0);
        acc[name].assists += Number(p["assists"] ?? 0);
        acc[name].rating  += Number(p["rating"] ?? 0);
        acc[name].games   += 1;
        if (p["mom"] === "1" || p["manofthematch"] === "1") acc[name].motm++;
      }
    }
  }
  const all = Object.values(acc);
  const topScorer   = all.length > 0 ? all.reduce((a, b) => b.goals > a.goals ? b : a) : null;
  const topAssister = all.length > 0 ? all.reduce((a, b) => b.assists > a.assists ? b : a) : null;
  const topMotm     = all.length > 0 ? all.reduce((a, b) => b.motm > a.motm ? b : a) : null;
  return { topScorer, topAssister, topMotm, all };
}

function getMatchScore(m: Match, clubId: string) {
  const ourClub = m.clubs[clubId] as Record<string, unknown> | undefined;
  const ourGoals = Number(ourClub?.["goals"] ?? 0);
  const oppEntry = Object.entries(m.clubs).find(([id]) => id !== clubId);
  const oppGoals = Number((oppEntry?.[1] as Record<string, unknown>)?.["goals"] ?? 0);
  return { ourGoals, oppGoals };
}

const BTN: React.CSSProperties = {
  padding: "5px 9px", background: "var(--card)", border: "1px solid var(--border)",
  borderRadius: 5, cursor: "pointer", color: "var(--muted)", fontSize: 11,
  display: "flex", alignItems: "center", gap: 4,
};

const PRESET_TAGS = ["Tournoi", "Division", "Soirée", "Entraînement", "Friendly", "Ranked"];

// ── Main component ──────────────────────────────────────────────────────────

export function SessionTab() {
  const t = useT();
  useSession();
  const {
    activeSession, sessions, currentClub, startSession, stopSession, persistSettings,
    deleteSession, archiveSession, updateSession, setActiveSessionGoal,
    setActiveSessionAdvancedGoals,
    discordWebhook, addToast,
    sessionTemplates, deleteSessionTemplate, mergeSessions,
    autoPostSession, setAutoPostSession,
  } = useAppStore();

  const [showArchived, setShowArchived] = useState(false);
  const [exportModal, setExportModal] = useState<"png" | "csv" | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [detailSession, setDetailSession] = useState<SessionType | null>(null);
  const [pdfPrompt, setPdfPrompt] = useState<SessionType | null>(null);
  const [pdfModal, setPdfModal] = useState<SessionType | null>(null);
  const [page, setPage] = useState(0);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteValue, setNoteValue] = useState("");
  const [editingTagsId, setEditingTagsId] = useState<string | null>(null);
  const [goalInput, setGoalInput] = useState<string>("");
  const [advGoalsInput, setAdvGoalsInput] = useState<string>("");
  const [advAssistsInput, setAdvAssistsInput] = useState<string>("");
  // Session comparison
  const [showCompare, setShowCompare] = useState(false);
  const [compareA, setCompareA] = useState<string>("");
  const [compareB, setCompareB] = useState<string>("");
  // Merge sessions
  const [showMerge, setShowMerge] = useState(false);
  const [mergeSelected, setMergeSelected] = useState<Set<string>>(new Set());
  const [mergeLabelInput, setMergeLabelInput] = useState("");
  // Goal history
  const [showGoalHistory, setShowGoalHistory] = useState(false);
  // Radar
  const [showRadar, setShowRadar] = useState(false);
  const [radarSessionId, setRadarSessionId] = useState<string>("");
  const contentRef = useRef<HTMLDivElement>(null);
  const PAGE_SIZE = 10;

  // ── Discord share ──────────────────────────────────────────────────────

  const shareToDiscord = async (s: SessionType) => {
    if (!discordWebhook) { addToast(t("discord.noWebhook"), "error"); return; }
    setSharingId(s.id);
    try {
      const kpis = sessionKpis(s.matches, s.clubId);
      const wld = sessionWLD(s.matches, s.clubId);
      const mvps = sessionMvpStats(s.matches, s.clubId);
      const color = wld.w > wld.l ? 0x23a559 : wld.l > wld.w ? 0xda373c : 0xfaa81a;

      // Forme récente (last 5 matches as emoji bar)
      const recentResults = [...s.matches]
        .sort((a, b) => Number(a.timestamp) - Number(b.timestamp))
        .slice(-5)
        .map((m) => matchResult(m, s.clubId) === "W" ? "🟢" : matchResult(m, s.clubId) === "L" ? "🔴" : "🟡");
      const formeBar = recentResults.join(" ");

      // MOTM — joueur avec le plus de fois MOTM, si égalité meilleure note moyenne
      const sortedByMOTM = [...mvps.all].sort((a, b) => b.motm - a.motm || (b.rating / Math.max(1, b.games)) - (a.rating / Math.max(1, a.games)));
      const motmPlayer = sortedByMOTM[0];

      // Top 3 buteurs
      const top3Goals = [...mvps.all]
        .filter(p => p.goals > 0)
        .sort((a, b) => b.goals - a.goals)
        .slice(0, 3)
        .map((p) => `**${p.name}** ${p.goals}⚽`)
        .join("  ·  ");

      // Top 3 assisteurs
      const top3Assists = [...mvps.all]
        .filter(p => p.assists > 0)
        .sort((a, b) => b.assists - a.assists)
        .slice(0, 3)
        .map((p) => `**${p.name}** ${p.assists}🅰️`)
        .join("  ·  ");

      // Score de forme session (pts / max)
      const sessionPts = wld.w * 3 + wld.d;
      const maxSessionPts = s.matches.length * 3;
      const formeScore = maxSessionPts > 0 ? Math.round((sessionPts / maxSessionPts) * 100) : 0;

      const matchLines = [...s.matches]
        .sort((a, b) => Number(a.timestamp) - Number(b.timestamp))
        .map((m) => {
          const r = matchResult(m, s.clubId);
          const { ourGoals, oppGoals } = getMatchScore(m, s.clubId);
          const icon = r === "W" ? "🟢" : r === "L" ? "🔴" : "🟡";
          return `${icon} **${ourGoals}–${oppGoals}**`;
        });

      const fields: { name: string; value: string; inline?: boolean }[] = [
        {
          name: "📊 Bilan",
          value: `🟢 **${wld.w}V** · 🟡 **${wld.d}N** · 🔴 **${wld.l}D**  ·  Forme **${formeScore}/100**`,
          inline: false,
        },
        { name: "⚽ Buts", value: String(kpis.goals), inline: true },
        { name: "🅰️ Passes D.", value: String(kpis.assists), inline: true },
        { name: "★ MOTM", value: String(kpis.motm), inline: true },
      ];
      if (recentResults.length > 0)
        fields.push({ name: "📈 Forme récente", value: formeBar, inline: false });
      if (motmPlayer && motmPlayer.motm > 0)
        fields.push({ name: "🏅 Homme du match", value: `**${motmPlayer.name}** — ${motmPlayer.motm}★ MOTM · note moy. **${motmPlayer.games > 0 ? (motmPlayer.rating / motmPlayer.games).toFixed(1) : "–"}**`, inline: false });
      if (top3Goals)
        fields.push({ name: "🥇 Top buteurs", value: top3Goals, inline: false });
      if (top3Assists)
        fields.push({ name: "🥇 Top assisteurs", value: top3Assists, inline: false });
      if (matchLines.length > 0)
        fields.push({ name: "🎮 Matchs", value: matchLines.join("  ·  ").slice(0, 1024), inline: false });
      if (s.notes?.trim())
        fields.push({ name: "📝 Notes", value: s.notes.slice(0, 1024), inline: false });
      if (s.tags && s.tags.length > 0)
        fields.push({ name: "🏷️ Tags", value: s.tags.join(" · "), inline: false });

      await sendDiscordWebhook(discordWebhook, [{
        title: `🏆 RÉCAP SESSION — ${s.clubName.toUpperCase()}`,
        color,
        description: `📅 ${new Date(s.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} · **${s.matches.length} match${s.matches.length !== 1 ? "s" : ""}**`,
        fields,
        footer: { text: "ProClubs Stats · Récap post-session" },
        timestamp: new Date().toISOString(),
      }]);
      addToast(t("discord.sent"), "success");
    } catch (e) { addToast(`Discord: ${String(e)}`, "error"); }
    finally { setSharingId(null); }
  };

  // ── Live Discord share (active session partial) ──────────────────────
  const shareLiveToDiscord = async () => {
    if (!discordWebhook || !activeSession) return;
    setSharingId(activeSession.id);
    try {
      const kpis = sessionKpis(activeSession.matches, activeSession.clubId);
      const wld = sessionWLD(activeSession.matches, activeSession.clubId);
      const color = wld.w > wld.l ? 0x23a559 : wld.l > wld.w ? 0xda373c : 0xfaa81a;
      const elapsed = Math.round((Date.now() - new Date(activeSession.date).getTime()) / 60000);

      const matchLines = [...activeSession.matches].reverse().slice(0, 10).map((m) => {
        const r = matchResult(m, activeSession.clubId);
        const { ourGoals, oppGoals } = getMatchScore(m, activeSession.clubId);
        return `${r === "W" ? "🟢" : r === "L" ? "🔴" : "🟡"} **${ourGoals} – ${oppGoals}**`;
      });

      const fields: { name: string; value: string; inline?: boolean }[] = [
        { name: "📊 Bilan en cours", value: `🟢 **${wld.w}V** · 🟡 **${wld.d}N** · 🔴 **${wld.l}D**`, inline: false },
        { name: "⚽ Buts", value: String(kpis.goals), inline: true },
        { name: "🅰️ Passes D.", value: String(kpis.assists), inline: true },
        { name: "★ MOTM", value: String(kpis.motm), inline: true },
      ];
      if (matchLines.length > 0) fields.push({ name: "🎮 Matchs", value: matchLines.join("  ·  ").slice(0, 1024) });

      await sendDiscordWebhook(discordWebhook, [{
        title: `🔴 Session en cours — ${activeSession.clubName}`,
        color,
        description: `⏱️ ${elapsed} min · ${activeSession.matches.length} match${activeSession.matches.length !== 1 ? "s" : ""}`,
        fields,
        footer: { text: "ProClubs Stats · Bilan partiel" },
      }]);
      addToast(t("discord.sent"), "success");
    } catch (e) { addToast(`Discord: ${String(e)}`, "error"); }
    finally { setSharingId(null); }
  };

  // ── Stop handler ──────────────────────────────────────────────────────

  const handleStop = () => {
    const session = useAppStore.getState().activeSession;
    stopSession();
    persistSettings();
    if (session && session.matches.length > 0) {
      setPdfPrompt(session);
    }
  };

  // ── Filtered + paginated sessions ─────────────────────────────────────

  const allVisible = useMemo(
    () => sessions.filter((s) => {
      if (showArchived ? !s.archived : s.archived) return false;
      if (tagFilter && !(s.tags ?? []).includes(tagFilter)) return false;
      return true;
    }),
    [sessions, showArchived, tagFilter],
  );
  const totalPages = Math.max(1, Math.ceil(allVisible.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const visible = useMemo(
    () => allVisible.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE),
    [allVisible, safePage],
  );

  // All tags used across sessions (for filter chips)
  const allTags = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach((s) => (s.tags ?? []).forEach((tag) => set.add(tag)));
    return Array.from(set);
  }, [sessions]);

  // Win rate chart data
  const winRateData = useMemo(
    () =>
      [...sessions]
        .filter((s) => !s.archived && s.matches.length > 0)
        .reverse()
        .slice(-12)
        .map((s, i) => {
          const wld = sessionWLD(s.matches, s.clubId);
          const rate = s.matches.length > 0 ? Math.round((wld.w / s.matches.length) * 100) : 0;
          return { name: `S${i + 1}`, rate, date: new Date(s.date).toLocaleDateString() };
        }),
    [sessions],
  );

  // ── Live stats ────────────────────────────────────────────────────────

  const kpis = useMemo(
    () => activeSession ? sessionKpis(activeSession.matches, activeSession.clubId) : null,
    [activeSession],
  );
  const activeWLD = useMemo(
    () => activeSession ? sessionWLD(activeSession.matches, activeSession.clubId) : null,
    [activeSession],
  );

  // CSV export
  const csvHeaders = ["Date", "Club", t("players.gp"), t("players.goals"), t("players.assists"), t("players.passes"), t("players.tackles"), t("session.motm"), "Tags", "Notes"];
  const csvRows = useMemo(() => allVisible.map((s) => {
    const k = sessionKpis(s.matches, s.clubId);
    return [new Date(s.date).toLocaleDateString(), s.clubName,
      s.matches.length, k.goals, k.assists, k.passes, k.tackles, k.motm,
      (s.tags ?? []).join("|"), s.notes ?? ""];
  }), [allVisible]);
  const dateStr = new Date().toISOString().slice(0, 10);

  // ── Goal history data ──────────────────────────────────────────────
  const goalHistoryData = useMemo(() => {
    const withGoals = sessions.filter((s) => s.goal != null && s.matches.length > 0);
    if (withGoals.length === 0) return null;
    let achieved = 0;
    const entries = [...withGoals].reverse().map((s, i) => {
      const wld = sessionWLD(s.matches, s.clubId);
      const hit = wld.w >= (s.goal ?? 0);
      if (hit) achieved++;
      const advMax = s.advancedGoals?.maxLosses;
      const advRat = s.advancedGoals?.minRating;
      const advMaxHit = advMax != null ? wld.l <= advMax : null;
      let advRatHit: boolean | null = null;
      if (advRat != null) {
        const allR: number[] = [];
        for (const m of s.matches) {
          const cps = m.players[s.clubId] as Record<string, Record<string, unknown>> | undefined;
          if (!cps) continue;
          for (const p of Object.values(cps)) { const r = Number(p["rating"] ?? 0); if (r > 0) allR.push(r); }
        }
        const avg = allR.length > 0 ? allR.reduce((a, b) => a + b, 0) / allR.length : 0;
        advRatHit = avg >= advRat;
      }
      return { name: `S${i + 1}`, date: new Date(s.date).toLocaleDateString(), goal: s.goal!, wins: wld.w, hit, advMaxHit, advRatHit };
    });
    return { entries, total: withGoals.length, achieved, rate: Math.round((achieved / withGoals.length) * 100) };
  }, [sessions]);

  // ── Radar data ─────────────────────────────────────────────────────
  const radarData = useMemo(() => {
    const sid = radarSessionId || sessions.find((s) => !s.archived && s.matches.length > 0)?.id;
    const s = sessions.find((x) => x.id === sid);
    if (!s || s.matches.length === 0) return null;
    const k = sessionKpis(s.matches, s.clubId);
    const wld = sessionWLD(s.matches, s.clubId);
    const n = s.matches.length;
    // Normalize per match × 10 for radar scale
    return {
      session: s,
      data: [
        { stat: "Buts", value: Math.min(10, (k.goals / n) * 5) },
        { stat: "Passes D.", value: Math.min(10, (k.assists / n) * 5) },
        { stat: "Passes", value: Math.min(10, (k.passes / n) * 0.05) },
        { stat: "Tacles", value: Math.min(10, (k.tackles / n) * 0.1) },
        { stat: "MOTM", value: Math.min(10, (k.motm / n) * 10) },
        { stat: "% Victoires", value: n > 0 ? (wld.w / n) * 10 : 0 },
      ],
    };
  }, [radarSessionId, sessions]);

  // ── Session alerts (check if goals about to be missed) ─────────────
  const sessionAlerts = useMemo(() => {
    if (!activeSession || activeSession.matches.length < 2) return [];
    const alerts: string[] = [];
    const wld = sessionWLD(activeSession.matches, activeSession.clubId);

    // Goal: wins target
    if (activeSession.goal != null) {
      const remaining = activeSession.goal - wld.w;
      const matchesPlayed = activeSession.matches.length;
      if (remaining > 0 && wld.l >= Math.max(1, Math.floor(matchesPlayed * 0.4))) {
        alerts.push(`Objectif ${activeSession.goal}V en danger — ${wld.w}V pour ${wld.l}D`);
      }
    }

    // Advanced: max losses
    const maxL = activeSession.advancedGoals?.maxLosses;
    if (maxL != null && wld.l >= maxL) {
      alerts.push(`Limite de défaites atteinte : ${wld.l}/${maxL}`);
    } else if (maxL != null && wld.l === maxL - 1) {
      alerts.push(`Attention : encore 1 défaite avant la limite (${wld.l}/${maxL})`);
    }

    // Advanced: min rating
    const minR = activeSession.advancedGoals?.minRating;
    if (minR != null) {
      const allR: number[] = [];
      for (const m of activeSession.matches) {
        const cps = m.players[activeSession.clubId] as Record<string, Record<string, unknown>> | undefined;
        if (!cps) continue;
        for (const p of Object.values(cps)) { const r = Number(p["rating"] ?? 0); if (r > 0) allR.push(r); }
      }
      const avg = allR.length > 0 ? allR.reduce((a, b) => a + b, 0) / allR.length : 0;
      if (avg > 0 && avg < minR) {
        alerts.push(`Note moyenne ${avg.toFixed(2)} sous l'objectif de ${minR}`);
      } else if (avg > 0 && avg < minR + 0.3) {
        alerts.push(`Note moyenne ${avg.toFixed(2)} — proche de la limite ${minR}`);
      }
    }
    return alerts;
  }, [activeSession]);

  const lastSession = useMemo(() => {
    const completed = sessions.filter((s) => !s.archived && s.matches.length > 0 && s.id !== activeSession?.id);
    if (completed.length === 0) return null;
    return completed.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  }, [sessions, activeSession]);

  const lastSessionStats = useMemo(() => {
    if (!lastSession) return null;
    const wld = sessionWLD(lastSession.matches, lastSession.clubId);
    const kpis = sessionKpis(lastSession.matches, lastSession.clubId);
    const mvps = sessionMvpStats(lastSession.matches, lastSession.clubId);
    const sorted = [...lastSession.matches].sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
    const formData = sorted.map((m, i) => {
      const r = matchResult(m, lastSession.clubId);
      return { n: i + 1, pts: r === "W" ? 3 : r === "D" ? 1 : 0, r };
    });
    return { wld, kpis, mvps, formData };
  }, [lastSession]);

  const activeStats = useMemo(() => {
    if (!activeSession || !currentClub) return null;
    return {
      wld: sessionWLD(activeSession.matches, activeSession.clubId),
      kpis: sessionKpis(activeSession.matches, activeSession.clubId),
      duration: Math.round((Date.now() - new Date(activeSession.date).getTime()) / 60000),
    };
  }, [activeSession, currentClub]);

  return (
    <div ref={contentRef} className="session-dashboard">
      <div className="session-left-col">

      {/* ── No club ── */}
      {!currentClub && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1,
          color: "var(--muted)", fontSize: 13 }}>
          {t("session.loadClubFirst")}
        </div>
      )}

      {/* ── Active session: match list ──────────────────────────────────── */}
      {activeSession && activeSession.matches.length > 0 && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.12em",
            fontFamily: "'Bebas Neue', sans-serif", marginBottom: 8 }}>{t("session.matchesPlayed")}</div>
          {[...activeSession.matches].reverse().map((m) => {
            const clubData = currentClub ? (m.clubs[currentClub.id] as Record<string, unknown>) : null;
            const goals    = clubData?.["goals"] ?? "?";
            const r        = currentClub ? matchResult(m, currentClub.id) : "D";
            return (
              <div key={m.matchId} style={{ display: "flex", alignItems: "center", gap: 8,
                padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                <Badge result={r} />
                <span style={{ fontSize: 12, color: "var(--text)" }}>{String(goals)} {t("session.goalCount")}</span>
                <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto" }}>{m.matchType}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Win rate chart ──────────────────────────────────────────────── */}
      {winRateData.length >= 2 && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.12em",
            fontFamily: "'Bebas Neue', sans-serif", marginBottom: 10, display: "flex", alignItems: "center", gap: 5 }}>
            <TrendingUp size={11} /> {t("session.winRateChart")}
          </div>
          <ResponsiveContainer width="100%" height={100}>
            <LineChart data={winRateData} margin={{ top: 4, right: 8, left: -28, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: "var(--muted)" }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "var(--muted)" }} unit="%" />
              <Tooltip
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 11 }}
                formatter={(v: unknown) => [`${v}%`, t("session.goal")]}
                labelFormatter={(_l: unknown, payload: unknown) => {
                  const p = payload as Array<{ payload?: { date?: string } }>;
                  return p?.[0]?.payload?.date ?? "";
                }}
              />
              <Line type="monotone" dataKey="rate" stroke="var(--accent)" strokeWidth={2}
                dot={{ r: 3, fill: "var(--accent)" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Comparaison inter-sessions ─────────────────────────────────── */}
      {sessions.filter((s) => !s.archived && s.matches.length > 0).length >= 2 && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: showCompare ? 10 : 0 }}>
            <span style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.12em",
              fontFamily: "'Bebas Neue', sans-serif", display: "flex", alignItems: "center", gap: 5 }}>
              ⚖️ COMPARER 2 SESSIONS
            </span>
            <button onClick={() => setShowCompare((v) => !v)}
              style={{ background: "none", border: "none", cursor: "pointer", color: showCompare ? "var(--accent)" : "var(--muted)", fontSize: 13 }}>
              {showCompare ? "▾" : "▸"}
            </button>
          </div>
          {showCompare && (() => {
            const eligibleSessions = sessions.filter((s) => !s.archived && s.matches.length > 0);
            const sesA = eligibleSessions.find((s) => s.id === compareA) ?? null;
            const sesB = eligibleSessions.find((s) => s.id === compareB) ?? null;

            // Build chart data: cumulative wins per match for each session
            const buildCurve = (s: SessionType) =>
              s.matches.map((m, i) => {
                const r = matchResult(m, s.clubId);
                const prev = i > 0 ? (s.matches.slice(0, i).filter((mm) => matchResult(mm, s.clubId) === "W").length) : 0;
                return { n: i + 1, v: prev + (r === "W" ? 1 : 0) };
              });
            const curveA = sesA ? buildCurve(sesA) : [];
            const curveB = sesB ? buildCurve(sesB) : [];
            const maxLen = Math.max(curveA.length, curveB.length);
            const chartData = Array.from({ length: maxLen }, (_, i) => ({
              n: i + 1,
              a: curveA[i]?.v ?? null,
              b: curveB[i]?.v ?? null,
            }));

            const wldA = sesA ? sessionWLD(sesA.matches, sesA.clubId) : null;
            const wldB = sesB ? sessionWLD(sesB.matches, sesB.clubId) : null;

            return (
              <div>
                {/* Selectors */}
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  {([
                    { val: compareA, set: setCompareA, color: "var(--accent)", label: "Session A" },
                    { val: compareB, set: setCompareB, color: "#a855f7",       label: "Session B" },
                  ] as const).map((slot) => (
                    <select key={slot.label} value={slot.val} onChange={(e) => slot.set(e.target.value)}
                      style={{ flex: 1, background: "var(--bg)", border: `1px solid ${slot.color}`,
                        color: "var(--text)", padding: "5px 8px", borderRadius: 6, fontSize: 11,
                        outline: "none", cursor: "pointer" }}>
                      <option value="">{slot.label}…</option>
                      {eligibleSessions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {new Date(s.date).toLocaleDateString()} · {s.clubName} ({s.matches.length}M)
                        </option>
                      ))}
                    </select>
                  ))}
                </div>

                {/* Stats comparison row */}
                {sesA && sesB && wldA && wldB && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "4px 10px",
                    marginBottom: 10, padding: "8px 10px", background: "var(--bg)",
                    borderRadius: 6, border: "1px solid var(--border)" }}>
                    {[
                      { label: "Matchs", a: sesA.matches.length, b: sesB.matches.length },
                      { label: "V", a: wldA.w, b: wldB.w },
                      { label: "N", a: wldA.d, b: wldB.d },
                      { label: "D", a: wldA.l, b: wldB.l },
                      { label: "% V", a: Math.round((wldA.w / sesA.matches.length) * 100), b: Math.round((wldB.w / sesB.matches.length) * 100) },
                    ].map(({ label, a, b }) => (
                      <div key={label} style={{ display: "contents" }}>
                        <div style={{ textAlign: "right", fontSize: 13, fontFamily: "'Bebas Neue', sans-serif",
                          color: a > b ? "var(--accent)" : a < b ? "var(--muted)" : "var(--text)" }}>{a}{label === "% V" ? "%" : ""}</div>
                        <div style={{ textAlign: "center", fontSize: 9, color: "var(--muted)",
                          fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.06em", alignSelf: "center" }}>{label}</div>
                        <div style={{ textAlign: "left", fontSize: 13, fontFamily: "'Bebas Neue', sans-serif",
                          color: b > a ? "#a855f7" : b < a ? "var(--muted)" : "var(--text)" }}>{b}{label === "% V" ? "%" : ""}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Overlaid chart */}
                {sesA && sesB && chartData.length > 0 && (
                  <ResponsiveContainer width="100%" height={120}>
                    <LineChart data={chartData} margin={{ top: 4, right: 8, left: -28, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="n" tick={{ fontSize: 9, fill: "var(--muted)" }} label={{ value: "Match", fontSize: 9, fill: "var(--muted)", position: "insideBottomRight", offset: -4 }} />
                      <YAxis tick={{ fontSize: 9, fill: "var(--muted)" }} />
                      <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 11 }}
                        formatter={(v: number | string, name: string) => [String(v) + " V", name === "a" ? sesA.clubName : sesB.clubName]} />
                      <Line type="monotone" dataKey="a" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                      <Line type="monotone" dataKey="b" stroke="#a855f7" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                )}
                {(!sesA || !sesB) && (
                  <p style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", margin: "8px 0 0" }}>Sélectionne deux sessions pour comparer</p>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Historique des objectifs ──────────────────────────────────── */}
      {goalHistoryData && goalHistoryData.entries.length >= 2 && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: showGoalHistory ? 10 : 0 }}>
            <span style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.12em",
              fontFamily: "'Bebas Neue', sans-serif", display: "flex", alignItems: "center", gap: 5 }}>
              <Flag size={11} /> HISTORIQUE DES OBJECTIFS
              <span style={{ color: goalHistoryData.rate >= 50 ? "var(--green)" : "var(--red)", fontWeight: 700, fontSize: 11 }}>
                {goalHistoryData.rate}%
              </span>
              <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 400 }}>
                ({goalHistoryData.achieved}/{goalHistoryData.total})
              </span>
            </span>
            <button onClick={() => setShowGoalHistory((v) => !v)}
              style={{ background: "none", border: "none", cursor: "pointer", color: showGoalHistory ? "var(--accent)" : "var(--muted)", fontSize: 13 }}>
              {showGoalHistory ? "▾" : "▸"}
            </button>
          </div>
          {showGoalHistory && (
            <div>
              <ResponsiveContainer width="100%" height={100}>
                <LineChart data={goalHistoryData.entries} margin={{ top: 4, right: 8, left: -28, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: "var(--muted)" }} />
                  <YAxis tick={{ fontSize: 9, fill: "var(--muted)" }} />
                  <Tooltip
                    contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 11 }}
                    formatter={(v: unknown, name: unknown) => [String(v), name === "goal" ? "Objectif" : "Victoires"]}
                    labelFormatter={(_l: unknown, payload: unknown) => {
                      const p = payload as Array<{ payload?: { date?: string } }>;
                      return p?.[0]?.payload?.date ?? "";
                    }}
                  />
                  <Line type="monotone" dataKey="goal" stroke="var(--gold)" strokeWidth={1} strokeDasharray="5 3" dot={false} />
                  <Line type="monotone" dataKey="wins" stroke="var(--green)" strokeWidth={2}
                    dot={(props: Record<string, unknown>) => {
                      const cx = Number(props.cx ?? 0);
                      const cy = Number(props.cy ?? 0);
                      const payload = props.payload as { hit?: boolean } | undefined;
                      return <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={4}
                        fill={payload?.hit ? "var(--green)" : "var(--red)"} stroke="none" />;
                    }} />
                </LineChart>
              </ResponsiveContainer>
              {/* Detail table */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                {goalHistoryData.entries.map((e) => (
                  <div key={e.name} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10,
                    border: `1px solid ${e.hit ? "var(--green)" : "var(--red)"}`,
                    background: e.hit ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                    color: e.hit ? "var(--green)" : "var(--red)" }}>
                    {e.name}: {e.wins}/{e.goal}V {e.hit ? "✓" : "✗"}
                    {e.advMaxHit != null && <span style={{ marginLeft: 4 }}>{e.advMaxHit ? "D✓" : "D✗"}</span>}
                    {e.advRatHit != null && <span style={{ marginLeft: 4 }}>{e.advRatHit ? "★✓" : "★✗"}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Radar de session ───────────────────────────────────────────── */}
      {sessions.filter((s) => !s.archived && s.matches.length > 0).length >= 1 && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: showRadar ? 10 : 0 }}>
            <span style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.12em",
              fontFamily: "'Bebas Neue', sans-serif", display: "flex", alignItems: "center", gap: 5 }}>
              📊 RADAR DE SESSION
            </span>
            <button onClick={() => setShowRadar((v) => !v)}
              style={{ background: "none", border: "none", cursor: "pointer", color: showRadar ? "var(--accent)" : "var(--muted)", fontSize: 13 }}>
              {showRadar ? "▾" : "▸"}
            </button>
          </div>
          {showRadar && (
            <div>
              <select value={radarSessionId}
                onChange={(e) => setRadarSessionId(e.target.value)}
                style={{ width: "100%", background: "var(--bg)", border: "1px solid var(--border)",
                  color: "var(--text)", padding: "5px 8px", borderRadius: 6, fontSize: 11,
                  outline: "none", cursor: "pointer", marginBottom: 10 }}>
                <option value="">Dernière session</option>
                {sessions.filter((s) => !s.archived && s.matches.length > 0).map((s) => (
                  <option key={s.id} value={s.id}>
                    {new Date(s.date).toLocaleDateString()} · {s.clubName} ({s.matches.length}M)
                  </option>
                ))}
              </select>
              {radarData && (
                <>
                  <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", marginBottom: 4 }}>
                    {radarData.session.clubName} — {new Date(radarData.session.date).toLocaleDateString()} ({radarData.session.matches.length} matchs)
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <RadarChart data={radarData.data}>
                      <PolarGrid stroke="var(--border)" />
                      <PolarAngleAxis dataKey="stat" tick={{ fontSize: 10, fill: "var(--muted)" }} />
                      <PolarRadiusAxis domain={[0, 10]} tick={false} axisLine={false} />
                      <Radar dataKey="value" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.25} strokeWidth={2} />
                    </RadarChart>
                  </ResponsiveContainer>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Fusion de sessions ─────────────────────────────────────────── */}
      {sessions.filter((s) => !s.archived && s.matches.length > 0).length >= 2 && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: showMerge ? 10 : 0 }}>
            <span style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.12em",
              fontFamily: "'Bebas Neue', sans-serif", display: "flex", alignItems: "center", gap: 5 }}>
              <Merge size={11} /> FUSIONNER DES SESSIONS
            </span>
            <button onClick={() => { setShowMerge((v) => !v); setMergeSelected(new Set()); setMergeLabelInput(""); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: showMerge ? "var(--accent)" : "var(--muted)", fontSize: 13 }}>
              {showMerge ? "▾" : "▸"}
            </button>
          </div>
          {showMerge && (() => {
            const eligible = sessions.filter((s) => !s.archived && s.matches.length > 0);
            return (
              <div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8 }}>
                  Sélectionne les sessions à fusionner en une session "tournoi" :
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 200, overflowY: "auto", marginBottom: 10 }}>
                  {eligible.map((s) => {
                    const checked = mergeSelected.has(s.id);
                    const wld = sessionWLD(s.matches, s.clubId);
                    return (
                      <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px",
                        background: checked ? "rgba(0,212,255,0.06)" : "var(--bg)",
                        border: `1px solid ${checked ? "var(--accent)" : "var(--border)"}`,
                        borderRadius: 6, cursor: "pointer", fontSize: 11, color: "var(--text)" }}>
                        <input type="checkbox" checked={checked}
                          onChange={() => {
                            const next = new Set(mergeSelected);
                            if (checked) next.delete(s.id); else next.add(s.id);
                            setMergeSelected(next);
                          }}
                          style={{ accentColor: "var(--accent)" }} />
                        <span style={{ flex: 1 }}>
                          {new Date(s.date).toLocaleDateString()} · {s.clubName} · {s.matches.length}M
                        </span>
                        <span style={{ color: "#23a559" }}>{wld.w}V</span>
                        <span style={{ color: "var(--muted)" }}>{wld.d}N</span>
                        <span style={{ color: "#da373c" }}>{wld.l}D</span>
                      </label>
                    );
                  })}
                </div>
                {mergeSelected.size >= 2 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input value={mergeLabelInput} onChange={(e) => setMergeLabelInput(e.target.value)}
                      placeholder="Nom du tournoi (optionnel)"
                      style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--border)",
                        color: "var(--text)", padding: "5px 8px", borderRadius: 5, fontSize: 11, outline: "none" }} />
                    <button onClick={() => {
                      mergeSessions(Array.from(mergeSelected), mergeLabelInput.trim());
                      persistSettings();
                      setMergeSelected(new Set());
                      setMergeLabelInput("");
                      setShowMerge(false);
                      addToast(`${mergeSelected.size} sessions fusionnées`, "success");
                    }}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 14px",
                      background: "rgba(0,212,255,0.12)", border: "1px solid rgba(0,212,255,0.3)",
                      borderRadius: 7, color: "var(--accent)", fontSize: 12, cursor: "pointer" }}>
                      <Merge size={12} /> Fusionner ({mergeSelected.size})
                    </button>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Past sessions ───────────────────────────────────────────────── */}
      {sessions.length > 0 && (
        <>
          {/* Header row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.12em",
              fontFamily: "'Bebas Neue', sans-serif", flex: 1 }}>
              {t("session.pastSessions")} {allVisible.length > 0 ? `(${allVisible.length})` : ""}
            </span>
            <button onClick={() => { setShowArchived((v) => !v); setPage(0); }} style={{ ...BTN }}>
              <Archive size={11} /> {showArchived ? t("session.activeLabel") : t("session.archivedLabel")}
            </button>
            <button onClick={() => setExportModal("png")} style={{ ...BTN }}>
              <Download size={11} /> PNG
            </button>
            <button onClick={() => setExportModal("csv")} style={{ ...BTN }}>
              <Download size={11} /> CSV
            </button>
            <button
              onClick={() => {
                const clubName = sessions[0]?.clubName ?? "Club";
                generateWeeklyReport(sessions, clubName).catch(() => {});
              }}
              title="Télécharger le rapport de la semaine en cours (PDF)"
              style={{ ...BTN }}>
              <Download size={11} /> Rapport semaine
            </button>
          </div>

          {/* Tag filter chips */}
          {allTags.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              <button
                onClick={() => { setTagFilter(null); setPage(0); }}
                style={{
                  padding: "3px 10px", borderRadius: 12, fontSize: 10, cursor: "pointer",
                  border: `1px solid ${tagFilter === null ? "var(--accent)" : "var(--border)"}`,
                  background: tagFilter === null ? "rgba(0,212,255,0.15)" : "var(--card)",
                  color: tagFilter === null ? "var(--accent)" : "var(--muted)",
                }}>
                Tous
              </button>
              {allTags.map((tag) => (
                <button key={tag}
                  onClick={() => { setTagFilter(tagFilter === tag ? null : tag); setPage(0); }}
                  style={{
                    padding: "3px 10px", borderRadius: 12, fontSize: 10, cursor: "pointer",
                    border: `1px solid ${tagFilter === tag ? "var(--accent)" : "var(--border)"}`,
                    background: tagFilter === tag ? "rgba(0,212,255,0.15)" : "var(--card)",
                    color: tagFilter === tag ? "var(--accent)" : "var(--muted)",
                  }}>
                  {tag}
                </button>
              ))}
            </div>
          )}

          {allVisible.length === 0 && (
            <div className="text-center text-xs py-8" style={{ color: "var(--muted)" }}>
              {showArchived ? t("session.noArchived") : t("session.noSessions")}
            </div>
          )}

          {/* ── Bento grid of session cards ─────────────────────────── */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            {visible.map((s) => {
              const k = sessionKpis(s.matches, s.clubId);
              const wld = sessionWLD(s.matches, s.clubId);
              const isEditingNote = editingNoteId === s.id;
              const isEditingTags = editingTagsId === s.id;
              const total = s.matches.length;
              const winRate = total > 0 ? Math.round((wld.w / total) * 100) : 0;
              const winRateColor = winRate >= 60 ? "var(--green)" : winRate >= 40 ? "var(--gold)" : "var(--red)";
              const recentResults = [...s.matches]
                .sort((a, b) => Number(a.timestamp) - Number(b.timestamp))
                .slice(-5)
                .map((m) => matchResult(m, s.clubId));
              const cardColor = wld.w > wld.l ? "#23a559" : wld.l > wld.w ? "#da373c" : "#faa81a";

              return (
                <div
                  key={s.id}
                  className="flex flex-col rounded-lg transition-all duration-200"
                  style={{ border: "1px solid var(--border)", background: "var(--card)", borderLeft: `4px solid ${cardColor}` }}
                  onMouseEnter={(e) => { e.currentTarget.style.boxShadow = `0 0 0 1px ${cardColor}44`; }}
                  onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; }}
                >
                  {/* ── Card header (clickable → detail) ── */}
                  <div className="px-6 pt-6 pb-4 cursor-pointer" style={{ borderBottom: "1px solid var(--border)" }}
                    onClick={() => setDetailSession(s)}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <div className="font-['Bebas_Neue'] text-xl tracking-wide truncate" style={{ color: "var(--text)" }}>{s.clubName}</div>
                        <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                          {new Date(s.date).toLocaleDateString()} · {total} match{total !== 1 ? "s" : ""}
                        </div>
                      </div>
                      {/* Win rate badge */}
                      <div className="flex-shrink-0 text-center px-2 py-0.5 rounded text-xs font-bold font-['Bebas_Neue'] tracking-wider"
                        style={{ color: winRateColor, border: `1px solid ${winRateColor}55`, background: winRateColor + "18" }}>
                        {winRate}%
                      </div>
                    </div>

                    {/* Forme pills */}
                    {recentResults.length > 0 && (
                      <div className="flex gap-1">
                        {recentResults.map((r, i) => {
                          const rc = r === "W" ? "var(--green)" : r === "L" ? "var(--red)" : "var(--muted)";
                          return (
                            <span key={i} className="w-6 h-6 rounded text-[10px] font-bold flex items-center justify-center"
                              style={{ background: rc + "22", color: rc, border: `1px solid ${rc}44` }}>{r}</span>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* ── KPI grid ── */}
                  <div className="px-6 py-4 grid grid-cols-2 gap-2">
                    {/* MJ — large */}
                    <div className="col-span-2 flex items-center gap-3 rounded-lg px-3 py-2" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                      <div>
                        <div className="font-['Bebas_Neue'] text-3xl leading-none" style={{ color: "var(--accent)" }}>{total}</div>
                        <div className="text-[9px] tracking-wider mt-0.5 font-['Bebas_Neue'] uppercase" style={{ color: "var(--muted)" }}>{t("players.gp")}</div>
                      </div>
                      <div className="flex-1 flex justify-end gap-3 text-center">
                        <div><div className="font-['Bebas_Neue'] text-2xl leading-none" style={{ color: "var(--green)" }}>{wld.w}</div><div className="text-[10px]" style={{ color: "var(--green)", opacity: 0.8 }}>V</div></div>
                        <div><div className="font-['Bebas_Neue'] text-2xl leading-none" style={{ color: "var(--gold)" }}>{wld.d}</div><div className="text-[10px]" style={{ color: "var(--gold)", opacity: 0.8 }}>N</div></div>
                        <div><div className="font-['Bebas_Neue'] text-2xl leading-none" style={{ color: "var(--red)" }}>{wld.l}</div><div className="text-[10px]" style={{ color: "var(--red)", opacity: 0.8 }}>D</div></div>
                      </div>
                    </div>

                    {/* Buts */}
                    <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                      <span className="text-base">⚽</span>
                      <div>
                        <div className="font-['Bebas_Neue'] text-xl leading-none" style={{ color: "var(--accent)" }}>{k.goals}</div>
                        <div className="text-[10px] tracking-wider" style={{ color: "var(--muted)" }}>{t("players.goals")}</div>
                      </div>
                    </div>

                    {/* PD */}
                    <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                      <span className="text-base">🅰️</span>
                      <div>
                        <div className="font-['Bebas_Neue'] text-xl leading-none" style={{ color: "#c4b5fd" }}>{k.assists}</div>
                        <div className="text-[10px] tracking-wider" style={{ color: "var(--muted)" }}>{t("players.assists")}</div>
                      </div>
                    </div>

                    {/* MOTM */}
                    <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                      <span className="text-base">★</span>
                      <div>
                        <div className="font-['Bebas_Neue'] text-xl leading-none" style={{ color: "var(--gold)" }}>{k.motm}</div>
                        <div className="text-[10px] tracking-wider" style={{ color: "var(--muted)" }}>{t("session.motm")}</div>
                      </div>
                    </div>

                    {/* Passes */}
                    <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                      <span className="text-base">🎯</span>
                      <div>
                        <div className="font-['Bebas_Neue'] text-xl leading-none" style={{ color: "#fb923c" }}>{k.passes}</div>
                        <div className="text-[10px] tracking-wider" style={{ color: "var(--muted)" }}>{t("players.passes")}</div>
                      </div>
                    </div>
                  </div>

                  {/* Tags display */}
                  {(s.tags ?? []).length > 0 && !isEditingTags && (
                    <div className="flex flex-wrap gap-1 px-4 pb-2">
                      {(s.tags ?? []).map((tag) => (
                        <span key={tag} className="px-2 py-0.5 rounded-full text-[9px]"
                          style={{ border: "1px solid var(--border)", color: "var(--muted)", background: "var(--surface)" }}>{tag}</span>
                      ))}
                    </div>
                  )}

                  {/* Notes display */}
                  {s.notes?.trim() && !isEditingNote && (
                    <div className="mx-4 mb-2 px-3 py-2 text-[10px] rounded-lg" style={{ color: "var(--muted)", background: "var(--surface)", borderLeft: "2px solid var(--accent)" }}>
                      {s.notes.length > 80 ? s.notes.slice(0, 80) + "…" : s.notes}
                    </div>
                  )}

                  {/* Tags editor */}
                  {isEditingTags && (
                    <div className="px-4 pb-3">
                      <div className="text-[9px] mb-2 tracking-wider" style={{ color: "var(--muted)" }}>{t("session.tags")}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {PRESET_TAGS.map((tag) => {
                          const active = (s.tags ?? []).includes(tag);
                          return (
                            <button key={tag} onClick={() => {
                              const cur = s.tags ?? [];
                              const next = active ? cur.filter((t2) => t2 !== tag) : [...cur, tag];
                              updateSession(s.id, { tags: next });
                              persistSettings();
                            }}
                              className="px-2.5 py-1 rounded-full text-[9px] cursor-pointer transition-colors"
                              style={{
                                border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                                background: active ? "var(--active)" : "var(--surface)",
                                color: active ? "var(--accent)" : "var(--muted)",
                              }}>
                              {tag}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Notes editor */}
                  {isEditingNote && (
                    <div className="px-4 pb-3">
                      <textarea value={noteValue} onChange={(e) => setNoteValue(e.target.value)}
                        placeholder={t("session.notesPlaceholder")} rows={3}
                        style={{ width: "100%", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", fontSize: 12, padding: "8px 10px", resize: "vertical", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
                        onFocus={(e) => { e.target.style.borderColor = "var(--accent)"; }}
                        onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }} />
                      <div className="flex gap-2 justify-end mt-2">
                        <button onClick={() => setEditingNoteId(null)}
                          style={{ padding: "4px 12px", fontSize: 10, border: "1px solid var(--border)", borderRadius: 6, color: "var(--muted)", background: "none", cursor: "pointer" }}>
                          {t("session.noThanks")}
                        </button>
                        <button onClick={() => { updateSession(s.id, { notes: noteValue }); persistSettings(); setEditingNoteId(null); }}
                          style={{ padding: "4px 12px", fontSize: 10, border: "1px solid var(--accent)", borderRadius: 6, color: "var(--accent)", background: "var(--active)", cursor: "pointer" }}>
                          ✓ Sauvegarder
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── Footer actions ── */}
                  <div className="mt-auto px-3 py-2 flex items-center gap-1.5 flex-wrap" style={{ borderTop: "1px solid var(--border)", background: "rgba(0,0,0,0.1)" }}>
                    <button onClick={() => setDetailSession(s)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                      style={{ color: "var(--accent)", background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.25)" }}>
                      <Info size={13} /> Détails
                    </button>
                    <button onClick={() => { if (isEditingNote) setEditingNoteId(null); else { setNoteValue(s.notes ?? ""); setEditingNoteId(s.id); } }}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                      style={{ color: isEditingNote ? "var(--accent)" : "var(--muted)", background: isEditingNote ? "var(--active)" : "var(--bg)", border: `1px solid ${isEditingNote ? "var(--accent)" : "var(--border)"}` }}>
                      <FileText size={13} /> Notes
                    </button>
                    <button onClick={() => setEditingTagsId(isEditingTags ? null : s.id)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                      style={{ color: isEditingTags ? "var(--accent)" : "var(--muted)", background: isEditingTags ? "var(--active)" : "var(--bg)", border: `1px solid ${isEditingTags ? "var(--accent)" : "var(--border)"}` }}>
                      <Tag size={13} /> Tags
                    </button>
                    {discordWebhook && (
                      <button onClick={() => shareToDiscord(s)} disabled={sharingId === s.id}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors disabled:opacity-40"
                        style={{ color: "#8b9cf4", background: "rgba(88,101,242,0.08)", border: "1px solid rgba(88,101,242,0.25)" }}>
                        <Send size={13} /> Discord
                      </button>
                    )}
                    <button onClick={() => { archiveSession(s.id); persistSettings(); }}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                      style={{ color: s.archived ? "var(--accent)" : "var(--muted)", background: s.archived ? "var(--active)" : "var(--bg)", border: `1px solid ${s.archived ? "var(--accent)" : "var(--border)"}` }}>
                      <Archive size={13} /> {s.archived ? "Désarchiver" : "Archiver"}
                    </button>
                    <button onClick={() => { deleteSession(s.id); persistSettings(); }}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ml-auto"
                      style={{ color: "var(--muted)", background: "var(--bg)", border: "1px solid var(--border)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = "var(--red)"; e.currentTarget.style.borderColor = "var(--red)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--muted)"; e.currentTarget.style.borderColor = "var(--border)"; }}>
                      <Trash2 size={13} /> Supprimer
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "8px 0" }}>
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0}
                style={{ ...BTN, opacity: safePage === 0 ? 0.4 : 1, cursor: safePage === 0 ? "default" : "pointer" }}>
                {"‹ " + t("session.prev")}
              </button>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>
                {safePage + 1} / {totalPages}
              </span>
              <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={safePage >= totalPages - 1}
                style={{ ...BTN, opacity: safePage >= totalPages - 1 ? 0.4 : 1, cursor: safePage >= totalPages - 1 ? "default" : "pointer" }}>
                {t("session.next") + " ›"}
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Export modals ──────────────────────────────────────────────── */}
      {exportModal === "png" && (
        <ExportModal type="png" pngSourceEl={contentRef.current}
          defaultFilename={`session-${dateStr}`} onClose={() => setExportModal(null)} />
      )}
      {exportModal === "csv" && (
        <ExportModal type="csv" csvHeaders={csvHeaders} csvRows={csvRows}
          defaultFilename={`sessions-${dateStr}`} onClose={() => setExportModal(null)} />
      )}

      {/* ── Session detail modal ───────────────────────────────────────── */}
      {detailSession && (() => {
        const s = detailSession;
        const kpis = sessionKpis(s.matches, s.clubId);
        const wld = sessionWLD(s.matches, s.clubId);
        const mvps = sessionMvpStats(s.matches, s.clubId);
        const bilColor = wld.w > wld.l ? "#23a559" : wld.l > wld.w ? "#da373c" : "#faa81a";
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center",
            justifyContent: "center", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
            onClick={() => setDetailSession(null)}>
            <div onClick={(e) => e.stopPropagation()} style={{
              background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12,
              width: 540, maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden",
            }}>
              {/* Modal header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
                <div>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: "var(--accent)",
                    letterSpacing: "0.1em" }}>{s.clubName}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>
                    {new Date(s.date).toLocaleDateString()} · {s.matches.length} match{s.matches.length !== 1 ? "s" : ""}
                    {(s.tags ?? []).length > 0 && (
                      <span style={{ marginLeft: 8 }}>
                        {(s.tags ?? []).map((tag) => (
                          <span key={tag} style={{ marginRight: 4, padding: "1px 6px", borderRadius: 8,
                            border: "1px solid var(--border)", fontSize: 9 }}>
                            {tag}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => setDetailSession(null)} style={{ background: "none", border: "none",
                  cursor: "pointer", color: "var(--muted)", padding: 4 }}>
                  <X size={18} />
                </button>
              </div>

              <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
                {/* Bilan + KPIs */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div style={{ background: "var(--bg)", borderRadius: 8, padding: "10px 14px",
                    border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.1em",
                      fontFamily: "'Bebas Neue', sans-serif", marginBottom: 6 }}>{t("session.bilan")}</div>
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: "#23a559" }}>{wld.w}V</span>
                      <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: "var(--muted)" }}>{wld.d}N</span>
                      <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: "#da373c" }}>{wld.l}D</span>
                      <span style={{ marginLeft: "auto", width: 8, height: 8, borderRadius: "50%",
                        background: bilColor, display: "inline-block" }} />
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                    {[
                      { label: "⚽", value: kpis.goals },
                      { label: "🅰️", value: kpis.assists },
                      { label: "★", value: kpis.motm },
                    ].map(({ label, value }) => (
                      <div key={label} style={{ background: "var(--bg)", borderRadius: 8, padding: "8px 4px",
                        border: "1px solid var(--border)", textAlign: "center" }}>
                        <div style={{ fontSize: 16 }}>{label}</div>
                        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: "var(--accent)" }}>{value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Notes in detail modal */}
                {s.notes?.trim() && (
                  <div style={{ background: "var(--bg)", borderRadius: 8, padding: "10px 12px",
                    border: "1px solid var(--border)", borderLeft: "3px solid var(--accent)" }}>
                    <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.1em",
                      fontFamily: "'Bebas Neue', sans-serif", marginBottom: 6 }}>📝 {t("session.notes")}</div>
                    <div style={{ fontSize: 12, color: "var(--text)", whiteSpace: "pre-wrap" }}>{s.notes}</div>
                  </div>
                )}

                {/* Analyse IA */}
                <AIPanel summary={generateSessionSummary(s)} />

                {/* Match list */}
                <div>
                  <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.12em",
                    fontFamily: "'Bebas Neue', sans-serif", marginBottom: 6 }}>{t("session.matchDetail")}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {[...s.matches].reverse().map((m, i) => {
                      const { ourGoals, oppGoals } = getMatchScore(m, s.clubId);
                      const r = matchResult(m, s.clubId);
                      const ts = Number(m.timestamp) * 1000;
                      return (
                        <div key={m.matchId ?? i} style={{ display: "flex", alignItems: "center", gap: 8,
                          padding: "7px 10px", background: "var(--bg)", borderRadius: 6,
                          border: "1px solid var(--border)" }}>
                          <Badge result={r} />
                          <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 17,
                            color: "var(--text)", letterSpacing: "0.05em" }}>
                            {ourGoals} – {oppGoals}
                          </span>
                          <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto" }}>
                            {m.matchType}
                          </span>
                          <span style={{ fontSize: 10, color: "var(--muted)" }}>
                            {ts ? new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Player stats */}
                {mvps.all.length > 0 && (
                  <div>
                    <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.12em",
                      fontFamily: "'Bebas Neue', sans-serif", marginBottom: 6 }}>{t("session.playerStats")}</div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ color: "var(--muted)", fontSize: 10 }}>
                          <th style={{ textAlign: "left", padding: "4px 6px", fontWeight: 500 }}>Joueur</th>
                          <th style={{ textAlign: "center", padding: "4px 6px", fontWeight: 500 }}>MJ</th>
                          <th style={{ textAlign: "center", padding: "4px 6px", fontWeight: 500 }}>⚽</th>
                          <th style={{ textAlign: "center", padding: "4px 6px", fontWeight: 500 }}>🅰️</th>
                          <th style={{ textAlign: "center", padding: "4px 6px", fontWeight: 500 }}>★</th>
                          <th style={{ textAlign: "center", padding: "4px 6px", fontWeight: 500 }}>{t("session.avgRating")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...mvps.all]
                          .sort((a, b) => b.goals - a.goals || b.assists - a.assists)
                          .map((p) => (
                            <tr key={p.name} style={{ borderTop: "1px solid var(--border)" }}>
                              <td style={{ padding: "5px 6px", color: "var(--text)", fontWeight: 500 }}>{p.name}</td>
                              <td style={{ padding: "5px 6px", textAlign: "center", color: "var(--muted)" }}>{p.games}</td>
                              <td style={{ padding: "5px 6px", textAlign: "center", color: p.goals > 0 ? "var(--accent)" : "var(--muted)" }}>{p.goals}</td>
                              <td style={{ padding: "5px 6px", textAlign: "center", color: p.assists > 0 ? "var(--accent)" : "var(--muted)" }}>{p.assists}</td>
                              <td style={{ padding: "5px 6px", textAlign: "center", color: p.motm > 0 ? "var(--gold)" : "var(--muted)" }}>{p.motm || "–"}</td>
                              <td style={{ padding: "5px 6px", textAlign: "center", color: "var(--muted)" }}>
                                {p.games > 0 ? (p.rating / p.games).toFixed(1) : "–"}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Action footer */}
              <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid var(--border)",
                justifyContent: "flex-end" }}>
                {discordWebhook && (
                  <button onClick={() => shareToDiscord(s)}
                    disabled={sharingId === s.id}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
                      background: "rgba(88,101,242,0.15)", border: "1px solid rgba(88,101,242,0.35)",
                      borderRadius: 7, color: "#8b9cf4", fontSize: 12, cursor: "pointer",
                      opacity: sharingId === s.id ? 0.5 : 1 }}>
                    <Send size={13} /> Discord
                  </button>
                )}
                <button onClick={() => { setDetailSession(null); setPdfModal(s); }}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
                    background: "rgba(0,212,255,0.12)", border: "1px solid rgba(0,212,255,0.3)",
                    borderRadius: 7, color: "var(--accent)", fontSize: 12, cursor: "pointer" }}>
                  <Download size={13} /> PDF
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      </div>{/* end session-left-col */}

      {/* ── Colonne droite ─────────────────────────────────────────────── */}
      <div className="session-right-col">

        {/* ── Objectifs en cours ────────────────────────────────────────── */}
        {currentClub && (
          <div style={{ background: "var(--tile-bg)", border: "1px solid var(--border-glass)", backdropFilter: "blur(8px)", borderRadius: 10, overflow: "hidden" }}>
            {/* Header */}
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border-glass)", display: "flex", alignItems: "center", gap: 6 }}>
              <Flag size={12} style={{ color: "var(--gold)" }} />
              <span style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.12em", fontFamily: "'Bebas Neue', sans-serif", flex: 1 }}>OBJECTIFS EN COURS</span>
              {activeSession && (
                <span style={{ fontSize: 9, color: "var(--accent)" }}>{activeSession.clubName}</span>
              )}
            </div>

            {activeSession ? (
              <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                {/* Victoires */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap", width: 80 }}>Victoires :</span>
                  <input
                    type="number" min={1}
                    value={goalInput !== "" ? goalInput : (activeSession.goal ?? "")}
                    placeholder="—"
                    onChange={(e) => setGoalInput(e.target.value)}
                    onBlur={() => {
                      const v = parseInt(goalInput);
                      setActiveSessionGoal(isNaN(v) ? undefined : v);
                      setGoalInput("");
                    }}
                    style={{ width: 48, background: "var(--bg)", border: "1px solid var(--border)",
                      color: "var(--text)", padding: "3px 6px", borderRadius: 4, fontSize: 12,
                      outline: "none", textAlign: "center" }}
                  />
                  {activeSession.goal != null && activeWLD && (
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontSize: 10, color: "var(--muted)" }}>{activeWLD.w}/{activeSession.goal}</span>
                        <span style={{ fontSize: 10, color: activeWLD.w >= activeSession.goal ? "var(--green)" : "var(--accent)" }}>
                          {Math.min(100, Math.round((activeWLD.w / activeSession.goal) * 100))}%
                        </span>
                      </div>
                      <div style={{ height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 2,
                          width: `${Math.min(100, (activeWLD.w / activeSession.goal) * 100)}%`,
                          background: activeWLD.w >= activeSession.goal ? "var(--green)" : "var(--accent)",
                          transition: "width 0.4s ease" }} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Buts */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap", width: 80 }}>Buts :</span>
                  <input
                    type="number" min={0}
                    value={advGoalsInput !== "" ? advGoalsInput : (activeSession.advancedGoals?.goalGoals ?? "")}
                    placeholder="—"
                    onChange={(e) => setAdvGoalsInput(e.target.value)}
                    onBlur={() => {
                      const v = parseInt(advGoalsInput);
                      setActiveSessionAdvancedGoals({ ...activeSession.advancedGoals, goalGoals: isNaN(v) ? undefined : v });
                      setAdvGoalsInput("");
                    }}
                    style={{ width: 48, background: "var(--bg)", border: "1px solid var(--border)",
                      color: "var(--text)", padding: "3px 6px", borderRadius: 4, fontSize: 12,
                      outline: "none", textAlign: "center" }}
                  />
                  {activeSession.advancedGoals?.goalGoals != null && kpis && (
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontSize: 10, color: "var(--muted)" }}>{kpis.goals}/{activeSession.advancedGoals.goalGoals}</span>
                        <span style={{ fontSize: 10, color: kpis.goals >= activeSession.advancedGoals.goalGoals ? "var(--green)" : "var(--accent)" }}>
                          {Math.min(100, Math.round((kpis.goals / activeSession.advancedGoals.goalGoals) * 100))}%
                        </span>
                      </div>
                      <div style={{ height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 2,
                          width: `${Math.min(100, (kpis.goals / activeSession.advancedGoals.goalGoals) * 100)}%`,
                          background: kpis.goals >= activeSession.advancedGoals.goalGoals ? "var(--green)" : "var(--accent)",
                          transition: "width 0.4s ease" }} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Passes décisives */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap", width: 80 }}>Passes D. :</span>
                  <input
                    type="number" min={0}
                    value={advAssistsInput !== "" ? advAssistsInput : (activeSession.advancedGoals?.goalAssists ?? "")}
                    placeholder="—"
                    onChange={(e) => setAdvAssistsInput(e.target.value)}
                    onBlur={() => {
                      const v = parseInt(advAssistsInput);
                      setActiveSessionAdvancedGoals({ ...activeSession.advancedGoals, goalAssists: isNaN(v) ? undefined : v });
                      setAdvAssistsInput("");
                    }}
                    style={{ width: 48, background: "var(--bg)", border: "1px solid var(--border)",
                      color: "var(--text)", padding: "3px 6px", borderRadius: 4, fontSize: 12,
                      outline: "none", textAlign: "center" }}
                  />
                  {activeSession.advancedGoals?.goalAssists != null && kpis && (
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontSize: 10, color: "var(--muted)" }}>{kpis.assists}/{activeSession.advancedGoals.goalAssists}</span>
                        <span style={{ fontSize: 10, color: kpis.assists >= activeSession.advancedGoals.goalAssists ? "var(--green)" : "#c4b5fd" }}>
                          {Math.min(100, Math.round((kpis.assists / activeSession.advancedGoals.goalAssists) * 100))}%
                        </span>
                      </div>
                      <div style={{ height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 2,
                          width: `${Math.min(100, (kpis.assists / activeSession.advancedGoals.goalAssists) * 100)}%`,
                          background: kpis.assists >= activeSession.advancedGoals.goalAssists ? "var(--green)" : "#8b5cf6",
                          transition: "width 0.4s ease" }} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Alertes */}
                {sessionAlerts.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {sessionAlerts.map((alert, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px",
                        background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.3)",
                        borderRadius: 6, fontSize: 10, color: "#eab308" }}>
                        <AlertTriangle size={11} style={{ flexShrink: 0 }} />
                        {alert}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding: "12px 14px" }}>
                <p style={{ fontSize: 11, color: "var(--muted)", textAlign: "center" }}>Lance une session pour suivre tes objectifs</p>
              </div>
            )}

            {/* Footer Discord */}
            {activeSession && discordWebhook && (
              <div style={{ padding: "8px 14px", borderTop: "1px solid var(--border-glass)", display: "flex", gap: 6 }}>
                <button
                  onClick={() => { setAutoPostSession(!autoPostSession); persistSettings(); }}
                  title={autoPostSession ? "Post auto Discord activé" : "Activer le post Discord automatique"}
                  style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px",
                    background: autoPostSession ? "rgba(88,101,242,0.2)" : "var(--card)",
                    border: `1px solid ${autoPostSession ? "rgba(88,101,242,0.5)" : "var(--border)"}`,
                    borderRadius: 6, color: autoPostSession ? "#8b9cf4" : "var(--muted)",
                    fontSize: 10, cursor: "pointer", transition: "all 0.15s", flex: 1, justifyContent: "center" }}
                >
                  <Send size={10} />
                  <span style={{ fontSize: 9, letterSpacing: "0.04em" }}>AUTO</span>
                </button>
                {activeSession.matches.length > 0 && (
                  <button onClick={shareLiveToDiscord}
                    disabled={sharingId === activeSession.id}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 12px", flex: 1, justifyContent: "center",
                      background: "rgba(88,101,242,0.15)", border: "1px solid rgba(88,101,242,0.35)",
                      borderRadius: 6, color: "#8b9cf4", fontSize: 11, cursor: "pointer",
                      opacity: sharingId === activeSession.id ? 0.5 : 1 }}>
                    <Send size={11} /> Live
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Session active : stats + stop ─────────────────────────────── */}
        {activeSession && activeStats && (
          <div style={{ background: "rgba(0,212,255,0.06)", border: "1px solid rgba(0,212,255,0.22)", borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 9, color: "var(--accent)", letterSpacing: "0.12em", fontFamily: "'Bebas Neue', sans-serif", marginBottom: 8 }}>
              SESSION EN COURS · {activeStats.duration}min
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 10 }}>
              {[
                { label: "V", value: activeStats.wld.w, color: "var(--green)" },
                { label: "N", value: activeStats.wld.d, color: "var(--gold)" },
                { label: "D", value: activeStats.wld.l, color: "var(--red)" },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ textAlign: "center", background: "var(--tile-bg)", border: "1px solid var(--border-glass)", borderRadius: 8, padding: "8px 4px" }}>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color, lineHeight: 1 }}>{value}</div>
                  <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 12 }}>
              {[
                { label: "Buts",  value: activeStats.kpis.goals   },
                { label: "PD",    value: activeStats.kpis.assists  },
                { label: "MOTM",  value: activeStats.kpis.motm     },
              ].map(({ label, value }) => (
                <div key={label} style={{ textAlign: "center", background: "var(--tile-bg)", border: "1px solid var(--border-glass)", borderRadius: 8, padding: "6px 4px" }}>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: "var(--accent)", lineHeight: 1 }}>{value}</div>
                  <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>
            <button onClick={handleStop} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              padding: "10px 0", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.35)",
              borderRadius: 8, color: "#ef4444", fontSize: 13, fontFamily: "'Bebas Neue', sans-serif",
              letterSpacing: "0.08em", cursor: "pointer" }}>
              <Square size={13} /> TERMINER LA SESSION
            </button>
          </div>
        )}

        {/* ── Pas de session active : bouton lancer + dernière session ── */}
        {!activeSession && currentClub && (
          <div style={{ background: "var(--tile-bg)", border: "1px solid var(--border-glass)", backdropFilter: "blur(8px)", borderRadius: 10, padding: 14, textAlign: "center" }}>
            <button
              onClick={() => startSession(currentClub)}
              style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 20px",
                background: "var(--active)", border: "1px solid var(--accent)", borderRadius: 8,
                color: "var(--accent)", fontSize: 13, fontFamily: "'Bebas Neue', sans-serif",
                letterSpacing: "0.06em", cursor: "pointer" }}>
              <Play size={14} /> {t("session.startBtn")}
            </button>
            {sessionTemplates.length > 0 && (
              <div style={{ marginTop: 12, borderTop: "1px solid var(--border-glass)", paddingTop: 12 }}>
                <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.12em",
                  fontFamily: "'Bebas Neue', sans-serif", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                  <Layers size={11} /> TEMPLATES
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
                  {sessionTemplates.map((tpl) => (
                    <div key={tpl.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <button
                        onClick={() => {
                          startSession(currentClub);
                          setTimeout(() => {
                            const s = useAppStore.getState();
                            if (s.activeSession) {
                              if (tpl.goal != null) s.setActiveSessionGoal(tpl.goal);
                              if (tpl.advancedGoals) s.setActiveSessionAdvancedGoals(tpl.advancedGoals);
                              if (tpl.tags || tpl.notes) {
                                const patch: Partial<SessionType> = {};
                                if (tpl.tags) patch.tags = tpl.tags;
                                if (tpl.notes) patch.notes = tpl.notes;
                                useAppStore.setState((prev) => ({
                                  activeSession: prev.activeSession ? { ...prev.activeSession, ...patch } : null,
                                }));
                              }
                            }
                          }, 50);
                        }}
                        style={{ padding: "5px 12px", borderRadius: 6, fontSize: 11, cursor: "pointer",
                          background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.25)",
                          color: "var(--accent)", display: "flex", alignItems: "center", gap: 4 }}>
                        <Play size={10} /> {tpl.name}
                      </button>
                      <button onClick={() => { deleteSessionTemplate(tpl.id); persistSettings(); }}
                        title="Supprimer template"
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 2, fontSize: 11 }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted)")}>
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Dernière session ──────────────────────────────────────────── */}
        {!activeSession && lastSession && lastSessionStats && (
          <div style={{ background: "var(--tile-bg)", border: "1px solid var(--border-glass)", backdropFilter: "blur(8px)", borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.12em", fontFamily: "'Bebas Neue', sans-serif", marginBottom: 6 }}>
              DERNIÈRE SESSION
            </div>
            <div style={{ fontSize: 12, color: "var(--text)", fontWeight: 600, marginBottom: 10 }}>
              {lastSession.clubName} · {new Date(lastSession.date).toLocaleDateString()}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 10 }}>
              {[
                { label: "VICTOIRES", value: lastSessionStats.wld.w, color: "var(--green)" },
                { label: "NULS",      value: lastSessionStats.wld.d, color: "var(--gold)" },
                { label: "DÉFAITES",  value: lastSessionStats.wld.l, color: "var(--red)" },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ textAlign: "center", background: "var(--tile-bg)", border: "1px solid var(--border-glass)", borderRadius: 8, padding: "8px 4px" }}>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color, lineHeight: 1 }}>{value}</div>
                  <div style={{ fontSize: 8, color: "var(--muted)", marginTop: 2, letterSpacing: "0.06em" }}>{label}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 10 }}>
              {[
                { label: "Buts",  value: lastSessionStats.kpis.goals   },
                { label: "PD",    value: lastSessionStats.kpis.assists  },
                { label: "MOTM",  value: lastSessionStats.kpis.motm     },
              ].map(({ label, value }) => (
                <div key={label} style={{ textAlign: "center", background: "var(--tile-bg)", border: "1px solid var(--border-glass)", borderRadius: 8, padding: "6px 4px" }}>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: "var(--accent)", lineHeight: 1 }}>{value}</div>
                  <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>
            {lastSessionStats.formData.length > 1 && (
              <>
                <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.12em", fontFamily: "'Bebas Neue', sans-serif", marginBottom: 6 }}>FORME</div>
                <ResponsiveContainer width="100%" height={80}>
                  <AreaChart data={lastSessionStats.formData} margin={{ top: 4, right: 4, left: -30, bottom: 0 }}>
                    <defs>
                      <linearGradient id="sess-form-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="n" tick={{ fill: "var(--muted)", fontSize: 8 }} />
                    <YAxis domain={[0, 3]} hide />
                    <Tooltip
                      contentStyle={{ background: "var(--tile-bg)", border: "1px solid var(--border-glass)", borderRadius: 6, fontSize: 10 }}
                      formatter={(v: unknown) => [v === 3 ? "V" : v === 1 ? "N" : "D", "Résultat"]}
                    />
                    <Area type="monotone" dataKey="pts" stroke="var(--accent)" strokeWidth={2.5} fill="url(#sess-form-fill)" dot={{ r: 2, fill: "var(--accent)", strokeWidth: 0 }} activeDot={{ r: 4 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </>
            )}
            {lastSessionStats.mvps.topScorer && lastSessionStats.mvps.topScorer.goals > 0 && (
              <div style={{ marginTop: 10, padding: "8px 10px", background: "var(--tile-bg)", border: "1px solid var(--border-glass)", borderRadius: 8 }}>
                <div style={{ fontSize: 9, color: "var(--gold)", letterSpacing: "0.1em", fontFamily: "'Bebas Neue', sans-serif", marginBottom: 4 }}>TOP BUTEUR</div>
                <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 600 }}>{lastSessionStats.mvps.topScorer.name}</div>
                <div style={{ fontSize: 11, color: "var(--accent)" }}>{lastSessionStats.mvps.topScorer.goals} ⚽</div>
              </div>
            )}
          </div>
        )}

      </div>{/* end session-right-col */}

      {/* ── PDF save modal (detail) ────────────────────────────────────── */}
      {pdfModal && (
        <PdfSaveModal
          filename={getSessionPdfFilename(pdfModal)}
          onConfirm={() => { generateSessionPdf(pdfModal); setPdfModal(null); }}
          onCancel={() => setPdfModal(null)}
        />
      )}

      {/* ── PDF prompt after session stop ─────────────────────────────── */}
      {pdfPrompt && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 100,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
        }} onClick={() => setPdfPrompt(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: "var(--card)", border: "1px solid var(--border)",
            borderRadius: 8, padding: 24, width: 340, textAlign: "center",
          }}>
            <Download size={28} style={{ color: "var(--accent)", marginBottom: 8 }} />
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: "var(--text)",
              letterSpacing: "0.06em", marginBottom: 4 }}>
              {t("session.ended")}
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>
              {pdfPrompt.matches.length} match{pdfPrompt.matches.length !== 1 ? "s" : ""} — {t("session.pdfQuestion")}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button onClick={() => { setPdfModal(pdfPrompt); setPdfPrompt(null); }}
                style={{
                  padding: "8px 18px", background: "rgba(0,212,255,0.15)",
                  border: "1px solid rgba(0,212,255,0.3)", borderRadius: 8,
                  color: "var(--accent)", fontSize: 13, cursor: "pointer", fontWeight: 600,
                }}>
                {t("session.exportPdfBtn")}
              </button>
              <button onClick={() => setPdfPrompt(null)}
                style={{
                  padding: "8px 18px", background: "var(--hover)",
                  border: "1px solid var(--border)", borderRadius: 8,
                  color: "var(--muted)", fontSize: 13, cursor: "pointer",
                }}>
                {t("session.noThanks")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
