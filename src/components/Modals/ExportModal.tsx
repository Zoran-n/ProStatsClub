import { useState, useEffect } from "react";
import { Download } from "lucide-react";

interface ExportModalProps {
  type: "png" | "csv";
  pngSourceEl?: HTMLElement | null;
  csvHeaders?: string[];
  csvRows?: (string | number)[][];
  defaultFilename: string;
  onClose: () => void;
}

export function ExportModal({ type, pngSourceEl, csvHeaders, csvRows, defaultFilename, onClose }: ExportModalProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filename, setFilename] = useState(defaultFilename);

  useEffect(() => {
    if (type === "png" && pngSourceEl) {
      setLoading(true);
      import("html2canvas").then(({ default: html2canvas }) => {
        const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#090c10";
        return html2canvas(pngSourceEl, { backgroundColor: bg, scale: 2, useCORS: true, logging: false });
      }).then((canvas) => {
        setDataUrl(canvas.toDataURL("image/png"));
      }).catch(() => {}).finally(() => setLoading(false));
    }
  }, []);

  const handleDownload = () => {
    if (type === "png" && dataUrl) {
      const link = document.createElement("a");
      link.download = `${filename}.png`;
      link.href = dataUrl;
      link.click();
      onClose();
    } else if (type === "csv" && csvHeaders && csvRows) {
      const csv = [csvHeaders, ...csvRows]
        .map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
        .join("\r\n");
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = `${filename}.csv`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
      onClose();
    }
  };

  const ext = type === "png" ? "png" : "csv";
  const ready = type === "png" ? !!dataUrl : true;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", zIndex: 200,
      display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}>
      <div style={{ background: "var(--card)", borderRadius: 12, padding: 32, width: 840,
        maxHeight: "88vh", display: "flex", flexDirection: "column", gap: 22,
        border: "1px solid var(--border)", boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: "var(--text)",
            letterSpacing: "0.06em", margin: 0 }}>
            EXPORTER — {type.toUpperCase()}
          </h3>
          <button onClick={onClose} style={{ background: "none", border: "none",
            color: "var(--muted)", cursor: "pointer", fontSize: 24, lineHeight: 1, padding: 4 }}>✕</button>
        </div>

        {/* Preview area */}
        <div style={{ flex: 1, overflowY: "auto", background: "var(--bg)", borderRadius: 8,
          border: "1px solid var(--border)", padding: 16, minHeight: 220, maxHeight: 560 }}>

          {type === "png" && (
            loading ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
                height: 220, color: "var(--muted)", fontSize: 16 }}>
                Génération du aperçu…
              </div>
            ) : dataUrl ? (
              <img src={dataUrl} alt="Aperçu" style={{ width: "100%", borderRadius: 4,
                display: "block" }} />
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
                height: 220, color: "var(--muted)", fontSize: 14 }}>
                Aperçu indisponible
              </div>
            )
          )}

          {type === "csv" && csvHeaders && csvRows && (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr>
                  {csvHeaders.map((h) => (
                    <th key={h} style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)",
                      textAlign: "left", color: "var(--muted)", fontSize: 13, fontWeight: "normal",
                      fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.06em",
                      whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {csvRows.slice(0, 20).map((row, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                    {row.map((cell, j) => (
                      <td key={j} style={{ padding: "8px 12px", color: "var(--text)", whiteSpace: "nowrap" }}>
                        {String(cell ?? "—")}
                      </td>
                    ))}
                  </tr>
                ))}
                {csvRows.length > 20 && (
                  <tr>
                    <td colSpan={csvHeaders.length} style={{ padding: "6px 8px",
                      color: "var(--muted)", fontSize: 10, fontStyle: "italic" }}>
                      + {csvRows.length - 20} ligne{csvRows.length - 20 > 1 ? "s" : ""} supplémentaire{csvRows.length - 20 > 1 ? "s" : ""}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Filename */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, color: "var(--muted)", flexShrink: 0 }}>Nom du fichier :</span>
          <input value={filename} onChange={(e) => setFilename(e.target.value)}
            style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--border)",
              color: "var(--text)", padding: "8px 14px", borderRadius: 6, fontSize: 15,
              outline: "none", transition: "border-color 0.15s" }}
            onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
            onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
          />
          <span style={{ fontSize: 14, color: "var(--muted)", flexShrink: 0 }}>.{ext}</span>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "11px 24px", background: "var(--bg)",
            border: "1px solid var(--border)", borderRadius: 6, color: "var(--muted)",
            fontSize: 15, cursor: "pointer" }}>
            Annuler
          </button>
          <button onClick={handleDownload} disabled={!ready}
            style={{ padding: "11px 28px", background: ready ? "var(--accent)" : "var(--muted)",
              border: "none", borderRadius: 6, color: "#000", fontSize: 16, cursor: ready ? "pointer" : "default",
              fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.08em",
              display: "flex", alignItems: "center", gap: 8, opacity: ready ? 1 : 0.5 }}>
            <Download size={16} /> TÉLÉCHARGER
          </button>
        </div>
      </div>
    </div>
  );
}
