import { useState } from "react";
import { Send, Shield } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { useT } from "../../i18n";
import type { Match } from "../../types";
import { sendDiscordWebhook } from "../../api/discord";

export function formatDate(ts: string | number, locale: string) {
  const n = Number(ts) * 1000 || Number(ts);
  const d = new Date(isNaN(n) ? ts : n);
  if (isNaN(d.getTime())) return String(ts);
  return d.toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatDuration(secs?: number) {
  if (!secs) return "";
  const m = Math.floor(secs / 60), s = secs % 60;
  return `${m}min ${s}s`;
}

interface TeamStat { label: string; my: string | number; opp: string | number }

export function extractTeamStats(match: Match, clubId: string, t: (key: string) => string): TeamStat[] {
  const myData  = match.clubs[clubId] as Record<string, unknown> | undefined;
  const oppEntry = Object.entries(match.clubs).find(([k]) => k !== clubId);
  const oppData = oppEntry?.[1] as Record<string, unknown> | undefined;
  if (!myData || !oppData) return [];

  const statKeys: [string, string][] = [
    ["possession", t("matches.possession")],
    ["shots", t("matches.shots")],
    ["shotsOnTarget", t("matches.shotsOnTarget")],
    ["corners", t("matches.corners")],
    ["passesAttempted", t("matches.passesAttempted")],
    ["passesCompleted", t("matches.passesCompleted")],
    ["fouls", t("players.fouls")],
    ["offsides", t("matches.offsides")],
    ["tackles", t("players.tackles")],
  ];

  const stats: TeamStat[] = [];
  for (const [key, label] of statKeys) {
    const myVal  = myData[key]  ?? myData[key.toLowerCase()];
    const oppVal = oppData[key] ?? oppData[key.toLowerCase()];
    if (myVal !== undefined || oppVal !== undefined) {
      const fmt = (v: unknown) => {
        if (v === undefined || v === null) return "—";
        if (key === "possession") return `${v}%`;
        return String(v);
      };
      stats.push({ label, my: fmt(myVal), opp: fmt(oppVal) });
    }
  }
  return stats;
}

interface MatchEvent { type: "goal" | "assist" | "card" | "motm"; player: string; detail?: string }

export function extractMatchEvents(match: Match, clubId: string): MatchEvent[] {
  const clubPlayers = match.players[clubId] as Record<string, Record<string, unknown>> | undefined;
  if (!clubPlayers) return [];

  const events: MatchEvent[] = [];
  for (const p of Object.values(clubPlayers)) {
    const name = String(p["name"] ?? p["playername"] ?? p["playerName"] ?? "—");
    const goals = Number(p["goals"] ?? 0);
    for (let i = 0; i < goals; i++) events.push({ type: "goal", player: name });
    const assists = Number(p["assists"] ?? 0);
    for (let i = 0; i < assists; i++) events.push({ type: "assist", player: name });
    const yc = Number(p["yellowCards"] ?? p["yellowcards"] ?? 0);
    const rc = Number(p["redCards"] ?? p["redcards"] ?? 0);
    if (yc > 0) events.push({ type: "card", player: name, detail: `yellow:${yc}` });
    if (rc > 0) events.push({ type: "card", player: name, detail: `red:${rc}` });
    if (p["mom"] === "1" || p["manofthematch"] === "1") events.push({ type: "motm", player: name });
  }
  const order = { goal: 0, assist: 1, card: 2, motm: 3 };
  events.sort((a, b) => order[a.type] - order[b.type]);
  return events;
}

/* ─── Main component ─── */
export function MatchModal({ match, clubId, onClose }: { match: Match; clubId: string; onClose: () => void }) {
  const t = useT();
  const lang = useAppStore((s) => s.language);
  const discordWebhook = useAppStore((s) => s.discordWebhook);
  const addToast = useAppStore((s) => s.addToast);
  const [sharing, setSharing] = useState(false);
  const locale = lang === "fr" ? "fr-FR" : lang === "es" ? "es-ES" : lang === "de" ? "de-DE" : lang === "pt" ? "pt-BR" : "en-US";

  const myData   = match.clubs[clubId] as Record<string, unknown> | undefined;
  const oppEntry = Object.entries(match.clubs).find(([k]) => k !== clubId);
  const oppData  = oppEntry?.[1] as Record<string, unknown> | undefined;
  const oppDet   = oppData?.["details"] as Record<string, unknown> | undefined;
  const oppName  = String(oppDet?.["name"] ?? oppData?.["name"] ?? t("matches.opponent"));

  const myPlayers = Object.entries(
    (match.players[clubId] ?? {}) as Record<string, Record<string, unknown>>
  ).map(([, p]) => ({
    name:          String(p["name"] ?? p["playername"] ?? "—"),
    goals:         Number(p["goals"]   ?? 0),
    assists:       Number(p["assists"] ?? 0),
    passes:        Number(p["passesMade"] ?? p["passesmade"] ?? 0),
    tackles:       Number(p["tacklesMade"] ?? p["tacklesmade"] ?? 0),
    interceptions: Number(p["interceptions"] ?? 0),
    fouls:         Number(p["foulsCommited"] ?? p["foulscommited"] ?? 0),
    yellowCards:   Number(p["yellowCards"] ?? p["yellowcards"] ?? 0),
    redCards:      Number(p["redCards"] ?? p["redcards"] ?? 0),
    rating:        Number(p["rating"] ?? p["ratingAve"] ?? 0),
    motm:          p["mom"] === "1" || p["manofthematch"] === "1",
  })).sort((a, b) => b.rating - a.rating);

  const myGoals  = String(myData?.["goals"]  ?? "?");
  const oppGoals = String(oppData?.["goals"] ?? "?");
  const res = myData?.["wins"] === "1" ? "W" : myData?.["losses"] === "1" ? "L" : "D";
  const isVictory = res === "W";
  const isDraw = res === "D";

  const teamStats = extractTeamStats(match, clubId, t);
  const events = extractMatchEvents(match, clubId);

  const resultBadge = isVictory
    ? { label: t("match.win").toUpperCase(),  color: "var(--green)" }
    : isDraw
    ? { label: t("match.draw").toUpperCase(), color: "var(--gold)" }
    : { label: t("match.loss").toUpperCase(), color: "var(--red)" };

  const shareToDiscord = async () => {
    if (!discordWebhook) { addToast(t("discord.noWebhook"), "error"); return; }
    setSharing(true);
    try {
      const color = res === "W" ? 0x23a559 : res === "L" ? 0xda373c : 0xfaa81a;
      const eventsLine = events.map((ev) => {
        if (ev.type === "goal")   return `⚽ ${ev.player}`;
        if (ev.type === "assist") return `🅰️ ${ev.player}`;
        if (ev.type === "motm" && isVictory) return `★ ${ev.player}`;
        if (ev.type === "card")   return `${ev.detail?.startsWith("red") ? "🟥" : "🟨"} ${ev.player}`;
        return "";
      }).filter(Boolean).join("  ·  ");

      const showTackles = myPlayers.some((p) => p.tackles > 0);
      const showInterceptions = myPlayers.some((p) => p.interceptions > 0);
      const col = (s: string, w: number) => s.padEnd(w).slice(0, w);
      const header = [
        col("Joueur", 14), col("Note", 5), col("Buts", 5), col("PD", 4), col("Passes", 7),
        ...(showTackles ? [col("Tack.", 6)] : []),
        ...(showInterceptions ? [col("Int.", 5)] : []),
        "MOTM",
      ].join(" ");
      const divider = "-".repeat(header.length);
      const rows = myPlayers.map((p) => [
        col(p.name, 14), col(p.rating > 0 ? p.rating.toFixed(1) : "—", 5),
        col(p.goals   > 0 ? String(p.goals)   : "—", 5),
        col(p.assists > 0 ? String(p.assists) : "—", 4),
        col(String(p.passes), 7),
        ...(showTackles       ? [col(p.tackles       > 0 ? String(p.tackles)       : "—", 6)] : []),
        ...(showInterceptions ? [col(p.interceptions > 0 ? String(p.interceptions) : "—", 5)] : []),
        p.motm && isVictory ? "★" : "",
      ].join(" "));
      const tableBlock = "```\n" + [header, divider, ...rows].join("\n") + "\n```";

      const fields: { name: string; value: string; inline?: boolean }[] = [];
      if (eventsLine) fields.push({ name: "\u200b", value: eventsLine });
      fields.push({ name: "JOUEURS", value: tableBlock });

      await sendDiscordWebhook(discordWebhook, [{
        title: `${myGoals} — ${oppGoals}  ·  vs ${oppName}`,
        color,
        description: `${formatDate(match.timestamp, locale)}  **${resultBadge.label}**`,
        fields,
        footer: { text: "ProClubs Stats" },
      }]);
      addToast(t("discord.sent"), "success");
    } catch (e) { addToast(`Discord: ${String(e)}`, "error"); }
    finally { setSharing(false); }
  };

  /* ── helpers pour les joueurs adverses ── */
  const oppPlayers = Object.entries(
    (match.players[oppEntry?.[0] ?? ""] ?? {}) as Record<string, Record<string, unknown>>
  ).map(([, p]) => ({
    name:   String(p["name"] ?? p["playername"] ?? "—"),
    goals:  Number(p["goals"]   ?? 0),
    assists:Number(p["assists"] ?? 0),
    rating: Number(p["rating"]  ?? p["ratingAve"] ?? 0),
  })).sort((a, b) => b.rating - a.rating);

  const TILE = "rounded-xl bg-[#13151A]/80 backdrop-blur-2xl border border-white/5";

  const PlayerRow = ({ name, goals, assists, rating, rank, motm: isMOTM }: {
    name: string; goals: number; assists: number; rating: number; rank: number; motm: boolean;
  }) => (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${isMOTM && isVictory ? "bg-amber-500/5 border border-amber-500/20" : "bg-white/[0.025] border border-white/5"}`}>
      <span className="font-['Bebas_Neue'] text-xs w-5 text-center text-slate-500">{rank}</span>
      <span className="flex-1 text-sm font-semibold text-slate-100 truncate">{name}</span>
      {goals > 0 && <span className="text-xs text-slate-400">⚽{goals}</span>}
      {assists > 0 && <span className="text-xs text-slate-400">🅰️{assists}</span>}
      <span className="font-['Bebas_Neue'] text-base leading-none font-bold"
        style={{ color: rating >= 7.5 ? "#23a559" : rating >= 6.5 ? "#f59e0b" : rating > 0 ? "#da373c" : "#6b7280" }}>
        {rating > 0 ? rating.toFixed(1) : "—"}
      </span>
      {isMOTM && isVictory && <Shield size={12} className="text-amber-400 flex-shrink-0" />}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`relative w-full max-w-[900px] max-h-[92vh] overflow-y-auto rounded-2xl shadow-2xl shadow-black/50 ${TILE} border border-white/5`}
        style={{ animation: "fadeSlideIn 0.15s ease-out" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header : score hero ─────────────────────────────── */}
        <div className="relative px-6 pt-6 pb-5 text-center rounded-t-2xl bg-white/[0.02] border-b border-white/5">
          <div className="absolute top-4 right-4 flex items-center gap-2">
            {discordWebhook && (
              <button onClick={shareToDiscord} disabled={sharing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 cursor-pointer">
                <Send size={11} /> Discord
              </button>
            )}
            <button onClick={onClose} className="win-btn">✕</button>
          </div>

          <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold tracking-widest mb-3"
            style={{ background: resultBadge.color + "22", color: resultBadge.color, border: `1px solid ${resultBadge.color}44` }}>
            {resultBadge.label}
          </span>

          <div className="font-['Bebas_Neue'] text-8xl leading-none tracking-widest"
            style={{ textShadow: `0 0 60px ${resultBadge.color}44` }}>
            <span style={{ color: resultBadge.color }}>{myGoals}</span>
            <span className="mx-4 text-slate-600 text-6xl">—</span>
            <span className="text-slate-400">{oppGoals}</span>
          </div>

          <div className="mt-2 text-base font-semibold text-slate-200">vs {oppName}</div>
          <div className="mt-0.5 text-xs text-slate-500">
            {formatDate(match.timestamp, locale)}
            {match.matchDuration ? ` · ${formatDuration(match.matchDuration)}` : ""}
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* ── Layout 3 colonnes ─────────────────────────────── */}
          <div className="grid grid-cols-3 gap-4">

            {/* Col gauche — mes joueurs */}
            <div className={`${TILE} p-4 space-y-1.5`}>
              <p className="text-[9px] font-['Bebas_Neue'] tracking-widest text-slate-400 mb-3">MON ÉQUIPE</p>
              {myPlayers.length > 0 ? myPlayers.map((p, i) => (
                <PlayerRow key={i} rank={i+1} name={p.name} goals={p.goals} assists={p.assists} rating={p.rating} motm={p.motm} />
              )) : <p className="text-xs text-slate-500 text-center py-4">—</p>}
            </div>

            {/* Col centre — stats d'équipe */}
            <div className={`${TILE} p-4`}>
              <p className="text-[9px] font-['Bebas_Neue'] tracking-widest text-slate-400 mb-3 text-center">{t("matches.teamStats")}</p>
              {teamStats.length > 0 ? (
                <div className="space-y-1">
                  {teamStats.map(({ label, my, opp: oppStat }) => {
                    const nMy = Number(String(my).replace("%","")), nOpp = Number(String(oppStat).replace("%",""));
                    const myW = !isNaN(nMy) && !isNaN(nOpp) && nMy > nOpp;
                    const oppW = !isNaN(nMy) && !isNaN(nOpp) && nOpp > nMy;
                    return (
                      <div key={label} className="grid grid-cols-3 items-center py-1.5 border-b border-white/5 last:border-0">
                        <span className={`text-right text-sm font-['Bebas_Neue'] ${myW ? "text-[var(--accent)]" : "text-slate-200"}`}>{my}</span>
                        <span className="text-center text-[9px] tracking-wider font-['Bebas_Neue'] uppercase text-slate-500">{label}</span>
                        <span className={`text-left text-sm font-['Bebas_Neue'] ${oppW ? "text-red-400" : "text-slate-400"}`}>{oppStat}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-500 text-center py-8">Aucune stat d'équipe</p>
              )}
            </div>

            {/* Col droite — joueurs adverses */}
            <div className={`${TILE} p-4 space-y-1.5`}>
              <p className="text-[9px] font-['Bebas_Neue'] tracking-widest text-slate-400 mb-3">{oppName.toUpperCase()}</p>
              {oppPlayers.length > 0 ? oppPlayers.map((p, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.025] border border-white/5">
                  <span className="font-['Bebas_Neue'] text-xs w-5 text-center text-slate-500">{i+1}</span>
                  <span className="flex-1 text-sm font-semibold text-slate-300 truncate">{p.name}</span>
                  {p.goals > 0 && <span className="text-xs text-slate-400">⚽{p.goals}</span>}
                  {p.assists > 0 && <span className="text-xs text-slate-400">🅰️{p.assists}</span>}
                  <span className="font-['Bebas_Neue'] text-base leading-none font-bold"
                    style={{ color: p.rating >= 7.5 ? "#23a559" : p.rating >= 6.5 ? "#f59e0b" : p.rating > 0 ? "#da373c" : "#6b7280" }}>
                    {p.rating > 0 ? p.rating.toFixed(1) : "—"}
                  </span>
                </div>
              )) : <p className="text-xs text-slate-500 text-center py-4">Aucun joueur</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
