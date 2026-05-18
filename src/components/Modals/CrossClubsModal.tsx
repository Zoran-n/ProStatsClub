import { useState } from "react";
import { X } from "lucide-react";
import { getMembers } from "../../api/tauri";
import { useAppStore } from "../../store/useAppStore";
import { POS_LABELS, ratingColor } from "./PlayerModal";
import type { Club, Player } from "../../types";

interface ClubEntry {
  club: Club;
  players: Player[];
  loading: boolean;
  loaded: boolean;
  error: boolean;
}

type SortKey = "goals" | "assists" | "passesMade" | "tacklesMade" | "motm" | "rating" | "gamesPlayed";

interface CrossPlayer extends Player {
  clubName: string;
  clubId: string;
}

const CLUB_COLORS = [
  "var(--accent)", "#8b5cf6", "#ff6b35", "#57f287",
  "#fee75c", "#ed4245", "#00d4ff", "#eb459e",
];

const SORT_COLS: { key: SortKey; label: string }[] = [
  { key: "goals",       label: "Buts" },
  { key: "assists",     label: "PD" },
  { key: "passesMade",  label: "Passes" },
  { key: "tacklesMade", label: "Tacles" },
  { key: "motm",        label: "MOTM" },
  { key: "rating",      label: "Note" },
  { key: "gamesPlayed", label: "MJ" },
];

export function CrossClubsModal({ onClose }: { onClose: () => void }) {
  const { favs, currentClub, players: currentPlayers } = useAppStore();

  // Build candidate clubs list (current + favs, deduplicated)
  const allClubs: Club[] = [];
  if (currentClub) allClubs.push(currentClub);
  for (const f of favs) {
    if (!allClubs.some((c) => c.id === f.id)) allClubs.push(f);
  }

  // Pre-populate current club
  const initMap = new Map<string, ClubEntry>();
  if (currentClub) {
    initMap.set(currentClub.id, {
      club: currentClub, players: currentPlayers, loading: false, loaded: true, error: false,
    });
  }

  const [clubData, setClubData] = useState<Map<string, ClubEntry>>(initMap);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(currentClub ? [currentClub.id] : [])
  );
  const [sortKey, setSortKey] = useState<SortKey>("goals");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterName, setFilterName] = useState("");
  const [filterPos, setFilterPos] = useState("all");

  const loadClub = async (club: Club) => {
    setClubData((prev) => {
      const next = new Map(prev);
      next.set(club.id, { club, players: [], loading: true, loaded: false, error: false });
      return next;
    });
    try {
      const players = await getMembers(club.id, club.platform);
      setClubData((prev) => {
        const next = new Map(prev);
        next.set(club.id, { club, players, loading: false, loaded: true, error: false });
        return next;
      });
    } catch {
      setClubData((prev) => {
        const next = new Map(prev);
        next.set(club.id, { club, players: [], loading: false, loaded: false, error: true });
        return next;
      });
    }
  };

  const toggleClub = (club: Club) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(club.id)) {
        next.delete(club.id);
      } else {
        next.add(club.id);
        const existing = clubData.get(club.id);
        if (!existing || (!existing.loaded && !existing.loading)) {
          loadClub(club);
        }
      }
      return next;
    });
  };

  // Color index per club (stable, based on allClubs order)
  const clubColorFor = (clubId: string): string => {
    const idx = allClubs.findIndex((c) => c.id === clubId);
    return CLUB_COLORS[idx >= 0 ? idx % CLUB_COLORS.length : 0];
  };

  // Build unified sorted player list
  const allPlayers: CrossPlayer[] = [];
  for (const [clubId, data] of clubData.entries()) {
    if (!selectedIds.has(clubId)) continue;
    for (const p of data.players) {
      allPlayers.push({ ...p, clubName: data.club.name || `Club #${clubId}`, clubId });
    }
  }

  const positions = Array.from(new Set(allPlayers.map((p) => POS_LABELS[p.position] || p.position || "—"))).sort();

  const sorted = allPlayers
    .filter((p) => {
      if (filterName && !p.name.toLowerCase().includes(filterName.toLowerCase())) return false;
      if (filterPos !== "all" && (POS_LABELS[p.position] || p.position || "—") !== filterPos) return false;
      return true;
    })
    .sort((a, b) => {
      const av = a[sortKey as keyof Player] as number;
      const bv = b[sortKey as keyof Player] as number;
      return sortDir === "desc" ? bv - av : av - bv;
    });

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const TH: React.CSSProperties = {
    padding: "8px 10px", textAlign: "center" as const, color: "var(--muted)",
    fontWeight: 600, fontSize: 9, letterSpacing: "0.08em",
    position: "sticky" as const, top: 0, background: "var(--bg)",
    cursor: "pointer", userSelect: "none" as const, whiteSpace: "nowrap" as const,
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 50,
        display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}
    >
      <div
        style={{ background: "var(--card)", borderRadius: 12, width: 1140, maxWidth: "96vw",
          maxHeight: "92vh", display: "flex", flexDirection: "column",
          border: "1px solid var(--border)", animation: "fadeSlideIn 0.15s ease-out" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: "var(--text)", letterSpacing: "0.06em" }}>
              🌐 CLASSEMENT CROSS-CLUBS
            </div>
            <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
              Compare les joueurs de tes clubs favoris sur un même tableau
            </div>
          </div>
          <button onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Club pills */}
        <div style={{ padding: "10px 20px", borderBottom: "1px solid var(--border)",
          display: "flex", gap: 6, flexWrap: "wrap", flexShrink: 0 }}>
          {allClubs.length === 0 && (
            <span style={{ fontSize: 11, color: "var(--muted)" }}>
              Aucun favori — ajoute des clubs en favoris pour les comparer
            </span>
          )}
          {allClubs.map((club) => {
            const isSelected = selectedIds.has(club.id);
            const data = clubData.get(club.id);
            const color = clubColorFor(club.id);
            return (
              <button key={club.id} onClick={() => toggleClub(club)}
                style={{
                  padding: "5px 12px", borderRadius: 20, fontSize: 11, cursor: "pointer",
                  background: isSelected ? `${color}18` : "var(--bg)",
                  border: `1px solid ${isSelected ? color : "var(--border)"}`,
                  color: isSelected ? color : "var(--muted)",
                  display: "flex", alignItems: "center", gap: 5, transition: "all 0.1s",
                  opacity: data?.loading ? 0.6 : 1,
                }}>
                {data?.loading ? "⏳" : data?.error ? "❌" : isSelected ? "✓" : "+"}
                {club.name || `Club #${club.id}`}
                {data?.loaded && (
                  <span style={{ fontSize: 9, opacity: 0.7 }}>({data.players.length})</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Search + pos filter */}
        <div style={{ padding: "8px 20px", borderBottom: "1px solid var(--border)",
          display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          <input
            value={filterName}
            onChange={(e) => setFilterName(e.target.value)}
            placeholder="Rechercher un joueur..."
            style={{ flex: "1 1 160px", background: "var(--bg)", border: "1px solid var(--border)",
              color: "var(--text)", padding: "5px 10px", borderRadius: 6, fontSize: 11, outline: "none" }}
          />
          <select value={filterPos} onChange={(e) => setFilterPos(e.target.value)}
            style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)",
              padding: "5px 8px", borderRadius: 6, fontSize: 11, outline: "none", cursor: "pointer" }}>
            <option value="all">Tous postes</option>
            {positions.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <span style={{ fontSize: 10, color: "var(--muted)", marginLeft: "auto", flexShrink: 0 }}>
            {sorted.length} joueurs · {selectedIds.size} club{selectedIds.size > 1 ? "s" : ""}
          </span>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {sorted.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
              {selectedIds.size === 0
                ? "Sélectionne au moins un club ci-dessus"
                : Array.from(selectedIds).some((id) => clubData.get(id)?.loading)
                  ? "Chargement des joueurs…"
                  : "Aucun joueur"}
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ ...TH, textAlign: "left", width: 28 }}>#</th>
                  <th style={{ ...TH, textAlign: "left" }}>JOUEUR</th>
                  <th style={{ ...TH, textAlign: "left" }}>CLUB</th>
                  <th style={{ ...TH, textAlign: "left" }}>POS</th>
                  {SORT_COLS.map(({ key, label }) => (
                    <th key={key} style={{ ...TH, color: sortKey === key ? "var(--accent)" : "var(--muted)" }}
                      onClick={() => handleSort(key)}>
                      {label} {sortKey === key ? (sortDir === "desc" ? "↓" : "↑") : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((p, i) => {
                  const clubColor = clubColorFor(p.clubId);
                  const posLabel = POS_LABELS[p.position] || p.position || "—";
                  const TD: React.CSSProperties = {
                    padding: "8px 10px",
                    borderBottom: "1px solid var(--border)",
                  };
                  return (
                    <tr key={`${p.clubId}-${p.name}`}
                      style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}>
                      <td style={{ ...TD, color: i === 0 ? "#f59e0b" : i === 1 ? "#94a3b8" : i === 2 ? "#cd7c3b" : "var(--muted)",
                        fontWeight: 700, fontSize: 11 }}>{i + 1}</td>
                      <td style={{ ...TD, color: "var(--text)", fontWeight: 600, maxWidth: 140,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</td>
                      <td style={{ ...TD }}>
                        <span style={{ padding: "2px 7px", borderRadius: 10, fontSize: 9, fontWeight: 700,
                          background: `${clubColor}18`, border: `1px solid ${clubColor}44`, color: clubColor,
                          whiteSpace: "nowrap" }}>
                          {p.clubName}
                        </span>
                      </td>
                      <td style={{ ...TD, color: "var(--muted)", fontSize: 10 }}>{posLabel}</td>
                      <td style={{ ...TD, textAlign: "center", color: "var(--accent)",
                        fontFamily: "'Bebas Neue', sans-serif", fontSize: 16 }}>{p.goals || "—"}</td>
                      <td style={{ ...TD, textAlign: "center", color: "var(--text)" }}>{p.assists || "—"}</td>
                      <td style={{ ...TD, textAlign: "center", color: "var(--muted)" }}>{p.passesMade}</td>
                      <td style={{ ...TD, textAlign: "center", color: "var(--muted)" }}>{p.tacklesMade}</td>
                      <td style={{ ...TD, textAlign: "center", color: "#ffd700", fontWeight: 700 }}>{p.motm > 0 ? p.motm : "—"}</td>
                      <td style={{ ...TD, textAlign: "center" }}>
                        <span style={{ color: ratingColor(p.rating),
                          fontFamily: "'Bebas Neue', sans-serif", fontSize: 15, fontWeight: 700 }}>
                          {p.rating > 0 ? p.rating.toFixed(1) : "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
