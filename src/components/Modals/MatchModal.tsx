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

/* ─── Rating badge ─── */
function RatingBadge({ rating }: { rating: number }) {
  const color =
    rating >= 7.5 ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" :
    rating >= 6.5 ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/40" :
                    "bg-red-500/20 text-red-400 border-red-500/40";
  return (
    <span className={`inline-flex items-center justify-center w-10 h-10 rounded-full border text-sm font-bold ${color}`}>
      {rating > 0 ? rating.toFixed(1) : "—"}
    </span>
  );
}

/* ─── Player initials avatar ─── */
function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/[\s_-]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div className="w-9 h-9 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center flex-shrink-0">
      <span className="text-xs font-bold text-slate-300 tracking-wide">{initials || "?"}</span>
    </div>
  );
}

/* ─── Event chip ─── */
function EventChip({ ev, isVictory }: { ev: MatchEvent; isVictory: boolean }) {
  if (ev.type === "motm") {
    if (!isVictory) return null;
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border border-yellow-400/60 bg-yellow-400/10 text-yellow-300">
        <Star size={11} className="fill-yellow-400 text-yellow-400" />
        {ev.player}
        <span className="text-[9px] font-normal opacity-70 tracking-wider">MOTM</span>
      </span>
    );
  }

  if (ev.type === "goal") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border border-cyan-500/40 bg-cyan-500/10 text-cyan-300">
        <span className="text-sm leading-none">⚽</span>
        {ev.player}
        <span className="text-[9px] font-normal opacity-60 tracking-wider">But</span>
      </span>
    );
  }

  if (ev.type === "assist") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border border-violet-500/40 bg-violet-500/10 text-violet-300">
        <span className="text-sm leading-none font-bold italic">A</span>
        {ev.player}
        <span className="text-[9px] font-normal opacity-60 tracking-wider">Passe déc.</span>
      </span>
    );
  }

  if (ev.type === "card") {
    const isRed = ev.detail?.startsWith("red");
    const count = ev.detail?.split(":")[1] ?? "1";
    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${
        isRed
          ? "border-red-500/40 bg-red-500/10 text-red-300"
          : "border-yellow-500/40 bg-yellow-500/10 text-yellow-300"
      }`}>
        <span className={`inline-block w-2.5 h-3.5 rounded-sm ${isRed ? "bg-red-500" : "bg-yellow-400"}`} />
        {count} {ev.player}
        <span className="text-[9px] font-normal opacity-60 tracking-wider">{isRed ? "Rouge" : "Jaune"}</span>
      </span>
    );
  }

  return null;
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
    ? { label: t("match.win").toUpperCase(),  cls: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" }
    : isDraw
    ? { label: t("match.draw").toUpperCase(), cls: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40" }
    : { label: t("match.loss").toUpperCase(), cls: "bg-red-500/20 text-red-400 border-red-500/40" };

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-[680px] max-h-[90vh] overflow-y-auto rounded-2xl bg-slate-950 border border-slate-800/60 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Hero Scoreboard ─────────────────────────────────── */}
        <div className={`relative overflow-hidden px-6 pt-6 pb-5 ${
          isVictory
            ? "bg-gradient-to-br from-emerald-950/60 via-slate-950 to-slate-950"
            : isDraw
            ? "bg-gradient-to-br from-yellow-950/40 via-slate-950 to-slate-950"
            : "bg-gradient-to-br from-red-950/50 via-slate-950 to-slate-950"
        }`}>
          {/* Glow orb */}
          <div className={`absolute -top-10 -left-10 w-40 h-40 rounded-full blur-3xl opacity-20 ${
            isVictory ? "bg-emerald-400" : isDraw ? "bg-yellow-400" : "bg-red-500"
          }`} />

          <div className="relative flex items-start justify-between">
            {/* Score block */}
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[10px] font-bold tracking-widest border ${resultBadge.cls}`}>
                  {resultBadge.label}
                </span>
              </div>
              <div className="font-['Bebas_Neue'] text-6xl leading-none tracking-wider text-white mb-2">
                {myGoals}
                <span className="text-slate-500 mx-2">—</span>
                {oppGoals}
              </div>
              <div className="text-base font-semibold text-slate-200 mb-0.5">
                vs <span className="text-white">{oppName}</span>
              </div>
              <div className="text-xs text-slate-500">
                {formatDate(match.timestamp, locale)}
                {match.matchDuration ? ` · ${formatDuration(match.matchDuration)}` : ""}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {discordWebhook && (
                <button
                  onClick={shareToDiscord}
                  disabled={sharing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 transition-colors disabled:opacity-40"
                >
                  <Send size={11} /> Discord
                </button>
              )}
              <button
                onClick={onClose}
                className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500 transition-colors text-sm"
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        <div className="px-6 pb-6 space-y-4 mt-4">
          {/* ── Highlights / Event chips ─────────────────────── */}
          {events.length > 0 && (
            <div>
              <p className="text-[9px] text-slate-500 tracking-widest font-['Bebas_Neue'] uppercase mb-2">Highlights</p>
              <div className="flex flex-wrap gap-2">
                {events.map((ev, i) => (
                  <EventChip key={i} ev={ev} isVictory={isVictory} />
                ))}
              </div>
            </div>
          )}

          {/* ── Team stats ───────────────────────────────────── */}
          {teamStats.length > 0 && (
            <div>
              <p className="text-[9px] text-slate-500 tracking-widest font-['Bebas_Neue'] uppercase mb-2">
                {t("matches.teamStats")}
              </p>
              <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 divide-y divide-slate-800/60">
                {teamStats.map(({ label, my, opp }) => {
                  const nMy = Number(String(my).replace("%", "")), nOpp = Number(String(opp).replace("%", ""));
                  const myWins  = !isNaN(nMy) && !isNaN(nOpp) && nMy > nOpp;
                  const oppWins = !isNaN(nMy) && !isNaN(nOpp) && nOpp > nMy;
                  return (
                    <div key={label} className="grid grid-cols-3 items-center px-4 py-2">
                      <span className={`text-right text-sm font-['Bebas_Neue'] ${myWins ? "text-cyan-400" : "text-slate-300"}`}>{my}</span>
                      <span className="text-center text-[9px] text-slate-500 tracking-wider font-['Bebas_Neue'] uppercase">{label}</span>
                      <span className={`text-left text-sm font-['Bebas_Neue'] ${oppWins ? "text-red-400" : "text-slate-300"}`}>{opp}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Player list ──────────────────────────────────── */}
          {myPlayers.length > 0 ? (
            <div>
              <p className="text-[9px] text-slate-500 tracking-widest font-['Bebas_Neue'] uppercase mb-2">
                {t("matches.playerStats")}
              </p>
              <div className="space-y-1.5">
                {/* Header row */}
                <div className="grid items-center gap-2 px-3 pb-1 border-b border-slate-800/60"
                  style={{ gridTemplateColumns: "2.25rem 1fr 2.5rem 2.5rem 2.5rem 3rem 2.5rem" + (hasTackles ? " 2.5rem" : "") + (hasCards ? " 2.5rem" : "") + (isVictory ? " 2rem" : "") }}>
                  <div />
                  <div className="text-[9px] text-slate-500 tracking-wider uppercase">Joueur</div>
                  <div className="text-[9px] text-slate-500 tracking-wider uppercase text-center">Note</div>
                  <div className="text-[9px] text-slate-500 tracking-wider uppercase text-center">Buts</div>
                  <div className="text-[9px] text-slate-500 tracking-wider uppercase text-center">PD</div>
                  <div className="text-[9px] text-slate-500 tracking-wider uppercase text-center">Passes</div>
                  {hasTackles && <div className="text-[9px] text-slate-500 tracking-wider uppercase text-center">Tacles</div>}
                  {hasInterceptions && <div className="text-[9px] text-slate-500 tracking-wider uppercase text-center">Int.</div>}
                  {hasFouls && <div className="text-[9px] text-slate-500 tracking-wider uppercase text-center">Fts</div>}
                  {hasCards && <div className="text-[9px] text-slate-500 tracking-wider uppercase text-center">Cartons</div>}
                  {isVictory && <div className="text-[9px] text-slate-500 tracking-wider uppercase text-center"><Star size={9} className="inline" /></div>}
                </div>

                {/* Player rows */}
                {myPlayers.map((p, i) => (
                  <div
                    key={i}
                    className={`grid items-center gap-2 px-3 py-2.5 rounded-xl border transition-colors ${
                      p.motm && isVictory
                        ? "bg-yellow-400/5 border-yellow-400/20 hover:bg-yellow-400/8"
                        : "bg-white/[0.03] border-slate-800/40 hover:bg-white/[0.06]"
                    }`}
                    style={{ gridTemplateColumns: "2.25rem 1fr 2.5rem 2.5rem 2.5rem 3rem 2.5rem" + (hasTackles ? " 2.5rem" : "") + (hasCards ? " 2.5rem" : "") + (isVictory ? " 2rem" : "") }}
                  >
                    <Avatar name={p.name} />
                    <div className="min-w-0">
                      <span className="text-sm font-semibold text-slate-200 truncate block">{p.name}</span>
                    </div>
                    <div className="flex justify-center">
                      <RatingBadge rating={p.rating} />
                    </div>
                    <div className="text-center text-sm font-bold text-cyan-400">{p.goals || <span className="text-slate-600 font-normal">—</span>}</div>
                    <div className="text-center text-sm font-bold text-violet-400">{p.assists || <span className="text-slate-600 font-normal">—</span>}</div>
                    <div className="text-center text-sm text-slate-300 font-medium">{p.passes || <span className="text-slate-600">—</span>}</div>
                    {hasTackles && <div className="text-center text-sm text-slate-300">{p.tackles || <span className="text-slate-600">—</span>}</div>}
                    {hasInterceptions && <div className="text-center text-sm text-slate-300">{p.interceptions || <span className="text-slate-600">—</span>}</div>}
                    {hasFouls && <div className="text-center text-sm text-slate-300">{p.fouls || <span className="text-slate-600">—</span>}</div>}
                    {hasCards && (
                      <div className="flex justify-center items-center gap-1">
                        {p.yellowCards > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-yellow-300 font-semibold">
                            <span className="w-2 h-3 rounded-sm bg-yellow-400 inline-block" />{p.yellowCards}
                          </span>
                        )}
                        {p.redCards > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-red-400 font-semibold">
                            <span className="w-2 h-3 rounded-sm bg-red-500 inline-block" />{p.redCards}
                          </span>
                        )}
                        {!p.yellowCards && !p.redCards && <span className="text-slate-600 text-sm">—</span>}
                      </div>
                    )}
                    {isVictory && (
                      <div className="flex justify-center">
                        {p.motm
                          ? <Shield size={14} className="text-yellow-400 fill-yellow-400/20" />
                          : <span className="text-slate-700 text-xs">—</span>
                        }
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-center text-slate-500 text-sm py-4">{t("matches.noPlayerStats")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
