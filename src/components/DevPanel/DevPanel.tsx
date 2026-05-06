import { useRef, useEffect, useState } from "react";
import { X, Trash2, Database, ChevronDown, ChevronRight } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";

type DevTab = "traffic" | "logs" | "cache";

const MATCH_TYPE_LABEL: Record<string, string> = {
  leagueMatch: "Championnat",
  playoffMatch: "Playoff",
  friendlyMatch: "Amical",
};

function parseKey(key: string): { clubId: string; platform: string; type: string } | null {
  const parts = key.split("_");
  if (parts.length < 3) return null;
  const type = parts[parts.length - 1];
  const platform = parts[parts.length - 2];
  const clubId = parts.slice(0, parts.length - 2).join("_");
  return { clubId, platform, type };
}

export function DevPanel() {
  const { logs, rawLogs, clearRawLogs, toggleDevPanel, proxyInfo, matchCache, clearMatchCacheKey, clearAllMatchCache, persistSettings } = useAppStore();
  const rawRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<DevTab>("traffic");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    rawRef.current?.scrollTo(0, rawRef.current.scrollHeight);
  }, [rawLogs]);

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [logs]);

  const classify = (line: string): string => {
    if (line.startsWith("→") || line.startsWith("←")) return "api";
    if (line.toLowerCase().includes("error") || line.toLowerCase().includes("erreur")) return "err";
    if (line.toLowerCase().includes("ok") || line.toLowerCase().includes("résultat")) return "ok";
    return "info";
  };

  const toggleExpand = (key: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(key)) { n.delete(key); } else { n.add(key); }
      return n;
    });

  // Group cache keys by clubId
  const grouped: Record<string, { key: string; platform: string; type: string; count: number }[]> = {};
  for (const [key, matches] of Object.entries(matchCache)) {
    const parsed = parseKey(key);
    if (!parsed) continue;
    const { clubId, platform, type } = parsed;
    if (!grouped[clubId]) grouped[clubId] = [];
    grouped[clubId].push({ key, platform, type, count: matches.length });
  }
  const totalMatches = Object.values(matchCache).reduce((a, m) => a + m.length, 0);
  const totalKeys = Object.keys(matchCache).length;

  const tabStyle = (t: DevTab): React.CSSProperties => ({
    flex: 1, padding: "5px 0", fontSize: 9, fontFamily: "'Bebas Neue', sans-serif",
    letterSpacing: "0.1em", cursor: "pointer", border: "none", background: "none",
    color: tab === t ? "var(--accent)" : "var(--muted)",
    borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent",
    transition: "color 0.1s",
  });

  return (
    <div className="dev-panel">
      <div className="dev-panel-header">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 13, letterSpacing: "0.15em", color: "var(--accent)" }}>
            DEV PANEL
          </span>
          <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: proxyInfo ? "rgba(34,197,94,0.2)" : "rgba(100,116,139,0.2)", color: proxyInfo ? "var(--green)" : "var(--muted)", border: `1px solid ${proxyInfo ? "var(--green)" : "var(--border)"}` }}>
            {proxyInfo ? `PROXY: ${proxyInfo}` : "DIRECT"}
          </span>
          <span style={{ fontSize: 9, color: "var(--muted)" }}>Ctrl+Shift+D</span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {tab === "traffic" && (
            <button onClick={clearRawLogs} title="Vider les logs API" style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", padding: 4, borderRadius: 4, display: "flex" }}>
              <Trash2 size={12} />
            </button>
          )}
          {tab === "cache" && totalKeys > 0 && (
            <button onClick={() => { clearAllMatchCache(); persistSettings(); }} title="Vider tout le cache" style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", padding: 4, borderRadius: 4, display: "flex" }}>
              <Trash2 size={12} />
            </button>
          )}
          <button onClick={toggleDevPanel} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", padding: 4, borderRadius: 4, display: "flex" }}>
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <button style={tabStyle("traffic")} onClick={() => setTab("traffic")}>TRAFIC ({rawLogs.length})</button>
        <button style={tabStyle("logs")} onClick={() => setTab("logs")}>LOGS ({logs.length})</button>
        <button style={tabStyle("cache")} onClick={() => setTab("cache")}>CACHE ({totalMatches})</button>
      </div>

      {/* TRAFIC */}
      {tab === "traffic" && (
        <div ref={rawRef} className="dev-panel-body" style={{ flex: 1 }}>
          {rawLogs.length === 0 ? (
            <span style={{ color: "var(--muted)", fontSize: 10 }}>Aucun trafic — lance une recherche</span>
          ) : (
            rawLogs.map((line, i) => (
              <div key={i} className={`dev-log-entry ${classify(line)}`}>{line}</div>
            ))
          )}
        </div>
      )}

      {/* LOGS */}
      {tab === "logs" && (
        <div ref={logRef} className="dev-panel-body" style={{ flex: 1 }}>
          {logs.map((line, i) => (
            <div key={i} className={`dev-log-entry ${classify(line)}`}>{line}</div>
          ))}
        </div>
      )}

      {/* CACHE */}
      {tab === "cache" && (
        <div className="dev-panel-body" style={{ flex: 1 }}>
          {totalKeys === 0 ? (
            <span style={{ color: "var(--muted)", fontSize: 10 }}>Cache vide</span>
          ) : (
            <>
              <div style={{ marginBottom: 8, fontSize: 10, color: "var(--muted)", display: "flex", alignItems: "center", gap: 5 }}>
                <Database size={10} />
                <span>{totalMatches} matchs · {totalKeys} clés · {Object.keys(grouped).length} club(s)</span>
              </div>
              {Object.entries(grouped).map(([clubId, entries]) => {
                const isOpen = expanded.has(clubId);
                const clubTotal = entries.reduce((a, e) => a + e.count, 0);
                return (
                  <div key={clubId} style={{ marginBottom: 6 }}>
                    {/* Club header */}
                    <div
                      onClick={() => toggleExpand(clubId)}
                      style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", padding: "3px 4px", borderRadius: 4, background: "var(--hover)", userSelect: "none" }}
                    >
                      {isOpen ? <ChevronDown size={10} color="var(--accent)" /> : <ChevronRight size={10} color="var(--muted)" />}
                      <span style={{ fontSize: 10, color: "var(--text)", fontWeight: 600, flex: 1 }}>Club {clubId}</span>
                      <span style={{ fontSize: 9, color: "var(--accent)", fontFamily: "'Bebas Neue', sans-serif" }}>{clubTotal} matchs</span>
                    </div>
                    {/* Entries */}
                    {isOpen && (
                      <div style={{ paddingLeft: 16, marginTop: 3, display: "flex", flexDirection: "column", gap: 2 }}>
                        {entries.map((e) => (
                          <div key={e.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10 }}>
                            <span style={{ color: "var(--muted)", width: 80, flexShrink: 0 }}>{MATCH_TYPE_LABEL[e.type] ?? e.type}</span>
                            <span style={{ color: "var(--text)", fontFamily: "'Bebas Neue', sans-serif", fontSize: 11 }}>{e.count}</span>
                            <span style={{ color: "var(--muted)", fontSize: 9 }}>{e.platform}</span>
                            <button
                              onClick={() => { clearMatchCacheKey(e.key); persistSettings(); }}
                              title="Supprimer cette entrée"
                              style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--muted)", cursor: "pointer", padding: 2, display: "flex", borderRadius: 3 }}
                            >
                              <Trash2 size={10} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
