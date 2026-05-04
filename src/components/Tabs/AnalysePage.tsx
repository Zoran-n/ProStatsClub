import { useMemo } from "react";
import { Brain, Target, Zap, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { AIPanel } from "../AI/AIPanel";
import {
  predictNextMatch,
  generateSmartGoals,
  generateSessionSummary,
  suggestPosition,
  detectPerformanceAnomaly,
} from "../../utils/aiEngine";

const SECTION: React.CSSProperties = {
  marginBottom: 24,
};
const SECTION_TITLE: React.CSSProperties = {
  fontFamily: "'Bebas Neue', sans-serif",
  fontSize: 13,
  letterSpacing: "0.12em",
  color: "var(--muted)",
  marginBottom: 12,
  display: "flex",
  alignItems: "center",
  gap: 6,
};
const CARD: React.CSSProperties = {
  background: "var(--hover)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: "14px 16px",
};

export function AnalysePage() {
  const { currentClub, players, matches, sessions } = useAppStore();

  // Per-player match ratings extracted from match history
  const playerMatchRatings = useMemo(() => {
    if (!currentClub) return {};
    const map: Record<string, { rating: number }[]> = {};
    for (const m of matches) {
      const clubPlayers = m.players[currentClub.id] as
        | Record<string, Record<string, string>>
        | undefined;
      if (!clubPlayers) continue;
      for (const [name, stats] of Object.entries(clubPlayers)) {
        const r = parseFloat(stats.ratingAve ?? stats.rating ?? "0");
        if (!map[name]) map[name] = [];
        map[name].push({ rating: r });
      }
    }
    return map;
  }, [matches, currentClub]);

  const lastSession = sessions.slice(-1)[0] ?? null;

  if (!currentClub) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", height: "100%", color: "var(--muted)", gap: 12,
      }}>
        <Brain size={48} style={{ opacity: 0.3 }} />
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: "0.1em", opacity: 0.5 }}>
          CHARGE UN CLUB POUR VOIR L'ANALYSE
        </span>
      </div>
    );
  }

  const prediction = predictNextMatch(currentClub, matches);
  const goals = generateSmartGoals(matches, currentClub.id);
  const sessionSummary = lastSession ? generateSessionSummary(lastSession) : null;

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "20px 24px" }}>

      {/* ── Prédiction + Objectifs ───────────────────────────── */}
      <div style={SECTION}>
        <div style={SECTION_TITLE}>
          <Zap size={13} />
          PRÉDICTION & OBJECTIFS
        </div>
        <AIPanel prediction={prediction} goals={goals.length > 0 ? goals : undefined} />
      </div>

      {/* ── Résumé de session ────────────────────────────────── */}
      {sessionSummary && (
        <div style={SECTION}>
          <div style={SECTION_TITLE}>
            <Brain size={13} />
            DERNIÈRE SESSION — {lastSession.clubName || lastSession.clubId}
          </div>
          <div style={{
            ...CARD,
            borderColor: sessionSummary.sentiment === "positive"
              ? "rgba(35,165,89,0.3)"
              : sessionSummary.sentiment === "negative"
              ? "rgba(218,55,60,0.3)"
              : "var(--border)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, color: "var(--text)", letterSpacing: "0.06em" }}>
                {sessionSummary.title.toUpperCase()}
              </span>
              <span style={{
                fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 10,
                background: sessionSummary.sentiment === "positive"
                  ? "var(--green)" : sessionSummary.sentiment === "negative"
                  ? "var(--red)" : "#eab308",
                color: sessionSummary.sentiment === "neutral" ? "#000" : "#fff",
              }}>
                {sessionSummary.sentiment === "positive" ? "EXCELLENT" : sessionSummary.sentiment === "negative" ? "ALERTE" : "NEUTRE"}
              </span>
            </div>
            <p style={{ fontSize: 12, color: "var(--text)", opacity: 0.85, fontStyle: "italic", marginBottom: 10, lineHeight: 1.5 }}>
              "{sessionSummary.narrative}"
            </p>
            {sessionSummary.keyPoints.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {sessionSummary.keyPoints.map((pt, i) => (
                  <span key={i} style={{
                    fontSize: 10, padding: "3px 8px", borderRadius: 10,
                    background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)",
                  }}>{pt}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Suggestions de poste + anomalies ────────────────── */}
      {players.length > 0 && (
        <div style={SECTION}>
          <div style={SECTION_TITLE}>
            <Target size={13} />
            PROFILS JOUEURS ({players.length})
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
            {[...players].sort((a, b) => b.rating - a.rating).map((player) => {
              const suggestions = suggestPosition(player);
              const best = suggestions[0];
              const second = suggestions[1];
              const anomaly = detectPerformanceAnomaly(playerMatchRatings[player.name] ?? []);

              return (
                <div key={player.name} style={CARD}>
                  {/* Name + anomaly */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <span style={{
                      fontFamily: "'Bebas Neue', sans-serif", fontSize: 15,
                      color: "var(--text)", letterSpacing: "0.04em",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, marginRight: 6,
                    }}>
                      {player.name}
                    </span>
                    {anomaly === "peak" && <span title="En forme"><TrendingUp size={14} color="var(--green)" /></span>}
                    {anomaly === "slump" && <span title="Baisse de forme"><TrendingDown size={14} color="var(--red)" /></span>}
                    {anomaly === null && <span title="Stable" style={{ opacity: 0.4 }}><Minus size={14} color="var(--muted)" /></span>}
                  </div>

                  {/* Rating */}
                  <div style={{ display: "flex", gap: 8, marginBottom: 10, fontSize: 11 }}>
                    <span style={{ color: "var(--gold)" }}>★ {player.rating.toFixed(1)}</span>
                    <span style={{ color: "var(--muted)" }}>{player.gamesPlayed} MJ</span>
                    <span style={{ color: "var(--accent)" }}>⚽ {player.goals}</span>
                  </div>

                  {/* Position suggestion */}
                  <div style={{ display: "flex", gap: 6 }}>
                    <span style={{
                      padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                      fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.06em",
                      background: "rgba(0,212,255,0.15)", border: "1px solid var(--accent)",
                      color: "var(--accent)",
                    }}>
                      {best.pos}
                    </span>
                    {second && (
                      <span style={{
                        padding: "3px 10px", borderRadius: 6, fontSize: 11,
                        fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.06em",
                        background: "transparent", border: "1px solid var(--border)",
                        color: "var(--muted)",
                      }}>
                        {second.pos}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
