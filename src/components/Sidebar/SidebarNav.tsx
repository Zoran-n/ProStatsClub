import { useAppStore, type SidebarTab } from "../../store/useAppStore";

const BASE_TABS: { id: SidebarTab; label: string }[] = [
  { id: "search",   label: "CHERCHE" },
  { id: "favs",     label: "FAVORIS" },
  { id: "settings", label: "PARAMS" },
];

export function SidebarNav() {
  const { sidebarTab, setSidebarTab } = useAppStore();
  const TABS = BASE_TABS;
  return (
    <div style={{ display: "flex", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
      {TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => setSidebarTab(t.id)}
          style={{
            flex: 1, padding: "8px 2px", fontSize: 9, fontFamily: "'Bebas Neue', sans-serif",
            letterSpacing: "0.05em", border: "none", cursor: "pointer", position: "relative",
            background: sidebarTab === t.id ? "var(--card)" : "transparent",
            color: sidebarTab === t.id ? "var(--accent)" : "var(--muted)",
            borderBottom: sidebarTab === t.id ? "2px solid var(--accent)" : "2px solid transparent",
            transition: "all 0.15s",
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
