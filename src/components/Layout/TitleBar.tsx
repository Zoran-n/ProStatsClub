import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X, Wifi, WifiOff } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";

const win = getCurrentWindow();

export function TitleBar({ showAppBar }: { showAppBar?: boolean }) {
  const { activeSession, proxyInfo, currentClub } = useAppStore();
  return (
    <div data-tauri-drag-region="" style={{
      height: 32, display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 8px", background: "var(--app-bar-bg)", flexShrink: 0, userSelect: "none",
    }}>
      {/* Left: app name + context */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, pointerEvents: "none", paddingLeft: showAppBar ? 52 : 12 }}>
        <span style={{
          fontFamily: "'Bebas Neue', sans-serif", fontSize: 13, letterSpacing: "0.15em",
          color: "var(--muted)",
        }}>
          PRO CLUBS STATS
        </span>
        {currentClub && (
          <>
            <span style={{ color: "var(--border)", fontSize: 10 }}>/</span>
            <span style={{ fontSize: 12, color: "var(--text)", fontWeight: 600 }}>
              {currentClub.name}
            </span>
          </>
        )}
        {activeSession && (
          <span style={{
            fontSize: 9, color: "#fff", display: "flex", alignItems: "center", gap: 4,
            background: "var(--red)", padding: "1px 6px", borderRadius: 3, fontWeight: 700,
          }}>
            <span className="pulse-dot" style={{ width: 6, height: 6 }} />
            LIVE
          </span>
        )}
      </div>

      {/* Center: proxy status */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, pointerEvents: "none" }}>
        {proxyInfo ? (
          <div style={{
            display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: "var(--green)",
            background: "rgba(35,165,89,0.12)", padding: "2px 7px", borderRadius: 3,
          }}>
            <Wifi size={9} /> PROXY
          </div>
        ) : (
          <div style={{
            display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: "var(--muted)",
            background: "var(--hover)", padding: "2px 7px", borderRadius: 3,
          }}>
            <WifiOff size={9} /> DIRECT
          </div>
        )}
      </div>

      {/* Right: window controls */}
      <div style={{ display: "flex", gap: 2 }}>
        <button className="win-btn" style={{ width: 24, height: 24 }} onClick={() => win.minimize()}><Minus size={11} /></button>
        <button className="win-btn" style={{ width: 24, height: 24 }} onClick={() => win.toggleMaximize()}><Square size={9} /></button>
        <button className="win-btn close-btn" style={{ width: 24, height: 24 }} onClick={() => win.close()}><X size={11} /></button>
      </div>
    </div>
  );
}
