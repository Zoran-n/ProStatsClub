import { useState } from "react";
import { Send } from "lucide-react";
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

/* ─── Team stats helpers (kept for Discord export) ─── */
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

/* ─── Match events ─── */
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
    if (yc > 0) events.push({ type: "card", player: name, detail: `🟨 ${yc}` });
    if (rc > 0) events.push({ type: "card", player: name, detail: `🟥 ${rc}` });
    if (p["mom"] === "1" || p["manofthematch"] === "1") events.push({ type: "motm", player: name });
  }
  const order = { goal: 0, assist: 1, card: 2, motm: 3 };
  events.sort((a, b) => order[a.type] - order[b.type]);
  return events;
}

/* ─── Rating color ─── */
function ratingColor(r: number) {
  if (r >= 8) return "var(--green)";
  if (r >= 7) return "#4ade80";
  if (r >= 6) return "#eab308";
  if (r > 0)  return "var(--red)";
  return "var(--muted)";
}

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

  const RESULT_LABEL: Record<string, { text: string; color: string; bg: string }> = {
    W: { text: t("match.win"),  color: "var(--green)", bg: "rgba(35,165,89,0.12)" },
    D: { text: t("match.draw"), color: "#eab308",      bg: "rgba(234,179,8,0.12)" },
    L: { text: t("match.loss"), color: "var(--red)",   bg: "rgba(218,55,60,0.12)" },
  };

  const rl = RESULT_LABEL[res];
  const events = extractMatchEvents(match, clubId);

  const shareToDiscord = async () => {
    if (!discordWebhook) { addToast(t("discord.noWebhook"), "error"); return; }
    setSharing(true);
    try {
      const color = res === "W" ? 0x23a559 : res === "L" ? 0xda373c : 0xfaa81a;
      const eventsLine = events.map((ev) => {
        if (ev.type === "goal")   return `⚽ ${ev.player}`;
        if (ev.type === "assist") return `🅰️ ${ev.player}`;
        if (ev.type === "motm")   return `★ ${ev.player}`;
        if (ev.type === "card")   return `${ev.detail} ${ev.player}`;
        return "";
      }).filter(Boolean).join("  ·  ");

      const showTackles       = myPlayers.some((p) => p.tackles > 0);
      const showInterceptions = myPlayers.some((p) => p.interceptions > 0);
      const col = (s: string, w: number) => s.padEnd(w).slice(0, w);
      const header  = [col("Joueur",14),col("Note",5),col("Buts",5),col("PD",4),col("Passes",7),
        ...(showTackles?[col("Tack.",6)]:[]),
        ...(showInterceptions?[col("Int.",5)]:[]),"MOTM"].join(" ");
      const divider = "-".repeat(header.length);
      const rows = myPlayers.map((p) => [
        col(p.name,14),col(p.rating>0?p.rating.toFixed(1):"—",5),
        col(p.goals>0?String(p.goals):"—",5),col(p.assists>0?String(p.assists):"—",4),
        col(String(p.passes),7),
        ...(showTackles?[col(p.tackles>0?String(p.tackles):"—",6)]:[]),
        ...(showInterceptions?[col(p.interceptions>0?String(p.interceptions):"—",5)]:[]),
        p.motm?"★":"",
      ].join(" "));
      const tableBlock = "```\n"+[header,divider,...rows].join("\n")+"\n```";

      const fields: { name: string; value: string; inline?: boolean }[] = [];
      if (eventsLine) fields.push({ name: "​", value: eventsLine });
      fields.push({ name: "JOUEURS", value: tableBlock });

      await sendDiscordWebhook(discordWebhook, [{
        title: `${myGoals} — ${oppGoals}  ·  vs ${oppName}`,
        color,
        description: `${formatDate(match.timestamp, locale)}  **${rl.text.toUpperCase()}**`,
        fields,
        footer: { text: "ProClubs Stats" },
      }]);
      addToast(t("discord.sent"), "success");
    } catch (e) { addToast(`Discord: ${String(e)}`, "error"); }
    finally { setSharing(false); }
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 50,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ background: "var(--card)", borderRadius: 16, width: "100%", maxWidth: 960,
          maxHeight: "90vh", overflowY: "auto", border: "1px solid var(--border)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)" }}
        onClick={(e) => e.stopPropagation()}
      >

        {/* ── Scoreboard header ───────────────────────────────── */}
        <div style={{
          background: rl.bg,
          borderBottom: `1px solid var(--border)`,
          borderRadius: "16px 16px 0 0",
          padding: "40px 32px 28px",
          textAlign: "center",
          position: "relative",
        }}>
          {/* Close */}
          <button onClick={onClose} style={{
            position: "absolute", top: 16, right: 16,
            background: "rgba(255,255,255,0.06)", border: "1px solid var(--border)",
            borderRadius: 10, color: "var(--muted)", cursor: "pointer",
            width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, transition: "all 0.15s",
          }}>✕</button>

          {/* Discord */}
          {discordWebhook && (
            <button onClick={shareToDiscord} disabled={sharing} style={{
              position: "absolute", top: 16, left: 16,
              display: "flex", alignItems: "center", gap: 7,
              padding: "7px 14px", background: "rgba(88,101,242,0.15)",
              border: "1px solid rgba(88,101,242,0.3)", borderRadius: 8,
              color: "#5865f2", fontSize: 13, cursor: sharing ? "default" : "pointer",
              opacity: sharing ? 0.5 : 1, transition: "all 0.15s",
            }}>
              <Send size={14} /> Discord
            </button>
          )}

          {/* Result badge */}
          <div style={{
            display: "inline-block", padding: "4px 16px", borderRadius: 20,
            background: `${rl.color}22`, border: `1px solid ${rl.color}55`,
            color: rl.color, fontSize: 13, fontWeight: 700, letterSpacing: "0.14em",
            fontFamily: "'Bebas Neue', sans-serif", marginBottom: 14,
          }}>
            {rl.text.toUpperCase()}
          </div>

          {/* Score */}
          <div style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 96, lineHeight: 1,
            letterSpacing: 4,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 22,
          }}>
            <span style={{ color: res === "W" ? "var(--green)" : res === "L" ? "var(--red)" : "#eab308" }}>
              {myGoals}
            </span>
            <span style={{ fontSize: 48, color: "var(--muted)", opacity: 0.4 }}>—</span>
            <span style={{ color: res === "L" ? "var(--green)" : res === "W" ? "var(--red)" : "#eab308" }}>
              {oppGoals}
            </span>
          </div>

          {/* Opponent + date */}
          <div style={{ marginTop: 12, fontSize: 17, color: "var(--text)", fontWeight: 600 }}>
            vs {oppName}
          </div>
          <div style={{ fontSize: 14, color: "var(--muted)", marginTop: 5 }}>
            {formatDate(match.timestamp, locale)}
            {match.matchDuration ? ` · ${formatDuration(match.matchDuration)}` : ""}
          </div>
        </div>

        <div style={{ padding: "22px 28px 28px" }}>

          {/* ── Events ─────────────────────────────────────────── */}
          {events.length > 0 && (
            <div style={{
              display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20,
              padding: "14px 18px", background: "var(--bg)",
              borderRadius: 10, border: "1px solid var(--border)",
            }}>
              {events.map((ev, i) => {
                const icon  = ev.type === "goal" ? "⚽" : ev.type === "assist" ? "🅰️" : ev.type === "motm" ? "⭐" : (ev.detail ?? "🟨");
                const color = ev.type === "goal" ? "var(--accent)" : ev.type === "assist" ? "#eab308" : ev.type === "motm" ? "#ffd700" : ev.detail?.includes("🟥") ? "var(--red)" : "#eab308";
                const label = ev.type === "goal" ? "But" : ev.type === "assist" ? "Passe déc." : ev.type === "motm" ? "MOTM" : ev.detail?.includes("🟥") ? "Rouge" : "Jaune";
                return (
                  <span key={i} style={{
                    display: "inline-flex", alignItems: "center", gap: 7,
                    padding: "6px 14px", borderRadius: 20, fontSize: 13,
                    background: `${color}15`, border: `1px solid ${color}40`,
                    color, fontWeight: 600,
                  }}>
                    {icon} {ev.player}
                    <span style={{ fontSize: 11, opacity: 0.6, fontWeight: 400 }}>{label}</span>
                  </span>
                );
              })}
            </div>
          )}

          {/* ── Joueurs ─────────────────────────────────────────── */}
          {myPlayers.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{
                fontSize: 12, color: "var(--muted)", letterSpacing: "0.12em",
                fontFamily: "'Bebas Neue', sans-serif", marginBottom: 6, paddingLeft: 2,
              }}>
                {t("matches.playerStats")}
              </div>

              {myPlayers.map((p, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 16,
                  padding: "14px 18px", borderRadius: 10,
                  background: i === 0 && p.motm ? "rgba(255,215,0,0.06)" : "var(--bg)",
                  border: `1px solid ${i === 0 && p.motm ? "rgba(255,215,0,0.2)" : "var(--border)"}`,
                  transition: "background 0.1s",
                }}>
                  {/* Rank */}
                  <div style={{
                    width: 28, textAlign: "center", fontSize: 14,
                    color: "var(--muted)", fontFamily: "'Bebas Neue', sans-serif", flexShrink: 0,
                  }}>
                    {i + 1}
                  </div>

                  {/* Name */}
                  <div style={{ flex: 1, fontSize: 16, color: "var(--text)", fontWeight: 600, minWidth: 0 }}>
                    {p.name}
                    {p.motm && (
                      <span style={{
                        marginLeft: 8, fontSize: 11, color: "#ffd700",
                        background: "rgba(255,215,0,0.15)", padding: "2px 8px",
                        borderRadius: 10, fontWeight: 700, letterSpacing: "0.06em",
                      }}>MOTM</span>
                    )}
                  </div>

                  {/* Stat chips */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    {p.goals > 0 && (
                      <span style={{
                        fontSize: 13, padding: "3px 11px", borderRadius: 12,
                        background: "rgba(var(--accent-rgb,88,101,242),0.15)",
                        border: "1px solid var(--accent)", color: "var(--accent)", fontWeight: 700,
                      }}>⚽ {p.goals}</span>
                    )}
                    {p.assists > 0 && (
                      <span style={{
                        fontSize: 13, padding: "3px 11px", borderRadius: 12,
                        background: "rgba(234,179,8,0.12)", border: "1px solid #eab308",
                        color: "#eab308", fontWeight: 700,
                      }}>🅰️ {p.assists}</span>
                    )}
                    {p.yellowCards > 0 && (
                      <span style={{ fontSize: 16 }}>🟨</span>
                    )}
                    {p.redCards > 0 && (
                      <span style={{ fontSize: 16 }}>🟥</span>
                    )}
                  </div>

                  {/* Rating */}
                  <div style={{
                    width: 56, textAlign: "center", flexShrink: 0,
                    fontFamily: "'Bebas Neue', sans-serif", fontSize: 28,
                    color: ratingColor(p.rating), lineHeight: 1,
                  }}>
                    {p.rating > 0 ? p.rating.toFixed(1) : "—"}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ textAlign: "center", color: "var(--muted)", fontSize: 15, marginTop: 8 }}>
              {t("matches.noPlayerStats")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
