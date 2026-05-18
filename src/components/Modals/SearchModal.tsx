import { useState, useEffect } from "react";
import { Star, X } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { useClub } from "../../hooks/useClub";
import { getLogo } from "../../api/tauri";
import type { Club } from "../../types";

function ClubLogo({ club }: { club: Club }) {
  const [logo, setLogo] = useState<string | null>(null);

  useEffect(() => {
    if (club.crestAssetId) {
      getLogo(club.crestAssetId).then(setLogo).catch(() => {});
    }
  }, [club.crestAssetId]);

  return (
    <div style={{
      width: 58, height: 58, borderRadius: 10, background: "var(--bg)",
      border: "1px solid var(--border)", flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden",
    }}>
      {logo
        ? <img src={logo} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        : <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: "var(--accent)" }}>
            {(club.name || "?")[0].toUpperCase()}
          </span>
      }
    </div>
  );
}

export function SearchModal() {
  const { searchResults, showSearchModal, closeSearchModal, favs, toggleFav, persistSettings } = useAppStore();
  const { load } = useClub();

  if (!showSearchModal) return null;

  const isFav = (c: Club) => favs.some((f) => f.id === c.id);

  const handleLoad = (club: Club) => {
    load(club.id, club.platform);
    persistSettings();
    closeSearchModal();
  };

  return (
    <div
      onClick={closeSearchModal}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.7)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10,
          width: 780, maxHeight: "70vh", display: "flex", flexDirection: "column",
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", padding: "18px 24px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <span style={{ flex: 1, fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: "0.12em", color: "var(--accent)" }}>
            RÉSULTATS ({searchResults.length})
          </span>
          <button onClick={closeSearchModal} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 4 }}>
            <X size={22} />
          </button>
        </div>

        {/* Results list */}
        <div style={{ overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
          {searchResults.length === 0 ? (
            <p style={{ textAlign: "center", color: "var(--muted)", padding: "38px 0", fontSize: 16 }}>Aucun résultat</p>
          ) : searchResults.map((club) => (
            <div
              key={club.id}
              onClick={() => handleLoad(club)}
              style={{
                display: "flex", alignItems: "center", gap: 16, padding: "14px 16px",
                cursor: "pointer", background: "var(--card)",
                border: "1px solid var(--border)", borderRadius: 9,
                transition: "border-color 0.15s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "var(--accent)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)"; }}
            >
              <ClubLogo club={club} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 19, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {club.name || `Club #${club.id}`}
                </div>
                <div style={{ fontSize: 14, color: "var(--muted)", marginTop: 3 }}>
                  ID {club.id}
                  {club.skillRating && <span style={{ color: "var(--gold)", marginLeft: 8 }}>★ {club.skillRating} SR</span>}
                  {(club.wins + club.losses + club.ties) > 0 && (
                    <span style={{ marginLeft: 8 }}>{club.wins}V {club.losses}D {club.ties}N</span>
                  )}
                </div>
              </div>

              {/* Fav button */}
              <button
                onClick={(e) => { e.stopPropagation(); toggleFav(club); persistSettings(); }}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: isFav(club) ? "var(--gold, #f59e0b)" : "var(--muted)", flexShrink: 0 }}
              >
                <Star size={20} fill={isFav(club) ? "currentColor" : "none"} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
