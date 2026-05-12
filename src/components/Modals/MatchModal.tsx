import { useState } from "react";
import { Send, Star, Shield } from "lucide-react";
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

  const hasInterceptions = myPlayers.some((p) => p.interceptions > 0);
  const hasTackles       = myPlayers.some((p) => p.tackles > 0);
  const hasFouls         = myPlayers.some((p) => p.fouls > 0);
  const hasCards         = myPlayers.some((p) => p.yellowCards > 0 || p.redCards > 0);

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.8)" }}
      onClick={onClose}
    >
      <div
        className="relative w-[680px] max-h-[90vh] overflow-y-auto rounded-lg shadow-2xl"
        style={{ background: "var(--main-bg)", border: "1px solid var(--border-glass)", backdropFilter: "blur(12px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Hero Scoreboard ─────────────────────────────────── */}
        <div className="relative overflow-hidden px-6 pt-6 pb-6 text-center"
          style={{ background: "var(--tile-bg)", borderBottom: "1px solid var(--border-glass)" }}>

          {/* Actions (top-right absolute) */}
          <div className="absolute top-4 right-4 flex items-center gap-2">
            {discordWebhook && (
              <button
                onClick={shareToDiscord}
                disabled={sharing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors disabled:opacity-40"
                style={{ border: "1px solid var(--border-glass)", background: "var(--active)", color: "var(--accent)" }}
              >
                <Send size={11} /> Discord
              </button>
            )}
            <button onClick={onClose} className="win-btn">✕</button>
          </div>

          {/* Result badge */}
          <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold tracking-widest mb-3"
            style={{ background: resultBadge.color + "22", color: resultBadge.color, border: `1px solid ${resultBadge.color}55` }}>
            {resultBadge.label}
          </span>

          {/* Score centré — pièce maîtresse */}
          <div className="font-['Bebas_Neue'] leading-none tracking-widest"
            style={{ fontSize: 88, color: "var(--text)", textShadow: `0 0 40px ${resultBadge.color}55` }}>
            <span style={{ color: resultBadge.color }}>{myGoals}</span>
            <span className="mx-3" style={{ color: "var(--muted)", fontSize: 60 }}>—</span>
            <span style={{ color: "var(--muted)" }}>{oppGoals}</span>
          </div>

          {/* Adversaire + date */}
          <div className="mt-2 text-base font-semibold" style={{ color: "var(--text)" }}>
            vs <span>{oppName}</span>
          </div>
          <div className="mt-0.5" style={{ fontSize: 11, color: "var(--muted)" }}>
            {formatDate(match.timestamp, locale)}
            {match.matchDuration ? ` · ${formatDuration(match.matchDuration)}` : ""}
          </div>
        </div>

        <div className="px-6 pb-6 space-y-4 mt-4">
          {/* ── Team stats ───────────────────────────────────── */}
          {teamStats.length > 0 && (
            <div>
              <p className="category-header mb-2">
                {t("matches.teamStats")}
              </p>
              <div className="rounded-lg" style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
                {teamStats.map(({ label, my, opp }, idx) => {
                  const nMy = Number(String(my).replace("%", "")), nOpp = Number(String(opp).replace("%", ""));
                  const myWins  = !isNaN(nMy) && !isNaN(nOpp) && nMy > nOpp;
                  const oppWins = !isNaN(nMy) && !isNaN(nOpp) && nOpp > nMy;
                  return (
                    <div key={label} className="grid grid-cols-3 items-center px-4 py-2"
                      style={idx > 0 ? { borderTop: "1px solid var(--border)" } : {}}>
                      <span className="text-right text-sm font-['Bebas_Neue']"
                        style={{ color: myWins ? "var(--accent)" : "var(--text)" }}>{my}</span>
                      <span className="text-center text-[9px] tracking-wider font-['Bebas_Neue'] uppercase"
                        style={{ color: "var(--muted)" }}>{label}</span>
                      <span className="text-left text-sm font-['Bebas_Neue']"
                        style={{ color: oppWins ? "var(--red)" : "var(--text)" }}>{opp}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Player list ──────────────────────────────────── */}
          {myPlayers.length > 0 ? (
            <div>
              <p className="category-header mb-2">
                {t("matches.playerStats")}
              </p>
              <div className="space-y-1.5">
                {/* Header row */}
                <div className="grid items-center gap-2 px-3 pb-1"
                  style={{ borderBottom: "1px solid var(--border)", gridTemplateColumns: "2.25rem 1fr 2.5rem 2.5rem 2.5rem 3rem 2.5rem" + (hasTackles ? " 2.5rem" : "") + (hasCards ? " 2.5rem" : "") + (isVictory ? " 2rem" : "") }}>
                  <div />
                  <div className="text-[9px] tracking-wider uppercase" style={{ color: "var(--muted)" }}>Joueur</div>
                  <div className="text-[9px] tracking-wider uppercase text-center" style={{ color: "var(--muted)" }}>Note</div>
                  <div className="text-[9px] tracking-wider uppercase text-center" style={{ color: "var(--muted)" }}>Buts</div>
                  <div className="text-[9px] tracking-wider uppercase text-center" style={{ color: "var(--muted)" }}>PD</div>
                  <div className="text-[9px] tracking-wider uppercase text-center" style={{ color: "var(--muted)" }}>Passes</div>
                  {hasTackles && <div className="text-[9px] tracking-wider uppercase text-center" style={{ color: "var(--muted)" }}>Tacles</div>}
                  {hasInterceptions && <div className="text-[9px] tracking-wider uppercase text-center" style={{ color: "var(--muted)" }}>Int.</div>}
                  {hasFouls && <div className="text-[9px] tracking-wider uppercase text-center" style={{ color: "var(--muted)" }}>Fts</div>}
                  {hasCards && <div className="text-[9px] tracking-wider uppercase text-center" style={{ color: "var(--muted)" }}>Cartons</div>}
                  {isVictory && <div className="text-[9px] tracking-wider uppercase text-center" style={{ color: "var(--muted)" }}><Star size={9} className="inline" /></div>}
                </div>

                {/* Player rows */}
                {myPlayers.map((p, i) => (
                  <div
                    key={i}
                    className="grid items-center gap-2 px-3 py-2.5 rounded-lg transition-colors"
                    style={{
                      border: p.motm && isVictory ? "1px solid #f59e0b44" : "1px solid var(--border-glass)",
                      background: p.motm && isVictory ? "#f59e0b0a" : "var(--tile-bg)",
                      backdropFilter: "blur(4px)",
                      gridTemplateColumns: "2.25rem 1fr 2.5rem 2.5rem 2.5rem 3rem 2.5rem" + (hasTackles ? " 2.5rem" : "") + (hasCards ? " 2.5rem" : "") + (isVictory ? " 2rem" : ""),
                    }}
                  >
                    <div className="flex items-center justify-center text-[11px] font-['Bebas_Neue'] tracking-wide" style={{ color: "var(--muted)" }}>
                      {i + 1}
                    </div>
                    <div className="min-w-0">
                      <span className="text-sm font-semibold truncate block" style={{ color: "var(--text)" }}>{p.name}</span>
                    </div>
                    <div className="flex justify-center">
                      <span className="font-['Bebas_Neue'] text-base font-bold leading-none" style={{ color: p.rating >= 7.5 ? "#23a559" : p.rating >= 6.5 ? "#f59e0b" : p.rating > 0 ? "#da373c" : "var(--muted)" }}>
                        {p.rating > 0 ? p.rating.toFixed(1) : "—"}
                      </span>
                    </div>
                    <div className="text-center text-sm font-bold" style={{ color: "var(--accent)" }}>{p.goals || <span className="font-normal" style={{ color: "var(--muted)" }}>—</span>}</div>
                    <div className="text-center text-sm font-bold" style={{ color: "#c4b5fd" }}>{p.assists || <span className="font-normal" style={{ color: "var(--muted)" }}>—</span>}</div>
                    <div className="text-center text-sm font-medium" style={{ color: "var(--text)" }}>{p.passes || <span style={{ color: "var(--muted)" }}>—</span>}</div>
                    {hasTackles && <div className="text-center text-sm" style={{ color: "var(--text)" }}>{p.tackles || <span style={{ color: "var(--muted)" }}>—</span>}</div>}
                    {hasInterceptions && <div className="text-center text-sm" style={{ color: "var(--text)" }}>{p.interceptions || <span style={{ color: "var(--muted)" }}>—</span>}</div>}
                    {hasFouls && <div className="text-center text-sm" style={{ color: "var(--text)" }}>{p.fouls || <span style={{ color: "var(--muted)" }}>—</span>}</div>}
                    {hasCards && (
                      <div className="flex justify-center items-center gap-1">
                        {p.yellowCards > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold" style={{ color: "#fcd34d" }}>
                            <span className="w-2 h-3 rounded-sm bg-yellow-400 inline-block" />{p.yellowCards}
                          </span>
                        )}
                        {p.redCards > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold" style={{ color: "#fca5a5" }}>
                            <span className="w-2 h-3 rounded-sm bg-red-500 inline-block" />{p.redCards}
                          </span>
                        )}
                        {!p.yellowCards && !p.redCards && <span className="text-sm" style={{ color: "var(--muted)" }}>—</span>}
                      </div>
                    )}
                    {isVictory && (
                      <div className="flex justify-center">
                        {p.motm
                          ? <Shield size={14} style={{ color: "#fcd34d" }} />
                          : <span className="text-xs" style={{ color: "var(--muted)" }}>—</span>
                        }
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-center text-sm py-4" style={{ color: "var(--muted)" }}>{t("matches.noPlayerStats")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
