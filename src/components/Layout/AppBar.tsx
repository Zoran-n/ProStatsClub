import { useState, useEffect } from "react";
import { Search, Plus, Settings, User, Download } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { useClub } from "../../hooks/useClub";
import { getLogo } from "../../api/tauri";
import type { Club } from "../../types";

/* ── Tooltip SaaS minimal ─────────────────────────────────────────── */
function AppTooltip({ label }: { label: string }) {
  return (
    <div className="ui-tooltip">
      {label}
    </div>
  );
}

/* ── Icône club individuelle ──────────────────────────────────────── */
function AppIcon({
  active, onClick, children, tooltip,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tooltip: string;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Indicateur 2px vertical — remplace le pill Discord */}
      <div style={{
        position: "absolute",
        left: 0,
        top: "50%",
        transform: "translateY(-50%)",
        width: 2,
        height: active ? 28 : hovered ? 16 : 0,
        borderRadius: "0 2px 2px 0",
        background: "var(--accent)",
        boxShadow: active ? "2px 0 8px rgba(0, 242, 255, 0.5)" : "none",
        transition: "height 0.2s cubic-bezier(0.4,0,0.2,1), box-shadow 0.2s cubic-bezier(0.4,0,0.2,1)",
      }} />

      <div
        onClick={onClick}
        style={{
          width: 40,
          height: 40,
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          background: active
            ? "rgba(0, 242, 255, 0.1)"
            : hovered
            ? "rgba(255, 255, 255, 0.05)"
            : "transparent",
          border: active ? "1px solid rgba(0, 242, 255, 0.2)" : "1px solid transparent",
          transition: "background 0.15s ease-out, border-color 0.15s ease-out",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        {children}
      </div>

      {hovered && <AppTooltip label={tooltip} />}
    </div>
  );
}

/* ── Icône club avec logo ─────────────────────────────────────────── */
function ClubAppIcon({
  club, active, onClick,
}: {
  club: Club;
  active: boolean;
  onClick: () => void;
}) {
  const [logo, setLogo] = useState<string | null>(null);

  useEffect(() => {
    if (club.crestAssetId) getLogo(club.crestAssetId).then(setLogo).catch(() => {});
  }, [club.crestAssetId]);

  return (
    <AppIcon active={active} onClick={onClick} tooltip={club.name || `Club #${club.id}`}>
      {logo ? (
        <img src={logo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <span style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 16,
          color: active ? "var(--accent)" : "var(--muted)",
          letterSpacing: "0.04em",
          filter: active ? "drop-shadow(0 0 4px rgba(0, 242, 255, 0.5))" : "none",
          transition: "color 0.15s, filter 0.15s",
        }}>
          {(club.name || "?")[0].toUpperCase()}
        </span>
      )}
    </AppIcon>
  );
}

/* ── Séparateur ───────────────────────────────────────────────────── */
function Separator() {
  return (
    <div style={{
      width: 24,
      height: 1,
      borderRadius: 1,
      background: "rgba(255, 255, 255, 0.06)",
      margin: "6px 0",
      flexShrink: 0,
    }} />
  );
}

/* ══════════════════════════════════════════════════════════════════
   AppBar — barre de navigation verticale gauche, 52px (--app-bar-w)
   ══════════════════════════════════════════════════════════════════ */
export function AppBar() {
  const {
    favs, history, currentClub, setSidebarTab, sidebarTab,
    eaProfile, discordWebhook, updateAvailable,
  } = useAppStore();
  const { load } = useClub();

  const clubs = [...favs];
  for (const c of history) {
    if (!clubs.some((f) => f.id === c.id)) clubs.push(c);
  }

  return (
    <nav
      aria-label="Navigation principale"
      style={{
        width: "var(--app-bar-w, 52px)",
        flexShrink: 0,
        height: "100%",
        background: "var(--app-bar-bg)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 8,
        paddingBottom: 8,
        gap: 4,
        overflowY: "auto",
        overflowX: "hidden",
        zIndex: "var(--z-sidebar)",
      }}
    >
      {/* Recherche */}
      <AppIcon
        active={sidebarTab === "search"}
        onClick={() => setSidebarTab("search")}
        tooltip="Recherche"
      >
        <Search
          size={18}
          style={{
            color: sidebarTab === "search" ? "var(--accent)" : "var(--muted)",
            filter: sidebarTab === "search" ? "drop-shadow(0 0 4px rgba(0, 242, 255, 0.5))" : "none",
            transition: "color 0.15s, filter 0.15s",
          }}
        />
      </AppIcon>

      <Separator />

      {/* Clubs */}
      {clubs.map((club) => (
        <ClubAppIcon
          key={club.id}
          club={club}
          active={currentClub?.id === club.id}
          onClick={() => { load(club.id, club.platform); setSidebarTab("search"); }}
        />
      ))}

      {clubs.length === 0 && (
        <AppIcon active={false} onClick={() => setSidebarTab("search")} tooltip="Ajouter un club">
          <Plus size={18} style={{ color: "var(--muted)" }} />
        </AppIcon>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      <Separator />

      {/* Profil */}
      <div style={{ position: "relative" }}>
        <AppIcon
          active={sidebarTab === "profile"}
          onClick={() => setSidebarTab("profile")}
          tooltip="Mon profil"
        >
          {eaProfile?.gamertag ? (
            <span style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 16,
              color: sidebarTab === "profile" ? "var(--accent)" : "var(--muted)",
              filter: sidebarTab === "profile" ? "drop-shadow(0 0 4px rgba(0, 242, 255, 0.5))" : "none",
              transition: "color 0.15s, filter 0.15s",
            }}>
              {eaProfile.gamertag[0].toUpperCase()}
            </span>
          ) : (
            <User
              size={18}
              style={{
                color: sidebarTab === "profile" ? "var(--accent)" : "var(--muted)",
                transition: "color 0.15s",
              }}
            />
          )}
        </AppIcon>
        {discordWebhook && (
          <div style={{
            position: "absolute",
            bottom: 0,
            right: 0,
            width: 6,
            height: 6,
            borderRadius: 4,
            background: "var(--accent)",
            boxShadow: "0 0 6px var(--accent)",
          }} title="Webhook actif" />
        )}
      </div>

      {/* Paramètres */}
      <div style={{ position: "relative", marginBottom: 4 }}>
        <AppIcon
          active={sidebarTab === "settings"}
          onClick={() => setSidebarTab("settings")}
          tooltip={`Paramètres${updateAvailable ? " · Mise à jour disponible" : ""}`}
        >
          <Settings
            size={18}
            style={{
              color: sidebarTab === "settings" ? "var(--accent)" : "var(--muted)",
              filter: sidebarTab === "settings" ? "drop-shadow(0 0 4px rgba(0, 242, 255, 0.5))" : "none",
              transition: "color 0.15s, filter 0.15s",
            }}
          />
        </AppIcon>
        {/* Badge mise à jour */}
        {updateAvailable && (
          <div style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: "var(--red)",
            border: "2px solid var(--app-bar-bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            animation: "pulse 2s ease-in-out infinite",
          }} title="Mise à jour disponible">
            <Download size={6} color="#fff" />
          </div>
        )}
      </div>
    </nav>
  );
}
