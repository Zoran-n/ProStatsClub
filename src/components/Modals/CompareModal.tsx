import { useMemo, useState, Fragment } from "react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Legend, ResponsiveContainer,
} from "recharts";
import { Send } from "lucide-react";
import { useT } from "../../i18n";
import { useAppStore } from "../../store/useAppStore";
import { sendDiscordWebhook } from "../../api/discord";
import type { Player } from "../../types";

const COLORS = ["var(--accent)", "#8b5cf6", "#ff6b35", "#57f287"];
const COLORS_HEX = ["#00d4ff", "#8b5cf6", "#ff6b35", "#57f287"];
const EMOJIS = ["🔵", "🟣", "🟠", "🟢"];

export function CompareModal({ players, allPlayers, onClose }: {
  players: Player[]; allPlayers: Player[]; onClose: () => void;
}) {
  const t = useT();
  const { discordWebhook, addToast } = useAppStore();
  const [sharing, setSharing] = useState(false);

  const RADAR_STATS = useMemo(() => [
    { key: "goals" as keyof Player,       label: t("players.goalsShort") },
    { key: "assists" as keyof Player,     label: t("players.assists") },
    { key: "passesMade" as keyof Player,  label: t("players.passes") },
    { key: "tacklesMade" as keyof Player, label: t("players.tackles") },
    { key: "motm" as keyof Player,        label: t("session.motm") },
    { key: "rating" as keyof Player,      label: t("players.rating") },
  ], [t]);

  const maxV = allPlayers.reduce((acc, p) => ({
    goals:       Math.max(acc.goals,       p.goals),
    assists:     Math.max(acc.assists,     p.assists),
    passesMade:  Math.max(acc.passesMade,  p.passesMade),
    tacklesMade: Math.max(acc.tacklesMade, p.tacklesMade),
    motm:        Math.max(acc.motm,        p.motm),
    rating:      Math.max(acc.rating,      p.rating),
  }), { goals: 1, assists: 1, passesMade: 1, tacklesMade: 1, motm: 1, rating: 1 });

  const norm = (val: number, max: number) => max > 0 ? Math.round((val / max) * 100) : 0;

  const radarData = RADAR_STATS.map(({ key, label }) => {
    const entry: Record<string, string | number> = { stat: label };
    players.forEach((p, i) => {
      entry[`p${i}`] = norm(Number(p[key]) || 0, maxV[key as keyof typeof maxV] ?? 1);
    });
    return entry;
  });

  const statRows: { label: string; values: number[]; fmt?: (v: number) => string }[] = [
    { label: t("players.gp"),          values: players.map((p) => p.gamesPlayed) },
    { label: t("players.goalsShort"),  values: players.map((p) => p.goals) },
    { label: t("players.assists"),     values: players.map((p) => p.assists) },
    { label: t("players.passes"),      values: players.map((p) => p.passesMade) },
    { label: t("players.tackles"),     values: players.map((p) => p.tacklesMade) },
    { label: t("session.motm"),        values: players.map((p) => p.motm) },
    { label: t("players.rating"),      values: players.map((p) => p.rating), fmt: (v) => v > 0 ? v.toFixed(1) : "—" },
  ];

  const handleShareDiscord = async () => {
    if (!discordWebhook) { addToast(t("discord.noWebhook"), "error"); return; }
    setSharing(true);
    try {
      const fields = statRows.map(({ label, values, fmt }) => {
        const f = fmt ?? ((v: number) => String(v));
        const maxVal = Math.max(...values);
        const line = players.map((_p, i) => {
          const v = values[i];
          const isBest = v === maxVal && maxVal > 0;
          return `${EMOJIS[i]} ${isBest ? "**" : ""}${f(v)}${isBest ? "**" : ""}`;
        }).join("  ·  ");
        return { name: label, value: line, inline: false };
      });

      await sendDiscordWebhook(discordWebhook, [{
        title: `👥 Comparaison — ${players.map((p) => p.name).join(" vs ")}`,
        color: parseInt(COLORS_HEX[0].replace("#", ""), 16),
        description: players.map((p, i) => `${EMOJIS[i]} **${p.name}**  ·  ${t("players.rating")} ${p.rating > 0 ? p.rating.toFixed(1) : "—"}`).join("\n"),
        fields,
        footer: { text: "ProClubs Stats" },
      }]);
      addToast(t("discord.sent"), "success");
    } catch (e) {
      addToast(`Discord: ${String(e)}`, "error");
    } finally {
      setSharing(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 50,
      display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "var(--card)", borderRadius: 12, padding: 32, width: 840,
        maxHeight: "90vh", overflowY: "auto",
        border: "1px solid var(--border)", animation: "fadeSlideIn 0.15s ease-out" }}
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 22 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", flex: 1, paddingRight: 8 }}>
            {players.map((p, i) => (
              <span key={p.name} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {i > 0 && <span style={{ color: "var(--muted)", fontSize: 14, fontWeight: 700, margin: "0 4px" }}>VS</span>}
                <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: COLORS[i],
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>
                  {p.name}
                </span>
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            {discordWebhook && (
              <button onClick={handleShareDiscord} disabled={sharing} title="Envoyer sur Discord"
                style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 14px",
                  background: "rgba(88,101,242,0.15)", border: "1px solid rgba(88,101,242,0.35)",
                  borderRadius: 6, color: "#8b9cf4", fontSize: 13, cursor: sharing ? "default" : "pointer",
                  opacity: sharing ? 0.5 : 1 }}>
                <Send size={15} /> Discord
              </button>
            )}
            <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--muted)",
              cursor: "pointer", fontSize: 22, lineHeight: 1, padding: 4 }}>✕</button>
          </div>
        </div>

        {/* Radar chart */}
        <ResponsiveContainer width="100%" height={380}>
          <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
            <PolarGrid stroke="var(--border)" />
            <PolarAngleAxis dataKey="stat"
              tick={{ fill: "var(--muted)", fontSize: 13, fontFamily: "'Bebas Neue', sans-serif" }} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            {players.map((p, i) => (
              <Radar key={p.name} name={p.name} dataKey={`p${i}`}
                stroke={COLORS[i]} fill={COLORS[i]} fillOpacity={0.18} />
            ))}
            <Legend wrapperStyle={{ fontSize: 14, fontFamily: "'Bebas Neue', sans-serif" }}
              formatter={(value: string) => <span style={{ color: "var(--text)" }}>{value}</span>} />
          </RadarChart>
        </ResponsiveContainer>

        {/* Stats comparison table */}
        <div style={{
          display: "grid",
          gridTemplateColumns: `auto repeat(${players.length}, 1fr)`,
          gap: "8px 12px", marginTop: 18,
          padding: "16px 20px", background: "var(--bg)", borderRadius: 8, border: "1px solid var(--border)",
        }}>
          {/* Column headers */}
          <div />
          {players.map((p, i) => (
            <div key={p.name} style={{ textAlign: "center", fontSize: 12,
              color: COLORS[i], fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.06em",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {p.name}
            </div>
          ))}

          {statRows.map(({ label, values, fmt }) => {
            const f = fmt ?? ((v: number) => String(v));
            const maxVal = Math.max(...values);
            return (
              <Fragment key={label}>
                <div style={{ fontSize: 12, color: "var(--muted)", fontFamily: "'Bebas Neue', sans-serif",
                  letterSpacing: "0.08em", alignSelf: "center", paddingRight: 6, whiteSpace: "nowrap" }}>
                  {label}
                </div>
                {values.map((v, i) => {
                  const isBest = v === maxVal && maxVal > 0;
                  return (
                    <div key={i} style={{ textAlign: "center", fontFamily: "'Bebas Neue', sans-serif", fontSize: 22,
                      color: isBest ? COLORS[i] : "var(--muted)" }}>
                      {f(v)}
                    </div>
                  );
                })}
              </Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
