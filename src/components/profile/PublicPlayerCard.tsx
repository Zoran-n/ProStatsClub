import { useMemo, useRef } from "react";
import html2canvas from "html2canvas";
import { Download, Share2 } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import type { PublicProfileConfig, Player } from "../../types";
import { sendDiscordFile } from "../../api/discord";

interface Props {
  config: PublicProfileConfig;
  player: Player | null;
  division?: { div: string; color: string } | null;
}

const THEMES = {
  gold: { bg: "linear-gradient(135deg, #2a2004 0%, #1a1402 100%)", border: "#f59e0b", text: "#fde68a", accent: "#f59e0b" },
  neon: { bg: "linear-gradient(135deg, #0f172a 0%, #020617 100%)", border: "#00d4ff", text: "#fff", accent: "#00d4ff" },
  dark: { bg: "linear-gradient(135deg, #18181b 0%, #09090b 100%)", border: "#3f3f46", text: "#fff", accent: "#fff" },
  minimal: { bg: "#ffffff", border: "#e4e4e7", text: "#18181b", accent: "#18181b" },
};

export function PublicPlayerCard({ config, player, division }: Props) {
  const { eaProfile, currentClub, discordWebhook, addToast } = useAppStore();
  const cardRef = useRef<HTMLDivElement>(null);

  const theme = THEMES[(config.theme as keyof typeof THEMES) || "gold"];

  const statLabels: Record<string, string> = {
    goals: "BUTS",
    assists: "PASSES",
    rating: "MOYENNE",
    motm: "MOTM",
    gamesPlayed: "MATCHS",
    tacklesMade: "TACLES",
    passesMade: "PASSES R.",
    interceptions: "INTERCEP.",
    cleanSheets: "CLEAN S.",
    saveAttempts: "ARRÊTS",
  };

  const statValues = useMemo(() => {
    if (!player) return {};
    return {
      goals: player.goals,
      assists: player.assists,
      rating: player.rating > 0 ? player.rating.toFixed(2) : "—",
      motm: player.motm,
      gamesPlayed: player.gamesPlayed,
      tacklesMade: player.tacklesMade,
      passesMade: player.passesMade,
      interceptions: player.interceptions || 0,
      cleanSheets: player.cleanSheets || 0,
      saveAttempts: player.saveAttempts || 0,
    };
  }, [player]);

  const handleDownload = async () => {
    if (!cardRef.current) return;
    try {
      const canvas = await html2canvas(cardRef.current, { scale: 2, backgroundColor: null, useCORS: true });
      const link = document.createElement("a");
      link.download = `ProCard-${eaProfile?.gamertag || "Joueur"}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      console.error(err);
    }
  };

  const handleShareDiscord = async () => {
    if (!cardRef.current || !discordWebhook) {
      addToast("Webhook Discord non configuré", "error");
      return;
    }
    try {
      const canvas = await html2canvas(cardRef.current, { scale: 2, backgroundColor: null, useCORS: true });
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        try {
          await sendDiscordFile(discordWebhook, blob, "procard.png");
          addToast("Carte partagée sur Discord !", "success");
        } catch (_err) {
          addToast("Erreur lors du partage Discord", "error");
        }
      }, "image/png");
    } catch (err) {
      console.error(err);
      addToast("Erreur lors de la capture", "error");
    }
  };

  if (!player || !eaProfile) return <div style={{ color: "var(--muted)", padding: 20 }}>Chargement de la carte...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
      {/* ── La Carte ── */}
      <div
        ref={cardRef}
        style={{
          width: 340,
          background: theme.bg,
          border: `2px solid ${theme.border}`,
          borderRadius: 8,
          padding: 24,
          position: "relative",
          overflow: "hidden",
          boxShadow: `0 10px 30px rgba(0,0,0,0.5), inset 0 0 20px ${theme.accent}11`,
          fontFamily: config.theme === "minimal" ? "sans-serif" : "'Bebas Neue', sans-serif",
          color: theme.text,
        }}
      >
        {/* En-tête : Avatar et Division */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div
            style={{
              width: 80, height: 80, borderRadius: "50%",
              background: theme.accent, display: "flex", alignItems: "center", justifyContent: "center",
              border: `3px solid ${theme.border}`,
            }}
          >
            <span style={{ fontSize: 36, color: config.theme === "minimal" ? "#fff" : "#000", fontWeight: "bold" }}>
              {eaProfile.gamertag[0].toUpperCase()}
            </span>
          </div>
          {division && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 24, color: division.color, textShadow: `0 0 10px ${division.color}66` }}>
                {division.div}
              </div>
              <div style={{ fontSize: 14, opacity: 0.8, marginTop: -4 }}>{player.position}</div>
            </div>
          )}
        </div>

        {/* Gamertag & Club */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 32, letterSpacing: "0.05em", lineHeight: 1.1 }}>{eaProfile.gamertag}</div>
          <div style={{ fontSize: 16, opacity: 0.7, letterSpacing: "0.05em" }}>{currentClub?.name || eaProfile.clubName}</div>
        </div>

        {/* Grille de stats (6 clés choisies) */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
          {config.selectedStats.map(statKey => (
            <div key={statKey} style={{
              background: config.theme === "minimal" ? "#f4f4f5" : "rgba(255,255,255,0.05)",
              border: `1px solid ${config.theme === "minimal" ? "#e4e4e7" : "rgba(255,255,255,0.1)"}`,
              borderRadius: 8, padding: "8px 12px",
              display: "flex", justifyContent: "space-between", alignItems: "center"
            }}>
              <span style={{ fontSize: 14, opacity: 0.8, letterSpacing: "0.05em" }}>
                {statLabels[statKey] || statKey.toUpperCase()}
              </span>
              <span style={{ fontSize: 22, color: theme.accent }}>
                {(statValues as Record<string, number | string>)[statKey] ?? "—"}
              </span>
            </div>
          ))}
        </div>

        {/* Objectif (optionnel) */}
        {config.objective && (
          <div style={{ borderTop: `1px solid ${theme.border}44`, paddingTop: 16 }}>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6, letterSpacing: "0.05em" }}>
              {config.objective.title}
            </div>
            <div style={{ height: 6, background: "rgba(255,255,255,0.1)", borderRadius: 3, overflow: "hidden", marginBottom: 4 }}>
              <div style={{
                width: `${Math.min(100, (((statValues as Record<string, number | string>)[config.objective.targetStat] as number || 0) / config.objective.targetValue) * 100)}%`,
                height: "100%", background: theme.accent
              }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.6 }}>
              <span>{(statValues as Record<string, number | string>)[config.objective.targetStat] || 0}</span>
              <span>{config.objective.targetValue}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Actions ── */}
      <div style={{ display: "flex", gap: 12 }}>
        <button
          onClick={handleDownload}
          style={{
            display: "flex", alignItems: "center", gap: 8, padding: "10px 20px",
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 8, color: "var(--text)", cursor: "pointer",
            fontFamily: "'Bebas Neue', sans-serif", fontSize: 16
          }}
        >
          <Download size={16} /> TÉLÉCHARGER
        </button>
        {discordWebhook && (
          <button
            onClick={handleShareDiscord}
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "10px 20px",
              background: "var(--accent)", border: "none",
              borderRadius: 8, color: "var(--bg)", cursor: "pointer",
              fontFamily: "'Bebas Neue', sans-serif", fontSize: 16
            }}
          >
            <Share2 size={16} /> PARTAGER
          </button>
        )}
      </div>
    </div>
  );
}
