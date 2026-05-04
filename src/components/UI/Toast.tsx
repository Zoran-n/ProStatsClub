import { useEffect, useState } from "react";
import { useAppStore } from "../../store/useAppStore";

import { sendDiscordWebhook } from "../../api/discord";
import { buildRecordEmbed } from "../../utils/discordEmbeds";
import type { RecordEntry } from "../../types";

export interface ToastMessage {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}

const COLORS = {
  success: "var(--green)",
  error:   "var(--red)",
  info:    "var(--accent)",
};

export function ToastContainer() {
  const toasts = useAppStore((s) => s.toasts);
  const removeToast = useAppStore((s) => s.removeToast);

  return (
    <div style={{
      position: "fixed", bottom: 20, right: 20, zIndex: 200,
      display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none",
    }}>
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDone={() => removeToast(toast.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDone }: { toast: ToastMessage; onDone: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDone, 3500);
    return () => clearTimeout(id);
  }, [onDone]);

  const color = COLORS[toast.type];
  return (
    <div style={{
      background: "var(--card)", border: `1px solid ${color}`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 6, padding: "8px 14px",
      fontSize: 12, color: "var(--text)",
      boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
      animation: "fadeSlideIn 0.15s ease-out",
      pointerEvents: "auto",
      maxWidth: 300,
    }}>
      {toast.message}
    </div>
  );
}

export function RecordAlertContainer() {
  const alerts = useAppStore((s) => s.recordAlerts);
  return (
    <div style={{
      position: "fixed", top: 80, right: 20, zIndex: 210,
      display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none",
    }}>
      {alerts.map((alert) => (
        <RecordAlertItem key={`${alert.matchId}-${alert.type}`} record={alert} />
      ))}
    </div>
  );
}

function RecordAlertItem({ record }: { record: RecordEntry }) {
  const { removeRecordAlert, discordWebhook, addToast } = useAppStore();
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => {
      removeRecordAlert(record.matchId, record.type);
    }, 10000); // 10s auto-dismiss
    return () => clearTimeout(id);
  }, [record, removeRecordAlert]);

  const share = async () => {
    if (!discordWebhook) return;
    setSending(true);
    try {
      await sendDiscordWebhook(discordWebhook, [buildRecordEmbed(record)]);
      addToast("Record partagé sur Discord !", "success");
      removeRecordAlert(record.matchId, record.type);
    } catch (e) {
      addToast(`Erreur: ${String(e)}`, "error");
      setSending(false);
    }
  };

  const getIcon = () => {
    if (record.type === "goals") return "⚽";
    if (record.type === "assists") return "🅰️";
    if (record.type === "rating") return "⭐";
    return "🏅"; // motm
  };

  return (
    <div style={{
      background: "var(--card)", border: "1px solid var(--gold)",
      borderRadius: 8, padding: "12px", width: 320,
      boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
      animation: "fadeSlideIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
      pointerEvents: "auto", position: "relative",
    }}>
      <button onClick={() => removeRecordAlert(record.matchId, record.type)}
        style={{ position: "absolute", top: 8, right: 8, background: "none", border: "none", color: "var(--muted)", cursor: "pointer" }}>
        ✕
      </button>
      
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <div style={{ background: "rgba(245,158,11,0.15)", color: "var(--gold)", width: 36, height: 36, borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 18 }}>🏆</span>
        </div>
        <div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: "var(--gold)", lineHeight: 1 }}>NOUVEAU RECORD</div>
          <div style={{ fontSize: 12, color: "var(--text)", fontWeight: 600 }}>{record.playerName}</div>
        </div>
      </div>
      
      <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
        {getIcon()} {record.type === "rating" ? "Note :" : record.type === "goals" ? "Buts :" : record.type === "assists" ? "Passes :" : "MOTM"} <span style={{ color: "var(--text)", fontWeight: 700 }}>{record.type === "rating" ? record.new.toFixed(1) : record.new}</span>
        {record.type !== "motm" && <span style={{ fontSize: 11 }}> (ancien: {record.previous})</span>}
      </div>

      {discordWebhook && (
        <button onClick={share} disabled={sending}
          style={{ width: "100%", padding: "8px", background: "rgba(88,101,242,0.15)", border: "1px solid rgba(88,101,242,0.4)",
            borderRadius: 6, color: "#8b9cf4", cursor: sending ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 12, fontWeight: 600, transition: "all 0.2s" }}
          onMouseEnter={(e) => { if (!sending) e.currentTarget.style.background = "rgba(88,101,242,0.25)"; }}
          onMouseLeave={(e) => { if (!sending) e.currentTarget.style.background = "rgba(88,101,242,0.15)"; }}>
          {sending ? "Envoi..." : "Partager sur Discord"}
        </button>
      )}
    </div>
  );
}
