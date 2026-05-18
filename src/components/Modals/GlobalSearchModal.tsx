import { useState, useEffect, useRef, useMemo } from "react";
import { Search, X, Users, Trophy, Star, Clock } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { useClub } from "../../hooks/useClub";
import { useT } from "../../i18n";
import type { Session } from "../../types";
import { POS_LABELS } from "./PlayerModal";

type ResultType = "club" | "player" | "session";

interface Result {
  type: ResultType;
  id: string;
  label: string;
  sub: string;
  payload: unknown;
}

export function GlobalSearchModal() {
  const t = useT();
  const { showGlobalSearch, toggleGlobalSearch, history, favs, players, sessions, currentClub } = useAppStore();
  const { load } = useClub();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showGlobalSearch) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [showGlobalSearch]);

  const results = useMemo((): Result[] => {
    const q = query.trim().toLowerCase();
    const out: Result[] = [];

    // ── Clubs (history + favs, deduped) ───────────────────────────────
    const clubsSeen = new Set<string>();
    const clubPool = [...favs, ...history];
    for (const c of clubPool) {
      const key = `${c.id}_${c.platform}`;
      if (clubsSeen.has(key)) continue;
      clubsSeen.add(key);
      if (!q || c.name.toLowerCase().includes(q)) {
        out.push({
          type: "club",
          id: key,
          label: c.name,
          sub: `${c.platform === "common-gen5" ? "PS5/XSX" : c.platform === "common-gen4" ? "PS4/XBO" : "PC"} · SR ${c.skillRating ?? "—"}`,
          payload: c,
        });
      }
    }

    // ── Players (current club) ─────────────────────────────────────────
    if (players.length > 0) {
      for (const p of players) {
        if (!q || p.name.toLowerCase().includes(q)) {
          const pos = POS_LABELS[p.position] ?? p.position ?? "—";
          out.push({
            type: "player",
            id: `player_${p.name}`,
            label: p.name,
            sub: `${pos} · ${p.goals}⚽ ${p.assists}🅰️ · ${p.rating > 0 ? p.rating.toFixed(1) : "—"} avg`,
            payload: p,
          });
        }
      }
    }

    // ── Sessions ──────────────────────────────────────────────────────
    for (const s of sessions.filter((x) => !x.archived)) {
      if (!q || s.clubName.toLowerCase().includes(q) || (s.notes ?? "").toLowerCase().includes(q) || (s.tags ?? []).some((tag) => tag.toLowerCase().includes(q))) {
        const wins = s.matches.filter((m) => {
          const c = m.clubs[s.clubId] as Record<string, unknown> | undefined;
          return c?.["wins"] === "1" || c?.["wins"] === 1;
        }).length;
        out.push({
          type: "session",
          id: `session_${s.id}`,
          label: s.clubName,
          sub: `${new Date(s.date).toLocaleDateString()} · ${s.matches.length}MJ · ${wins}V${(s.tags ?? []).length > 0 ? " · " + (s.tags ?? []).join(", ") : ""}`,
          payload: s,
        });
      }
    }

    // If no query, limit to 5 per type
    if (!q) return out.slice(0, 15);
    return out.slice(0, 30);
  }, [query, history, favs, players, sessions]);

  const grouped = useMemo(() => {
    const clubs  = results.filter((r) => r.type === "club");
    const pls    = results.filter((r) => r.type === "player");
    const sess   = results.filter((r) => r.type === "session");
    return [
      { key: "club",    label: t("global.clubs"),    icon: <Star size={14} />,   items: clubs  },
      { key: "player",  label: t("global.players"),  icon: <Users size={14} />,  items: pls    },
      { key: "session", label: t("global.sessions"), icon: <Trophy size={14} />, items: sess   },
    ].filter((g) => g.items.length > 0);
  }, [results, t]);

  const [cursor, setCursor] = useState(0);
  const flatResults = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  useEffect(() => { setCursor(0); }, [query]);

  const handleSelect = (r: Result) => {
    if (r.type === "club") {
      const c = r.payload as { id: string; platform: string };
      load(c.id, c.platform);
    } else if (r.type === "player") {
      // Open player modal — store a pending player open signal
      useAppStore.getState().setActiveTab("players");
      useAppStore.getState().addToast(`Joueur : ${r.label}`, "info");
    } else if (r.type === "session") {
      const s = r.payload as Session;
      useAppStore.getState().setActiveTab("session");
      useAppStore.getState().setViewingSession(s);
    }
    toggleGlobalSearch();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { toggleGlobalSearch(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, flatResults.length - 1)); return; }
    if (e.key === "ArrowUp")   { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); return; }
    if (e.key === "Enter" && flatResults[cursor]) { handleSelect(flatResults[cursor]); }
  };

  if (!showGlobalSearch) return null;

  let globalIdx = 0;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 500,
        background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        paddingTop: "12vh",
      }}
      onClick={toggleGlobalSearch}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 12, width: 840, maxHeight: "65vh",
          display: "flex", flexDirection: "column",
          boxShadow: "0 32px 80px rgba(0,0,0,0.7)",
          overflow: "hidden",
        }}
      >
        {/* Search input */}
        <div style={{
          display: "flex", alignItems: "center", gap: 14,
          padding: "16px 22px", borderBottom: "1px solid var(--border)", flexShrink: 0,
        }}>
          <Search size={20} style={{ color: "var(--accent)", flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("global.searchPlaceholder")}
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              color: "var(--text)", fontSize: 19, fontFamily: "inherit",
            }}
          />
          <kbd style={{
            fontSize: 13, color: "var(--muted)", background: "var(--card)",
            border: "1px solid var(--border)", borderRadius: 4, padding: "3px 8px",
          }}>ESC</kbd>
          <button onClick={toggleGlobalSearch} style={{
            background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 2,
          }}>
            <X size={20} />
          </button>
        </div>

        {/* Results */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {grouped.length === 0 ? (
            <div style={{ padding: "44px 0", textAlign: "center", color: "var(--muted)", fontSize: 16 }}>
              {query ? t("global.noResults") : t("global.typeToSearch")}
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.key}>
                {/* Group header */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "11px 22px 6px",
                  fontSize: 13, color: "var(--muted)",
                  fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.1em",
                }}>
                  {group.icon} {group.label}
                </div>

                {/* Group items */}
                {group.items.map((r) => {
                  const idx = globalIdx++;
                  const isActive = idx === cursor;
                  const isFav = r.type === "club" && favs.some((f) => {
                    const c = r.payload as { id: string };
                    return f.id === c.id;
                  });
                  const isCurrentClub = r.type === "club" && currentClub?.id === (r.payload as { id: string }).id;

                  return (
                    <div
                      key={r.id}
                      onClick={() => handleSelect(r)}
                      onMouseEnter={() => setCursor(idx)}
                      style={{
                        display: "flex", alignItems: "center", gap: 14,
                        padding: "11px 22px", cursor: "pointer",
                        background: isActive ? "var(--hover)" : "transparent",
                        borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                        transition: "background 0.08s",
                      }}
                    >
                      {/* Icon */}
                      <div style={{
                        width: 42, height: 42, borderRadius: 10,
                        background: r.type === "club" ? "var(--card)" : r.type === "player" ? "rgba(0,212,255,0.1)" : "rgba(250,168,26,0.1)",
                        border: "1px solid var(--border)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0, fontSize: 15, color: "var(--accent)",
                        fontFamily: "'Bebas Neue', sans-serif",
                      }}>
                        {r.type === "club" ? r.label.slice(0, 2).toUpperCase() :
                         r.type === "player" ? <Users size={18} style={{ color: "var(--accent)" }} /> :
                         <Clock size={18} style={{ color: "var(--gold)" }} />}
                      </div>

                      {/* Text */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 16, color: "var(--text)", fontWeight: 600,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          display: "flex", alignItems: "center", gap: 6 }}>
                          {r.label}
                          {isFav && <Star size={13} fill="var(--gold)" style={{ color: "var(--gold)", flexShrink: 0 }} />}
                          {isCurrentClub && (
                            <span style={{ fontSize: 12, background: "rgba(0,212,255,0.15)", color: "var(--accent)",
                              border: "1px solid rgba(0,212,255,0.3)", borderRadius: 3, padding: "2px 7px" }}>
                              ACTIF
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.sub}
                        </div>
                      </div>

                      {/* Enter hint */}
                      {isActive && (
                        <kbd style={{ fontSize: 12, color: "var(--muted)", background: "var(--card)",
                          border: "1px solid var(--border)", borderRadius: 3, padding: "2px 7px", flexShrink: 0 }}>
                          ↵
                        </kbd>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "9px 22px", borderTop: "1px solid var(--border)",
          display: "flex", gap: 16, fontSize: 13, color: "var(--muted)", flexShrink: 0,
        }}>
          <span>↑↓ Naviguer</span>
          <span>↵ Sélectionner</span>
          <span>ESC Fermer</span>
        </div>
      </div>
    </div>
  );
}
