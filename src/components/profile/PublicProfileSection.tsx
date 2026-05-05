import { useState, useEffect } from "react";
import { useAppStore } from "../../store/useAppStore";
import { PublicPlayerCard } from "./PublicPlayerCard";
import type { PublicProfileConfig } from "../../types";

const ALL_STATS = [
  { key: "goals", label: "Buts" },
  { key: "assists", label: "Passes Décisives" },
  { key: "rating", label: "Note Moyenne" },
  { key: "motm", label: "Homme du match" },
  { key: "gamesPlayed", label: "Matchs Joués" },
  { key: "tacklesMade", label: "Tacles" },
  { key: "passesMade", label: "Passes Réussies" },
  { key: "interceptions", label: "Interceptions" },
  { key: "cleanSheets", label: "Clean Sheets" },
  { key: "saveAttempts", label: "Arrêts GK" },
];

const THEMES = [
  { key: "gold", label: "Gold (Premium)" },
  { key: "neon", label: "Neon (Cyber)" },
  { key: "dark", label: "Dark (Pro)" },
  { key: "minimal", label: "Minimaliste" },
];

export function PublicProfileSection() {
  const { publicProfileConfig, setPublicProfileConfig, eaProfile, players, currentClub } = useAppStore();
  
  const [config, setConfig] = useState<PublicProfileConfig>(() => publicProfileConfig || {
    selectedStats: ["goals", "assists", "rating", "motm", "gamesPlayed", "tacklesMade"],
    theme: "gold",
  });

  const [hasObjective, setHasObjective] = useState(!!config.objective);

  const player = eaProfile ? players.find(p => p.name.toLowerCase() === eaProfile.gamertag.toLowerCase()) || null : null;
  const division = currentClub?.skillRating ? { div: "Elite", color: "#f59e0b" } : null; // Simplification for preview
  
  useEffect(() => {
    setPublicProfileConfig(config);
  }, [config, setPublicProfileConfig]);

  const toggleStat = (key: string) => {
    setConfig(prev => {
      const selected = prev.selectedStats.includes(key)
        ? prev.selectedStats.filter(s => s !== key)
        : [...prev.selectedStats, key].slice(0, 6);
      return { ...prev, selectedStats: selected };
    });
  };

  const handleObjectiveChange = (field: string, value: string | number) => {
    setConfig(prev => ({
      ...prev,
      objective: {
        targetStat: field === "stat" ? String(value) : (prev.objective?.targetStat || "goals"),
        targetValue: field === "value" ? Number(value) : (prev.objective?.targetValue || 100),
        title: field === "title" ? String(value) : (prev.objective?.title || "Mon Objectif"),
      }
    }));
  };

  const toggleObjective = (checked: boolean) => {
    setHasObjective(checked);
    setConfig(prev => ({
      ...prev,
      objective: checked ? { targetStat: "goals", targetValue: 100, title: "100 Buts Saison" } : undefined
    }));
  };

  return (
    <div style={{ display: "flex", gap: 32, alignItems: "flex-start", marginTop: 24 }}>
      {/* ── Configuration Panel ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ background: "var(--surface)", padding: 20, borderRadius: 12, border: "1px solid var(--border)" }}>
          <h3 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, margin: "0 0 16px 0", color: "var(--accent)" }}>
            Personnalisation de la Carte
          </h3>
          
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 8, letterSpacing: "0.05em" }}>THÈME VISUEL</label>
            <div style={{ display: "flex", gap: 8 }}>
              {THEMES.map(t => (
                <button
                  key={t.key}
                  onClick={() => setConfig(p => ({ ...p, theme: t.key }))}
                  style={{
                    padding: "8px 12px", background: config.theme === t.key ? "var(--accent)" : "var(--hover)",
                    border: config.theme === t.key ? "none" : "1px solid var(--border)",
                    color: config.theme === t.key ? "#fff" : "var(--text)", borderRadius: 6, cursor: "pointer",
                    fontSize: 12
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 8, letterSpacing: "0.05em" }}>
              STATISTIQUES AFFICHÉES ({config.selectedStats.length}/6)
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {ALL_STATS.map(stat => {
                const isActive = config.selectedStats.includes(stat.key);
                return (
                  <button
                    key={stat.key}
                    onClick={() => toggleStat(stat.key)}
                    style={{
                      padding: "6px 10px", background: isActive ? "rgba(0,212,255,0.1)" : "var(--hover)",
                      border: `1px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
                      color: isActive ? "var(--accent)" : "var(--muted)", borderRadius: 16, cursor: "pointer",
                      fontSize: 12
                    }}
                  >
                    {stat.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text)", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={hasObjective}
                onChange={(e) => toggleObjective(e.target.checked)}
                style={{ accentColor: "var(--accent)" }}
              />
              AFFICHER UN OBJECTIF EN COURS
            </label>
            
            {hasObjective && config.objective && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                <input
                  type="text"
                  placeholder="Titre de l'objectif"
                  value={config.objective.title}
                  onChange={e => handleObjectiveChange("title", e.target.value)}
                  style={{ background: "var(--bg)", border: "1px solid var(--border)", padding: "8px 12px", borderRadius: 6, color: "var(--text)" }}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <select
                    value={config.objective.targetStat}
                    onChange={e => handleObjectiveChange("stat", e.target.value)}
                    style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--border)", padding: "8px 12px", borderRadius: 6, color: "var(--text)" }}
                  >
                    {ALL_STATS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                  <input
                    type="number"
                    value={config.objective.targetValue}
                    onChange={e => handleObjectiveChange("value", e.target.value)}
                    style={{ width: 80, background: "var(--bg)", border: "1px solid var(--border)", padding: "8px 12px", borderRadius: 6, color: "var(--text)" }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
        
        <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
          La carte utilise vos statistiques cumulées disponibles dans l'application. Elle est générée localement et peut être partagée sur votre serveur Discord.
        </div>
      </div>

      {/* ── Live Preview ── */}
      <div style={{ flexShrink: 0, width: 340 }}>
        <h3 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, margin: "0 0 16px 0", color: "var(--text)", textAlign: "center" }}>
          PRÉVISUALISATION
        </h3>
        <PublicPlayerCard config={config} player={player} division={division} />
      </div>
    </div>
  );
}
