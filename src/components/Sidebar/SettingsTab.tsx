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

export function SettingsTab() {
  const { theme, darkMode, showAnimations, showLogs, showIdSearch, fontSize, fontFamily,
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
    addToast, loadSettings,
    persistSettings } = useAppStore();
  const t = useT();

  const [updateStatus, setUpdateStatus] = useState<"idle" | "checking" | "downloading" | "up-to-date" | "error">("idle");
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState("…");

  // Shortcut remapping state
  const [capturingAction, setCapturingAction] = useState<string | null>(null);

  // Scheduled notifications state
  const [notifTime, setNotifTime] = useState("20:00");
  const [notifDays, setNotifDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [notifMsg, setNotifMsg] = useState("");

  // Interface profiles state
  const [profileName, setProfileName] = useState("");

  // Settings import ref
  const settingsImportRef = useRef<HTMLInputElement>(null);

  useEffect(() => { getVersion().then(setAppVersion).catch(() => {}); }, []);

  // Auto-check on mount if enabled
  useEffect(() => {
    if (autoUpdate) handleCheckUpdate();
     
  }, []);

  const apply = (fn: () => void) => { fn(); persistSettings(); };

  // ── Export settings (without matchCache / sessions) ─────────────────
  const exportSettings = () => {
    try {
      const s = useAppStore.getState();
      const payload = {
        theme: s.theme, darkMode: s.darkMode,
        showGrid: s.showGrid, showAnimations: s.showAnimations,
        showLogs: s.showLogs, showIdSearch: s.showIdSearch,
        fontSize: String(s.fontSize), fontFamily: s.fontFamily,
        customAccent: s.customAccent || undefined,
        customBg: s.customBg || undefined,
        customSurface: s.customSurface || undefined,
        customCard: s.customCard || undefined,
        language: s.language, onboarded: s.onboarded,
        navLayout: s.navLayout,
        tactics: s.tactics,
        favs: s.favs,
        history: s.history,
        discordWebhook: s.discordWebhook || undefined,
        autoUpdate: s.autoUpdate,
        visibleKpis: s.visibleKpis,
        eaProfile: s.eaProfile ?? undefined,
        eaProfiles: s.eaProfiles,
        customShortcuts: s.customShortcuts,
        streamingMode: s.streamingMode,
        scheduledNotifications: s.scheduledNotifications,
        interfaceProfiles: s.interfaceProfiles,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `prostats_settings_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      addToast("Paramètres exportés !", "success");
    } catch (e) {
      addToast(`Export échoué: ${String(e)}`, "error");
    }
  };

  const importSettings = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        const s = useAppStore.getState();
        // Merge settings fields only — keep sessions and matchCache from current state
        const merged = {
          ...data,
          sessions: s.sessions,
          matchCache: s.matchCache,
          cacheTimestamps: s.cacheTimestamps,
          cacheOwners: s.cacheOwners,
          compareHistory: s.compareHistory ?? [],
          syncHistory: s.syncHistory ?? [],
          eaProfile: data.eaProfile ?? s.eaProfile ?? undefined,
          eaProfiles: data.eaProfiles ?? s.eaProfiles ?? [],
        };
        await apiSave(merged);
        await loadSettings();
        addToast("Paramètres importés !", "success");
      } catch {
        addToast("Fichier de paramètres invalide", "error");
      }
    };
    reader.readAsText(file);
  };

  // ── Shortcut key capture ────────────────────────────────────────────
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
    setUpdateVersion(null);
    setUpdateError(null);
    try {
      const update = await checkUpdate();
      if (update?.available) {
        setPendingUpdate(update);
        setUpdateInfo(update.version ?? null, update.body ?? null);
        setUpdateAvailable(true);
        setUpdateVersion(update.version ?? null);
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
          setUpdateVersion(result.version ?? null);
          setUpdateStatus("idle");
        } else {
          setUpdateAvailable(false);
          setPendingUpdate(null);
          setUpdateStatus("up-to-date");
          setTimeout(() => setUpdateStatus("idle"), 3000);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[updater]", msg);
        setUpdateError(msg);
        setUpdateStatus("error");
        setTimeout(() => { setUpdateStatus("idle"); setUpdateError(null); }, 10000);
      }
    }
  };

  const Section = ({ label }: { label: string }) => (
    <div className="category-header" style={{ padding: "16px 0 4px", margin: 0 }}>
      {label}
    </div>
  );

  const Toggle = ({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "8px 0" }} role="switch" aria-checked={value} aria-label={label} tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); apply(() => onChange(!value)); } }}>
      <span style={{ fontSize: 13, color: "var(--text)" }}>{label}</span>
      <div onClick={() => apply(() => onChange(!value))} style={{
        width: 40, height: 24, borderRadius: 12, flexShrink: 0, cursor: "pointer",
        background: value ? "var(--green)" : "var(--border)",
        position: "relative", transition: "background 0.15s",
      }}>
        <div style={{
          position: "absolute", top: 3, left: value ? 19 : 3,
          width: 18, height: 18, borderRadius: "50%", background: "#fff",
          transition: "left 0.15s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
        }} />
      </div>
    </div>
  );

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "4px 14px 20px" }} role="region" aria-label={t("settings.title")}>

      {/* ── APPARENCE ── */}
      <Section label={t("settings.appearance")} />
      <Toggle label={t("settings.darkMode")} value={darkMode} onChange={setDarkMode} />

      {/* ── LANGUE ── */}
      <Section label={t("settings.language")} />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {LANGUAGES.map((l) => {
          const active = language === l.id;
          return (
            <button key={l.id} onClick={() => apply(() => setLanguage(l.id as Lang))}
              aria-pressed={active}
              style={{
                flex: 1, minWidth: 60, padding: "6px 4px",
                background: active ? "var(--accent)" : "var(--hover)",
                color: active ? "#fff" : "var(--text)",
                border: "none", borderRadius: 4, cursor: "pointer",
                fontSize: 11, fontWeight: active ? 700 : 400,
                transition: "all 0.1s",
              }}>
              <div style={{ fontSize: 10, marginBottom: 1 }}>{l.flag}</div>
              {l.label}
            </button>
          );
        })}
      </div>

      {/* ── PALETTES COMPLÈTES ── */}
      <Section label="PALETTES COMPLÈTES" />
      <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
        {PALETTE_PRESETS.map((p) => {
          const active = palettePreset === p.id;
          return (
            <button key={p.id} title={p.label}
              onClick={() => {
                setPalettePreset(active ? null : p.id);
                persistSettings();
              }}
              aria-pressed={active}
              style={{
                flex: 1, minWidth: 64, padding: "8px 4px", borderRadius: 6, cursor: "pointer",
                border: `2px solid ${active ? p.accent : "var(--border)"}`,
                background: active ? `${p.accent}18` : "var(--hover)",
                transition: "all 0.15s", display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
              }}>
              <div style={{ display: "flex", gap: 2 }}>
                {p.preview.map((c, i) => (
                  <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: c, border: "1px solid rgba(255,255,255,0.15)" }} />
                ))}
              </div>
              <span style={{ fontSize: 9, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.08em",
                color: active ? p.accent : "var(--muted)", fontWeight: active ? 700 : 400 }}>
                {p.label}
              </span>
            </button>
          );
        })}
      </div>
      {palettePreset && (
        <p style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4, lineHeight: 1.5 }}>
          Palette active — remplace le thème d'accent. Cliquez à nouveau pour désactiver.
        </p>
      )}

      {/* ── THEME DE COULEUR ── */}
      <Section label={t("settings.accentColor")} />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {THEMES.map((th) => {
          const active = theme === th.id;
          return (
            <button key={th.id} title={th.label} onClick={() => apply(() => setTheme(th.id))}
              aria-pressed={active}
              style={{
                width: 32, height: 32, borderRadius: "50%", padding: 0, cursor: "pointer",
                border: active ? `3px solid var(--text)` : "3px solid transparent",
                background: th.color,
                transition: "all 0.15s", flexShrink: 0,
                boxShadow: active ? `0 0 0 2px ${th.color}` : "none",
              }} />
          );
        })}
        {/* Custom color button */}
        <div style={{ position: "relative" }}>
          <button title={t("settings.custom")} onClick={() => {
            const el = document.getElementById("custom-color-picker");
            if (el) el.click();
          }} aria-pressed={theme === "custom"} style={{
            width: 32, height: 32, borderRadius: "50%", padding: 0, cursor: "pointer",
            border: theme === "custom" ? `3px solid var(--text)` : "3px solid transparent",
            background: theme === "custom" ? (customAccent || "#888") : "linear-gradient(135deg, #ff0000, #00ff00, #0000ff)",
            transition: "all 0.15s", flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: theme === "custom" ? `0 0 0 2px ${customAccent}` : "none",
          }}>
            {theme !== "custom" && <Palette size={14} color="#fff" />}
          </button>
          {/* color picker is in the custom theme panel below */}
        </div>
      </div>
      {theme === "custom" && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          <button
            onClick={() => {
              setCustomAccent(""); setCustomBg(""); setCustomSurface(""); setCustomCard("");
              persistSettings();
            }}
            style={{
              alignSelf: "flex-end", padding: "3px 10px",
              background: "var(--hover)", border: "1px solid var(--border)",
              borderRadius: 4, cursor: "pointer", fontSize: 11,
              color: "var(--muted)", display: "flex", alignItems: "center", gap: 4,
            }}
          >↺ Tout réinitialiser</button>
          {([
            { id: "accent",  label: "Accent",      value: customAccent,  setter: setCustomAccent,  inputId: "custom-color-picker",         default: "#00d4ff" },
            { id: "bg",      label: "Background",  value: customBg,      setter: setCustomBg,      inputId: "custom-bg-picker",            default: "#030303" },
            { id: "surface", label: "Surface",     value: customSurface, setter: setCustomSurface, inputId: "custom-surface-picker",       default: "#0a0a0b" },
            { id: "card",    label: "Card",        value: customCard,    setter: setCustomCard,    inputId: "custom-card-picker",          default: "#0d0d10" },
          ] as const).map((row) => (
            <div key={row.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 11, color: "var(--muted)", width: 68 }}>{row.label}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
                <div style={{ position: "relative" }}>
                  <button
                    onClick={() => { document.getElementById(row.inputId)?.click(); }}
                    style={{
                      width: 24, height: 24, borderRadius: 5, padding: 0, cursor: "pointer",
                      border: "2px solid var(--border)",
                      background: row.value || row.default,
                    }}
                  />
                  <input id={row.inputId} type="color"
                    value={row.value || row.default}
                    onChange={(e) => { row.setter(e.target.value); persistSettings(); }}
                    style={{ position: "absolute", opacity: 0, width: 0, height: 0, top: 0, left: 0 }}
                  />
                </div>
                <span style={{ fontSize: 10, color: "var(--muted)", fontFamily: "monospace" }}>
                  {row.value || row.default}
                </span>
                {row.value && (
                  <button
                    onClick={() => { row.setter(""); persistSettings(); }}
                    title="Réinitialiser"
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)",
                      fontSize: 10, padding: "0 2px", marginLeft: "auto" }}
                  >↺</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── TAILLE DU TEXTE ── */}
      <Section label={t("settings.textSize")} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: "var(--muted)", flexShrink: 0 }}>A</span>
        <input
          type="range" min={10} max={20} step={1}
          value={fontSize}
          onChange={(e) => apply(() => setFontSize(Number(e.target.value)))}
          className="settings-slider"
          aria-label={t("settings.textSize")}
        />
        <span style={{ fontSize: 15, color: "var(--muted)", flexShrink: 0 }}>A</span>
      </div>
      <div style={{ textAlign: "center", fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>
        {fontSize}px
      </div>

      {/* ── POLICE ── */}
      <Section label={t("settings.font")} />
      <div style={{ display: "flex", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
        {([
          { id: "barlow",  label: "Barlow",  font: '"Barlow", sans-serif' },
          { id: "inter",   label: "Inter",   font: '"Inter", sans-serif' },
          { id: "roboto",  label: "Roboto",  font: '"Roboto", sans-serif' },
          { id: "system",  label: t("settings.system"), font: 'system-ui, sans-serif' },
        ] as const).map((f) => {
          const active = fontFamily === f.id;
          return (
            <button key={f.id} onClick={() => apply(() => setFontFamily(f.id))}
              aria-pressed={active}
              style={{
                flex: 1, padding: "6px 4px",
                background: active ? "var(--accent)" : "var(--hover)",
                color: active ? "#fff" : "var(--text)",
                border: "none", borderRadius: 4, cursor: "pointer",
                fontSize: 12, fontWeight: active ? 600 : 400,
                fontFamily: f.font,
                transition: "all 0.1s",
              }}>{f.label}</button>
          );
        })}
      </div>

      {/* ── EFFETS VISUELS ── */}
      <Section label={t("settings.effects")} />
      <Toggle label={t("settings.animations")} value={showAnimations} onChange={setShowAnimations} />

      {/* ── INTERFACE ── */}
      <Section label={t("settings.interface")} />
      <Toggle label={t("settings.showLogs")}  value={showLogs}     onChange={setShowLogs} />
      <Toggle label={t("settings.idSearch")}   value={showIdSearch} onChange={setShowIdSearch} />

      {/* Navigation layout */}
      <div style={{ padding: "8px 0" }}>
        <span style={{ fontSize: 13, color: "var(--text)", display: "block", marginBottom: 8 }}>
          Disposition de la navigation
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          {([
            { id: "horizontal", label: "Haut",    desc: "Barre en haut",       bar: { top:0,left:0,right:0,height:6,bottom:"auto",width:"auto" } },
            { id: "bottom",     label: "Bas",     desc: "Barre en bas",        bar: { bottom:0,left:0,right:0,height:6,top:"auto",width:"auto" } },
            { id: "vertical",   label: "Gauche",  desc: "Panneau à gauche",    bar: { top:0,left:0,bottom:0,width:8,right:"auto",height:"auto" } },
            { id: "right",      label: "Droite",  desc: "Panneau à droite",    bar: { top:0,right:0,bottom:0,width:8,left:"auto",height:"auto" } },
          ] as const).map((opt) => {
            const active = navLayout === opt.id;
            return (
              <button key={opt.id}
                onClick={() => { setNavLayout(opt.id); persistSettings(); }}
                aria-pressed={active}
                style={{
                  flex: 1, padding: "8px 4px",
                  background: active ? "rgba(var(--accent-rgb,0,212,255),0.12)" : "var(--hover)",
                  border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                  borderRadius: 6, cursor: "pointer", transition: "all 0.15s",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                }}
              >
                <div style={{ width: 32, height: 22, borderRadius: 3, border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`, position: "relative", overflow: "hidden", background: "var(--bg)" }}>
                  <div style={{ position: "absolute", ...opt.bar, background: active ? "var(--accent)" : "var(--muted)", opacity: 0.7 }} />
                </div>
                <span style={{ fontSize: 10, fontWeight: active ? 600 : 400, color: active ? "var(--accent)" : "var(--text)" }}>{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── RACCOURCIS PERSONNALISABLES ── */}
      <Section label={t("settings.shortcuts")} />
      <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 4 }}>
        {/* Non-remappable */}
        {[
          { keys: "F11",           label: t("shortcut.fullscreen") },
          { keys: "Ctrl+1–5",     label: t("nav.players") + " / " + t("nav.matches") + " / ..." },
          { keys: "Ctrl+Shift+D", label: t("shortcut.devPanel") },
          { keys: "R",             label: "Rafraîchir le club" },
          { keys: "S",             label: "Démarrer / Arrêter la session" },
        ].map((s) => (
          <div key={s.keys} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "3px 0" }}>
            <span style={{ fontSize: 11, color: "var(--text)" }}>{s.label}</span>
            <kbd style={{ padding: "2px 6px", background: "var(--hover)", borderRadius: 3, fontSize: 10, fontWeight: 700, color: "var(--muted)", border: "1px solid var(--border)", fontFamily: "monospace" }}>{s.keys}</kbd>
          </div>
        ))}
        {/* Remappable shortcuts */}
        {[
          { action: "search",      defaultCombo: "ctrl+f", label: t("shortcut.search") },
          { action: "export",      defaultCombo: "ctrl+e", label: t("shortcut.export") },
          { action: "globalSearch",defaultCombo: "ctrl+k", label: "Recherche globale" },
        ].map(({ action, defaultCombo, label }) => {
          const current = customShortcuts[action] || defaultCombo;
          const isCapturing = capturingAction === action;
          return (
            <div key={action} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "3px 0" }}>
              <span style={{ fontSize: 11, color: "var(--text)" }}>{label}</span>
              <button
                onKeyDown={isCapturing ? (e) => handleKeyCapture(e, action) : undefined}
                onClick={() => setCapturingAction(isCapturing ? null : action)}
                onBlur={() => setCapturingAction(null)}
                style={{
                  padding: "2px 8px", borderRadius: 3, fontSize: 10, fontWeight: 700,
                  fontFamily: "monospace", cursor: "pointer", outline: "none",
                  border: isCapturing ? "1px solid var(--accent)" : "1px solid var(--border)",
                  background: isCapturing ? "rgba(0,212,255,0.1)" : "var(--hover)",
                  color: isCapturing ? "var(--accent)" : "var(--text)",
                  transition: "all 0.1s", minWidth: 80,
                }}>
                {isCapturing ? "Appuyez…" : current.split("+").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("+")}
              </button>
            </div>
          );
        })}
        {Object.keys(customShortcuts).length > 0 && (
          <button onClick={() => { resetCustomShortcuts(); persistSettings(); }}
            style={{ alignSelf: "flex-end", padding: "2px 8px", background: "transparent",
              border: "1px solid var(--border)", borderRadius: 4, fontSize: 10,
              color: "var(--muted)", cursor: "pointer" }}>
            ↺ Réinitialiser les raccourcis
          </button>
        )}
      </div>

      {/* ── MODE STREAMING ── */}
      <Section label="MODE STREAMING" />
      <div style={{ marginBottom: 8 }}>
        <Toggle
          label={streamingMode ? "Mode streaming actif — infos masquées" : "Masquer ID, webhook et gamertag"}
          value={streamingMode}
          onChange={(v) => { setStreamingMode(v); persistSettings(); }}
        />
        {streamingMode && (
          <div style={{ marginTop: 6, padding: "6px 10px", background: "rgba(245,158,11,0.1)",
            border: "1px solid rgba(245,158,11,0.3)", borderRadius: 5, fontSize: 10, color: "var(--gold)",
            display: "flex", alignItems: "center", gap: 6 }}>
            <EyeOff size={11} /> IDs de club, webhook Discord et gamertag masqués dans l'interface
          </div>
        )}
      </div>

      {/* ── NOTIFICATIONS PLANIFIÉES ── */}
      <Section label="RAPPELS PLANIFIÉS" />
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 4 }}>
        {scheduledNotifications.map((n) => {
          const dayLabels = ["Di", "Lu", "Ma", "Me", "Je", "Ve", "Sa"];
          return (
            <div key={n.id} style={{ background: "var(--hover)", borderRadius: 6, padding: "8px 10px",
              border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: n.enabled ? "var(--text)" : "var(--muted)", fontWeight: 600 }}>
                  {n.time} — {n.message || "Rappel ProClubs Stats"}
                </div>
                <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
                  {n.days.length === 0 ? "Tous les jours" : n.days.map((d) => dayLabels[d]).join(", ")}
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
          );
        })}
        {/* Add form */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, background: "var(--hover)",
          borderRadius: 6, padding: "10px", border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", gap: 6 }}>
            <input type="time" value={notifTime} onChange={(e) => setNotifTime(e.target.value)}
              style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)",
                padding: "5px 8px", borderRadius: 4, fontSize: 12, flex: 1 }} />
            <input value={notifMsg} onChange={(e) => setNotifMsg(e.target.value)}
              placeholder="Message du rappel…"
              style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)",
                padding: "5px 8px", borderRadius: 4, fontSize: 11, flex: 2 }} />
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {["Di", "Lu", "Ma", "Me", "Je", "Ve", "Sa"].map((label, idx) => {
              const active = notifDays.includes(idx);
              return (
                <button key={idx} onClick={() => setNotifDays((d) => active ? d.filter((x) => x !== idx) : [...d, idx])}
                  style={{ padding: "3px 8px", borderRadius: 4, border: "1px solid var(--border)",
                    background: active ? "var(--accent)" : "transparent",
                    color: active ? "#fff" : "var(--muted)", fontSize: 10, cursor: "pointer" }}>
                  {label}
                </button>
              );
            })}
          </div>
          <button onClick={() => {
            addScheduledNotification({ id: crypto.randomUUID(), time: notifTime, days: notifDays, message: notifMsg, enabled: true });
            persistSettings();
            setNotifMsg("");
            addToast("Rappel ajouté !", "success");
          }} style={{ padding: "6px", background: "var(--accent)", color: "#fff", border: "none",
            borderRadius: 4, fontSize: 12, cursor: "pointer", fontFamily: "'Bebas Neue', sans-serif",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
            <Bell size={12} /> AJOUTER UN RAPPEL
          </button>
        </div>
      </div>

      {/* ── PROFILS D'INTERFACE ── */}
      <Section label="PROFILS D'INTERFACE" />
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 4 }}>
        {interfaceProfiles.map((p) => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--hover)",
            borderRadius: 6, padding: "8px 10px", border: "1px solid var(--border)" }}>
            <Layers size={12} color="var(--muted)" />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: "var(--text)", fontWeight: 600 }}>{p.name}</div>
              <div style={{ fontSize: 10, color: "var(--muted)" }}>{p.theme} · {p.navLayout} · {p.darkMode ? "sombre" : "clair"}</div>
            </div>
            <button onClick={() => applyInterfaceProfile(p.id)}
              style={{ padding: "3px 8px", background: "var(--accent)", color: "#fff", border: "none",
                borderRadius: 4, fontSize: 10, cursor: "pointer", fontFamily: "'Bebas Neue', sans-serif" }}>
              APPLIQUER
            </button>
            <button onClick={() => { deleteInterfaceProfile(p.id); persistSettings(); }}
              style={{ padding: "3px 6px", background: "transparent", border: "1px solid var(--border)",
                borderRadius: 4, cursor: "pointer", color: "var(--red)" }}>
              <Trash2 size={11} />
            </button>
          </div>
        ))}
        {/* Save current as profile */}
        <div style={{ display: "flex", gap: 6 }}>
          <input value={profileName} onChange={(e) => setProfileName(e.target.value)}
            placeholder="Nom du profil (ex: Streaming, Tournoi…)"
            style={{ flex: 1, background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)",
              padding: "6px 10px", borderRadius: 4, fontSize: 11 }} />
          <button onClick={() => {
            if (!profileName.trim()) return;
            saveInterfaceProfile({ id: crypto.randomUUID(), name: profileName.trim(), theme, navLayout, darkMode });
            persistSettings();
            setProfileName("");
            addToast(`Profil "${profileName.trim()}" sauvegardé !`, "success");
          }} disabled={!profileName.trim()}
            style={{ padding: "6px 10px", background: profileName.trim() ? "var(--accent)" : "var(--hover)",
              color: profileName.trim() ? "#fff" : "var(--muted)", border: "none",
              borderRadius: 4, fontSize: 12, cursor: profileName.trim() ? "pointer" : "default",
              fontFamily: "'Bebas Neue', sans-serif", display: "flex", alignItems: "center", gap: 4 }}>
            <Save size={12} /> SAUVEGARDER
          </button>
        </div>
        <p style={{ fontSize: 10, color: "var(--muted)", lineHeight: 1.5 }}>
          Sauvegarde le thème, la disposition et le mode clair/sombre actuels.
        </p>
      </div>

      {/* ── IMPORT / EXPORT PARAMÈTRES ── */}
      <Section label="PARAMÈTRES" />
      <p style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.5, marginBottom: 8 }}>
        Exporte ou importe uniquement les paramètres (thème, raccourcis, tactiques, favoris…) — sans le cache de matchs ni les sessions.
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
        <button onClick={exportSettings} style={{
          flex: 1, padding: "8px", background: "var(--hover)",
          border: "1px solid var(--border)", borderRadius: 6,
          color: "var(--text)", fontSize: 11, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
          fontFamily: "'Bebas Neue', sans-serif",
        }}>
          <Download size={11} /> EXPORTER
        </button>
        <button onClick={() => settingsImportRef.current?.click()} style={{
          flex: 1, padding: "8px", background: "var(--hover)",
          border: "1px solid var(--border)", borderRadius: 6,
          color: "var(--text)", fontSize: 11, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
          fontFamily: "'Bebas Neue', sans-serif",
        }}>
          <Upload size={11} /> IMPORTER
        </button>
        <input ref={settingsImportRef} type="file" accept=".json" style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) importSettings(f); e.target.value = ""; }} />
      </div>

      {/* ── MISES A JOUR ── */}
      <Section label={t("settings.updates")} />
      <Toggle
        label={t("settings.autoUpdate")}
        value={autoUpdate}
        onChange={(v) => { setAutoUpdate(v); persistSettings(); }}
      />
      <button onClick={handleCheckUpdate}
        disabled={updateStatus === "checking" || updateStatus === "downloading"}
        style={{
          width: "100%", padding: "8px 10px",
          background: updateStatus === "up-to-date" ? "rgba(35,165,89,0.15)"
            : updateStatus === "error" ? "rgba(218,55,60,0.15)"
            : "var(--hover)",
          border: "none",
          color: updateStatus === "up-to-date" ? "var(--green)"
            : updateStatus === "error" ? "var(--red)"
            : "var(--text)",
          borderRadius: 4, cursor: updateStatus === "checking" || updateStatus === "downloading" ? "default" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          fontSize: 13, fontWeight: 600,
          opacity: updateStatus === "checking" || updateStatus === "downloading" ? 0.7 : 1,
          transition: "all 0.15s",
        }}>
        {updateStatus === "checking"  && <><RefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} /> {t("settings.checking")}</>}
        {updateStatus === "up-to-date" && <><Check size={14} /> {t("settings.upToDate")}</>}
        {updateStatus === "error"      && <><RefreshCw size={14} /> {t("settings.retry")}</>}
        {updateStatus === "idle" && !updateVersion && <><RefreshCw size={14} /> {t("settings.checkUpdates")}</>}
        {updateStatus === "idle" && updateVersion  && <><Download size={14} /> v{updateVersion} {t("settings.available")}</>}
      </button>
      {updateStatus === "error" && updateError && (
        <div style={{ marginTop: 8, padding: "8px 10px", background: "rgba(218,55,60,0.1)", borderRadius: 4 }}>
          <p style={{ fontSize: 10, color: "var(--red)", fontFamily: "monospace", wordBreak: "break-all",
            lineHeight: 1.5 }}>{updateError}</p>
        </div>
      )}

      <div style={{ marginTop: 20, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
        <p style={{ fontSize: 11, color: "var(--muted)" }}>ProClubs Stats v{appVersion}</p>
        <p style={{ fontSize: 10, color: "var(--border)", marginTop: 2 }}>Tauri 2 · Rust · React</p>
      </div>
    </div>
  );
}
