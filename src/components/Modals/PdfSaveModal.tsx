import { Download, X, FolderOpen } from "lucide-react";
import { useT } from "../../i18n";

interface Props {
  filename: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PdfSaveModal({ filename, onConfirm, onCancel }: Props) {
  const t = useT();
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--card)", border: "1px solid var(--border)",
          borderRadius: 12, width: 570, overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", borderBottom: "1px solid var(--border)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Download size={16} style={{ color: "var(--accent)" }} />
            <span style={{
              fontFamily: "'Bebas Neue', sans-serif", fontSize: 16,
              color: "var(--text)", letterSpacing: "0.08em",
            }}>
              Export PDF
            </span>
          </div>
          <button onClick={onCancel} style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--muted)", padding: 4,
          }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "16px 16px 20px" }}>
          {/* Filename box */}
          <div style={{
            background: "var(--bg)", border: "1px solid var(--border)",
            borderRadius: 8, padding: "10px 12px", marginBottom: 12,
          }}>
            <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4, letterSpacing: "0.06em" }}>
              {t("session.pdfFilename")}
            </div>
            <div style={{
              fontSize: 13, color: "var(--accent)", fontFamily: "monospace",
              wordBreak: "break-all",
            }}>
              {filename}
            </div>
          </div>

          {/* Save location info */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 11, color: "var(--muted)", marginBottom: 20,
          }}>
            <FolderOpen size={13} />
            <span>{t("session.pdfSaveInfo")}</span>
          </div>

          {/* Buttons */}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={onCancel} style={{
              padding: "7px 16px", background: "var(--hover)",
              border: "1px solid var(--border)", borderRadius: 7,
              color: "var(--muted)", fontSize: 12, cursor: "pointer",
            }}>
              {t("session.noThanks")}
            </button>
            <button onClick={onConfirm} style={{
              padding: "7px 16px",
              background: "rgba(0,212,255,0.15)",
              border: "1px solid rgba(0,212,255,0.35)",
              borderRadius: 7, color: "var(--accent)",
              fontSize: 12, cursor: "pointer", fontWeight: 600,
              display: "flex", alignItems: "center", gap: 5,
            }}>
              <Download size={13} /> {t("session.pdfConfirm")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
