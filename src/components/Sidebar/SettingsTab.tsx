import { useState, useEffect, useRef } from "react";
import { RefreshCw, Download, Palette, Check, Upload, Save, Trash2, Bell, BellOff, Layers, EyeOff } from "lucide-react";
import { check as checkUpdate } from "@tauri-apps/plugin-updater";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { saveSettings as apiSave } from "../../api/tauri";
import { useAppStore } from "../../store/useAppStore";
import { setPendingUpdate, setPendingManualUrl } from "../../utils/pendingUpdate";
import { THEMES, PALETTE_PRESETS } from "../../types";
import { useT, LANGUAGES } from "../../i18n";
import type { Lang } from "../../i18n";

// ─── Shared tile styles ───────────────────────────────────────────────────────

const TILE: React.CSSProperties = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "16px",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const TILE_TITLE: React.CSSProperties = {
  fontSize: 10, color: "var(--muted)", letterSpacing: "0.1em",
  fontFamily: "'Bebas Neue', sans-serif",
  display: "flex", alignItems: "center", gap: 6,
  marginBottom: 2,
};

const KBD: React.CSSProperties = {
  padding: "2px 6px",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 3,
  fontSize: 10,
  fontFamily: "monospace",
  fontWeight: 700,
  color: "var(--text)",
  letterSpacing: "0.02em",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function Toggle({ label, value, onChange, sublabel }: {
  label: string; value: boolean; onChange: (v: boolean) => void; sublabel?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}
      role="switch" aria-checked={value} aria-label={label} tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onChange(!value); } }}>
      <div>
        <span style={{ fontSize: 12, color: "var(--text)" }}>{label}</span>
        {sublabel && <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 1 }}>{sublabel}</div>}
      </div>
      <div onClick={() => onChange(!value)} style={{
        width: 36, height: 20, borderRadius: 10, flexShrink: 0, cursor: "pointer",
        background: value ? "var(--accent)" : "var(--border)",
        position: "relative", transition: "background 0.15s",
      }}>
        <div style={{
          position: "absolute", top: 2, left: value ? 17 : 2,
          width: 16, height: 16, borderRadius: "50%", background: "#fff",
          transition: "left 0.15s", boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
        }} />
      </div>
    </div>
  );
}

function TileLabel({ children }: { children: React.ReactNode }) {
  return <div style={TILE_TITLE}>{children}</div>;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SettingsTab() {
  const {
    theme, darkMode, showAnimations, showLogs, showIdSearch, fontSize, fontFamily,
    customAccent, customBg, customSurface, customCard,
    language, setTheme, setDarkMode, setShowAnimations, setShowLogs,
    setShowIdSearch, setFontSize, setFontFamily, setCustomAccent,
    setCustomBg, setCustomSurface, setCustomCard, setLanguage,
    autoUpdate, setAutoUpdate, setUpdateAvailable, setUpdateInfo,
    navLayout, setNavLayout,
    streamingMode, setStreamingMode,
    customShortcuts, setCustomShortcut, resetCustomShortcuts,
    scheduledNotifications, addScheduledNotification, updateScheduledNotification, deleteScheduledNotification,
    interfaceProfiles, saveInterfaceProfile, deleteInterfaceProfile, applyInterfaceProfile,
    palettePreset, setPalettePreset,
    addToast, loadSettings, persistSettings,
  } = useAppStore();
  const t = useT();

  const [updateStatus, setUpdateStatus] = useState<"idle" | "checking" | "downloading" | "up-to-date" | "error">("idle");
  const [updateVersion, setUpdateVersionLocal] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState("…");
  const [capturingAction, setCapturingAction] = useState<string | null>(null);
  const [notifTime, setNotifTime] = useState("20:00");
  const [notifDays, setNotifDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [notifMsg, setNotifMsg] = useState("");
  const [profileName, setProfileName] = useState("");
  const settingsImportRef = useRef<HTMLInputElement>(null);

  useEffect(() => { getVersion().then(setAppVersion).catch(() => {}); }, []);
  useEffect(() => { if (autoUpdate) handleCheckUpdate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = (fn: () => void) => { fn(); persistSettings(); };

  const exportSettings = () => {
    try {
      const s = useAppStore.getState();
      const payload = {
        theme: s.theme, darkMode: s.darkMode,
        showGrid: s.showGrid, showAnimations: s.showAnimations,
        showLogs: s.showLogs, showIdSearch: s.showIdSearch,
        fontSize: String(s.fontSize), fontFamily: s.fontFamily,
        customAccent: s.customAccent || undefined, customBg: s.customBg || undefined,
        customSurface: s.customSurface || undefined, customCard: s.customCard || undefined,
        language: s.language, onboarded: s.onboarded, navLayout: s.navLayout,
        tactics: s.tactics, favs: s.favs, history: s.history,
        discordWebhook: s.discordWebhook || undefined, autoUpdate: s.autoUpdate,
        visibleKpis: s.visibleKpis, eaProfile: s.eaProfile ?? undefined,
        eaProfiles: s.eaProfiles, customShortcuts: s.customShortcuts,
        streamingMode: s.streamingMode, scheduledNotifications: s.scheduledNotifications,
        interfaceProfiles: s.interfaceProfiles,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `prostats_settings_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      addToast("Paramètres exportés !", "success");
    } catch (e) { addToast(`Export échoué: ${String(e)}`, "error"); }
  };

  const importSettings = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        const s = useAppStore.getState();
        const merged = {
          ...data,
          sessions: s.sessions, matchCache: s.matchCache,
          cacheTimestamps: s.cacheTimestamps, cacheOwners: s.cacheOwners,
          compareHistory: s.compareHistory ?? [], syncHistory: s.syncHistory ?? [],
          eaProfile: data.eaProfile ?? s.eaProfile ?? undefined,
          eaProfiles: data.eaProfiles ?? s.eaProfiles ?? [],
        };
        await apiSave(merged);
        await loadSettings();
        addToast("Paramètres importés !", "success");
      } catch { addToast("Fichier de paramètres invalide", "error"); }
    };
    reader.readAsText(file);
  };

  const handleKeyCapture = (e: React.KeyboardEvent, action: string) => {
    e.preventDefault();
    const parts: string[] = [];
    if (e.ctrlKey) parts.push("ctrl");
    if (e.shiftKey) parts.push("shift");
    if (e.altKey) parts.push("alt");
    const key = e.key.toLowerCase();
    if (!["control", "shift", "alt", "meta"].includes(key)) parts.push(key);
    if (parts.length > 0 && parts[parts.length - 1] !== parts[0]) {
      setCustomShortcut(action, parts.join("+"));
      persistSettings();
      setCapturingAction(null);
    }
  };

  const handleCheckUpdate = async () => {
    setUpdateStatus("checking");
    setUpdateVersionLocal(null);
    setUpdateError(null);
    try {
      const update = await checkUpdate();
      if (update?.available) {
        setPendingUpdate(update);
        setUpdateInfo(update.version ?? null, update.body ?? null);
        setUpdateAvailable(true);
        setUpdateVersionLocal(update.version ?? null);
        setUpdateStatus("idle");
      } else {
        setUpdateAvailable(false);
        setPendingUpdate(null);
        setUpdateStatus("up-to-date");
        setTimeout(() => setUpdateStatus("idle"), 3000);
      }
    } catch (pluginErr) {
      console.warn("[updater] plugin failed, trying manual check...", pluginErr);
      try {
        const result = await invoke<{ available: boolean; version: string; notes: string; url: string }>(
          "check_for_update", { currentVersion: appVersion }
        );
        if (result.available) {
          const url = `https://github.com/Zoran-n/proclubs-tauri/releases/latest`;
          setPendingManualUrl(url);
          setUpdateInfo(result.version ?? null, result.notes ?? null);
          setUpdateAvailable(true);
          setUpdateVersionLocal(result.version ?? null);
          setUpdateStatus("idle");
        } else {
          setUpdateAvailable(false);
          setPendingUpdate(null);
          setUpdateStatus("up-to-date");
          setTimeout(() => setUpdateStatus("idle"), 3000);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setUpdateError(msg);
        setUpdateStatus("error");
        setTimeout(() => { setUpdateStatus("idle"); setUpdateError(null); }, 10000);
      }
    }
  };

  const DAY_LABELS = ["Di", "Lu", "Ma", "Me", "Je", "Ve", "Sa"];

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "16px" }} role="region" aria-label={t("settings.title")}>

      {/* ══ BENTO GRID — row 1 ══ */}
      <div className="settings-bento" style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gridTemplateRows: "auto auto auto",
        gap: 12,
      }}>

        {/* ── TILE A: Apparence (col 1, row 1) ── */}
        <div style={{ ...TILE, gridColumn: "1", gridRow: "1" }}>
          <TileLabel>{t("settings.appearance")}</TileLabel>

          <Toggle label={t("settings.darkMode")} value={darkMode} onChange={(v) => apply(() => setDarkMode(v))} />

          {/* Palettes */}
          <div>
            <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "'Bebas Neue', sans-serif",
              letterSpacing: "0.08em", marginBottom: 7 }}>PALETTES</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {PALETTE_PRESETS.map((p) => {
                const active = palettePreset === p.id;
                return (
                  <button key={p.id} title={p.label}
                    onClick={() => { setPalettePreset(active ? null : p.id); persistSettings(); }}
                    aria-pressed={active}
                    style={{
                      flex: 1, minWidth: 54, padding: "6px 4px", borderRadius: 5, cursor: "pointer",
                      border: `1px solid ${active ? p.accent : "var(--border)"}`,
                      background: active ? `${p.accent}18` : "var(--surface)",
                      transition: "all 0.15s", display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                    }}>
                    <div style={{ display: "flex", gap: 2 }}>
                      {p.preview.map((c, i) => (
                        <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: c,
                          border: "1px solid rgba(255,255,255,0.1)" }} />
                      ))}
                    </div>
                    <span style={{ fontSize: 8, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.06em",
                      color: active ? p.accent : "var(--muted)" }}>
                      {p.label}
                    </span>
                  </button>
                );
              })}
            </div>
            {palettePreset && (
              <p style={{ fontSize: 9, color: "var(--muted)", marginTop: 5, lineHeight: 1.4 }}>
                Palette active — cliquez à nouveau pour désactiver.
              </p>
            )}
          </div>

          {/* Accents */}
          <div>
            <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "'Bebas Neue', sans-serif",
              letterSpacing: "0.08em", marginBottom: 7 }}>{t("settings.accentColor")}</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
              {THEMES.map((th) => {
                const active = theme === th.id;
                return (
                  <button key={th.id} title={th.label} onClick={() => apply(() => setTheme(th.id))}
                    aria-pressed={active}
                    style={{
                      width: 26, height: 26, borderRadius: "50%", padding: 0, cursor: "pointer",
                      border: active ? "2px solid var(--text)" : "2px solid transparent",
                      background: th.color, transition: "all 0.12s", flexShrink: 0,
                      boxShadow: active ? `0 0 0 2px ${th.color}55` : "none",
                    }} />
                );
              })}
              <div style={{ position: "relative" }}>
                <button title={t("settings.custom")} onClick={() => document.getElementById("custom-color-picker")?.click()}
                  aria-pressed={theme === "custom"} style={{
                    width: 26, height: 26, borderRadius: "50%", padding: 0, cursor: "pointer",
                    border: theme === "custom" ? "2px solid var(--text)" : "2px solid transparent",
                    background: theme === "custom" ? (customAccent || "#888") : "linear-gradient(135deg,#f00,#0f0,#00f)",
                    transition: "all 0.12s", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                  {theme !== "custom" && <Palette size={12} color="#fff" />}
                </button>
              </div>
            </div>

            {theme === "custom" && (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
                <button onClick={() => { setCustomAccent(""); setCustomBg(""); setCustomSurface(""); setCustomCard(""); persistSettings(); }}
                  style={{ alignSelf: "flex-end", padding: "2px 8px", background: "var(--surface)",
                    border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer",
                    fontSize: 10, color: "var(--muted)" }}>↺ Réinitialiser</button>
                {([
                  { id: "accent",  label: "Accent",  value: customAccent,  setter: setCustomAccent,  inputId: "custom-color-picker",   default: "#00d4ff" },
                  { id: "bg",      label: "BG",       value: customBg,      setter: setCustomBg,      inputId: "custom-bg-picker",       default: "#030303" },
                  { id: "surface", label: "Surface",  value: customSurface, setter: setCustomSurface, inputId: "custom-surface-picker",  default: "#0a0a0b" },
                  { id: "card",    label: "Card",     value: customCard,    setter: setCustomCard,    inputId: "custom-card-picker",     default: "#0d0d10" },
                ] as const).map((row) => (
                  <div key={row.id} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ fontSize: 10, color: "var(--muted)", width: 46, flexShrink: 0 }}>{row.label}</span>
                    <div style={{ position: "relative", flexShrink: 0 }}>
                      <button onClick={() => document.getElementById(row.inputId)?.click()} style={{
                        width: 20, height: 20, borderRadius: 4, padding: 0, cursor: "pointer",
                        border: "1px solid var(--border)", background: row.value || row.default,
                      }} />
                      <input id={row.inputId} type="color" value={row.value || row.default}
                        onChange={(e) => { row.setter(e.target.value); persistSettings(); }}
                        style={{ position: "absolute", opacity: 0, width: 0, height: 0, top: 0, left: 0 }} />
                    </div>
                    <span style={{ fontSize: 9, color: "var(--muted)", fontFamily: "monospace", flex: 1,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.value || row.default}
                    </span>
                    {row.value && (
                      <button onClick={() => { row.setter(""); persistSettings(); }}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 10, padding: 0 }}>
                        ↺
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Text size */}
          <div>
            <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "'Bebas Neue', sans-serif",
              letterSpacing: "0.08em", marginBottom: 7 }}>{t("settings.textSize")} — {fontSize}px</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, color: "var(--muted)" }}>A</span>
              <input type="range" min={10} max={20} step={1} value={fontSize}
                onChange={(e) => apply(() => setFontSize(Number(e.target.value)))}
                className="settings-slider" style={{ flex: 1 }}
                aria-label={t("settings.textSize")} />
              <span style={{ fontSize: 14, color: "var(--muted)" }}>A</span>
            </div>
          </div>

          {/* Font */}
          <div>
            <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "'Bebas Neue', sans-serif",
              letterSpacing: "0.08em", marginBottom: 7 }}>{t("settings.font")}</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {([
                { id: "barlow", label: "Barlow",  font: '"Barlow", sans-serif' },
                { id: "inter",  label: "Inter",   font: '"Inter", sans-serif' },
                { id: "roboto", label: "Roboto",  font: '"Roboto", sans-serif' },
                { id: "system", label: t("settings.system"), font: "system-ui, sans-serif" },
              ] as const).map((f) => {
                const active = fontFamily === f.id;
                return (
                  <button key={f.id} onClick={() => apply(() => setFontFamily(f.id))} aria-pressed={active}
                    style={{
                      flex: 1, padding: "5px 4px",
                      background: active ? "var(--accent)" : "var(--surface)",
                      color: active ? "#fff" : "var(--text)",
                      border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                      borderRadius: 4, cursor: "pointer", fontSize: 11,
                      fontFamily: f.font, transition: "all 0.1s",
                    }}>{f.label}</button>
                );
              })}
            </div>
          </div>

          <Toggle label={t("settings.animations")} value={showAnimations} onChange={(v) => apply(() => setShowAnimations(v))} />
        </div>

        {/* ── TILE B: Interface + Langue (col 2, row 1) ── */}
        <div style={{ ...TILE, gridColumn: "2", gridRow: "1" }}>

          {/* Language */}
          <div>
            <TileLabel>{t("settings.language")}</TileLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 5 }}>
              {LANGUAGES.map((l) => {
                const active = language === l.id;
                return (
                  <button key={l.id} onClick={() => apply(() => setLanguage(l.id as Lang))}
                    aria-pressed={active}
                    style={{
                      padding: "6px 4px", textAlign: "center",
                      background: active ? "var(--accent)" : "var(--surface)",
                      color: active ? "#fff" : "var(--text)",
                      border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                      borderRadius: 5, cursor: "pointer", transition: "all 0.1s",
                    }}
                    onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLButtonElement).style.color = active ? "#fff" : "var(--accent)"; }}
                    onMouseLeave={(e) => { if (!active) { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text)"; } }}
                  >
                    <div style={{ fontSize: 14, marginBottom: 2 }}>{l.flag}</div>
                    <div style={{ fontSize: 10, fontWeight: active ? 700 : 400 }}>{l.label}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Nav layout */}
          <div>
            <TileLabel>NAVIGATION</TileLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
              {([
                { id: "horizontal", label: "Haut",    bar: { top:0,left:0,right:0,height:5,bottom:"auto",width:"auto" } },
                { id: "bottom",     label: "Bas",     bar: { bottom:0,left:0,right:0,height:5,top:"auto",width:"auto" } },
                { id: "vertical",   label: "Gauche",  bar: { top:0,left:0,bottom:0,width:6,right:"auto",height:"auto" } },
                { id: "right",      label: "Droite",  bar: { top:0,right:0,bottom:0,width:6,left:"auto",height:"auto" } },
              ] as const).map((opt) => {
                const active = navLayout === opt.id;
                return (
                  <button key={opt.id} onClick={() => { setNavLayout(opt.id); persistSettings(); }} aria-pressed={active}
                    style={{
                      padding: "8px 4px",
                      background: active ? "rgba(var(--accent-rgb,0,212,255),0.1)" : "var(--surface)",
                      border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                      borderRadius: 5, cursor: "pointer", transition: "all 0.15s",
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                    }}>
                    <div style={{ width: 28, height: 18, borderRadius: 2,
                      border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                      position: "relative", overflow: "hidden", background: "var(--bg)" }}>
                      <div style={{ position: "absolute", ...opt.bar, background: active ? "var(--accent)" : "var(--muted)", opacity: 0.75 }} />
                    </div>
                    <span style={{ fontSize: 9, color: active ? "var(--accent)" : "var(--text)", fontWeight: active ? 600 : 400 }}>
                      {opt.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Interface toggles */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <TileLabel>{t("settings.interface")}</TileLabel>
            <Toggle label={t("settings.showLogs")}  value={showLogs}     onChange={(v) => apply(() => setShowLogs(v))} />
            <Toggle label={t("settings.idSearch")}  value={showIdSearch} onChange={(v) => apply(() => setShowIdSearch(v))} />
          </div>

          {/* Streaming mode */}
          <div>
            <TileLabel><EyeOff size={11} /> MODE STREAMING</TileLabel>
            <Toggle
              label={streamingMode ? "Actif — infos masquées" : "Masquer ID, webhook, gamertag"}
              value={streamingMode}
              onChange={(v) => { setStreamingMode(v); persistSettings(); }}
            />
            {streamingMode && (
              <div style={{ marginTop: 6, padding: "5px 8px", background: "rgba(245,158,11,0.1)",
                border: "1px solid rgba(245,158,11,0.3)", borderRadius: 4, fontSize: 10, color: "var(--gold)",
                display: "flex", alignItems: "center", gap: 5 }}>
                <EyeOff size={10} /> ID, webhook et gamertag masqués
              </div>
            )}
          </div>
        </div>

        {/* ── TILE C: Système (col 3, row 1) ── */}
        <div style={{ ...TILE, gridColumn: "3", gridRow: "1" }}>
          <TileLabel>{t("settings.updates")}</TileLabel>

          <Toggle label={t("settings.autoUpdate")} value={autoUpdate}
            onChange={(v) => { setAutoUpdate(v); persistSettings(); }} />

          <button onClick={handleCheckUpdate}
            disabled={updateStatus === "checking" || updateStatus === "downloading"}
            style={{
              width: "100%", padding: "9px 12px",
              background: updateStatus === "up-to-date" ? "rgba(35,165,89,0.12)"
                : updateStatus === "error" ? "rgba(218,55,60,0.12)"
                : updateVersion ? "rgba(var(--accent-rgb,0,212,255),0.12)"
                : "var(--surface)",
              border: `1px solid ${
                updateStatus === "up-to-date" ? "var(--green)"
                : updateStatus === "error" ? "var(--red)"
                : updateVersion ? "var(--accent)"
                : "var(--border)"}`,
              color: updateStatus === "up-to-date" ? "var(--green)"
                : updateStatus === "error" ? "var(--red)"
                : updateVersion ? "var(--accent)"
                : "var(--text)",
              borderRadius: 6, cursor: updateStatus === "checking" ? "default" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              fontSize: 12, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.06em",
              opacity: updateStatus === "checking" ? 0.7 : 1,
              transition: "all 0.15s",
            }}>
            {updateStatus === "checking"   && <><RefreshCw size={13} style={{ animation: "spin 1s linear infinite" }} /> {t("settings.checking")}</>}
            {updateStatus === "up-to-date" && <><Check size={13} /> {t("settings.upToDate")}</>}
            {updateStatus === "error"      && <><RefreshCw size={13} /> {t("settings.retry")}</>}
            {updateStatus === "idle" && !updateVersion && <><RefreshCw size={13} /> {t("settings.checkUpdates")}</>}
            {updateStatus === "idle" && updateVersion  && <><Download size={13} /> v{updateVersion} {t("settings.available")}</>}
          </button>

          {updateStatus === "error" && updateError && (
            <div style={{ padding: "7px 9px", background: "rgba(218,55,60,0.08)", borderRadius: 4,
              border: "1px solid rgba(218,55,60,0.2)" }}>
              <p style={{ fontSize: 9, color: "var(--red)", fontFamily: "monospace",
                wordBreak: "break-all", lineHeight: 1.5 }}>{updateError}</p>
            </div>
          )}

          {/* Import/Export settings */}
          <div>
            <TileLabel>PARAMÈTRES</TileLabel>
            <p style={{ fontSize: 10, color: "var(--muted)", lineHeight: 1.4, marginBottom: 8 }}>
              Exporte/importe thème, raccourcis, tactiques, favoris — sans cache ni sessions.
            </p>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={exportSettings} style={{
                flex: 1, padding: "7px", background: "var(--surface)",
                border: "1px solid var(--border)", borderRadius: 5,
                color: "var(--text)", fontSize: 10, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                fontFamily: "'Bebas Neue', sans-serif",
              }}>
                <Download size={10} /> EXPORT
              </button>
              <button onClick={() => settingsImportRef.current?.click()} style={{
                flex: 1, padding: "7px", background: "var(--surface)",
                border: "1px solid var(--border)", borderRadius: 5,
                color: "var(--text)", fontSize: 10, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                fontFamily: "'Bebas Neue', sans-serif",
              }}>
                <Upload size={10} /> IMPORT
              </button>
              <input ref={settingsImportRef} type="file" accept=".json" style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) importSettings(f); e.target.value = ""; }} />
            </div>
          </div>

          {/* Interface profiles */}
          <div>
            <TileLabel><Layers size={11} /> PROFILS D'INTERFACE</TileLabel>
            {interfaceProfiles.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 8 }}>
                {interfaceProfiles.map((p) => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--surface)",
                    borderRadius: 5, padding: "6px 8px", border: "1px solid var(--border)" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: "var(--text)", fontWeight: 600,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                      <div style={{ fontSize: 9, color: "var(--muted)" }}>{p.theme} · {p.navLayout}</div>
                    </div>
                    <button onClick={() => applyInterfaceProfile(p.id)}
                      style={{ padding: "2px 7px", background: "var(--accent)", color: "#fff", border: "none",
                        borderRadius: 3, fontSize: 9, cursor: "pointer", fontFamily: "'Bebas Neue', sans-serif",
                        letterSpacing: "0.04em" }}>
                      APPLIQUER
                    </button>
                    <button onClick={() => { deleteInterfaceProfile(p.id); persistSettings(); }}
                      style={{ padding: "2px 5px", background: "transparent", border: "1px solid var(--border)",
                        borderRadius: 3, cursor: "pointer", color: "var(--red)" }}>
                      <Trash2 size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 5 }}>
              <input value={profileName} onChange={(e) => setProfileName(e.target.value)}
                placeholder="Nom du profil…"
                style={{ flex: 1, background: "var(--surface)", border: "1px solid var(--border)",
                  color: "var(--text)", padding: "5px 8px", borderRadius: 4, fontSize: 10, outline: "none" }} />
              <button onClick={() => {
                if (!profileName.trim()) return;
                saveInterfaceProfile({ id: crypto.randomUUID(), name: profileName.trim(), theme, navLayout, darkMode });
                persistSettings(); setProfileName("");
                addToast(`Profil "${profileName.trim()}" sauvegardé !`, "success");
              }} disabled={!profileName.trim()}
                style={{ padding: "5px 8px", background: profileName.trim() ? "var(--accent)" : "var(--surface)",
                  color: profileName.trim() ? "#fff" : "var(--muted)", border: "none",
                  borderRadius: 4, fontSize: 10, cursor: profileName.trim() ? "pointer" : "default",
                  fontFamily: "'Bebas Neue', sans-serif", display: "flex", alignItems: "center", gap: 3 }}>
                <Save size={10} /> SAUVER
              </button>
            </div>
          </div>

          {/* Version */}
          <div style={{ marginTop: "auto", paddingTop: 10, borderTop: "1px solid var(--border)" }}>
            <p style={{ fontSize: 11, color: "var(--muted)" }}>ProClubs Stats v{appVersion}</p>
            <p style={{ fontSize: 9, color: "var(--border)", marginTop: 2 }}>Tauri 2 · Rust · React</p>
          </div>
        </div>

        {/* ── TILE D: Raccourcis (col 1-2, row 2) ── */}
        <div style={{ ...TILE, gridColumn: "1 / 3", gridRow: "2" }}>
          <TileLabel>{t("settings.shortcuts")}</TileLabel>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 24px" }}>
            {/* Fixed shortcuts */}
            {[
              { keys: "F11",            label: t("shortcut.fullscreen") },
              { keys: "Ctrl+1–5",      label: t("nav.players") + " → " + t("nav.compare") },
              { keys: "Ctrl+Shift+D",  label: t("shortcut.devPanel") },
              { keys: "R",              label: "Rafraîchir le club" },
              { keys: "S",              label: "Démarrer / Arrêter session" },
            ].map((s) => (
              <div key={s.keys} style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: 11, color: "var(--muted)" }}>{s.label}</span>
                <kbd style={KBD}>{s.keys}</kbd>
              </div>
            ))}

            {/* Remappable shortcuts */}
            {[
              { action: "search",       defaultCombo: "ctrl+f", label: t("shortcut.search") },
              { action: "export",       defaultCombo: "ctrl+e", label: t("shortcut.export") },
              { action: "globalSearch", defaultCombo: "ctrl+k", label: "Recherche globale" },
            ].map(({ action, defaultCombo, label }) => {
              const current = customShortcuts[action] || defaultCombo;
              const isCapturing = capturingAction === action;
              const displayKeys = current.split("+").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("+");
              return (
                <div key={action} style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ fontSize: 11, color: "var(--text)" }}>{label}</span>
                  <button
                    onKeyDown={isCapturing ? (e) => handleKeyCapture(e, action) : undefined}
                    onClick={() => setCapturingAction(isCapturing ? null : action)}
                    onBlur={() => setCapturingAction(null)}
                    style={{
                      ...KBD, cursor: "pointer", outline: "none",
                      border: isCapturing ? "1px solid var(--accent)" : "1px solid var(--border)",
                      background: isCapturing ? "rgba(0,212,255,0.1)" : "var(--surface)",
                      color: isCapturing ? "var(--accent)" : "var(--text)",
                      minWidth: 80, textAlign: "center", transition: "all 0.1s",
                    }}>
                    {isCapturing ? "Appuyez…" : displayKeys}
                  </button>
                </div>
              );
            })}
          </div>

          {Object.keys(customShortcuts).length > 0 && (
            <button onClick={() => { resetCustomShortcuts(); persistSettings(); }}
              style={{ alignSelf: "flex-end", padding: "2px 8px", background: "transparent",
                border: "1px solid var(--border)", borderRadius: 4, fontSize: 10,
                color: "var(--muted)", cursor: "pointer" }}>
              ↺ Réinitialiser les raccourcis
            </button>
          )}
        </div>

        {/* ── TILE E: placeholder to prevent grid hole (col 3, row 2) ── */}
        {/* This col is already filled by TILE C spanning row 1 only, so row 2 col 3 is empty — fill it */}
        <div style={{ ...TILE, gridColumn: "3", gridRow: "2", gap: 8 }}>
          <TileLabel>EFFETS VISUELS</TileLabel>
          <Toggle label={t("settings.animations")} value={showAnimations} onChange={(v) => apply(() => setShowAnimations(v))} />
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
            <TileLabel><EyeOff size={11} /> MODE STREAMING</TileLabel>
            <Toggle
              label={streamingMode ? "Actif — infos masquées" : "Masquer les infos sensibles"}
              value={streamingMode}
              onChange={(v) => { setStreamingMode(v); persistSettings(); }}
            />
            {streamingMode && (
              <div style={{ marginTop: 6, padding: "5px 8px", background: "rgba(245,158,11,0.1)",
                border: "1px solid rgba(245,158,11,0.3)", borderRadius: 4, fontSize: 10, color: "var(--gold)",
                display: "flex", alignItems: "center", gap: 5 }}>
                <EyeOff size={10} /> ID, webhook et gamertag masqués
              </div>
            )}
          </div>
        </div>

        {/* ── TILE F: Rappels planifiés (col 1-3, row 3) ── */}
        <div style={{ ...TILE, gridColumn: "1 / 4", gridRow: "3" }}>
          <TileLabel><Bell size={11} /> RAPPELS PLANIFIÉS</TileLabel>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 6 }}>
            {scheduledNotifications.map((n) => (
              <div key={n.id} style={{ background: "var(--surface)", borderRadius: 6, padding: "8px 10px",
                border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: n.enabled ? "var(--text)" : "var(--muted)", fontWeight: 600 }}>
                    {n.time} — {n.message || "Rappel ProClubs Stats"}
                  </div>
                  <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 2 }}>
                    {n.days.length === 0 ? "Tous les jours" : n.days.map((d) => DAY_LABELS[d]).join(", ")}
                  </div>
                </div>
                <button onClick={() => { updateScheduledNotification(n.id, { enabled: !n.enabled }); persistSettings(); }}
                  style={{ padding: "3px 6px", background: "transparent", border: "1px solid var(--border)",
                    borderRadius: 4, cursor: "pointer", color: n.enabled ? "var(--accent)" : "var(--muted)" }}>
                  {n.enabled ? <Bell size={11} /> : <BellOff size={11} />}
                </button>
                <button onClick={() => { deleteScheduledNotification(n.id); persistSettings(); }}
                  style={{ padding: "3px 6px", background: "transparent", border: "1px solid var(--border)",
                    borderRadius: 4, cursor: "pointer", color: "var(--red)" }}>
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>

          {/* Add form */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end",
            background: "var(--surface)", borderRadius: 6, padding: "10px 12px", border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", gap: 6, flex: 1, minWidth: 260 }}>
              <input type="time" value={notifTime} onChange={(e) => setNotifTime(e.target.value)}
                style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)",
                  padding: "5px 8px", borderRadius: 4, fontSize: 12, width: 90 }} />
              <input value={notifMsg} onChange={(e) => setNotifMsg(e.target.value)}
                placeholder="Message du rappel…"
                style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)",
                  padding: "5px 8px", borderRadius: 4, fontSize: 11, flex: 1 }} />
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {DAY_LABELS.map((label, idx) => {
                const active = notifDays.includes(idx);
                return (
                  <button key={idx}
                    onClick={() => setNotifDays((d) => active ? d.filter((x) => x !== idx) : [...d, idx])}
                    style={{ padding: "4px 7px", borderRadius: 4, border: "1px solid var(--border)",
                      background: active ? "var(--accent)" : "transparent",
                      color: active ? "#fff" : "var(--muted)", fontSize: 10, cursor: "pointer",
                      fontWeight: active ? 700 : 400, transition: "all 0.1s" }}>
                    {label}
                  </button>
                );
              })}
            </div>
            <button onClick={() => {
              addScheduledNotification({ id: crypto.randomUUID(), time: notifTime, days: notifDays, message: notifMsg, enabled: true });
              persistSettings(); setNotifMsg("");
              addToast("Rappel ajouté !", "success");
            }} style={{
              padding: "6px 14px", background: "var(--accent)", color: "#fff", border: "none",
              borderRadius: 4, fontSize: 12, cursor: "pointer", fontFamily: "'Bebas Neue', sans-serif",
              display: "flex", alignItems: "center", gap: 5, letterSpacing: "0.06em",
            }}>
              <Bell size={12} /> AJOUTER
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
