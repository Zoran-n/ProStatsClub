import { useState } from "react";
import { Download, X, RefreshCw, ExternalLink } from "lucide-react";
import { relaunch } from "@tauri-apps/plugin-process";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useAppStore } from "../../store/useAppStore";
import { getPendingUpdate, getPendingManualUrl } from "../../utils/pendingUpdate";

export function UpdateModal() {
  const { updateAvailable, updateVersion, updateNotes, setUpdateAvailable, setUpdateInfo } = useAppStore();
  const [status, setStatus] = useState<"idle" | "downloading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  if (!updateAvailable) return null;

  const manualUrl = getPendingManualUrl();

  const handleInstall = async () => {
    const update = getPendingUpdate();
    if (!update && !manualUrl) return;

    if (manualUrl) {
      await openUrl(manualUrl);
      return;
    }

    setStatus("downloading");
    setError(null);
    try {
      await update!.downloadAndInstall();
      setStatus("done");
      setTimeout(() => relaunch(), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  };

  const handleLater = () => {
    setUpdateAvailable(false);
    setUpdateInfo(null, null);
    setStatus("idle");
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 300,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)",
    }}>
      <div style={{
        background: "var(--card)", border: "1px solid var(--border)",
        borderRadius: 8, width: 420, overflow: "hidden",
        boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
        animation: "fadeSlideIn 0.2s ease-out",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: "1px solid var(--border)",
          background: "rgba(0,212,255,0.06)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Download size={20} style={{ color: "var(--accent)" }} />
            <span style={{
              fontFamily: "'Bebas Neue', sans-serif", fontSize: 18,
              color: "var(--text)", letterSpacing: "0.08em",
            }}>
              Mise à jour disponible
            </span>
          </div>
          {status === "idle" && (
            <button onClick={handleLater} style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--muted)", padding: 4,
            }}>
              <X size={16} />
            </button>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: "20px 20px 16px" }}>
          {/* Version badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <span style={{
              fontFamily: "'Bebas Neue', sans-serif", fontSize: 28,
              color: "var(--accent)", letterSpacing: "0.06em", lineHeight: 1,
            }}>
              v{updateVersion}
            </span>
            <span style={{
              padding: "3px 8px", borderRadius: 6,
              background: "rgba(0,212,255,0.12)", border: "1px solid rgba(0,212,255,0.25)",
              fontSize: 10, color: "var(--accent)", fontWeight: 700, letterSpacing: "0.06em",
            }}>
              NOUVEAU
            </span>
          </div>

          {/* Release notes */}
          {updateNotes && (
            <div style={{
              background: "var(--bg)", borderRadius: 8, padding: "10px 12px",
              border: "1px solid var(--border)", marginBottom: 16,
              maxHeight: 160, overflowY: "auto",
            }}>
              {updateNotes.split("\n").map((line, i) => {
                if (line.startsWith("### ")) return (
                  <p key={i} style={{ fontSize: 11, fontWeight: 700, color: "var(--text)", margin: "8px 0 2px", lineHeight: 1.4 }}>
                    {line.slice(4)}
                  </p>
                );
                if (line.startsWith("## ")) return (
                  <p key={i} style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", margin: "10px 0 4px", lineHeight: 1.4 }}>
                    {line.slice(3)}
                  </p>
                );
                if (line.startsWith("- ")) return (
                  <p key={i} style={{ fontSize: 11, color: "var(--muted)", margin: "1px 0 1px 8px", lineHeight: 1.5 }}>
                    · {line.slice(2)}
                  </p>
                );
                if (line.trim() === "") return <div key={i} style={{ height: 4 }} />;
                return (
                  <p key={i} style={{ fontSize: 11, color: "var(--muted)", margin: "1px 0", lineHeight: 1.5 }}>
                    {line}
                  </p>
                );
              })}
            </div>
          )}

          {/* Progress / status */}
          {status === "downloading" && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8, marginBottom: 12,
              padding: "8px 12px", background: "rgba(0,212,255,0.08)",
              borderRadius: 8, border: "1px solid rgba(0,212,255,0.2)",
            }}>
              <RefreshCw size={14} style={{ color: "var(--accent)", animation: "spin 1s linear infinite" }} />
              <span style={{ fontSize: 12, color: "var(--accent)" }}>Téléchargement et installation…</span>
            </div>
          )}
          {status === "done" && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8, marginBottom: 12,
              padding: "8px 12px", background: "rgba(35,165,89,0.1)",
              borderRadius: 8, border: "1px solid rgba(35,165,89,0.25)",
            }}>
              <span style={{ fontSize: 12, color: "var(--green)" }}>✓ Installé — redémarrage en cours…</span>
            </div>
          )}
          {status === "error" && error && (
            <div style={{
              padding: "8px 12px", background: "rgba(218,55,60,0.1)",
              borderRadius: 8, border: "1px solid rgba(218,55,60,0.25)", marginBottom: 12,
            }}>
              <p style={{ fontSize: 10, color: "var(--red)", margin: 0, wordBreak: "break-all" }}>{error}</p>
            </div>
          )}

          {/* Buttons */}
          {status !== "done" && (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleInstall}
                disabled={status === "downloading"}
                style={{
                  flex: 1, padding: "10px 16px",
                  background: status === "downloading" ? "rgba(0,212,255,0.08)" : "rgba(0,212,255,0.15)",
                  border: "1px solid rgba(0,212,255,0.3)", borderRadius: 8,
                  color: status === "downloading" ? "var(--muted)" : "var(--accent)",
                  fontSize: 13, fontWeight: 700, cursor: status === "downloading" ? "default" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.06em",
                }}>
                {manualUrl
                  ? <><ExternalLink size={14} /> Ouvrir la page</>
                  : <><Download size={14} /> Installer maintenant</>
                }
              </button>
              <button onClick={handleLater}
                disabled={status === "downloading"}
                style={{
                  padding: "10px 16px", background: "var(--hover)",
                  border: "1px solid var(--border)", borderRadius: 8,
                  color: "var(--muted)", fontSize: 13, cursor: status === "downloading" ? "default" : "pointer",
                  opacity: status === "downloading" ? 0.5 : 1,
                }}>
                Plus tard
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
