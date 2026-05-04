import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { TitleBar } from "./components/Layout/TitleBar";
import { GuildBar } from "./components/Layout/GuildBar";
import { Sidebar } from "./components/Layout/Sidebar";
import { MainPanel } from "./components/Layout/MainPanel";
import { DevPanel } from "./components/DevPanel/DevPanel";
import { SearchModal } from "./components/Modals/SearchModal";
import { GlobalSearchModal } from "./components/Modals/GlobalSearchModal";
import { Onboarding } from "./components/Modals/Onboarding";
import { ToastContainer, RecordAlertContainer } from "./components/UI/Toast";
import { UpdateModal } from "./components/Modals/UpdateModal";
import { useAppStore } from "./store/useAppStore";
import { checkProxy } from "./api/tauri";
import { useAutoLoad } from "./hooks/useAutoLoad";
import { useOffline } from "./hooks/useOffline";

const win = getCurrentWindow();

function App() {
  const {
    loadSettings, theme, showGrid, showAnimations, darkMode, fontSize,
    addRawLog, toggleDevPanel, showDevPanel, setProxyInfo,
    setSidebarTab, setActiveTab, onboarded, settingsLoaded, toggleGlobalSearch,
    navLayout, customShortcuts, scheduledNotifications, addToast,
    currentClub, activeSession, startSession, stopSession,
  } = useAppStore();

  useAutoLoad();
  const isOffline = useOffline();

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    document.documentElement.style.setProperty("--fs", `${fontSize}px`);
    root.toggleAttribute("data-no-grid", !showGrid);
    root.toggleAttribute("data-no-anim", !showAnimations);
    root.toggleAttribute("data-light", !darkMode);
    loadSettings();
    checkProxy().then((p) => setProxyInfo(p)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const unlistenLog = listen<string>("api_log", (event) => {
      addRawLog(event.payload);
    });
    const unlistenTray = listen("tray-toggle-session", () => {
      const store = useAppStore.getState();
      if (!store.currentClub) {
        store.addToast("Sélectionnez un club d'abord", "error");
        return;
      }
      if (store.activeSession) {
        store.stopSession();
        store.addToast("Session arrêtée via raccourci", "info");
      } else {
        store.startSession("Session rapide", []);
        store.addToast("Session démarrée via raccourci", "success");
      }
    });
    return () => { 
      unlistenLog.then(fn => fn());
      unlistenTray.then(fn => fn());
    };
  }, [addRawLog]);

  // ── Global keyboard shortcuts (with custom remapping) ──────────────
  useEffect(() => {
    function matchesCombo(e: KeyboardEvent, defaultCombo: string, action: string): boolean {
      const combo = customShortcuts[action] || defaultCombo;
      const parts = combo.toLowerCase().split("+");
      const key = parts[parts.length - 1];
      const ctrl = parts.includes("ctrl");
      const shift = parts.includes("shift");
      return e.ctrlKey === ctrl && e.shiftKey === shift && e.key.toLowerCase() === key;
    }

    const handler = (e: KeyboardEvent) => {
      // F11 → Fullscreen toggle (not remappable)
      if (e.key === "F11") {
        e.preventDefault();
        win.isFullscreen().then((fs) => win.setFullscreen(!fs));
        return;
      }
      // Ctrl+Shift+D → Dev panel (not remappable)
      if (e.ctrlKey && e.shiftKey && e.key === "D") {
        e.preventDefault();
        toggleDevPanel();
        return;
      }
      // Skip shortcuts when typing in an input/textarea
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      // Ctrl+F → Focus search
      if (matchesCombo(e, "ctrl+f", "search")) {
        e.preventDefault();
        setSidebarTab("search");
        setTimeout(() => {
          const el = document.querySelector<HTMLInputElement>('input[placeholder*="echerch"], input[placeholder*="earch"], input[placeholder*="uscar"], input[placeholder*="uchen"], input[placeholder*="esquis"]');
          el?.focus();
        }, 50);
        return;
      }
      // Ctrl+E → Export
      if (matchesCombo(e, "ctrl+e", "export")) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("shortcut:export"));
        return;
      }
      // Ctrl+K → Global search
      if (matchesCombo(e, "ctrl+k", "globalSearch")) {
        e.preventDefault();
        toggleGlobalSearch();
        return;
      }
      // Ctrl+1..5 → Switch tabs
      if (e.ctrlKey && e.key >= "1" && e.key <= "5") {
        e.preventDefault();
        const tabs = ["players", "matches", "charts", "session", "compare"] as const;
        const idx = Number(e.key) - 1;
        setActiveTab(tabs[idx]);
        return;
      }
      // R → Refresh club (dispatch event handled by search hook)
      if (!e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "r") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("shortcut:refresh"));
        return;
      }
      // S → Toggle session start/stop
      if (!e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (activeSession) {
          stopSession();
          addToast("Session terminée", "success");
        } else if (currentClub) {
          startSession(currentClub);
          addToast("Session démarrée", "success");
        }
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleDevPanel, setSidebarTab, setActiveTab, toggleGlobalSearch, customShortcuts, activeSession, currentClub, startSession, stopSession, addToast]);

  // ── Scheduled notifications ───────────────────────────────────────
  useEffect(() => {
    if (!scheduledNotifications.length) return;
    const interval = setInterval(() => {
      const now = new Date();
      const day = now.getDay(); // 0=Sun…6=Sat
      const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      for (const notif of scheduledNotifications) {
        if (!notif.enabled) continue;
        if (notif.time !== hhmm) continue;
        if (notif.days.length > 0 && !notif.days.includes(day)) continue;
        addToast(notif.message || "Rappel ProClubs Stats !", "info");
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [scheduledNotifications, addToast]);

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100vw", height: "100vh", overflow: "hidden", background: "var(--bg)", position: "relative" }}>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <div id="grid-overlay" />
      <TitleBar showDiscordLayout />
      {isOffline && (
        <div style={{
          background: "var(--gold)", color: "#000", padding: "3px 12px",
          fontSize: 11, fontWeight: 700, textAlign: "center",
          letterSpacing: "0.06em", fontFamily: "'Bebas Neue', sans-serif",
          flexShrink: 0,
        }}>
          MODE HORS-LIGNE — DONNÉES DU CACHE
        </div>
      )}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", position: "relative", zIndex: 2 }}>
        <GuildBar />
        {navLayout === "horizontal" ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <Sidebar />
            <MainPanel />
          </div>
        ) : navLayout === "bottom" ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <MainPanel />
            <Sidebar />
          </div>
        ) : navLayout === "right" ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "row", overflow: "hidden" }}>
            <MainPanel />
            <Sidebar />
          </div>
        ) : (
          <>
            <Sidebar />
            <MainPanel />
          </>
        )}
      </div>
      {showDevPanel && <DevPanel />}
      <SearchModal />
      <GlobalSearchModal />
      {settingsLoaded && !onboarded && <Onboarding />}
      <UpdateModal />
      <RecordAlertContainer />
      <ToastContainer />
    </div>
  );
}

export default App;
