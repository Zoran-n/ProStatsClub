import { useState, useEffect, useRef } from "react";
import { RefreshCw, Search, Hash, User, Send } from "lucide-react";
import { searchClub, detectPlatform, getLogo } from "../../api/tauri";
import { sendDiscordWebhook } from "../../api/discord";
import { buildClubOverviewEmbed } from "../../utils/discordEmbeds";
import { useAppStore } from "../../store/useAppStore";
import { useClub } from "../../hooks/useClub";
import type { Club } from "../../types";

function ClubLogo({ club, size = 32 }: { club: Club; size?: number }) {
  const [logo, setLogo] = useState<string | null>(null);
  useEffect(() => {
    if (club.crestAssetId) getLogo(club.crestAssetId).then(setLogo).catch(() => {});
  }, [club.crestAssetId]);
  return (
    <div style={{ width: size, height: size, borderRadius: 5, background: "var(--bg)",
      border: "1px solid var(--border)", flexShrink: 0, overflow: "hidden",
      display: "flex", alignItems: "center", justifyContent: "center" }}>
      {logo
        ? <img src={logo} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        : <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: size * 0.38, color: "var(--accent)" }}>
            {(club.name || "?")[0].toUpperCase()}
          </span>
      }
    </div>
  );
}

const PLABEL: Record<string, string> = { "common-gen5": "PS5/XSX", "common-gen4": "PS4/XBO", "pc": "PC" };

function ClubHoverTooltip({ club, anchorRect }: { club: Club; anchorRect: DOMRect }) {
  const total = club.wins + club.losses + club.ties;
  return (
    <div style={{
      position: "fixed",
      left: anchorRect.right + 8,
      top: anchorRect.top + anchorRect.height / 2,
      transform: "translateY(-50%)",
      background: "var(--surface)",
      border: "1px solid var(--accent)",
      borderRadius: 8,
      padding: "10px 14px",
      zIndex: 1000,
      width: 158,
      pointerEvents: "none",
      boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
    }}>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, color: "var(--accent)", marginBottom: 2 }}>
        {club.name}
      </div>
      <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6 }}>{PLABEL[club.platform] ?? club.platform}</div>
      <div style={{ fontSize: 11, display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "var(--muted)" }}>SR</span>
          <span style={{ color: "var(--accent)", fontWeight: 700 }}>{club.skillRating ?? "—"}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "var(--muted)" }}>MJ</span>
          <span style={{ color: "var(--text)" }}>{total}</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <span style={{ color: "var(--green)" }}>V {club.wins}</span>
          <span style={{ color: "var(--muted)" }}>N {club.ties}</span>
          <span style={{ color: "var(--red)" }}>D {club.losses}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "var(--gold, #f59e0b)" }}>⚽</span>
          <span style={{ color: "var(--text)" }}>{club.goals}</span>
        </div>
      </div>
    </div>
  );
}

export function SearchTab({ compact }: { compact?: boolean } = {}) {
  const { history, favs, toggleFav, showIdSearch, showLogs, logs, addLog, persistSettings,
    setSearchResults, eaProfile, discordWebhook, addToast, players, matches } = useAppStore();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [directId, setDirectId] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [sharing, setSharing] = useState(false);
  const [suggestions, setSuggestions] = useState<Club[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [historyFilter, setHistoryFilter] = useState("");
  const [tooltip, setTooltip] = useState<{ club: Club; rect: DOMRect } | null>(null);
  const { load } = useClub();
  const autoRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { currentClub } = useAppStore();

  // Autocomplete: debounced search as-you-type (min 3 chars)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 3) { setSuggestions([]); setShowSuggestions(false); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const clubs = await searchClub(query.trim());
        setSuggestions(clubs.slice(0, 6));
        setShowSuggestions(clubs.length > 0);
      } catch { /* silently ignore */ }
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const shareOverview = async () => {
    if (!discordWebhook || !currentClub) return;
    setSharing(true);
    try {
      await sendDiscordWebhook(discordWebhook, [buildClubOverviewEmbed(currentClub, players, matches)]);
      addToast("Envoyé sur Discord !", "success");
    } catch (e) { addToast(`Discord: ${String(e)}`, "error"); }
    finally { setSharing(false); }
  };

  const doSearch = async (q = query) => {
    if (!q.trim()) return;
    setShowSuggestions(false);
    setSearching(true);
    addLog(`Recherche: "${q}"…`);
    try {
      const clubs = await searchClub(q.trim());
      setSearchResults(clubs, true);
      addLog(`${clubs.length} résultat(s)`);
    } catch (e) {
      addLog(`Erreur recherche: ${String(e)}`);
    } finally { setSearching(false); }
  };

  const handleRefresh = async () => {
    if (currentClub) await load(currentClub.id, currentClub.platform);
    setCountdown(60);
  };

  useEffect(() => {
    if (autoRefresh) {
      setCountdown(60);
      autoRef.current = setInterval(() => { if (currentClub) load(currentClub.id, currentClub.platform); setCountdown(60); }, 60_000);
      countRef.current = setInterval(() => setCountdown((c) => (c <= 1 ? 60 : c - 1)), 1_000);
    } else {
      if (autoRef.current) clearInterval(autoRef.current);
      if (countRef.current) clearInterval(countRef.current);
    }
    return () => { if (autoRef.current) clearInterval(autoRef.current); if (countRef.current) clearInterval(countRef.current); };
  }, [autoRefresh, currentClub]);

  const handleLoadById = async () => {
    if (!directId.trim()) return;
    addLog(`Détection plateforme pour ID ${directId}…`);
    try {
      const p = await detectPlatform(directId.trim());
      await load(directId.trim(), p);
      setDirectId("");
    } catch (e) { addLog(`Erreur: ${String(e)}`); }
  };

  const isFav = (id: string) => favs.some((f) => f.id === id);
  const s = { section: { padding: compact ? "6px 8px" : "10px 12px", borderBottom: compact ? "none" : "1px solid var(--border)" } as React.CSSProperties };

  const filteredHistory = historyFilter.trim()
    ? history.filter((c) => (c.name ?? "").toLowerCase().includes(historyFilter.toLowerCase()))
    : history;

  // Compact mode: just search input
  if (compact) {
    return (
      <div style={{ padding: "4px 8px" }}>
        <div style={{ position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSearch()}
            placeholder="Rechercher..."
            style={{
              width: "100%", background: "var(--bg)", border: "none", color: "var(--text)",
              padding: "6px 8px 6px 28px", borderRadius: 4, fontSize: 12, outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
      {/* Fixed tooltip overlay */}
      {tooltip && <ClubHoverTooltip club={tooltip.club} anchorRect={tooltip.rect} />}

      {/* Mon club (gamertag lié) */}
      {eaProfile?.clubId && (
        <div style={s.section}>
          <label style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.08em", fontFamily: "'Bebas Neue', sans-serif", display: "block", marginBottom: 6 }}>
            MON CLUB
          </label>
          <div style={{ background: "var(--card)", borderRadius: 5, padding: "7px 10px", border: "1px solid var(--border)", marginBottom: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)" }}>{eaProfile.gamertag}</div>
            <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 1 }}>{eaProfile.clubName}</div>
          </div>
          <button onClick={() => { load(eaProfile.clubId, eaProfile.platform); persistSettings(); }}
            style={{ width: "100%", padding: "7px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 4, fontFamily: "'Bebas Neue', sans-serif", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
            <User size={12} /> CHARGER MON CLUB
          </button>
        </div>
      )}

      {/* Search by name + autocomplete */}
      <div style={s.section}>
        <label style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.08em", fontFamily: "'Bebas Neue', sans-serif", display: "block", marginBottom: 6 }}>
          RECHERCHE PAR NOM
        </label>
        <div style={{ marginBottom: 8 }}>
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: 11, color: "var(--muted)", zIndex: 1, pointerEvents: "none" }} />
            <input value={query}
              onChange={(e) => { setQuery(e.target.value); setShowSuggestions(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") { setShowSuggestions(false); doSearch(); } if (e.key === "Escape") setShowSuggestions(false); }}
              onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              placeholder="Nom du club..."
              style={{
                width: "100%", background: "var(--bg)", border: "none", color: "var(--text)",
                padding: "8px 10px 8px 32px",
                borderRadius: showSuggestions && suggestions.length > 0 ? "4px 4px 0 0" : 4,
                fontSize: 13, outline: "none", boxSizing: "border-box",
              }}
            />
          </div>
          {/* Inline autocomplete suggestions */}
          {showSuggestions && suggestions.length > 0 && (
            <div style={{ background: "var(--surface)", border: "1px solid var(--accent)", borderTop: "none",
              borderRadius: "0 0 6px 6px", overflow: "hidden" }}>
              {suggestions.map((club) => (
                <div key={`${club.id}_${club.platform}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setShowSuggestions(false);
                    load(club.id, club.platform);
                    setQuery("");
                  }}
                  style={{ padding: "7px 12px", cursor: "pointer",
                    borderBottom: "1px solid var(--border)", display: "flex",
                    justifyContent: "space-between", alignItems: "center",
                    transition: "background 0.1s" }}
                  onMouseEnter={(e) => (e.currentTarget as HTMLDivElement).style.background = "var(--hover)"}
                  onMouseLeave={(e) => (e.currentTarget as HTMLDivElement).style.background = ""}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {club.name}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--muted)", flexShrink: 0, marginLeft: 8 }}>
                    SR {club.skillRating ?? "—"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <button onClick={() => doSearch()} disabled={searching}
          style={{ width: "100%", padding: "8px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 4, fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, letterSpacing: "0.1em", cursor: "pointer", opacity: searching ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          {searching ? <><Search size={14} className="spin" /> RECHERCHE…</> : <><Search size={14} /> RECHERCHER</>}
        </button>
      </div>

      {/* Direct ID */}
      {showIdSearch && (
        <div style={s.section}>
          <label style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.08em", fontFamily: "'Bebas Neue', sans-serif", display: "block", marginBottom: 6 }}>
            OU ENTRER L'ID DIRECT
          </label>
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <input value={directId} onChange={(e) => setDirectId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLoadById()}
              placeholder="Ex: 3539213"
              style={{ flex: 1, background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)", padding: "6px 8px", borderRadius: 4, fontSize: 12, outline: "none" }}
            />
          </div>
          <button onClick={handleLoadById} style={{ width: "100%", padding: "7px", background: "transparent", border: "1px solid var(--accent)", color: "var(--accent)", borderRadius: 4, fontFamily: "'Bebas Neue', sans-serif", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
            <Hash size={12} /> CHARGER PAR ID
          </button>
        </div>
      )}

      {/* History (up to 25) with filter */}
      {history.length > 0 && (
        <div style={s.section}>
          <label style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.08em", fontFamily: "'Bebas Neue', sans-serif", display: "block", marginBottom: 6 }}>
            CLUBS RÉCENTS ({history.length})
          </label>
          {history.length > 5 && (
            <input value={historyFilter} onChange={(e) => setHistoryFilter(e.target.value)}
              placeholder="Filtrer l'historique..."
              style={{ width: "100%", background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)",
                padding: "5px 8px", borderRadius: 4, fontSize: 11, marginBottom: 6,
                outline: "none", boxSizing: "border-box" }}
            />
          )}
          {filteredHistory.map((club) => (
            <div key={club.id}
              onClick={() => { load(club.id, club.platform); persistSettings(); }}
              onMouseEnter={(e) => {
                setTooltip({ club, rect: e.currentTarget.getBoundingClientRect() });
                (e.currentTarget as HTMLDivElement).style.borderColor = "var(--accent)";
              }}
              onMouseLeave={(e) => {
                setTooltip(null);
                (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)";
              }}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 8px", cursor: "pointer",
                background: "var(--card)", border: "1px solid var(--border)", borderRadius: 5, marginBottom: 5,
                transition: "border-color 0.15s" }}>
              <ClubLogo club={club} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {club.name || `Club #${club.id}`}
                </div>
                <div style={{ fontSize: 10, color: "var(--muted)" }}>SR {club.skillRating ?? "—"}</div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); toggleFav(club); persistSettings(); }}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 2,
                  color: isFav(club.id) ? "var(--gold, #f59e0b)" : "var(--muted)", flexShrink: 0, fontSize: 13 }}>
                {isFav(club.id) ? "★" : "☆"}
              </button>
            </div>
          ))}
          {filteredHistory.length === 0 && historyFilter && (
            <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", padding: "8px 0" }}>
              Aucun résultat pour « {historyFilter} »
            </div>
          )}
        </div>
      )}

      {/* Refresh */}
      <div style={s.section}>
        <label style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.08em", fontFamily: "'Bebas Neue', sans-serif", display: "block", marginBottom: 6 }}>
          RAFRAÎCHISSEMENT
        </label>
        <button onClick={handleRefresh} style={{ width: "100%", padding: "7px", background: "transparent", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 4, fontFamily: "'Bebas Neue', sans-serif", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginBottom: 6 }}>
          <RefreshCw size={12} /> RAFRAÎCHIR
        </button>
        <button
          onClick={() => {
            if (!discordWebhook) { addToast("Configure le webhook Discord dans Mon Profil", "error"); return; }
            if (!currentClub) { addToast("Charge un club d'abord", "error"); return; }
            shareOverview();
          }}
          disabled={sharing}
          style={{ width: "100%", padding: "7px", background: "rgba(0,242,255,0.08)", border: "1px solid rgba(0,242,255,0.2)", color: sharing ? "var(--muted)" : "var(--accent)", borderRadius: 4, fontFamily: "'Bebas Neue', sans-serif", fontSize: 12, cursor: sharing ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginBottom: 6, opacity: sharing ? 0.6 : 1, transition: "all 0.15s" }}>
          <Send size={12} /> {sharing ? "ENVOI…" : "STATS DISCORD"}
        </button>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--muted)", cursor: "pointer" }}>
          <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
          Auto ({autoRefresh ? `${countdown}s` : "60s"})
        </label>
      </div>

      {/* Logs */}
      {showLogs && (
        <div style={{ ...s.section, flex: 1 }}>
          <label style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.08em", fontFamily: "'Bebas Neue', sans-serif", display: "block", marginBottom: 6 }}>
            LOGS
          </label>
          <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 4, padding: 8, fontSize: 10, color: "var(--green)", fontFamily: "monospace", height: 100, overflowY: "auto", lineHeight: 1.6 }}>
            {logs.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        </div>
      )}
    </div>
  );
}
