import { useState, useEffect, useMemo } from "react";
import { BarChart2, Trophy, Search, Sparkles, Settings, Send, Pencil, X, Minimize2, Megaphone, ListChecks, BookOpen, LayoutDashboard } from "lucide-react";
import { GlassCard } from "../UI/GlassCard";
import { useAppStore } from "../../store/useAppStore";
import { PlayersTab } from "../Tabs/PlayersTab";
import { MatchesTab } from "../Tabs/MatchesTab";
import { ChartsTab } from "../Tabs/ChartsTab";
import { SessionTab } from "../Tabs/SessionTab";
import { CompareTab } from "../Sidebar/CompareTab";
import { SettingsTab } from "../Sidebar/SettingsTab";
import { ProfilePanel } from "../Modals/ProfilePanel";
import { Spinner } from "../UI/Spinner";
import { getLogo } from "../../api/tauri";
import { sendDiscordWebhook } from "../../api/discord";
import { buildPlayersEmbed, buildMatchesEmbed, buildChartsEmbed } from "../../utils/discordEmbeds";
import { MatchAnnounceModal, DiscordPollModal, HighlightModal, SeasonThreadModal, WeeklyRankingModal, SeasonReportModal } from "../Modals/DiscordActionsModals";
import { useT } from "../../i18n";
import type { Club, Match, Player } from "../../types";

// ─── Dashboard widget view ────────────────────────────────────────────────────

const ALL_WIDGETS = [
  { id: "forme",          label: "Score de forme" },
  { id: "serie",          label: "Série en cours" },
  { id: "kpis_rapides",   label: "KPIs rapides" },
  { id: "derniers_matchs",label: "Derniers matchs" },
  { id: "top_joueur",     label: "Top joueur" },
  { id: "heatmap",        label: "Forme 10 matchs" },
];

function DashboardView({
  widgets, setWidgets, club, matches, players,
  formScore, formColor, formLabel, streakText, streakColor,
}: {
  widgets: string[];
  setWidgets: (w: string[]) => void;
  club: Club;
  matches: Match[];
  players: Player[];
  formScore: number | null;
  formColor: string;
  formLabel: string;
  streakText: string | null;
  streakColor: string;
}) {
  const [editing, setEditing] = useState(false);

  const total   = club.wins + club.losses + club.ties;
  const winPct  = total > 0 ? Math.round((club.wins / total) * 100) : 0;
  const topScorer  = [...players].sort((a, b) => b.goals - a.goals)[0];
  const last5 = [...matches].sort((a, b) => Number(a.timestamp) - Number(b.timestamp)).slice(-5);

  const CARD: React.CSSProperties = {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    position: "relative",
    overflow: "hidden",
  };
  const TITLE: React.CSSProperties = {
    fontFamily: "'Bebas Neue', sans-serif", fontSize: 11, letterSpacing: "0.1em",
    color: "var(--muted)", marginBottom: 4,
  };

  const renderWidget = (id: string) => {
    switch (id) {
      case "forme":
        return formScore !== null ? (
          <GlassCard key={id} beam glow="cyan"
            padding="14px 16px"
            style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={TITLE}>SCORE DE FORME</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 42, color: formColor, lineHeight: 1 }}>
              {formScore}<span style={{ fontSize: 18, opacity: 0.6 }}>/100</span>
            </div>
            <div style={{ fontSize: 10, color: formColor, fontWeight: 700 }}>{formLabel}</div>
          </GlassCard>
        ) : null;

      case "serie":
        return streakText ? (
          <div key={id} style={CARD}>
            <div style={TITLE}>SÉRIE EN COURS</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: streakColor, lineHeight: 1 }}>
              {streakText}
            </div>
          </div>
        ) : null;

      case "kpis_rapides":
        return (
          <div key={id} style={CARD}>
            <div style={TITLE}>KPIs RAPIDES</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {[
                { label: "Matchs", value: total, color: "var(--accent)" },
                { label: "V%", value: `${winPct}%`, color: "var(--green)" },
                { label: "Buts", value: club.goals, color: "var(--gold)" },
                { label: "SR", value: club.skillRating ?? "—", color: "var(--gold)" },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ textAlign: "center", background: "var(--bg)", borderRadius: 6, padding: "6px 4px" }}>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color, lineHeight: 1 }}>{value}</div>
                  <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        );

      case "derniers_matchs":
        return (
          <div key={id} style={CARD}>
            <div style={TITLE}>DERNIERS MATCHS</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {last5.length === 0
                ? <span style={{ fontSize: 11, color: "var(--muted)" }}>Aucun match</span>
                : last5.map((m, i) => {
                    const c = m.clubs[club.id] as Record<string, string> | undefined;
                    const res = !c ? "?" : Number(c.wins) > 0 ? "V" : Number(c.ties) > 0 ? "N" : "D";
                    const color = res === "V" ? "var(--green)" : res === "D" ? "var(--red)" : "#eab308";
                    const goals = c?.goals ?? "?";
                    const ts = Number(m.timestamp);
                    const date = ts > 0 ? new Date(ts > 1e12 ? ts : ts * 1000).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) : "";
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                        <span style={{ width: 20, height: 20, borderRadius: 4, background: color,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontFamily: "'Bebas Neue', sans-serif", fontSize: 11, color: "#fff", flexShrink: 0 }}>{res}</span>
                        <span style={{ color: "var(--text)" }}>{goals} but{Number(goals) !== 1 ? "s" : ""}</span>
                        <span style={{ color: "var(--muted)", marginLeft: "auto", fontSize: 10 }}>{date}</span>
                      </div>
                    );
                  })}
            </div>
          </div>
        );

      case "top_joueur":
        return topScorer ? (
          <div key={id} style={CARD}>
            <div style={TITLE}>TOP JOUEUR</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: "var(--text)", lineHeight: 1 }}>
              {topScorer.name}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
              <span style={{ fontSize: 11, color: "var(--accent)" }}>⚽ {topScorer.goals}</span>
              <span style={{ fontSize: 11, color: "#8b5cf6" }}>🅰️ {topScorer.assists}</span>
              <span style={{ fontSize: 11, color: "var(--gold)" }}>★ {topScorer.motm}</span>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>{topScorer.gamesPlayed} MJ</span>
            </div>
          </div>
        ) : null;

      case "heatmap":
        return (
          <div key={id} style={CARD}>
            <div style={TITLE}>FORME (10 MATCHS)</div>
            <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
              {[...matches]
                .sort((a, b) => Number(a.timestamp) - Number(b.timestamp))
                .slice(-10)
                .map((m, i) => {
                  const c = m.clubs[club.id] as Record<string, string> | undefined;
                  const res = !c ? "?" : Number(c.wins) > 0 ? "W" : Number(c.ties) > 0 ? "D" : "L";
                  return (
                    <div key={i} title={res === "W" ? "Victoire" : res === "D" ? "Nul" : "Défaite"}
                      style={{ width: 18, height: 28, borderRadius: 3,
                        background: res === "W" ? "var(--green)" : res === "D" ? "#eab308" : res === "L" ? "var(--red)" : "var(--border)",
                        opacity: 0.85 }} />
                  );
                })}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "16px 20px" }}>
      {/* Widget configurator toggle */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button onClick={() => setEditing(v => !v)}
          style={{ padding: "4px 12px", borderRadius: 5, fontSize: 11, cursor: "pointer",
            background: editing ? "var(--accent)" : "var(--hover)",
            border: `1px solid ${editing ? "var(--accent)" : "var(--border)"}`,
            color: editing ? "#000" : "var(--muted)",
            fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.06em" }}>
          {editing ? "FERMER" : "CONFIGURER WIDGETS"}
        </button>
      </div>

      {/* Widget picker */}
      {editing && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16, padding: "12px 14px",
          background: "var(--hover)", borderRadius: 8, border: "1px solid var(--border)" }}>
          {ALL_WIDGETS.map(({ id, label }) => {
            const active = widgets.includes(id);
            return (
              <button key={id} onClick={() => {
                setWidgets(active
                  ? widgets.length > 1 ? widgets.filter(w => w !== id) : widgets
                  : [...widgets, id]);
              }}
                style={{ padding: "4px 12px", borderRadius: 12, fontSize: 10, cursor: "pointer",
                  border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                  background: active ? "rgba(0,212,255,0.12)" : "transparent",
                  color: active ? "var(--accent)" : "var(--muted)" }}>
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* Widget grid — bento staggered */}
      <div className="stagger-container"
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
        {widgets.map(id => renderWidget(id)).filter(Boolean)}
      </div>
    </div>
  );
}

export function MainPanel() {
  const { currentClub, players, matches, activeTab, isLoading, error, activeSession,
    sidebarTab, setSidebarTab, discordWebhook, addToast, visibleKpis, setVisibleKpis,
    persistSettings, compactMode, setCompactMode, toggleGlobalSearch } = useAppStore();
  const t = useT();
  const [logo, setLogo] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [editingKpis, setEditingKpis] = useState(false);
  const [showAnnounce, setShowAnnounce] = useState(false);
  const [showPoll, setShowPoll] = useState(false);
  const [showHighlight, setShowHighlight] = useState(false);
  const [showSeasonThread, setShowSeasonThread] = useState(false);
  const [showWeeklyRanking, setShowWeeklyRanking] = useState(false);
  const [showSeasonReport, setShowSeasonReport] = useState(false);
  const [dashboardMode, setDashboardMode] = useState(false);
  const [dashWidgets, setDashWidgets] = useState<string[]>(["forme", "serie", "derniers_matchs", "top_joueur", "kpis_rapides", "heatmap"]);

  const shareTab = async () => {
    if (!discordWebhook || !currentClub) return;
    setSharing(true);
    try {
      let embed;
      if (activeTab === "players") embed = buildPlayersEmbed(players, currentClub.name);
      else if (activeTab === "matches") embed = buildMatchesEmbed(matches, currentClub.id, currentClub.name);
      else embed = buildChartsEmbed(currentClub);
      await sendDiscordWebhook(discordWebhook, [embed]);
      addToast("Envoyé sur Discord !", "success");
    } catch (e) { addToast(`Discord: ${String(e)}`, "error"); }
    finally { setSharing(false); }
  };

  const TAB_LABELS: Record<string, string> = {
    players: t("nav.players"),
    matches: t("nav.matches"),
    charts: t("nav.charts"),
    session: t("nav.session"),
    compare: t("nav.compare"),
  };

  useEffect(() => {
    setLogo(null);
    if (currentClub?.crestAssetId) {
      getLogo(currentClub.crestAssetId).then(setLogo).catch(() => {});
    }
  }, [currentClub?.id]);

  const total  = (currentClub?.wins ?? 0) + (currentClub?.losses ?? 0) + (currentClub?.ties ?? 0);
  const winPct = total > 0 ? Math.round(((currentClub?.wins ?? 0) / total) * 100) : 0;
  const goalsPerMatch = total > 0 ? ((currentClub?.goals ?? 0) / total).toFixed(1) : "0.0";
  const points = (currentClub?.wins ?? 0) * 3 + (currentClub?.ties ?? 0);

  // ── Score de forme (10 derniers matchs) ────────────────────────────
  const { formScore, formLabel, formColor, streakText, streakColor } = useMemo(() => {
    if (!currentClub || matches.length === 0) return { formScore: null, formLabel: "", formColor: "var(--muted)", streakText: null, streakColor: "var(--muted)" };
    const sorted = [...matches].sort((a, b) => Number(a.timestamp) - Number(b.timestamp)).slice(-10);
    let pts = 0;
    const results: string[] = [];
    for (const m of sorted) {
      const c = m.clubs[currentClub.id] as Record<string, string> | undefined;
      if (!c) continue;
      if (Number(c.wins) > 0)   { pts += 3; results.push("W"); }
      else if (Number(c.ties) > 0) { pts += 1; results.push("D"); }
      else                       { results.push("L"); }
    }
    const maxPts = results.length * 3;
    const score = maxPts > 0 ? Math.round((pts / maxPts) * 100) : 0;
    const fColor = score >= 66 ? "var(--green)" : score >= 33 ? "#eab308" : "var(--red)";
    const fLabel = score >= 66 ? "BONNE FORME" : score >= 33 ? "FORME MOYENNE" : "MAUVAISE FORME";
    // Streak
    let streak = 0, sType = "";
    for (let i = results.length - 1; i >= 0; i--) {
      if (streak === 0) { sType = results[i]; streak = 1; }
      else if (results[i] === sType) streak++;
      else break;
    }
    const sEmoji = sType === "W" ? "🔥" : sType === "D" ? "🤝" : "📉";
    const sColor = sType === "W" ? "var(--green)" : sType === "D" ? "#eab308" : "var(--red)";
    const sText = streak >= 2 ? `${sEmoji} ${streak} ${sType === "W" ? "V" : sType === "D" ? "N" : "D"} de suite` : null;
    return { formScore: score, formLabel: fLabel, formColor: fColor, streakText: sText, streakColor: sColor };
  }, [matches, currentClub]);

  const ALL_KPIS_CATALOG = currentClub ? [
    { key: "matches",      label: t("main.matches"),      value: total,                color: "var(--accent)", desc: "Victoires + Nuls + Défaites" },
    { key: "wins",         label: t("main.wins"),         value: currentClub.wins,     color: "var(--green)",  desc: "Nombre de victoires" },
    { key: "draws",        label: t("main.draws"),        value: currentClub.ties,     color: "var(--gold)",   desc: "Nombre de matchs nuls" },
    { key: "losses",       label: t("main.losses"),       value: currentClub.losses,   color: "var(--red)",    desc: "Nombre de défaites" },
    { key: "winRate",      label: t("main.winRate"),      value: `${winPct}%`,          color: "var(--accent)", desc: "Victoires / Total matchs" },
    { key: "goals",        label: t("main.goals"),        value: currentClub.goals,    color: "var(--gold)",   desc: "Buts marqués au total" },
    { key: "goalsPerMatch",label: t("main.goalsPerMatch"),value: goalsPerMatch,         color: "var(--gold)",   desc: "Moyenne de buts par match" },
    { key: "points",       label: t("main.points"),       value: points,               color: "var(--green)",  desc: "V×3 + N×1 (points ligue)" },
    { key: "forme",        label: "FORME",                value: formScore !== null ? `${formScore}` : "—",  color: formColor, desc: "Score de forme sur 10 matchs (/100)" },
  ] : [];

  const KPIS = ALL_KPIS_CATALOG.filter(k => visibleKpis.includes(k.key));

  // ── Profile settings page ─────────────────────────────────────────
  if (sidebarTab === "profile") {
    return (
      <main id="main-content" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--main-bg)" }}
        role="main" aria-label="Paramètres profil">
        <div style={{
          height: 48, display: "flex", alignItems: "center", gap: 8,
          padding: "0 16px", borderBottom: "1px solid rgba(0,0,0,0.24)",
          flexShrink: 0, background: "var(--main-bg)",
        }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>Paramètres profil</span>
        </div>
        <ProfilePanel />
      </main>
    );
  }

  // ── Settings page ──────────────────────────────────────────────────
  if (!isLoading && sidebarTab === "settings") {
    return (
      <main id="main-content" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--main-bg)" }}
        role="main" aria-label={t("settings.title")}>
        <div style={{
          height: 48, display: "flex", alignItems: "center", gap: 8,
          padding: "0 16px", borderBottom: "1px solid rgba(0,0,0,0.24)",
          flexShrink: 0, background: "var(--main-bg)",
        }}>
          <button onClick={() => setSidebarTab("search")} style={{
            background: "none", border: "none", cursor: "pointer", color: "var(--muted)",
            display: "flex", alignItems: "center", padding: 4, borderRadius: 4,
            transition: "color 0.15s",
          }} aria-label={t("sidebar.search")}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--muted)"; }}>
            <Settings size={18} />
          </button>
          <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>{t("settings.title")}</span>
        </div>
        <div style={{ flex: 1, overflow: "auto", maxWidth: 600, margin: "0 auto", width: "100%" }}>
          <SettingsTab />
        </div>
      </main>
    );
  }

  // ── Club loaded ────────────────────────────────────────────────────
  return (
    <>
    <main id="main-content" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--main-bg)" }}
      role="main" aria-label={TAB_LABELS[activeTab] || t("nav.players")}>

      {/* ── Header contextuel ─────────────────────────────────────────── */}
      <div style={{
        height: 44,
        display: "flex", alignItems: "center", gap: 8,
        padding: "0 16px",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
        background: "var(--surface)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        position: "sticky", top: 0,
        zIndex: "var(--z-header)" as unknown as number,
      }}>
        {currentClub && <div className="refresh-bar" aria-hidden="true" />}
        {/* Search — gauche */}
        <button onClick={toggleGlobalSearch} title="Recherche globale (Ctrl+K)"
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "5px 10px", background: "var(--hover)", border: "1px solid var(--border)",
            borderRadius: 6, color: "var(--muted)", fontSize: 11, cursor: "pointer", flex: 1, maxWidth: 200,
          }}>
          <Search size={12} />
          <span style={{ opacity: 0.6 }}>Rechercher…</span>
          <kbd style={{ marginLeft: "auto", fontSize: 9, opacity: 0.5, background: "var(--card)", padding: "1px 4px", borderRadius: 3 }}>Ctrl+K</kbd>
        </button>
        {/* Vue buttons — droite */}
        {currentClub && (
          <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
            <button onClick={() => setDashboardMode(v => !v)}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "5px 10px",
                background: dashboardMode ? "rgba(var(--accent-rgb,59,130,246),0.12)" : "var(--hover)",
                border: `1px solid ${dashboardMode ? "var(--accent)" : "var(--border)"}`,
                borderRadius: 6, color: dashboardMode ? "var(--accent)" : "var(--muted)",
                fontSize: 10, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.08em",
                fontWeight: 700, cursor: "pointer", transition: "all 0.15s",
              }}>
              <LayoutDashboard size={11} /> VUE DASHBOARD
            </button>
            <button onClick={() => setCompactMode(!compactMode)}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "5px 10px",
                background: compactMode ? "rgba(var(--accent-rgb,59,130,246),0.12)" : "var(--hover)",
                border: `1px solid ${compactMode ? "var(--accent)" : "var(--border)"}`,
                borderRadius: 6, color: compactMode ? "var(--accent)" : "var(--muted)",
                fontSize: 10, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.08em",
                fontWeight: 700, cursor: "pointer", transition: "all 0.15s",
              }}>
              <Minimize2 size={11} /> VUE COMPACTE
            </button>
          </div>
        )}
      </div>

      {/* ── Club banner ─────────────────────────────────────────── */}
      {currentClub && (
        <div style={{
          display: "flex", alignItems: "center", gap: 14, padding: "14px 20px",
          background: "var(--hover)", flexShrink: 0,
        }}>
          {/* Left accent bar */}
          <div style={{ width: 4, alignSelf: "stretch", background: "var(--accent)", borderRadius: 2, flexShrink: 0 }} />
          {/* Logo */}
          <div style={{
            width: 52, height: 52, borderRadius: 12,
            background: "var(--surface)", border: "1px solid var(--border)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, overflow: "hidden",
          }}>
            {logo
              ? <img src={logo} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              : <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: "var(--accent)" }}>
                  {(currentClub.name || "?")[0].toUpperCase()}
                </span>
            }
          </div>
          {/* Name + meta */}
          <div style={{ flex: 1 }}>
            <div style={{
              fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: "var(--text)",
              letterSpacing: "0.04em", lineHeight: 1,
            }}>
              {currentClub.name || `Club #${currentClub.id}`}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              <span style={{ fontSize: 11, color: "var(--accent)", fontWeight: 600 }}>
                {currentClub.platform.toUpperCase()}
              </span>
              {currentClub.skillRating && (
                <>
                  <span style={{ color: "var(--border)" }}>·</span>
                  <span style={{ fontSize: 11, color: "var(--gold)", fontWeight: 600 }}>
                    ★ {currentClub.skillRating} SR
                  </span>
                </>
              )}
            </div>
          </div>
          {/* Forme + Série */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, marginLeft: "auto" }}>
            {formScore !== null && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ display: "flex", gap: 2 }}>
                  {[...matches]
                    .sort((a, b) => Number(a.timestamp) - Number(b.timestamp))
                    .slice(-10)
                    .map((m, i) => {
                      const c = m.clubs[currentClub!.id] as Record<string, string> | undefined;
                      const res = !c ? "?" : Number(c.wins) > 0 ? "W" : Number(c.ties) > 0 ? "D" : "L";
                      return (
                        <div key={i} title={res === "W" ? "Victoire" : res === "D" ? "Nul" : "Défaite"}
                          style={{ width: 6, height: 16, borderRadius: 2,
                            background: res === "W" ? "var(--green)" : res === "D" ? "#eab308" : res === "L" ? "var(--red)" : "var(--border)",
                            opacity: 0.85 }} />
                      );
                    })}
                </div>
                <span style={{ fontSize: 10, color: formColor, fontWeight: 700, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.04em" }}>
                  {formScore}/100
                </span>
              </div>
            )}
            {streakText && (
              <span style={{ fontSize: 10, color: streakColor, fontWeight: 700 }}>{streakText}</span>
            )}
          </div>
          {/* Actions Discord */}
          {discordWebhook && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 8 }}>
              {["players", "matches", "charts"].includes(activeTab) && (
                <button onClick={shareTab} disabled={sharing} title="Partager sur Discord"
                  style={{
                    display: "flex", alignItems: "center", gap: 4,
                    padding: "4px 8px", background: "rgba(0,242,255,0.08)",
                    border: "1px solid rgba(0,242,255,0.2)", borderRadius: 5,
                    color: sharing ? "var(--muted)" : "var(--accent)", fontSize: 10, cursor: sharing ? "default" : "pointer",
                    opacity: sharing ? 0.6 : 1, transition: "all 0.15s",
                    fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.06em",
                  }}>
                  <Send size={11} /> PARTAGER
                </button>
              )}
              {[
                { icon: <Megaphone size={11} />, action: () => setShowAnnounce(true), title: "Annonce pré-match" },
                { icon: <ListChecks size={11} />, action: () => setShowPoll(true), title: "Sondage Discord" },
                { icon: <Sparkles size={11} />, action: () => setShowHighlight(true), title: "Moment fort" },
                { icon: <BookOpen size={11} />, action: () => setShowSeasonThread(true), title: "Thread saison" },
                { icon: <Trophy size={11} />, action: () => setShowWeeklyRanking(true), title: "Classement semaine" },
                { icon: <BarChart2 size={11} />, action: () => setShowSeasonReport(true), title: "Rapport de saison" },
              ].map(({ icon, action, title }) => (
                <button key={title} onClick={action} title={title}
                  style={{
                    display: "flex", alignItems: "center", padding: "4px 6px",
                    background: "var(--hover)", border: "1px solid var(--border)",
                    borderRadius: 5, color: "var(--muted)", cursor: "pointer", fontSize: 11,
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "var(--muted)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; }}>
                  {icon}
                </button>
              ))}
            </div>
          )}
          {/* LIVE badge */}
          {activeSession && (
            <span style={{
              fontSize: 11, color: "#fff", background: "var(--red)",
              padding: "4px 10px", borderRadius: 4, fontWeight: 700,
              display: "flex", alignItems: "center", gap: 5,
            }} role="status">
              <span className="pulse-dot" style={{ width: 7, height: 7 }} />
              LIVE
            </span>
          )}
        </div>
      )}

      {/* ── KPI cards ─────────────────────────────────────────────── */}
      {currentClub && (
        <div style={{ position: "relative", flexShrink: 0 }}>
          <div style={{
            display: "flex", alignItems: "stretch", gap: 8, padding: "12px 16px",
            borderBottom: "1px solid rgba(0,0,0,0.12)",
          }} role="group" aria-label="KPIs">
            {KPIS.map(({ key, label, value, color }) => (
              <div key={key} className="hover-lift" style={{
                flex: 1, background: "var(--hover)", borderRadius: 8,
                padding: "10px 12px", textAlign: "center", cursor: "default",
              }}>
                <div className="kpi-value" style={{
                  fontFamily: "'Bebas Neue', sans-serif", fontSize: 24,
                  color, lineHeight: 1,
                }}>{value}</div>
                <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.06em", marginTop: 4, fontWeight: 600 }}>
                  {label}
                </div>
              </div>
            ))}
            {/* Bouton Éditer */}
            <button
              onClick={() => setEditingKpis(v => !v)}
              title={t("main.editKpis")}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                gap: 4, padding: "8px 10px", background: editingKpis ? "var(--accent)" : "var(--hover)",
                border: `1px solid ${editingKpis ? "var(--accent)" : "var(--border)"}`,
                borderRadius: 8, cursor: "pointer", color: editingKpis ? "#fff" : "var(--muted)",
                transition: "all 0.15s", flexShrink: 0, minWidth: 40,
              }}
              onMouseEnter={(e) => { if (!editingKpis) { e.currentTarget.style.color = "var(--text)"; e.currentTarget.style.borderColor = "var(--accent)"; } }}
              onMouseLeave={(e) => { if (!editingKpis) { e.currentTarget.style.color = "var(--muted)"; e.currentTarget.style.borderColor = "var(--border)"; } }}
            >
              <Pencil size={13} />
              <span style={{ fontSize: 8, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.06em" }}>
                {t("main.editKpis")}
              </span>
            </button>
          </div>

          {/* ── Panel éditeur KPI ─────────────────────────────────── */}
          {editingKpis && (
            <div
              style={{
                position: "absolute", top: "calc(100% - 1px)", right: 0, zIndex: 200,
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: "0 0 10px 10px", padding: "14px 16px", width: 260,
                boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
              }}
            >
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, letterSpacing: "0.08em", color: "var(--accent)" }}>
                  {t("main.kpiPanelTitle")}
                </span>
                <button
                  onClick={() => setEditingKpis(false)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", display: "flex", padding: 2 }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--muted)"; }}
                >
                  <X size={14} />
                </button>
              </div>

              {/* Liste des KPIs */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {ALL_KPIS_CATALOG.map(kpi => {
                  const active = visibleKpis.includes(kpi.key);
                  return (
                    <label
                      key={kpi.key}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                        padding: "7px 10px", borderRadius: 6, transition: "background 0.1s",
                        background: active ? "rgba(var(--accent-rgb, 0,212,255), 0.08)" : "transparent",
                        border: `1px solid ${active ? "rgba(var(--accent-rgb, 0,212,255), 0.2)" : "transparent"}`,
                      }}
                    >
                      {/* Checkbox custom */}
                      <div
                        style={{
                          width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                          border: `2px solid ${active ? "var(--accent)" : "var(--border)"}`,
                          background: active ? "var(--accent)" : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          transition: "all 0.15s",
                        }}
                        onClick={() => {
                          let next: string[];
                          if (active) {
                            if (visibleKpis.length <= 1) return;
                            next = visibleKpis.filter(k => k !== kpi.key);
                          } else {
                            next = [...visibleKpis, kpi.key];
                          }
                          setVisibleKpis(next);
                          persistSettings();
                        }}
                      >
                        {active && (
                          <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                            <path d="M1.5 4.5L3.5 6.5L7.5 2.5" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                      <div style={{ flex: 1, pointerEvents: "none" }}>
                        <div style={{ fontSize: 12, fontFamily: "'Bebas Neue', sans-serif", color: kpi.color, letterSpacing: "0.05em" }}>
                          {kpi.label}
                        </div>
                        <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 1 }}>
                          {kpi.desc}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Content ───────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        {isLoading && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 10,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)",
          }} role="status" aria-label={t("misc.loading")}>
            <Spinner size={40} />
          </div>
        )}
        {error && (
          <div style={{
            position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)",
            zIndex: 10, background: "rgba(218,55,60,0.9)", color: "#fff",
            padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 500,
          }} role="alert">
            {error}
          </div>
        )}

        {!currentClub && !isLoading ? (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", height: "100%", color: "var(--muted)", gap: 16,
          }}>
            <BarChart2 size={56} style={{ opacity: 0.3 }} aria-hidden="true" />
            <p style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: "0.1em", opacity: 0.5 }}>
              {t("main.searchToStart")}
            </p>
          </div>
        ) : dashboardMode && currentClub ? (
          <DashboardView
            widgets={dashWidgets}
            setWidgets={setDashWidgets}
            club={currentClub}
            matches={matches}
            players={players}
            formScore={formScore}
            formColor={formColor}
            formLabel={formLabel}
            streakText={streakText}
            streakColor={streakColor}
          />
        ) : (
          <div key={activeTab} className="tab-content" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
            {activeTab === "players"  && <PlayersTab />}
            {activeTab === "matches"  && <MatchesTab />}
            {activeTab === "charts"   && <ChartsTab />}
            {activeTab === "session"  && <SessionTab />}
            {activeTab === "compare"  && <CompareTab />}
          </div>
        )}
      </div>
    </main>
    {showAnnounce     && <MatchAnnounceModal  onClose={() => setShowAnnounce(false)} />}
    {showPoll         && <DiscordPollModal    onClose={() => setShowPoll(false)} />}
    {showHighlight    && <HighlightModal      onClose={() => setShowHighlight(false)} />}
    {showSeasonThread && <SeasonThreadModal   onClose={() => setShowSeasonThread(false)} />}
    {showWeeklyRanking && <WeeklyRankingModal onClose={() => setShowWeeklyRanking(false)} />}
    {showSeasonReport && <SeasonReportModal   onClose={() => setShowSeasonReport(false)} />}
    </>
  );
}
