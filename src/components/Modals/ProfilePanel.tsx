import { useState, useMemo, useRef } from "react";
import { Link, User, Unlink, Send, Database, Plus, ChevronRight, Download, Upload, Image, Clock, Trash2, FileDown, FileUp, EyeOff } from "lucide-react";
import { searchClub, getMembers, saveSettings as apiSave } from "../../api/tauri";
import { sendDiscordWebhook } from "../../api/discord";
import { useAppStore } from "../../store/useAppStore";
import { useClub } from "../../hooks/useClub";
import { PLATFORMS } from "../../types";
import type { Club, EaProfile, SyncEntry } from "../../types";

const inputStyle: React.CSSProperties = {
  width: "100%", background: "var(--card)", border: "1px solid var(--border)",
  color: "var(--text)", padding: "8px 12px", borderRadius: 6, fontSize: 13,
  outline: "none", boxSizing: "border-box", transition: "border-color 0.15s",
};

const labelStyle: React.CSSProperties = {
  fontSize: 10, color: "var(--muted)", letterSpacing: "0.08em",
  fontFamily: "'Bebas Neue', sans-serif", display: "block", marginBottom: 5,
};

const TILE: React.CSSProperties = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "16px",
};

const TILE_TITLE: React.CSSProperties = {
  fontSize: 10, color: "var(--muted)", letterSpacing: "0.1em",
  fontFamily: "'Bebas Neue', sans-serif", marginBottom: 12,
  display: "flex", alignItems: "center", gap: 6,
};

function getDivision(sr: number): { div: string; color: string } {
  if (sr >= 3000) return { div: "Elite", color: "#f59e0b" };
  if (sr >= 2700) return { div: "Div 1", color: "#f59e0b" };
  if (sr >= 2400) return { div: "Div 2", color: "#f59e0b" };
  if (sr >= 2100) return { div: "Div 3", color: "#a855f7" };
  if (sr >= 1800) return { div: "Div 4", color: "#a855f7" };
  if (sr >= 1500) return { div: "Div 5", color: "#3b82f6" };
  if (sr >= 1300) return { div: "Div 6", color: "#3b82f6" };
  if (sr >= 1100) return { div: "Div 7", color: "#22c55e" };
  if (sr >= 900)  return { div: "Div 8", color: "#22c55e" };
  if (sr >= 700)  return { div: "Div 9", color: "#6b7280" };
  return              { div: "Div 10", color: "#6b7280" };
}

function SyncEntryRow({ entry }: { entry: SyncEntry }) {
  const d = new Date(entry.ts);
  const dateStr = `${d.toLocaleDateString("fr-FR")} ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0",
      borderBottom: "1px solid var(--border)" }}>
      <span style={{ color: entry.status === "ok" ? "var(--green)" : "var(--red)", fontSize: 8 }}>●</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {entry.clubName}
          {entry.matchCount > 0 && <span style={{ color: "var(--accent)", marginLeft: 4 }}>+{entry.matchCount}</span>}
        </div>
        {entry.note && <div style={{ fontSize: 10, color: "var(--muted)" }}>{entry.note}</div>}
      </div>
      <span style={{ fontSize: 10, color: "var(--muted)", whiteSpace: "nowrap" }}>{dateStr}</span>
    </div>
  );
}

export function ProfilePanel() {
  const {
    eaProfile, setEaProfile, eaProfiles, addEaProfile, removeEaProfile, switchEaProfile,
    syncHistory, addSyncEntry,
    addLog, persistSettings, setSidebarTab,
    discordWebhook, setDiscordWebhook, addToast,
    matchCache, sessions, matches, currentClub,
    loadSettings,
    cacheTimestamps, cacheOwners,
    clearMatchCacheKey, clearAllMatchCache, clearMatchCacheForPeriod, clearMatchCacheForProfile,
    streamingMode,
  } = useAppStore();

  const mask = (value: string, chars = 4) =>
    streamingMode ? value.slice(0, chars) + "••••••" : value;
  const { load } = useClub();

  const [gamertag, setGamertag] = useState(eaProfile?.gamertag ?? "");
  const [clubSearch, setClubSearch] = useState(eaProfile?.clubName ?? "");
  const [platform, setPlatform] = useState(eaProfile?.platform ?? "common-gen5");
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [webhookDraft, setWebhookDraft] = useState(discordWebhook);
  const [testing, setTesting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showPeriodDelete, setShowPeriodDelete] = useState<string | null>(null);
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  const cacheImportRef = useRef<HTMLInputElement>(null);

  const srNum = useMemo(() => {
    if (!eaProfile?.clubId) return null;
    if (currentClub?.id === eaProfile.clubId && currentClub.skillRating) {
      return Number(currentClub.skillRating) || null;
    }
    const keys = Object.keys(matchCache).filter(k => k.startsWith(`${eaProfile.clubId}_`));
    for (const key of keys) {
      const ms = matchCache[key];
      if (!ms?.length) continue;
      const m = ms[0];
      const club = m.clubs?.[eaProfile.clubId];
      if (club) {
        const sr = Number((club as Record<string, unknown>).skillRating ?? (club as Record<string, unknown>).skill_rating ?? 0);
        if (sr > 0) return sr;
      }
    }
    return null;
  }, [eaProfile, currentClub, matchCache]);

  const division = srNum ? getDivision(srNum) : null;

  const aggStats = useMemo(() => {
    if (!eaProfile?.gamertag || !eaProfile?.clubId) return null;
    const gt = eaProfile.gamertag.toLowerCase();
    const cid = eaProfile.clubId;
    let games = 0, goals = 0, assists = 0, motm = 0, ratingSum = 0, ratingCount = 0;
    const processMatches = (ms: typeof matches) => {
      for (const m of ms) {
        const clubPlayers = (m.players?.[cid] ?? {}) as Record<string, Record<string, unknown>>;
        const entry = Object.entries(clubPlayers).find(([, v]) => {
          const name = String(v["name"] ?? v["playername"] ?? v["playerName"] ?? "").toLowerCase();
          return name === gt;
        });
        if (!entry) continue;
        const p = entry[1];
        games++;
        goals += Number(p["goals"] ?? 0);
        assists += Number(p["assists"] ?? 0);
        motm += (p["mom"] === "1" || p["manofthematch"] === "1") ? 1 : 0;
        const r = Number(p["rating"] ?? p["ratingAve"] ?? 0);
        if (r > 0) { ratingSum += r; ratingCount++; }
      }
    };
    for (const s of sessions) processMatches(s.matches);
    processMatches(matches);
    if (games === 0) return null;
    return { games, goals, assists, motm, avgRating: ratingCount > 0 ? (ratingSum / ratingCount).toFixed(2) : null };
  }, [eaProfile, sessions, matches]);

  const handleLink = async () => {
    if (!gamertag.trim() || !clubSearch.trim()) return;
    setLinking(true); setError(null);
    addLog(`Liaison profil: "${gamertag}" dans "${clubSearch}"…`);
    try {
      const clubs = await searchClub(clubSearch.trim(), platform);
      if (!clubs.length) { setError("Aucun club trouvé."); return; }
      let found: Club | null = null;
      for (const club of clubs.slice(0, 10)) {
        const members = await getMembers(club.id, club.platform).catch(() => []);
        if (members.find((m) => m.name.toLowerCase() === gamertag.trim().toLowerCase())) {
          found = club; break;
        }
      }
      if (found) {
        const profile: EaProfile = { gamertag: gamertag.trim(), platform, clubId: found.id, clubName: found.name };
        setEaProfile(profile);
        addEaProfile(profile);
        await persistSettings();
        setShowLinkForm(false);
        addLog(`Profil lié: ${found.name}`);
      } else {
        setError("Gamertag introuvable dans les membres du club.");
      }
    } catch (e) {
      setError(`Erreur: ${String(e)}`);
    } finally {
      setLinking(false);
    }
  };

  const handleUnlink = () => {
    setEaProfile({ gamertag: "", platform: "common-gen5", clubId: "", clubName: "" });
    persistSettings();
  };

  const handleLoadClub = () => {
    if (!eaProfile?.clubId) return;
    load(eaProfile.clubId, eaProfile.platform);
    setSidebarTab("search");
    addSyncEntry({
      ts: new Date().toISOString(),
      clubId: eaProfile.clubId,
      clubName: eaProfile.clubName,
      matchCount: 0, status: "ok", note: "Chargement manuel",
    });
    persistSettings();
  };

  function freshness(key: string): string {
    const ts = cacheTimestamps[key];
    if (!ts) return "jamais";
    const diffMin = Math.round((Date.now() - ts) / 60000);
    if (diffMin < 1) return "à l'instant";
    if (diffMin < 60) return `il y a ${diffMin} min`;
    const diffH = Math.round(diffMin / 60);
    if (diffH < 24) return `il y a ${diffH}h`;
    return `il y a ${Math.round(diffH / 24)}j`;
  }

  const exportCacheJson = () => {
    try {
      const blob = new Blob([JSON.stringify(matchCache, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `prostats_cache_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      addToast("Cache exporté !", "success");
    } catch (e) { addToast(`Export cache échoué: ${String(e)}`, "error"); }
  };

  const importCacheJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target?.result as string) as Record<string, unknown>;
        const s = useAppStore.getState();
        const merged = { ...s.matchCache };
        for (const [key, value] of Object.entries(data)) {
          if (Array.isArray(value)) merged[key] = value as never;
        }
        const payload = {
          history: s.history, favs: s.favs, tactics: s.tactics, sessions: s.sessions,
          compareHistory: s.compareHistory, eaProfile: s.eaProfile ?? undefined, eaProfiles: s.eaProfiles,
          syncHistory: s.syncHistory, theme: s.theme, darkMode: s.darkMode, proxyUrl: s.proxyUrl || undefined,
          showGrid: s.showGrid, showAnimations: s.showAnimations, showLogs: s.showLogs, showIdSearch: s.showIdSearch,
          fontSize: String(s.fontSize), fontFamily: s.fontFamily, customAccent: s.customAccent || undefined,
          language: s.language, onboarded: s.onboarded, matchCache: merged,
          cacheTimestamps: s.cacheTimestamps, cacheOwners: s.cacheOwners,
          discordWebhook: s.discordWebhook || undefined, autoUpdate: s.autoUpdate,
          matchAnnotations: s.matchAnnotations, visibleKpis: s.visibleKpis, navLayout: s.navLayout,
        };
        await apiSave(payload);
        await loadSettings();
        addToast("Cache importé et fusionné !", "success");
      } catch { addToast("Fichier cache invalide", "error"); }
    };
    reader.readAsText(file);
  };

  const exportBackup = async () => {
    try {
      const s = useAppStore.getState();
      const payload = {
        history: s.history, favs: s.favs, tactics: s.tactics, sessions: s.sessions,
        compareHistory: s.compareHistory, eaProfile: s.eaProfile ?? undefined, eaProfiles: s.eaProfiles,
        syncHistory: s.syncHistory, theme: s.theme, darkMode: s.darkMode, proxyUrl: s.proxyUrl || undefined,
        showGrid: s.showGrid, showAnimations: s.showAnimations, showLogs: s.showLogs, showIdSearch: s.showIdSearch,
        fontSize: String(s.fontSize), fontFamily: s.fontFamily, customAccent: s.customAccent || undefined,
        language: s.language, onboarded: s.onboarded, matchCache: s.matchCache,
        discordWebhook: s.discordWebhook || undefined, autoUpdate: s.autoUpdate,
        matchAnnotations: s.matchAnnotations, visibleKpis: s.visibleKpis, navLayout: s.navLayout,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `prostats_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      addToast("Backup exporté !", "success");
    } catch (e) { addToast(`Export échoué: ${String(e)}`, "error"); }
  };

  const importBackup = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        await apiSave(data);
        await loadSettings();
        addToast("Backup restauré avec succès !", "success");
      } catch { addToast("Fichier de backup invalide", "error"); }
    };
    reader.readAsText(file);
  };

  const generateProfileCard = () => {
    if (!eaProfile?.gamertag) return;
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#00d4ff";
    const canvas = document.createElement("canvas");
    canvas.width = 520; canvas.height = 200;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#1a1c1f"; ctx.fillRect(0, 0, 520, 200);
    ctx.fillStyle = accent; ctx.fillRect(0, 0, 4, 200);
    ctx.beginPath(); ctx.arc(60, 64, 34, 0, Math.PI * 2);
    ctx.fillStyle = accent + "33"; ctx.fill();
    ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = accent; ctx.font = "bold 28px Arial"; ctx.textAlign = "center";
    ctx.fillText(eaProfile.gamertag[0].toUpperCase(), 60, 73);
    ctx.fillStyle = "#ffffff"; ctx.font = "bold 26px Arial"; ctx.textAlign = "left";
    ctx.fillText(eaProfile.gamertag, 110, 52);
    ctx.fillStyle = "#888888"; ctx.font = "14px Arial";
    ctx.fillText(`${eaProfile.clubName} · ${eaProfile.platform}`, 110, 72);
    if (division) {
      ctx.fillStyle = division.color + "22"; ctx.beginPath();
      ctx.roundRect(110, 82, 70, 22, 4); ctx.fill();
      ctx.fillStyle = division.color; ctx.font = "bold 13px Arial"; ctx.textAlign = "left";
      ctx.fillText(division.div, 116, 98);
      if (srNum) { ctx.fillStyle = "#666"; ctx.font = "11px Arial"; ctx.fillText(`${srNum} SR`, 188, 98); }
    }
    ctx.strokeStyle = "#333"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(24, 122); ctx.lineTo(496, 122); ctx.stroke();
    if (aggStats) {
      const stats = [
        { label: "MATCHS", value: String(aggStats.games) },
        { label: "BUTS", value: String(aggStats.goals) },
        { label: "PASSES D.", value: String(aggStats.assists) },
        { label: "MOTM", value: String(aggStats.motm) },
        { label: "NOTE MOY.", value: aggStats.avgRating ?? "—" },
      ];
      const colW = 460 / stats.length;
      stats.forEach((s, i) => {
        const x = 30 + i * colW + colW / 2;
        ctx.fillStyle = accent; ctx.font = "bold 22px Arial"; ctx.textAlign = "center";
        ctx.fillText(s.value, x, 158);
        ctx.fillStyle = "#666"; ctx.font = "10px Arial"; ctx.fillText(s.label, x, 174);
      });
    } else {
      ctx.fillStyle = "#444"; ctx.font = "13px Arial"; ctx.textAlign = "center";
      ctx.fillText("Aucune stat disponible — charge un club pour analyser tes performances", 260, 158);
    }
    ctx.fillStyle = "#444"; ctx.font = "10px Arial"; ctx.textAlign = "right";
    ctx.fillText("ProClubs Stats", 496, 194);
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url; a.download = `${eaProfile.gamertag}_prostats.png`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    addToast("Fiche exportée !", "success");
  };

  const copyDiscordEmbed = () => {
    if (!eaProfile?.gamertag) return;
    const lines = [
      `**${eaProfile.gamertag}** — ${eaProfile.clubName}`,
      division ? `🏆 ${division.div}${srNum ? ` (${srNum} SR)` : ""}` : "",
      aggStats ? [
        `⚽ ${aggStats.goals} buts  🎯 ${aggStats.assists} PD  🌟 ${aggStats.motm} MOTM`,
        aggStats.avgRating ? `📊 Note moy. ${aggStats.avgRating} / ${aggStats.games} matchs` : `🎮 ${aggStats.games} matchs`,
      ].join("\n") : "",
      "_via ProClubs Stats_",
    ].filter(Boolean).join("\n");
    navigator.clipboard.writeText(lines).then(
      () => addToast("Embed copié !", "success"),
      () => addToast("Impossible de copier", "error"),
    );
  };

  const saveWebhook = () => { setDiscordWebhook(webhookDraft); persistSettings(); };
  const testWebhook = async () => {
    const url = webhookDraft.trim();
    if (!url) return;
    setTesting(true);
    try {
      await sendDiscordWebhook(url, [{
        title: "✅ ProClubs Stats — Test", color: 0x00d4ff,
        description: "Webhook Discord correctement configuré !",
        footer: { text: "ProClubs Stats" },
      }]);
      addToast("Message test envoyé !", "success");
    } catch (e) { addToast(`Discord: ${String(e)}`, "error"); }
    finally { setTesting(false); }
  };

  const isLinked = Boolean(eaProfile?.clubId);

  const cacheTypes = isLinked ? [
    { key: `${eaProfile!.clubId}_${eaProfile!.platform}_leagueMatch`, label: "Championnat" },
    { key: `${eaProfile!.clubId}_${eaProfile!.platform}_playoffMatch`, label: "Playoff" },
    { key: `${eaProfile!.clubId}_${eaProfile!.platform}_friendlyMatch`, label: "Amical" },
  ] : [];
  const cacheTotal = cacheTypes.reduce((acc, t) => acc + (matchCache[t.key]?.length ?? 0), 0);

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "20px" }}>

      {/* Streaming banner */}
      {streamingMode && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(245,158,11,0.1)",
          border: "1px solid rgba(245,158,11,0.3)", borderRadius: 6, padding: "6px 10px", marginBottom: 16,
          fontSize: 11, color: "var(--gold)" }}>
          <EyeOff size={12} /> Mode streaming — infos sensibles masquées
        </div>
      )}

      {/* ── Bento grid ── */}
      <div className="profile-panel-grid" style={{
        display: "grid",
        gridTemplateColumns: "1.2fr 1fr 1fr",
        gridTemplateRows: "auto auto auto",
        gap: 12,
      }}>

        {/* ── TILE 1: Identité & Actions (row 1+2, col 1) ── */}
        <div style={{ ...TILE, gridColumn: "1", gridRow: "1 / 3", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={TILE_TITLE}><User size={11} /> MON PROFIL EA</div>

          {/* Avatar + info */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 56, height: 56, borderRadius: "50%",
              background: isLinked ? "var(--accent)" : "var(--surface)",
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "2px solid var(--border)", flexShrink: 0,
            }}>
              {isLinked
                ? <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: "#fff" }}>
                    {eaProfile!.gamertag[0].toUpperCase()}
                  </span>
                : <User size={24} color="var(--muted)" />
              }
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: "var(--text)", letterSpacing: "0.04em" }}>
                {eaProfile?.gamertag ? mask(eaProfile.gamertag) : "Mon profil"}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {eaProfile?.clubName ? `${eaProfile.clubName} · ${streamingMode ? "••••" : eaProfile.platform}` : "Aucun profil EA lié"}
              </div>
              {division && (
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 4, marginTop: 5,
                  padding: "2px 8px", borderRadius: 4, background: division.color + "22",
                  border: `1px solid ${division.color}44`, color: division.color,
                  fontFamily: "'Bebas Neue', sans-serif", fontSize: 12,
                }}>
                  {division.div}
                  {srNum && <span style={{ fontSize: 10, opacity: 0.7 }}>{srNum} SR</span>}
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          {isLinked ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <button onClick={handleLoadClub} style={{
                width: "100%", padding: "9px", background: "var(--accent)", color: "#fff",
                border: "none", borderRadius: 6, fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 13, letterSpacing: "0.08em", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}>
                <User size={13} /> CHARGER MON CLUB
              </button>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setShowLinkForm(v => !v)} style={{
                  flex: 1, padding: "7px", background: "var(--hover)",
                  border: "1px solid var(--border)", color: "var(--text)",
                  borderRadius: 6, fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 11, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                }}>
                  <Plus size={11} /> AJOUTER
                </button>
                <button onClick={handleUnlink} style={{
                  flex: 1, padding: "7px", background: "transparent",
                  border: "1px solid var(--border)", color: "var(--muted)",
                  borderRadius: 6, fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 11, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                }}>
                  <Unlink size={11} /> DÉLIER
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowLinkForm(v => !v)} style={{
              width: "100%", padding: "9px", background: "var(--accent)", color: "#fff",
              border: "none", borderRadius: 6, fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 13, letterSpacing: "0.08em", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>
              <Link size={13} /> LIER MON PROFIL
            </button>
          )}

          {/* Link form */}
          {showLinkForm && (
            <div style={{ background: "var(--surface)", borderRadius: 6, padding: "12px",
              border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.08em",
                fontFamily: "'Bebas Neue', sans-serif", marginBottom: 10 }}>
                LIER UN NOUVEAU PROFIL
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div>
                  <label style={labelStyle}>GAMERTAG / PSN ID</label>
                  <input value={gamertag} onChange={(e) => setGamertag(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleLink()}
                    placeholder="Ton pseudo EA…" style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                    onBlur={(e) => (e.target.style.borderColor = "var(--border)")} />
                </div>
                <div>
                  <label style={labelStyle}>NOM DE TON CLUB</label>
                  <input value={clubSearch} onChange={(e) => setClubSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleLink()}
                    placeholder="Nom exact du club…" style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                    onBlur={(e) => (e.target.style.borderColor = "var(--border)")} />
                </div>
                <div>
                  <label style={labelStyle}>PLATEFORME</label>
                  <select value={platform} onChange={(e) => setPlatform(e.target.value)}
                    style={{ ...inputStyle, fontSize: 12 }}>
                    {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                {error && (
                  <div style={{ background: "rgba(218,55,60,0.1)", border: "1px solid rgba(218,55,60,0.3)",
                    borderRadius: 6, padding: "7px 10px", fontSize: 11, color: "var(--red)" }}>
                    {error}
                  </div>
                )}
                <button onClick={handleLink} disabled={linking || !gamertag.trim() || !clubSearch.trim()} style={{
                  width: "100%", padding: "8px", background: "var(--accent)", color: "#fff",
                  border: "none", borderRadius: 6, fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 12, letterSpacing: "0.08em", cursor: "pointer",
                  opacity: linking || !gamertag.trim() || !clubSearch.trim() ? 0.6 : 1,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                }}>
                  <Link size={12} /> {linking ? "RECHERCHE…" : "LIER"}
                </button>
              </div>
            </div>
          )}

          {/* Fiche partageable */}
          {isLinked && (
            <div>
              <div style={TILE_TITLE}><Image size={11} /> FICHE DE PROFIL</div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={generateProfileCard} style={{
                  flex: 1, padding: "7px", background: "var(--hover)",
                  border: "1px solid var(--border)", borderRadius: 6,
                  color: "var(--text)", fontSize: 11, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                  fontFamily: "'Bebas Neue', sans-serif",
                }}>
                  <Download size={11} /> PNG
                </button>
                <button onClick={copyDiscordEmbed} style={{
                  flex: 1, padding: "7px", background: "rgba(0,242,255,0.08)",
                  border: "1px solid rgba(0,242,255,0.2)", borderRadius: 6,
                  color: "var(--accent)", fontSize: 11, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                  fontFamily: "'Bebas Neue', sans-serif",
                }}>
                  <Send size={11} /> DISCORD
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── TILE 2: Stats perso (row 1, col 2) ── */}
        <div style={{ ...TILE, gridColumn: "2", gridRow: "1" }}>
          <div style={TILE_TITLE}><ChevronRight size={11} /> STATS PERSO</div>
          {aggStats ? (
            <>
              <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 10 }}>
                Sur {aggStats.games} matchs analysés
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {[
                  { label: "BUTS", value: aggStats.goals, color: "var(--green)" },
                  { label: "PASSES D.", value: aggStats.assists, color: "var(--accent)" },
                  { label: "MOTM", value: aggStats.motm, color: "var(--gold)" },
                  { label: "NOTE MOY.", value: aggStats.avgRating ?? "—", color: "var(--text)" },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{
                    background: "var(--surface)", borderRadius: 6, padding: "10px 8px",
                    textAlign: "center", border: "1px solid var(--border)",
                  }}>
                    <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color, lineHeight: 1 }}>
                      {value}
                    </div>
                    <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 4, letterSpacing: "0.06em" }}>
                      {label}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.6 }}>
              Charge un club lié pour afficher tes stats agrégées.
            </div>
          )}
        </div>

        {/* ── TILE 3: Profils enregistrés (row 1, col 3) ── */}
        <div style={{ ...TILE, gridColumn: "3", gridRow: "1", overflow: "hidden" }}>
          <div style={TILE_TITLE}><User size={11} /> PROFILS ({eaProfiles.length})</div>
          {eaProfiles.length === 0 ? (
            <div style={{ fontSize: 11, color: "var(--muted)" }}>Aucun profil enregistré.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 5, overflowY: "auto", maxHeight: 200 }}>
              {eaProfiles.map((p) => {
                const isActive = eaProfile?.gamertag === p.gamertag && eaProfile?.platform === p.platform;
                return (
                  <div key={`${p.gamertag}-${p.platform}`} style={{
                    display: "flex", alignItems: "center", gap: 6, padding: "6px 8px",
                    background: isActive ? "rgba(0,212,255,0.08)" : "var(--surface)",
                    border: `1px solid ${isActive ? "rgba(0,212,255,0.3)" : "var(--border)"}`,
                    borderRadius: 5,
                  }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: "50%",
                      background: isActive ? "var(--accent)" : "var(--card)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0, fontSize: 11, fontWeight: 700,
                      color: isActive ? "#fff" : "var(--muted)",
                      fontFamily: "'Bebas Neue', sans-serif",
                    }}>
                      {p.gamertag[0].toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: isActive ? "var(--accent)" : "var(--text)", fontWeight: 600,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.gamertag}
                      </div>
                      <div style={{ fontSize: 9, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.clubName}
                      </div>
                    </div>
                    {!isActive && (
                      <button onClick={() => { switchEaProfile(p); persistSettings(); }}
                        style={{
                          padding: "3px 6px", background: "var(--card)",
                          border: "1px solid var(--border)", borderRadius: 4,
                          color: "var(--text)", fontSize: 10, cursor: "pointer",
                          fontFamily: "'Bebas Neue', sans-serif",
                        }}>
                        ▶
                      </button>
                    )}
                    <button onClick={() => { removeEaProfile(p.gamertag); persistSettings(); }}
                      style={{
                        padding: "3px 5px", background: "transparent",
                        border: "1px solid var(--border)", borderRadius: 4,
                        color: "var(--muted)", fontSize: 10, cursor: "pointer",
                      }}>
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── TILE 4: Cache (row 2, col 2+3) ── */}
        <div style={{ ...TILE, gridColumn: "2 / 4", gridRow: "2" }}>
          <div style={{ ...TILE_TITLE, justifyContent: "space-between" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Database size={11} /> GESTION DU CACHE ({cacheTotal} / 6000)
            </span>
            {isLinked && (
              <button onClick={() => { clearAllMatchCache(); persistSettings(); }}
                style={{
                  padding: "2px 7px", background: "transparent",
                  border: "1px solid var(--border)", borderRadius: 4,
                  color: "var(--red)", fontSize: 10, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 3,
                  fontFamily: "'Bebas Neue', sans-serif",
                }}>
                <Trash2 size={9} /> TOUT VIDER
              </button>
            )}
          </div>

          {isLinked ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 10 }}>
                {cacheTypes.map(({ key, label }) => {
                  const count = matchCache[key]?.length ?? 0;
                  const pct = Math.min(100, Math.round((count / 2000) * 100));
                  const owner = cacheOwners[key];
                  const isPeriodOpen = showPeriodDelete === key;
                  return (
                    <div key={key} style={{ background: "var(--surface)", borderRadius: 6, padding: "10px 10px",
                      border: "1px solid var(--border)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                        <span style={{ color: "var(--text)", fontWeight: 600 }}>{label}</span>
                        <span style={{ color: count > 0 ? "var(--accent)" : "var(--muted)", fontWeight: 600, fontSize: 10 }}>
                          {count}/2k
                        </span>
                      </div>
                      <div style={{ height: 3, background: "var(--card)", borderRadius: 2, overflow: "hidden", marginBottom: 6 }}>
                        <div style={{
                          height: "100%", width: `${pct}%`,
                          background: pct >= 100 ? "var(--green)" : "var(--accent)",
                          borderRadius: 2, transition: "width 0.3s ease",
                        }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ fontSize: 9, color: "var(--muted)" }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 2 }}>
                            <Clock size={8} /> {freshness(key)}
                          </span>
                          {owner && <span style={{ marginTop: 1, display: "flex", alignItems: "center", gap: 2 }}>
                            <User size={8} /> {owner}
                          </span>}
                        </div>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button onClick={() => setShowPeriodDelete(isPeriodOpen ? null : key)}
                            title="Filtrer par période"
                            style={{ padding: "3px 5px", background: "transparent", border: "1px solid var(--border)",
                              borderRadius: 3, color: "var(--muted)", fontSize: 9, cursor: "pointer" }}>
                            📅
                          </button>
                          <button onClick={() => { clearMatchCacheKey(key); persistSettings(); }}
                            disabled={count === 0}
                            style={{ padding: "3px 5px", background: "transparent", border: "1px solid var(--border)",
                              borderRadius: 3, color: count > 0 ? "var(--red)" : "var(--muted)",
                              fontSize: 9, cursor: count > 0 ? "pointer" : "default",
                              opacity: count > 0 ? 1 : 0.4, display: "flex", alignItems: "center" }}>
                            <Trash2 size={9} />
                          </button>
                        </div>
                      </div>
                      {isPeriodOpen && (
                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
                          <div style={{ fontSize: 9, color: "var(--muted)", marginBottom: 5 }}>
                            Supprimer hors période :
                          </div>
                          <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
                            <input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)}
                              style={{ ...inputStyle, width: "auto", flex: 1, minWidth: 100, fontSize: 10, padding: "4px 6px" }} />
                            <span style={{ color: "var(--muted)", fontSize: 10 }}>→</span>
                            <input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)}
                              style={{ ...inputStyle, width: "auto", flex: 1, minWidth: 100, fontSize: 10, padding: "4px 6px" }} />
                            <button disabled={!periodFrom || !periodTo} onClick={() => {
                              if (!periodFrom || !periodTo) return;
                              clearMatchCacheForPeriod(key, new Date(periodFrom).getTime(), new Date(periodTo + "T23:59:59").getTime());
                              persistSettings(); setShowPeriodDelete(null);
                              setPeriodFrom(""); setPeriodTo("");
                              addToast("Matchs hors période supprimés", "success");
                            }} style={{
                              padding: "4px 8px", background: "var(--red)", color: "#fff",
                              border: "none", borderRadius: 3, fontSize: 10, cursor: "pointer",
                              opacity: periodFrom && periodTo ? 1 : 0.4,
                              fontFamily: "'Bebas Neue', sans-serif",
                            }}>
                              OK
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Per-profile delete */}
              {eaProfiles.length > 1 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 9, color: "var(--muted)", marginBottom: 5 }}>
                    Supprimer le cache d'un profil :
                  </div>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {eaProfiles.map((p) => (
                      <button key={p.gamertag}
                        onClick={() => { clearMatchCacheForProfile(p.gamertag); persistSettings(); addToast(`Cache de ${p.gamertag} supprimé`, "success"); }}
                        style={{
                          padding: "3px 7px", background: "transparent",
                          border: "1px solid var(--border)", borderRadius: 4,
                          color: "var(--muted)", fontSize: 10, cursor: "pointer",
                          display: "flex", alignItems: "center", gap: 3,
                        }}>
                        <Trash2 size={9} /> {p.gamertag}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Export / Import cache */}
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={exportCacheJson} style={{
                  flex: 1, padding: "6px", background: "var(--surface)",
                  border: "1px solid var(--border)", borderRadius: 5,
                  color: "var(--text)", fontSize: 10, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                  fontFamily: "'Bebas Neue', sans-serif",
                }}>
                  <FileDown size={10} /> EXPORTER CACHE
                </button>
                <button onClick={() => cacheImportRef.current?.click()} style={{
                  flex: 1, padding: "6px", background: "var(--surface)",
                  border: "1px solid var(--border)", borderRadius: 5,
                  color: "var(--text)", fontSize: 10, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                  fontFamily: "'Bebas Neue', sans-serif",
                }}>
                  <FileUp size={10} /> IMPORTER CACHE
                </button>
                <input ref={cacheImportRef} type="file" accept=".json" style={{ display: "none" }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) importCacheJson(f); e.target.value = ""; }} />
              </div>
            </>
          ) : (
            <div style={{ fontSize: 11, color: "var(--muted)" }}>Liez un profil pour gérer le cache.</div>
          )}
        </div>

        {/* ── TILE 5: Discord (row 3, col 1+2) ── */}
        <div style={{ ...TILE, gridColumn: "1 / 3", gridRow: "3" }}>
          <div style={TILE_TITLE}>INTÉGRATION DISCORD</div>
          <p style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.5, marginBottom: 8 }}>
            Configure ton webhook Discord pour partager les résumés dans ton serveur.<br />
            <span style={{ fontSize: 10, color: "var(--border)" }}>Serveur → Paramètres du salon → Intégrations → Webhooks</span>
          </p>
          <label style={labelStyle}>URL DU WEBHOOK</label>
          <textarea
            value={streamingMode && webhookDraft ? webhookDraft.slice(0, 30) + "••••••" : webhookDraft}
            onChange={(e) => { if (!streamingMode) setWebhookDraft(e.target.value); }}
            readOnly={streamingMode}
            placeholder="https://discord.com/api/webhooks/…"
            rows={2}
            style={{ ...inputStyle, resize: "none", fontSize: 11, lineHeight: 1.5,
              fontFamily: "monospace", color: webhookDraft ? "var(--text)" : "var(--muted)" }}
            onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
            onBlur={(e) => { e.target.style.borderColor = "var(--border)"; saveWebhook(); }}
          />
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button onClick={saveWebhook} style={{
              flex: 1, padding: "7px", background: "var(--hover)",
              border: "1px solid var(--border)", borderRadius: 5,
              color: "var(--text)", fontSize: 11, cursor: "pointer",
              fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.06em",
            }}>ENREGISTRER</button>
            <button onClick={testWebhook} disabled={!webhookDraft.trim() || testing} style={{
              flex: 1, padding: "7px", background: "rgba(0,242,255,0.08)",
              border: "1px solid rgba(0,242,255,0.2)", borderRadius: 5,
              color: testing ? "var(--muted)" : "var(--accent)", fontSize: 11,
              cursor: webhookDraft.trim() && !testing ? "pointer" : "default",
              opacity: webhookDraft.trim() && !testing ? 1 : 0.5,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
              fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.06em",
              transition: "all 0.15s",
            }}>
              <Send size={11} /> {testing ? "ENVOI…" : "TESTER"}
            </button>
          </div>
          {discordWebhook && (
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--green)" }}>
              <span>●</span> Webhook configuré
            </div>
          )}
        </div>

        {/* ── TILE 6: Backup + Sync (row 3, col 3) ── */}
        <div style={{ ...TILE, gridColumn: "3", gridRow: "3" }}>
          <div style={TILE_TITLE}><Download size={11} /> BACKUP LOCAL</div>
          <p style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.5, marginBottom: 10 }}>
            Exporte ou restaure toutes tes données (sessions, tactics, profils, settings).
          </p>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <button onClick={exportBackup} style={{
              flex: 1, padding: "7px", background: "var(--hover)",
              border: "1px solid var(--border)", borderRadius: 5,
              color: "var(--text)", fontSize: 11, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
              fontFamily: "'Bebas Neue', sans-serif",
            }}>
              <Download size={11} /> EXPORT
            </button>
            <button onClick={() => importRef.current?.click()} style={{
              flex: 1, padding: "7px", background: "var(--hover)",
              border: "1px solid var(--border)", borderRadius: 5,
              color: "var(--text)", fontSize: 11, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
              fontFamily: "'Bebas Neue', sans-serif",
            }}>
              <Upload size={11} /> IMPORT
            </button>
            <input ref={importRef} type="file" accept=".json" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) importBackup(f); e.target.value = ""; }} />
          </div>

          {/* Sync history */}
          {syncHistory.length > 0 && (
            <>
              <button onClick={() => setShowHistory(v => !v)} style={{
                background: "none", border: "none", padding: 0, cursor: "pointer", width: "100%", textAlign: "left",
              }}>
                <div style={{ ...TILE_TITLE, marginBottom: showHistory ? 8 : 0, justifyContent: "space-between" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <Clock size={11} /> SYNC ({syncHistory.length})
                  </span>
                  <span style={{ fontSize: 9, color: "var(--muted)", display: "inline-block",
                    transform: showHistory ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>▼</span>
                </div>
              </button>
              {showHistory && (
                <div style={{ maxHeight: 160, overflow: "auto" }}>
                  {syncHistory.map((e, i) => <SyncEntryRow key={i} entry={e} />)}
                </div>
              )}
            </>
          )}
        </div>

      </div>
    </div>
  );
}
