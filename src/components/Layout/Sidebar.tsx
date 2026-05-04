import { useState, useEffect, useRef } from "react";
import { Users, Swords, BarChart3, Timer, GitCompare, Star, ChevronDown, Search, RefreshCw, Send, User, Brain } from "lucide-react";
import { useAppStore, type ActiveTab } from "../../store/useAppStore";
import { SearchTab } from "../Sidebar/SearchTab";
import { useClub } from "../../hooks/useClub";
import { getLogo, searchClub } from "../../api/tauri";
import { sendDiscordWebhook } from "../../api/discord";
import { buildClubOverviewEmbed } from "../../utils/discordEmbeds";
import { useT } from "../../i18n";
import type { Club } from "../../types";
import type { ReactNode } from "react";

function ClubLogo({ club, size = 28 }: { club: Club; size?: number }) {
  const [logo, setLogo] = useState<string | null>(null);
  useEffect(() => {
    if (club.crestAssetId) getLogo(club.crestAssetId).then(setLogo).catch(() => {});
  }, [club.crestAssetId]);
  return (
    <div style={{
      width: size, height: size, borderRadius: size / 4, background: "var(--bg)",
      flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
    }} aria-hidden="true">
      {logo
        ? <img src={logo} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        : <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: size * 0.5, color: "var(--accent)" }}>
            {(club.name || "?")[0].toUpperCase()}
          </span>
      }
    </div>
  );
}

function useNavItems(): { id: ActiveTab; icon: ReactNode; label: string }[] {
  const t = useT();
  return [
    { id: "players",  icon: <Users size={18} />,       label: t("nav.players") },
    { id: "matches",  icon: <Swords size={18} />,      label: t("nav.matches") },
    { id: "charts",   icon: <BarChart3 size={18} />,   label: t("nav.charts") },
    { id: "session",  icon: <Timer size={18} />,       label: t("nav.session") },
    { id: "compare",  icon: <GitCompare size={18} />,  label: t("nav.compare") },
  ];
}

/* ── Entry point: picks horizontal or vertical ───────────────────── */

export function Sidebar() {
  const { navLayout } = useAppStore();
  return (navLayout === "horizontal" || navLayout === "bottom")
    ? <HorizontalSidebar />
    : <VerticalSidebar />;
}

/* ══════════════════════════════════════════════════════════════════
   HORIZONTAL TOP BAR
   ══════════════════════════════════════════════════════════════════ */

function HorizontalSidebar() {
  const { currentClub, activeTab, setActiveTab, setSidebarTab, sidebarTab, favs, activeSession, history,
    toggleFav, persistSettings, discordWebhook, players, matches, addToast, eaProfile } = useAppStore();
  const { load } = useClub();
  const t = useT();
  const NAV_ITEMS = useNavItems().map((i) => ({ ...i, icon: cloneIconSize(i.icon, 15) }));
  const [sharing, setSharing] = useState(false);
  const [showClubMenu, setShowClubMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowClubMenu(false);
    };
    if (showClubMenu) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showClubMenu]);

  const shareOverview = async () => {
    if (!discordWebhook) { addToast("Configure le webhook Discord dans Mon Profil", "error"); return; }
    if (!currentClub) { addToast("Charge un club d'abord", "error"); return; }
    setSharing(true);
    try {
      await sendDiscordWebhook(discordWebhook, [buildClubOverviewEmbed(currentClub, players, matches)]);
      addToast("Envoyé sur Discord !", "success");
    } catch (e) { addToast(`Discord: ${String(e)}`, "error"); }
    finally { setSharing(false); }
  };

  if (!currentClub) return <HorizontalLaunchBar />;

  const allClubs = [...favs];
  for (const c of history) { if (!allClubs.some((f) => f.id === c.id)) allClubs.push(c); }

  return (
    <nav style={{
      height: 44, flexShrink: 0,
      background: "var(--sidebar-bg)", borderBottom: "1px solid var(--border)",
      display: "flex", alignItems: "center",
      paddingLeft: 8, paddingRight: 8,
      position: "relative", zIndex: 10,
    }} role="navigation" aria-label={t("sidebar.stats")}>

      {/* Club switcher */}
      <div ref={menuRef} style={{ position: "relative" }}>
        <button onClick={() => setShowClubMenu((v) => !v)} style={{
          display: "flex", alignItems: "center", gap: 7, height: 44, padding: "0 10px",
          background: "none", border: "none", cursor: "pointer", color: "var(--text)", flexShrink: 0,
        }} aria-expanded={showClubMenu} aria-haspopup="listbox">
          <ClubLogo club={currentClub} size={24} />
          <span style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", maxWidth: 130,
            overflow: "hidden", textOverflow: "ellipsis" }}>
            {currentClub.name}
          </span>
          <ChevronDown size={13} color="var(--muted)" style={{ flexShrink: 0, transition: "transform 0.15s",
            transform: showClubMenu ? "rotate(180deg)" : "none" }} />
        </button>

        {showClubMenu && allClubs.length > 0 && (
          <div style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0,
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 8, padding: "6px 0", minWidth: 200, zIndex: 200,
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          }} role="listbox">
            {allClubs.map((club) => (
              <div key={club.id}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "7px 12px",
                  cursor: "pointer", background: currentClub?.id === club.id ? "var(--active)" : "transparent",
                  transition: "background 0.1s",
                }}
                onClick={() => { load(club.id, club.platform); setShowClubMenu(false); persistSettings(); }}
                onMouseEnter={(e) => { if (currentClub?.id !== club.id) (e.currentTarget as HTMLElement).style.background = "var(--hover)"; }}
                onMouseLeave={(e) => { if (currentClub?.id !== club.id) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                role="option" aria-selected={currentClub?.id === club.id}
              >
                <ClubLogo club={club} size={20} />
                <span style={{ flex: 1, fontSize: 13, color: "var(--text)", overflow: "hidden",
                  textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {club.name || `Club #${club.id}`}
                </span>
                <button onClick={(e) => { e.stopPropagation(); toggleFav(club); persistSettings(); }}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 2,
                    color: favs.some((f) => f.id === club.id) ? "var(--gold)" : "var(--muted)",
                    flexShrink: 0, opacity: 0.7 }}>
                  <Star size={12} fill={favs.some((f) => f.id === club.id) ? "currentColor" : "none"} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ width: 1, height: 20, background: "var(--border)", margin: "0 6px", flexShrink: 0 }} />

      {/* Nav tabs */}
      <div style={{ display: "flex", alignItems: "stretch", height: "100%" }}>
        {NAV_ITEMS.map((item) => {
          const active = activeTab === item.id;
          return (
            <button key={item.id} role="tab" aria-selected={active}
              onClick={() => { setActiveTab(item.id); setSidebarTab("search"); persistSettings(); }}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "0 12px", height: "100%",
                background: "none", border: "none",
                borderBottom: `2px solid ${active ? "var(--accent)" : "transparent"}`,
                color: active ? "var(--text)" : "var(--muted)",
                cursor: "pointer", fontSize: 12, fontWeight: active ? 600 : 400,
                transition: "color 0.1s, border-color 0.1s", whiteSpace: "nowrap", flexShrink: 0,
              }}
              onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = "var(--text)"; }}
              onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = "var(--muted)"; }}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.id === "session" && activeSession && (
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--red)", flexShrink: 0 }} />
              )}
            </button>
          );
        })}

        {/* Mon Profil tab */}
        {eaProfile?.clubId && (
          <button role="tab" aria-selected={sidebarTab === "myprofile"}
            onClick={() => setSidebarTab("myprofile")}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "0 12px", height: "100%",
              background: "none", border: "none",
              borderBottom: `2px solid ${sidebarTab === "myprofile" ? "var(--accent)" : "transparent"}`,
              color: sidebarTab === "myprofile" ? "var(--text)" : "var(--muted)",
              cursor: "pointer", fontSize: 12, fontWeight: sidebarTab === "myprofile" ? 600 : 400,
              transition: "color 0.1s, border-color 0.1s", whiteSpace: "nowrap", flexShrink: 0,
            }}
            onMouseEnter={(e) => { if (sidebarTab !== "myprofile") (e.currentTarget as HTMLElement).style.color = "var(--text)"; }}
            onMouseLeave={(e) => { if (sidebarTab !== "myprofile") (e.currentTarget as HTMLElement).style.color = "var(--muted)"; }}
          >
            <User size={15} />
            <span>Profil</span>
          </button>
        )}

        {/* Analyse tab */}
        <button role="tab" aria-selected={sidebarTab === "analyse"}
          onClick={() => setSidebarTab("analyse")}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "0 12px", height: "100%",
            background: "none", border: "none",
            borderBottom: `2px solid ${sidebarTab === "analyse" ? "var(--accent)" : "transparent"}`,
            color: sidebarTab === "analyse" ? "var(--text)" : "var(--muted)",
            cursor: "pointer", fontSize: 12, fontWeight: sidebarTab === "analyse" ? 600 : 400,
            transition: "color 0.1s, border-color 0.1s", whiteSpace: "nowrap", flexShrink: 0,
          }}
          onMouseEnter={(e) => { if (sidebarTab !== "analyse") (e.currentTarget as HTMLElement).style.color = "var(--text)"; }}
          onMouseLeave={(e) => { if (sidebarTab !== "analyse") (e.currentTarget as HTMLElement).style.color = "var(--muted)"; }}
        >
          <Brain size={15} />
          <span>Analyse</span>
        </button>
      </div>

      <div style={{ flex: 1 }} />

      {/* Right actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
        <TopBarIconBtn title={t("sidebar.refreshBtn")} onClick={() => load(currentClub.id, currentClub.platform)}>
          <RefreshCw size={15} />
        </TopBarIconBtn>
        <AutoRefreshButton clubId={currentClub.id} platform={currentClub.platform} load={load} />
        {discordWebhook && (
          <button onClick={shareOverview} disabled={sharing}
            style={{
              display: "flex", alignItems: "center", gap: 5, padding: "0 10px", height: 28, borderRadius: 5,
              background: "rgba(88,101,242,0.12)", border: "1px solid rgba(88,101,242,0.25)",
              color: sharing ? "var(--muted)" : "#5865f2",
              fontSize: 11, fontWeight: 700, cursor: sharing ? "default" : "pointer",
              fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.06em",
              transition: "all 0.15s", opacity: sharing ? 0.6 : 1,
            }}
            onMouseEnter={(e) => { if (!sharing) (e.currentTarget as HTMLElement).style.background = "rgba(88,101,242,0.25)"; }}
            onMouseLeave={(e) => { if (!sharing) (e.currentTarget as HTMLElement).style.background = "rgba(88,101,242,0.12)"; }}
          >
            <Send size={12} /> {sharing ? "ENVOI…" : "DISCORD"}
          </button>
        )}
      </div>
    </nav>
  );
}

function HorizontalLaunchBar() {
  const { history, favs, toggleFav, persistSettings, addLog, setSearchResults } = useAppStore();
  const { load } = useClub();
  const t = useT();
  const [query, setQuery] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const allClubs = [...favs];
  for (const c of history) { if (!allClubs.some((f) => f.id === c.id)) allClubs.push(c); }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    if (showMenu) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMenu]);

  const doSearch = async () => {
    if (!query.trim()) return;
    addLog(`${t("sidebar.search")}: "${query}"…`);
    try {
      const clubs = await searchClub(query.trim());
      setSearchResults(clubs, true);
    } catch (e) { addLog(`Error: ${String(e)}`); }
  };

  return (
    <nav style={{
      height: 44, flexShrink: 0,
      background: "var(--sidebar-bg)", borderBottom: "1px solid var(--border)",
      display: "flex", alignItems: "center", gap: 8,
      paddingLeft: 12, paddingRight: 12, position: "relative", zIndex: 10,
    }}>
      <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 15, color: "var(--accent)",
        flexShrink: 0, letterSpacing: "0.06em" }}>
        {allClubs[0]?.name || "ProClubs Stats"}
      </span>
      <div style={{ width: 1, height: 20, background: "var(--border)", flexShrink: 0 }} />
      <div style={{ position: "relative", flex: 1, maxWidth: 340 }}>
        <Search size={13} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)",
          color: "var(--muted)", pointerEvents: "none" }} />
        <input value={query} onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && doSearch()}
          placeholder={t("sidebar.searchPlaceholder")}
          style={{
            width: "100%", background: "var(--bg)", border: "1px solid var(--border)",
            color: "var(--text)", padding: "5px 8px 5px 26px", borderRadius: 5, fontSize: 12, outline: "none",
          }}
          onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "var(--accent)"; }}
          onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "var(--border)"; }}
        />
      </div>
      <div style={{ flex: 1 }} />
      {allClubs.length > 0 && (
        <div ref={menuRef} style={{ position: "relative" }}>
          <button onClick={() => setShowMenu((v) => !v)} style={{
            display: "flex", alignItems: "center", gap: 5, padding: "0 10px", height: 28, borderRadius: 5,
            background: "var(--hover)", border: "1px solid var(--border)", color: "var(--muted)",
            fontSize: 11, cursor: "pointer",
          }}>
            {t("sidebar.recent")}
            <ChevronDown size={12} style={{ transition: "transform 0.15s", transform: showMenu ? "rotate(180deg)" : "none" }} />
          </button>
          {showMenu && (
            <div style={{
              position: "absolute", top: "calc(100% + 4px)", right: 0,
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 8, padding: "6px 0", minWidth: 200, zIndex: 200,
              boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            }}>
              {allClubs.map((club) => (
                <div key={club.id}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px",
                    cursor: "pointer", transition: "background 0.1s" }}
                  onClick={() => { load(club.id, club.platform); setShowMenu(false); persistSettings(); }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--hover)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <ClubLogo club={club} size={20} />
                  <span style={{ flex: 1, fontSize: 13, color: "var(--text)", overflow: "hidden",
                    textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {club.name || `Club #${club.id}`}
                  </span>
                  <button onClick={(e) => { e.stopPropagation(); toggleFav(club); persistSettings(); }}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 2,
                      color: favs.some((f) => f.id === club.id) ? "var(--gold)" : "var(--muted)", opacity: 0.7 }}>
                    <Star size={12} fill={favs.some((f) => f.id === club.id) ? "currentColor" : "none"} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </nav>
  );
}

/* ══════════════════════════════════════════════════════════════════
   VERTICAL SIDEBAR (layout original)
   ══════════════════════════════════════════════════════════════════ */

function VerticalSidebar() {
  const { currentClub, activeTab, setActiveTab, setSidebarTab, sidebarTab, favs, activeSession, history,
    toggleFav, persistSettings, discordWebhook, players, matches, addToast, eaProfile } = useAppStore();
  const { load } = useClub();
  const t = useT();
  const NAV_ITEMS = useNavItems();
  const [sharing, setSharing] = useState(false);

  const shareOverview = async () => {
    if (!discordWebhook) { addToast("Configure le webhook Discord dans Mon Profil", "error"); return; }
    if (!currentClub) { addToast("Charge un club d'abord", "error"); return; }
    setSharing(true);
    try {
      await sendDiscordWebhook(discordWebhook, [buildClubOverviewEmbed(currentClub, players, matches)]);
      addToast("Envoyé sur Discord !", "success");
    } catch (e) { addToast(`Discord: ${String(e)}`, "error"); }
    finally { setSharing(false); }
  };

  if (!currentClub) {
    return (
      <aside style={{ width: 240, flexShrink: 0, height: "100%",
        background: "var(--sidebar-bg)", display: "flex", flexDirection: "column" }}
        role="navigation" aria-label={t("sidebar.search")}>
        <VerticalLaunchSidebar />
      </aside>
    );
  }

  return (
    <aside style={{ width: 240, flexShrink: 0, height: "100%",
      background: "var(--sidebar-bg)", display: "flex", flexDirection: "column" }}
      role="navigation" aria-label={t("sidebar.stats")}>
      {/* Header */}
      <div style={{ height: 48, display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 16px", borderBottom: "1px solid rgba(0,0,0,0.24)", flexShrink: 0, cursor: "pointer" }}>
        <span style={{ fontWeight: 600, fontSize: 15, color: "var(--text)", overflow: "hidden",
          textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {currentClub.name}
        </span>
        <ChevronDown size={16} color="var(--text)" />
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {/* Search */}
        <div className="category-header">
          <ChevronDown size={10} style={{ marginRight: 2 }} />
          {t("sidebar.search")}
        </div>
        <div className="sidebar-tab" style={{ maxHeight: 300, overflow: "hidden" }}>
          <SearchTab compact />
        </div>

        {/* Nav channels */}
        <div className="category-header" style={{ marginTop: 8 }}>
          <ChevronDown size={10} style={{ marginRight: 2 }} />
          {t("sidebar.stats")}
        </div>
        {NAV_ITEMS.map((item) => (
          <div key={item.id}
            className={`channel-item ${activeTab === item.id ? "active" : ""}`}
            onClick={() => { setActiveTab(item.id); setSidebarTab("search"); persistSettings(); }}
            role="tab" aria-selected={activeTab === item.id} tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter") { setActiveTab(item.id); setSidebarTab("search"); persistSettings(); } }}>
            <span style={{ color: activeTab === item.id ? "var(--text)" : "var(--muted)", flexShrink: 0, display: "flex" }}>{item.icon}</span>
            <span>{item.label}</span>
            {item.id === "session" && activeSession && (
              <span style={{ marginLeft: "auto", width: 8, height: 8, borderRadius: "50%",
                background: "var(--red)", flexShrink: 0 }} aria-label="Live" />
            )}
          </div>
        ))}

        {/* Favorites */}
        {favs.length > 0 && (
          <>
            <div className="category-header" style={{ marginTop: 8 }}>
              <ChevronDown size={10} style={{ marginRight: 2 }} />
              {t("sidebar.favs")}
            </div>
            <VerticalFavsList />
          </>
        )}

        {/* Recent clubs */}
        {history.length > 0 && (
          <>
            <div className="category-header" style={{ marginTop: 8 }}>
              <ChevronDown size={10} style={{ marginRight: 2 }} />
              {t("sidebar.recent")}
            </div>
            {history.map((club) => (
              <div key={club.id}
                className={`channel-item ${currentClub?.id === club.id ? "active" : ""}`}
                onClick={() => { load(club.id, club.platform); persistSettings(); }}
                role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") { load(club.id, club.platform); persistSettings(); } }}>
                <ClubLogo club={club} size={20} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {club.name || `Club #${club.id}`}
                </span>
                <button onClick={(e) => { e.stopPropagation(); toggleFav(club); persistSettings(); }}
                  style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer",
                    padding: 2, color: favs.some((f) => f.id === club.id) ? "var(--gold)" : "var(--muted)",
                    flexShrink: 0, opacity: 0.6, transition: "opacity 0.1s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.6"; }}>
                  <Star size={12} fill={favs.some((f) => f.id === club.id) ? "currentColor" : "none"} />
                </button>
              </div>
            ))}
          </>
        )}

        {/* Refresh */}
        <div className="category-header" style={{ marginTop: 8 }}>
          <ChevronDown size={10} style={{ marginRight: 2 }} />
          {t("sidebar.refresh")}
        </div>
        <div className="channel-item"
          onClick={() => load(currentClub.id, currentClub.platform)}
          role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter") load(currentClub.id, currentClub.platform); }}
          style={{ cursor: "pointer" }}>
          <RefreshCw size={18} style={{ color: "var(--muted)", flexShrink: 0 }} />
          <span>{t("sidebar.refreshBtn")}</span>
        </div>
        <VerticalAutoRefreshItem clubId={currentClub.id} platform={currentClub.platform} load={load} />

        <VerticalDiscordSection onShare={shareOverview} sharing={sharing} />

        {/* Mon Profil */}
        {eaProfile?.clubId && (
          <>
            <div className="category-header" style={{ marginTop: 8 }}>
              <ChevronDown size={10} style={{ marginRight: 2 }} />
              MON PROFIL
            </div>
            <div
              className={`channel-item ${sidebarTab === "myprofile" ? "active" : ""}`}
              onClick={() => setSidebarTab("myprofile")}
              role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") setSidebarTab("myprofile"); }}
              style={{ cursor: "pointer" }}>
              <User size={18} style={{ color: sidebarTab === "myprofile" ? "var(--accent)" : "var(--muted)", flexShrink: 0 }} />
              <span>{eaProfile.gamertag}</span>
            </div>
          </>
        )}

        {/* Analyse IA */}
        <div className="category-header" style={{ marginTop: 8 }}>
          <ChevronDown size={10} style={{ marginRight: 2 }} />
          ANALYSE
        </div>
        <div
          className={`channel-item ${sidebarTab === "analyse" ? "active" : ""}`}
          onClick={() => setSidebarTab("analyse")}
          role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter") setSidebarTab("analyse"); }}
          style={{ cursor: "pointer" }}>
          <Brain size={18} style={{ color: sidebarTab === "analyse" ? "var(--accent)" : "var(--muted)", flexShrink: 0 }} />
          <span>Analyse IA</span>
        </div>
      </div>

      <VerticalUserPanel />
    </aside>
  );
}

function VerticalLaunchSidebar() {
  const { history, favs, toggleFav, persistSettings, setActiveTab, activeTab, addLog, setSearchResults, eaProfile, sidebarTab, setSidebarTab } = useAppStore();
  const { load } = useClub();
  const t = useT();
  const NAV_ITEMS = useNavItems();
  const [query, setQuery] = useState("");

  const lastClub = history[0] || favs[0];
  const isFav = (id: string) => favs.some((f) => f.id === id);

  const doSearch = async () => {
    if (!query.trim()) return;
    addLog(`${t("sidebar.search")}: "${query}"…`);
    try {
      const clubs = await searchClub(query.trim());
      setSearchResults(clubs, true);
    } catch (e) { addLog(`Error: ${String(e)}`); }
  };

  return (
    <>
      <div style={{ height: 48, display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 16px", borderBottom: "1px solid rgba(0,0,0,0.24)", flexShrink: 0 }}>
        <span style={{ fontWeight: 600, fontSize: 15, color: "var(--text)", overflow: "hidden",
          textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {lastClub?.name || "ProClubs Stats"}
        </span>
        <ChevronDown size={16} color="var(--text)" />
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        <div className="category-header">
          <ChevronDown size={10} style={{ marginRight: 2 }} />
          {t("sidebar.search")}
        </div>
        <div style={{ padding: "4px 8px" }}>
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 8, top: "50%",
              transform: "translateY(-50%)", color: "var(--muted)" }} />
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
              placeholder={t("sidebar.searchPlaceholder")}
              style={{ width: "100%", background: "var(--bg)", border: "none", color: "var(--text)",
                padding: "6px 8px 6px 28px", borderRadius: 4, fontSize: 12, outline: "none",
                boxSizing: "border-box" }} />
          </div>
        </div>

        <div className="category-header" style={{ marginTop: 8 }}>
          <ChevronDown size={10} style={{ marginRight: 2 }} />
          {t("sidebar.stats")}
        </div>
        {NAV_ITEMS.map((item) => (
          <div key={item.id}
            className={`channel-item ${activeTab === item.id ? "active" : ""}`}
            onClick={() => { setActiveTab(item.id); if (lastClub) load(lastClub.id, lastClub.platform); }}
            role="tab" aria-selected={activeTab === item.id} tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter") { setActiveTab(item.id); if (lastClub) load(lastClub.id, lastClub.platform); } }}>
            <span style={{ color: activeTab === item.id ? "var(--text)" : "var(--muted)", flexShrink: 0, display: "flex" }}>{item.icon}</span>
            <span>{item.label}</span>
          </div>
        ))}

        {favs.length > 0 && (
          <>
            <div className="category-header" style={{ marginTop: 8 }}>
              <ChevronDown size={10} style={{ marginRight: 2 }} />
              {t("sidebar.favs")}
            </div>
            {favs.map((club) => (
              <div key={club.id} className="channel-item"
                onClick={() => load(club.id, club.platform)} role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") load(club.id, club.platform); }}>
                <ClubLogo club={club} size={20} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {club.name || `Club #${club.id}`}
                </span>
                <button onClick={(e) => { e.stopPropagation(); toggleFav(club); persistSettings(); }}
                  style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer",
                    padding: 2, color: "var(--gold)", flexShrink: 0, opacity: 0.6, transition: "opacity 0.1s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.6"; }}>
                  <Star size={12} fill="currentColor" />
                </button>
              </div>
            ))}
          </>
        )}

        {history.length > 0 && (
          <>
            <div className="category-header" style={{ marginTop: 8 }}>
              <ChevronDown size={10} style={{ marginRight: 2 }} />
              {t("sidebar.recent")}
            </div>
            {history.map((club) => (
              <div key={club.id} className="channel-item"
                onClick={() => { load(club.id, club.platform); persistSettings(); }} role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") { load(club.id, club.platform); persistSettings(); } }}>
                <ClubLogo club={club} size={20} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {club.name || `Club #${club.id}`}
                </span>
                <button onClick={(e) => { e.stopPropagation(); toggleFav(club); persistSettings(); }}
                  style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer",
                    padding: 2, color: isFav(club.id) ? "var(--gold)" : "var(--muted)",
                    flexShrink: 0, opacity: 0.6, transition: "opacity 0.1s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.6"; }}>
                  <Star size={12} fill={isFav(club.id) ? "currentColor" : "none"} />
                </button>
              </div>
            ))}
          </>
        )}

        <div className="category-header" style={{ marginTop: 8 }}>
          <ChevronDown size={10} style={{ marginRight: 2 }} />
          {t("sidebar.refresh")}
        </div>
        <div className="channel-item"
          onClick={() => { if (lastClub) load(lastClub.id, lastClub.platform); }}
          role="button" tabIndex={0} style={{ cursor: "pointer" }}>
          <RefreshCw size={18} style={{ color: "var(--muted)", flexShrink: 0 }} />
          <span>{t("sidebar.refreshBtn")}</span>
        </div>
        <VerticalAutoRefreshItem clubId={lastClub?.id} platform={lastClub?.platform} load={load} />

        {/* Mon Profil */}
        {eaProfile?.clubId && (
          <>
            <div className="category-header" style={{ marginTop: 8 }}>
              <ChevronDown size={10} style={{ marginRight: 2 }} />
              MON PROFIL
            </div>
            <div
              className={`channel-item ${sidebarTab === "myprofile" ? "active" : ""}`}
              onClick={() => setSidebarTab("myprofile")}
              role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") setSidebarTab("myprofile"); }}
              style={{ cursor: "pointer" }}>
              <User size={18} style={{ color: sidebarTab === "myprofile" ? "var(--accent)" : "var(--muted)", flexShrink: 0 }} />
              <span>{eaProfile.gamertag}</span>
            </div>
          </>
        )}

        {/* Analyse IA */}
        <div className="category-header" style={{ marginTop: 8 }}>
          <ChevronDown size={10} style={{ marginRight: 2 }} />
          ANALYSE
        </div>
        <div
          className={`channel-item ${sidebarTab === "analyse" ? "active" : ""}`}
          onClick={() => setSidebarTab("analyse")}
          role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter") setSidebarTab("analyse"); }}
          style={{ cursor: "pointer" }}>
          <Brain size={18} style={{ color: sidebarTab === "analyse" ? "var(--accent)" : "var(--muted)", flexShrink: 0 }} />
          <span>Analyse IA</span>
        </div>
      </div>
    </>
  );
}

function VerticalFavsList() {
  const { favs, toggleFav, persistSettings, currentClub } = useAppStore();
  const { load } = useClub();
  return (
    <>
      {favs.map((club) => (
        <div key={club.id}
          className={`channel-item ${currentClub?.id === club.id ? "active" : ""}`}
          onClick={() => load(club.id, club.platform)} role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter") load(club.id, club.platform); }}>
          <ClubLogo club={club} size={20} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {club.name || `Club #${club.id}`}
          </span>
          <button onClick={(e) => { e.stopPropagation(); toggleFav(club); persistSettings(); }}
            style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer",
              padding: 2, color: "var(--gold)", flexShrink: 0, opacity: 0.6, transition: "opacity 0.1s" }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.6"; }}>
            <Star size={12} fill="currentColor" />
          </button>
        </div>
      ))}
    </>
  );
}

function VerticalAutoRefreshItem({ clubId, platform, load }: { clubId?: string; platform?: string; load: (id: string, p: string) => void }) {
  const t = useT();
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const autoRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (autoRefresh && clubId && platform) {
      setCountdown(60);
      autoRef.current = setInterval(() => { load(clubId, platform); setCountdown(60); }, 60_000);
      countRef.current = setInterval(() => setCountdown((c) => (c <= 1 ? 60 : c - 1)), 1_000);
    } else {
      if (autoRef.current) clearInterval(autoRef.current);
      if (countRef.current) clearInterval(countRef.current);
    }
    return () => { if (autoRef.current) clearInterval(autoRef.current); if (countRef.current) clearInterval(countRef.current); };
  }, [autoRefresh, clubId, platform]);

  return (
    <div className="channel-item" style={{ cursor: "pointer" }} onClick={() => setAutoRefresh(!autoRefresh)}
      role="button" tabIndex={0} aria-pressed={autoRefresh}
      onKeyDown={(e) => { if (e.key === "Enter") setAutoRefresh(!autoRefresh); }}>
      <Timer size={18} style={{ color: autoRefresh ? "var(--green)" : "var(--muted)", flexShrink: 0 }} />
      <span>{t("sidebar.autoRefresh")}</span>
      {autoRefresh && <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--muted)" }}>{countdown}s</span>}
    </div>
  );
}

function VerticalDiscordSection({ onShare, sharing }: { onShare: () => void; sharing: boolean }) {
  const { discordWebhook, setSidebarTab } = useAppStore();
  return (
    <div style={{ margin: "12px 8px 4px", borderRadius: 8, overflow: "hidden", border: "1px solid rgba(88,101,242,0.25)" }}>
      <div style={{ background: "rgba(88,101,242,0.18)", padding: "7px 10px", display: "flex",
        alignItems: "center", gap: 7, borderBottom: "1px solid rgba(88,101,242,0.2)" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="#5865f2">
          <path d="M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026 13.83 13.83 0 0 0 1.226-1.963.074.074 0 0 0-.041-.104 13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028zM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.956 2.38-2.157 2.38zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.946 2.38-2.157 2.38z"/>
        </svg>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#5865f2", letterSpacing: "0.04em", flex: 1 }}>DISCORD</span>
        {discordWebhook
          ? <span style={{ fontSize: 9, background: "rgba(35,165,89,0.2)", color: "var(--green)", padding: "2px 6px", borderRadius: 10, fontWeight: 600 }}>Actif</span>
          : <span style={{ fontSize: 9, background: "rgba(255,255,255,0.06)", color: "var(--muted)", padding: "2px 6px", borderRadius: 10 }}>Non configuré</span>
        }
      </div>
      <div style={{ padding: "8px 8px 6px" }}>
        <button onClick={onShare} disabled={sharing} style={{
          width: "100%", padding: "7px 10px",
          background: sharing ? "rgba(88,101,242,0.08)" : "rgba(88,101,242,0.15)",
          border: "none", borderRadius: 6,
          color: sharing ? "var(--muted)" : "#5865f2",
          fontSize: 12, fontWeight: 700, cursor: sharing ? "default" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          transition: "all 0.15s", fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.06em",
        }}
          onMouseEnter={(e) => { if (!sharing) e.currentTarget.style.background = "rgba(88,101,242,0.25)"; }}
          onMouseLeave={(e) => { if (!sharing) e.currentTarget.style.background = "rgba(88,101,242,0.15)"; }}
        >
          <Send size={13} />
          {sharing ? "ENVOI EN COURS…" : "PARTAGER LES STATS"}
        </button>
        {!discordWebhook && (
          <button onClick={() => setSidebarTab("profile")} style={{
            width: "100%", marginTop: 5, padding: "5px 10px",
            background: "none", border: "none", color: "var(--muted)",
            fontSize: 10, cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted",
          }}>
            Configurer dans Mon Profil
          </button>
        )}
      </div>
    </div>
  );
}

function VerticalUserPanel() {
  const { currentClub } = useAppStore();
  const t = useT();
  return (
    <div style={{ padding: "8px", background: "rgba(0,0,0,0.16)", flexShrink: 0,
      display: "flex", alignItems: "center", gap: 8 }} role="status">
      {currentClub ? (
        <>
          <ClubLogo club={currentClub} size={32} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", overflow: "hidden",
              textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {currentClub.name}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>
              {currentClub.platform.toUpperCase()}
              {currentClub.skillRating && ` · ${currentClub.skillRating} SR`}
            </div>
          </div>
        </>
      ) : (
        <div style={{ flex: 1, fontSize: 12, color: "var(--muted)" }}>{t("sidebar.noClub")}</div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   SHARED HELPERS
   ══════════════════════════════════════════════════════════════════ */

function TopBarIconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} title={title} style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      width: 30, height: 30, borderRadius: 6,
      background: "none", border: "none", cursor: "pointer",
      color: "var(--muted)", transition: "color 0.1s, background 0.1s",
    }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--hover)"; (e.currentTarget as HTMLElement).style.color = "var(--text)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "none"; (e.currentTarget as HTMLElement).style.color = "var(--muted)"; }}
    >{children}</button>
  );
}

function AutoRefreshButton({ clubId, platform, load }: { clubId: string; platform: string; load: (id: string, p: string) => void }) {
  const t = useT();
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const autoRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (autoRefresh) {
      setCountdown(60);
      autoRef.current = setInterval(() => { load(clubId, platform); setCountdown(60); }, 60_000);
      countRef.current = setInterval(() => setCountdown((c) => (c <= 1 ? 60 : c - 1)), 1_000);
    } else {
      if (autoRef.current) clearInterval(autoRef.current);
      if (countRef.current) clearInterval(countRef.current);
    }
    return () => { if (autoRef.current) clearInterval(autoRef.current); if (countRef.current) clearInterval(countRef.current); };
  }, [autoRefresh, clubId, platform]);

  return (
    <button onClick={() => setAutoRefresh((v) => !v)} title={t("sidebar.autoRefresh")} aria-pressed={autoRefresh}
      style={{
        display: "flex", alignItems: "center", gap: 4, padding: "0 8px", height: 28, borderRadius: 5,
        background: autoRefresh ? "rgba(35,165,89,0.15)" : "none",
        border: `1px solid ${autoRefresh ? "var(--green)" : "transparent"}`,
        color: autoRefresh ? "var(--green)" : "var(--muted)",
        fontSize: 10, cursor: "pointer", transition: "all 0.15s",
      }}
      onMouseEnter={(e) => { if (!autoRefresh) { (e.currentTarget as HTMLElement).style.background = "var(--hover)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; } }}
      onMouseLeave={(e) => { if (!autoRefresh) { (e.currentTarget as HTMLElement).style.background = "none"; (e.currentTarget as HTMLElement).style.borderColor = "transparent"; } }}
    >
      <Timer size={13} />
      {autoRefresh && <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.06em" }}>{countdown}s</span>}
    </button>
  );
}

/** Remplace la taille d'un icon Lucide (JSX Element) — simple helper pour ne pas dupliquer les listes */
function cloneIconSize(icon: ReactNode, size: number): ReactNode {
  if (!icon || typeof icon !== "object") return icon;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const el = icon as any;
  return { ...el, props: { ...el.props, size } };
}
