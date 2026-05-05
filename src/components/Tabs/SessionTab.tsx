import { useRef, useState, useMemo } from "react";
import {
  Play, Square, Trophy, Trash2, Archive, Download, Crown, Target,
  Handshake, Send, Info, X, Tag, FileText, Flag, TrendingUp,
  Copy, Merge, AlertTriangle, Layers,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
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

// ── Sub-components ─────────────────────────────────────────────────────────

function KpiGrid({ kpis, t }: { kpis: ReturnType<typeof sessionKpis>; t: (key: string) => string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, marginTop: 10 }}>
      {[
        { label: t("players.goals"),   value: kpis.goals   },
        { label: t("players.assists"), value: kpis.assists },
        { label: t("players.passes"),  value: kpis.passes  },
        { label: t("players.tackles"), value: kpis.tackles },
        { label: t("session.motm"),    value: kpis.motm    },
      ].map(({ label, value }) => (
        <div key={label} style={{ textAlign: "center", background: "var(--bg)", borderRadius: 8,
          padding: "8px 4px", border: "1px solid var(--border)" }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: "var(--accent)", lineHeight: 1 }}>
            {value}
          </div>
          <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 3, letterSpacing: "0.06em" }}>{label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function SessionTab() {
  const t = useT();
  useSession();
  const {
    activeSession, sessions, currentClub, startSession, stopSession, persistSettings,
    deleteSession, archiveSession, updateSession, setActiveSessionGoal,
    setActiveSessionAdvancedGoals,
    discordWebhook, addToast,
    sessionTemplates, saveSessionTemplate, deleteSessionTemplate, mergeSessions,
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
  const [showAdvGoals, setShowAdvGoals] = useState(false);
  const [advMaxLossesInput, setAdvMaxLossesInput] = useState<string>("");
  const [advMinRatingInput, setAdvMinRatingInput] = useState<string>("");
  // Session comparison
  const [showCompare, setShowCompare] = useState(false);
  const [compareA, setCompareA] = useState<string>("");
  const [compareB, setCompareB] = useState<string>("");
  // Templates
  const [showTemplates, setShowTemplates] = useState(false);
  const [tplNameInput, setTplNameInput] = useState("");
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
  const mvps = useMemo(
    () => activeSession && activeSession.matches.length > 0
      ? sessionMvpStats(activeSession.matches, activeSession.clubId) : null,
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

  return (
    <div ref={contentRef} style={{ display: "flex", flexDirection: "column", height: "100%",
      overflowY: "auto", padding: 16, gap: 12 }}>

      {/* ── Active session ─────────────────────────────────────────────── */}
      {activeSession ? (
        <div style={{ background: "rgba(0,212,255,0.06)", border: "1px solid rgba(0,212,255,0.2)",
          borderRadius: 10, padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: "var(--accent)",
                letterSpacing: "0.1em" }}>
                {activeSession.clubName}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                {new Date(activeSession.date).toLocaleString()} · {activeSession.matches.length} match{activeSession.matches.length !== 1 ? "s" : ""}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {discordWebhook && (
                <button
                  onClick={() => { setAutoPostSession(!autoPostSession); persistSettings(); }}
                  title={autoPostSession ? "Post auto Discord activé — cliquer pour désactiver" : "Activer le post Discord automatique à la fin de session"}
                  style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px",
                    background: autoPostSession ? "rgba(88,101,242,0.2)" : "var(--card)",
                    border: `1px solid ${autoPostSession ? "rgba(88,101,242,0.5)" : "var(--border)"}`,
                    borderRadius: 6, color: autoPostSession ? "#8b9cf4" : "var(--muted)",
                    fontSize: 10, cursor: "pointer", transition: "all 0.15s" }}
                >
                  <Send size={10} />
                  <span style={{ fontSize: 9, letterSpacing: "0.04em" }}>AUTO</span>
                </button>
              )}
              {discordWebhook && activeSession.matches.length > 0 && (
                <button onClick={shareLiveToDiscord}
                  disabled={sharingId === activeSession.id}
                  title="Partager le bilan en cours"
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px",
                    background: "rgba(88,101,242,0.15)", border: "1px solid rgba(88,101,242,0.35)",
                    borderRadius: 7, color: "#8b9cf4", fontSize: 12, cursor: "pointer",
                    opacity: sharingId === activeSession.id ? 0.5 : 1 }}>
                  <Send size={12} /> Discord
                </button>
              )}
              <button onClick={handleStop} style={{ display: "flex", alignItems: "center", gap: 5,
                padding: "6px 12px", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)",
                borderRadius: 7, color: "#ef4444", fontSize: 12, cursor: "pointer" }}>
                <Square size={12} /> {t("session.end")}
              </button>
            </div>
          </div>

          {/* Objectifs — simple + avancés */}
          <div style={{ marginTop: 10 }}>
            {/* Ligne principale : victoires cibles */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Flag size={13} style={{ color: "var(--gold)", flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>
                {t("session.goalLabel")} :
              </span>
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
                    <span style={{ fontSize: 10, color: "var(--muted)" }}>{activeWLD.w} / {activeSession.goal} {t("session.goalProgress")}</span>
                    <span style={{ fontSize: 10, color: activeWLD.w >= activeSession.goal ? "var(--green)" : "var(--accent)" }}>
                      {Math.min(100, Math.round((activeWLD.w / activeSession.goal) * 100))}%
                    </span>
                  </div>
                  <div style={{ height: 5, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 3,
                      width: `${Math.min(100, (activeWLD.w / activeSession.goal) * 100)}%`,
                      background: activeWLD.w >= activeSession.goal ? "var(--green)" : "var(--accent)",
                      transition: "width 0.4s ease" }} />
                  </div>
                </div>
              )}
              <button onClick={() => setShowAdvGoals((v) => !v)}
                title="Objectifs avancés"
                style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px",
                  color: showAdvGoals ? "var(--accent)" : "var(--muted)", fontSize: 14, lineHeight: 1 }}>
                {showAdvGoals ? "▾" : "▸"}
              </button>
            </div>

            {/* Objectifs avancés */}
            {showAdvGoals && (
              <div style={{ marginTop: 8, padding: "10px 12px", background: "var(--bg)",
                borderRadius: 8, border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.1em",
                  fontFamily: "'Bebas Neue', sans-serif" }}>OBJECTIFS AVANCÉS</div>

                {/* Max défaites */}
                {(() => {
                  const maxL = activeSession.advancedGoals?.maxLosses;
                  const achieved = maxL != null && activeWLD ? activeWLD.l <= maxL : false;
                  return (
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: "var(--muted)", flex: 1 }}>Défaites max :</span>
                        <input type="number" min={0}
                          value={advMaxLossesInput !== "" ? advMaxLossesInput : (maxL ?? "")}
                          placeholder="—"
                          onChange={(e) => setAdvMaxLossesInput(e.target.value)}
                          onBlur={() => {
                            const v = parseInt(advMaxLossesInput);
                            setActiveSessionAdvancedGoals({ ...activeSession.advancedGoals, maxLosses: isNaN(v) ? undefined : v });
                            setAdvMaxLossesInput("");
                          }}
                          style={{ width: 40, background: "var(--card)", border: "1px solid var(--border)",
                            color: "var(--text)", padding: "2px 5px", borderRadius: 4, fontSize: 11,
                            outline: "none", textAlign: "center" }}
                        />
                        {maxL != null && activeWLD && (
                          <span style={{ fontSize: 10, color: achieved ? "var(--green)" : "var(--red)", fontWeight: 700 }}>
                            {activeWLD.l}D {achieved ? "✓" : "✗"}
                          </span>
                        )}
                      </div>
                      {maxL != null && activeWLD && (
                        <div style={{ height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ height: "100%", borderRadius: 2,
                            width: `${Math.min(100, (activeWLD.l / Math.max(1, maxL + 1)) * 100)}%`,
                            background: achieved ? "var(--green)" : "var(--red)", transition: "width 0.4s ease" }} />
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Note moy min */}
                {(() => {
                  const minR = activeSession.advancedGoals?.minRating;
                  const avgRating = (() => {
                    if (!activeSession.matches.length) return null;
                    const allRatings: number[] = [];
                    for (const m of activeSession.matches) {
                      const cps = m.players[activeSession.clubId] as Record<string, Record<string, unknown>> | undefined;
                      if (!cps) continue;
                      for (const p of Object.values(cps)) {
                        const r = Number(p["rating"] ?? 0);
                        if (r > 0) allRatings.push(r);
                      }
                    }
                    return allRatings.length ? allRatings.reduce((a, b) => a + b, 0) / allRatings.length : null;
                  })();
                  const achieved = minR != null && avgRating != null && avgRating >= minR;
                  return (
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: "var(--muted)", flex: 1 }}>Note moy. min :</span>
                        <input type="number" min={1} max={10} step={0.1}
                          value={advMinRatingInput !== "" ? advMinRatingInput : (minR ?? "")}
                          placeholder="—"
                          onChange={(e) => setAdvMinRatingInput(e.target.value)}
                          onBlur={() => {
                            const v = parseFloat(advMinRatingInput);
                            setActiveSessionAdvancedGoals({ ...activeSession.advancedGoals, minRating: isNaN(v) ? undefined : v });
                            setAdvMinRatingInput("");
                          }}
                          style={{ width: 40, background: "var(--card)", border: "1px solid var(--border)",
                            color: "var(--text)", padding: "2px 5px", borderRadius: 4, fontSize: 11,
                            outline: "none", textAlign: "center" }}
                        />
                        {minR != null && avgRating != null && (
                          <span style={{ fontSize: 10, color: achieved ? "var(--green)" : "var(--red)", fontWeight: 700 }}>
                            {avgRating.toFixed(2)} {achieved ? "✓" : "✗"}
                          </span>
                        )}
                      </div>
                      {minR != null && avgRating != null && (
                        <div style={{ height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ height: "100%", borderRadius: 2,
                            width: `${Math.min(100, (avgRating / 10) * 100)}%`,
                            background: achieved ? "var(--green)" : "#eab308", transition: "width 0.4s ease" }} />
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* ── Sauvegarder comme template ── */}
          {(activeSession.goal != null || (activeSession.tags ?? []).length > 0 || activeSession.advancedGoals) && (
            <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
              {showTemplates ? (
                <>
                  <input value={tplNameInput} onChange={(e) => setTplNameInput(e.target.value)}
                    placeholder="Nom du template"
                    style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--border)",
                      color: "var(--text)", padding: "4px 8px", borderRadius: 4, fontSize: 11, outline: "none" }} />
                  <button onClick={() => {
                    if (!tplNameInput.trim()) return;
                    saveSessionTemplate({
                      id: Date.now().toString(),
                      name: tplNameInput.trim(),
                      tags: activeSession.tags,
                      notes: activeSession.notes,
                      goal: activeSession.goal,
                      advancedGoals: activeSession.advancedGoals,
                    });
                    persistSettings();
                    setTplNameInput("");
                    setShowTemplates(false);
                    addToast("Template sauvegardé", "success");
                  }} style={{ ...BTN, color: "var(--accent)", border: "1px solid var(--accent)" }}>
                    ✓
                  </button>
                  <button onClick={() => setShowTemplates(false)} style={{ ...BTN }}>
                    <X size={11} />
                  </button>
                </>
              ) : (
                <button onClick={() => setShowTemplates(true)}
                  style={{ ...BTN, fontSize: 10, color: "var(--muted)" }}>
                  <Copy size={11} /> Sauvegarder comme template
                </button>
              )}
            </div>
          )}

          {/* ── Alertes en session ── */}
          {sessionAlerts.length > 0 && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
              {sessionAlerts.map((alert, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px",
                  background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.3)",
                  borderRadius: 6, fontSize: 11, color: "#eab308" }}>
                  <AlertTriangle size={13} style={{ flexShrink: 0 }} />
                  {alert}
                </div>
              ))}
            </div>
          )}

          {kpis && <KpiGrid kpis={kpis} t={t} />}

          {mvps && (mvps.topScorer || mvps.topAssister || mvps.topMotm) && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginTop: 8 }}>
              {[
                { icon: <Target size={13} />, label: t("session.topScorer"), player: mvps.topScorer, stat: mvps.topScorer ? `${mvps.topScorer.goals} ${t("session.goalCount")}` : "" },
                { icon: <Handshake size={13} />, label: t("session.topAssist"), player: mvps.topAssister, stat: mvps.topAssister ? `${mvps.topAssister.assists} ${t("players.assists")}` : "" },
                { icon: <Crown size={13} />, label: t("session.motm"), player: mvps.topMotm, stat: mvps.topMotm ? `${mvps.topMotm.motm}x` : "" },
              ].map(({ icon, label, player, stat }) => player && (player.goals > 0 || player.assists > 0 || player.motm > 0) ? (
                <div key={label} style={{ background: "var(--bg)", borderRadius: 8, padding: "8px 10px",
                  border: "1px solid var(--border)", textAlign: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginBottom: 4 }}>
                    <span style={{ color: "var(--gold)" }}>{icon}</span>
                    <span style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.06em", fontWeight: 600 }}>{label}</span>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 600 }}>{player.name}</div>
                  <div style={{ fontSize: 11, color: "var(--accent)", marginTop: 2 }}>{stat}</div>
                </div>
              ) : null)}
            </div>
          )}

          {activeSession.matches.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.12em",
                fontFamily: "'Bebas Neue', sans-serif", marginBottom: 6 }}>{t("session.matchesPlayed")}</div>
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
        </div>
      ) : currentClub ? (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginBottom: sessionTemplates.length > 0 ? 16 : 0 }}>
            <Trophy size={36} style={{ color: "var(--muted)" }} />
            <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>{t("session.noActive")}</p>
            <button onClick={() => startSession(currentClub)} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "8px 18px",
              background: "rgba(0,212,255,0.12)", border: "1px solid rgba(0,212,255,0.3)",
              borderRadius: 8, color: "var(--accent)", fontSize: 13, cursor: "pointer" }}>
              <Play size={14} /> {t("session.startBtn")}
            </button>
          </div>

          {/* ── Templates de session ── */}
          {sessionTemplates.length > 0 && (
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
              <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.12em",
                fontFamily: "'Bebas Neue', sans-serif", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
                <Layers size={11} /> TEMPLATES
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {sessionTemplates.map((tpl) => (
                  <div key={tpl.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <button
                      onClick={() => {
                        startSession(currentClub);
                        // Apply template after start via setTimeout to let state settle
                        setTimeout(() => {
                          const s = useAppStore.getState();
                          if (s.activeSession) {
                            if (tpl.goal != null) s.setActiveSessionGoal(tpl.goal);
                            if (tpl.advancedGoals) s.setActiveSessionAdvancedGoals(tpl.advancedGoals);
                            if (tpl.tags || tpl.notes) {
                              const patch: Partial<SessionType> = {};
                              if (tpl.tags) patch.tags = tpl.tags;
                              if (tpl.notes) patch.notes = tpl.notes;
                              // We update via set since it's the active session
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
      ) : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1,
          color: "var(--muted)", fontSize: 13 }}>
          {t("session.loadClubFirst")}
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
                        formatter={(v: any, name: any) => [String(v) + " V", name === "a" ? sesA.clubName : sesB.clubName]} />
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
            <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 12, padding: 16 }}>
              {showArchived ? t("session.noArchived") : t("session.noSessions")}
            </div>
          )}

          {visible.map((s) => {
            const k = sessionKpis(s.matches, s.clubId);
            const wld = sessionWLD(s.matches, s.clubId);
            const isEditingNote = editingNoteId === s.id;
            const isEditingTags = editingTagsId === s.id;

            return (
              <div key={s.id} style={{ background: "var(--card)", border: "1px solid var(--border)",
                borderRadius: 8, padding: 14 }}>
                {/* Card header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, color: "var(--text)",
                      letterSpacing: "0.06em" }}>{s.clubName}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                      <span>{new Date(s.date).toLocaleDateString()} · {s.matches.length} match{s.matches.length !== 1 ? "s" : ""}</span>
                      <span style={{ color: "#23a559", fontWeight: 600 }}>{wld.w}V</span>
                      <span style={{ color: "var(--muted)" }}>{wld.d}N</span>
                      <span style={{ color: "#da373c", fontWeight: 600 }}>{wld.l}D</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 5 }}>
                    <button onClick={() => setDetailSession(s)} title={t("session.details")}
                      style={{ ...BTN, color: "var(--accent)" }}>
                      <Info size={11} />
                    </button>
                    <button
                      onClick={() => {
                        if (isEditingNote) {
                          setEditingNoteId(null);
                        } else {
                          setNoteValue(s.notes ?? "");
                          setEditingNoteId(s.id);
                        }
                      }}
                      title={t("session.notes")}
                      style={{ ...BTN, color: isEditingNote ? "var(--accent)" : "var(--muted)" }}>
                      <FileText size={11} />
                    </button>
                    <button
                      onClick={() => setEditingTagsId(isEditingTags ? null : s.id)}
                      title={t("session.tags")}
                      style={{ ...BTN, color: isEditingTags ? "var(--accent)" : "var(--muted)" }}>
                      <Tag size={11} />
                    </button>
                    {discordWebhook && (
                      <button onClick={() => shareToDiscord(s)} title={t("discord.share")}
                        disabled={sharingId === s.id}
                        style={{ ...BTN, color: "var(--accent)", opacity: sharingId === s.id ? 0.5 : 1 }}>
                        <Send size={11} />
                      </button>
                    )}
                    <button onClick={() => { archiveSession(s.id); persistSettings(); }}
                      title={s.archived ? t("session.unarchive") : t("session.archive")}
                      style={{ ...BTN, color: (s.archived ? "var(--accent)" : "var(--muted)") as string }}>
                      <Archive size={11} />
                    </button>
                    <button onClick={() => { deleteSession(s.id); persistSettings(); }} title={t("misc.delete")}
                      style={{ ...BTN }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted)")}>
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>

                {/* KPI row */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4, textAlign: "center", marginBottom: 8 }}>
                  {[
                    { l: t("players.gp"),      v: s.matches.length },
                    { l: t("players.goals"),   v: k.goals          },
                    { l: t("players.assists"), v: k.assists        },
                    { l: t("players.passes"),  v: k.passes         },
                    { l: t("session.motm"),    v: k.motm           },
                  ].map(({ l, v }) => (
                    <div key={l}>
                      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, color: "var(--accent)" }}>{v}</div>
                      <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.06em" }}>{l}</div>
                    </div>
                  ))}
                </div>

                {/* Tags display */}
                {(s.tags ?? []).length > 0 && !isEditingTags && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
                    {(s.tags ?? []).map((tag) => (
                      <span key={tag} style={{
                        padding: "2px 8px", borderRadius: 10, fontSize: 10,
                        border: "1px solid var(--border)", color: "var(--muted)",
                        background: "var(--bg)",
                      }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Notes display */}
                {s.notes?.trim() && !isEditingNote && (
                  <div style={{
                    fontSize: 11, color: "var(--muted)", padding: "6px 8px",
                    background: "var(--bg)", borderRadius: 5, borderLeft: "2px solid var(--accent)",
                    marginBottom: 6,
                  }}>
                    {s.notes}
                  </div>
                )}

                {/* Tags editor */}
                {isEditingTags && (
                  <div style={{ marginTop: 8, padding: "10px 0 4px" }}>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6, letterSpacing: "0.06em" }}>
                      {t("session.tags")}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {PRESET_TAGS.map((tag) => {
                        const active = (s.tags ?? []).includes(tag);
                        return (
                          <button key={tag}
                            onClick={() => {
                              const cur = s.tags ?? [];
                              const next = active ? cur.filter((t2) => t2 !== tag) : [...cur, tag];
                              updateSession(s.id, { tags: next });
                              persistSettings();
                            }}
                            style={{
                              padding: "3px 10px", borderRadius: 10, fontSize: 10, cursor: "pointer",
                              border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                              background: active ? "rgba(0,212,255,0.15)" : "var(--card)",
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
                  <div style={{ marginTop: 8 }}>
                    <textarea
                      value={noteValue}
                      onChange={(e) => setNoteValue(e.target.value)}
                      placeholder={t("session.notesPlaceholder")}
                      rows={3}
                      style={{
                        width: "100%", background: "var(--bg)", border: "1px solid var(--border)",
                        color: "var(--text)", padding: "6px 8px", borderRadius: 5, fontSize: 11,
                        outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box",
                      }}
                    />
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 4 }}>
                      <button onClick={() => setEditingNoteId(null)} style={{ ...BTN }}>
                        {t("session.noThanks")}
                      </button>
                      <button
                        onClick={() => {
                          updateSession(s.id, { notes: noteValue });
                          persistSettings();
                          setEditingNoteId(null);
                        }}
                        style={{
                          ...BTN, color: "var(--accent)",
                          border: "1px solid var(--accent)", background: "rgba(0,212,255,0.1)",
                        }}>
                        ✓ Sauvegarder
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

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
            borderRadius: 12, padding: 24, width: 340, textAlign: "center",
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
