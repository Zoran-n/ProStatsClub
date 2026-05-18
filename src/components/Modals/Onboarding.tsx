import { useState } from "react";
import { Search, Users, Timer, GitCompare, Keyboard, ChevronRight, Maximize } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { useT, LANGUAGES } from "../../i18n";
import type { Lang } from "../../i18n";

const STEPS = [
  { icon: <Search size={28} />,      key: "onboarding.step1" },
  { icon: <Users size={28} />,       key: "onboarding.step2" },
  { icon: <Timer size={28} />,       key: "onboarding.step3" },
  { icon: <GitCompare size={28} />,  key: "onboarding.step4" },
];

const SHORTCUTS = [
  { keys: "F11",           key: "shortcut.fullscreen" },
  { keys: "Ctrl + F",     key: "shortcut.search" },
  { keys: "Ctrl + E",     key: "shortcut.export" },
  { keys: "Ctrl + 1-5",   key: "nav.players" },
  { keys: "Ctrl+Shift+D", key: "shortcut.devPanel" },
];

export function Onboarding() {
  const { setOnboarded, setLanguage, language, persistSettings } = useAppStore();
  const t = useT();
  const [step, setStep] = useState(0); // 0=lang, 1=features, 2=shortcuts

  const finish = () => {
    setOnboarded();
    persistSettings();
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 99999,
      background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: "var(--surface)", borderRadius: 16, padding: "36px 40px",
        maxWidth: 720, width: "90%", boxShadow: "0 16px 64px rgba(0,0,0,0.5)",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 24,
      }}>
        {/* ── Step 0: Language selection ── */}
        {step === 0 && (
          <>
            <div style={{ fontSize: 48 }}>&#9917;</div>
            <h1 style={{
              fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: "var(--text)",
              letterSpacing: "0.06em", textAlign: "center",
            }}>
              {t("onboarding.welcome")}
            </h1>
            <p style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", lineHeight: 1.5 }}>
              {t("onboarding.desc")}
            </p>

            <div style={{ width: "100%" }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase",
                letterSpacing: "0.04em", marginBottom: 8,
              }}>
                {t("settings.language")}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {LANGUAGES.map((l) => (
                  <button key={l.id} onClick={() => { setLanguage(l.id as Lang); }}
                    style={{
                      flex: 1, minWidth: 70, padding: "8px 6px",
                      background: language === l.id ? "var(--accent)" : "var(--hover)",
                      color: language === l.id ? "#fff" : "var(--text)",
                      border: "none", borderRadius: 6, cursor: "pointer",
                      fontSize: 12, fontWeight: language === l.id ? 700 : 400,
                      transition: "all 0.15s",
                    }}>
                    <div style={{ fontSize: 14, marginBottom: 2 }}>{l.flag}</div>
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={() => setStep(1)} style={{
              width: "100%", padding: "10px 0",
              background: "var(--accent)", color: "#fff", border: "none",
              borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>
              <ChevronRight size={16} /> {t("onboarding.start")}
            </button>
          </>
        )}

        {/* ── Step 1: Features overview ── */}
        {step === 1 && (
          <>
            <Maximize size={36} color="var(--accent)" />
            <h2 style={{
              fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: "var(--text)",
              letterSpacing: "0.04em",
            }}>
              {t("onboarding.welcome")}
            </h2>
            <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
              {STEPS.map((s, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "10px 14px", background: "var(--hover)", borderRadius: 8,
                }}>
                  <div style={{ color: "var(--accent)", flexShrink: 0 }}>{s.icon}</div>
                  <span style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.4 }}>{t(s.key)}</span>
                </div>
              ))}
            </div>
            <button onClick={() => setStep(2)} style={{
              width: "100%", padding: "10px 0",
              background: "var(--accent)", color: "#fff", border: "none",
              borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>
              <Keyboard size={16} /> {t("onboarding.shortcuts")}
            </button>
          </>
        )}

        {/* ── Step 2: Keyboard shortcuts ── */}
        {step === 2 && (
          <>
            <Keyboard size={36} color="var(--accent)" />
            <h2 style={{
              fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: "var(--text)",
              letterSpacing: "0.04em",
            }}>
              {t("onboarding.shortcuts")}
            </h2>
            <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
              {SHORTCUTS.map((s) => (
                <div key={s.keys} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 14px", background: "var(--hover)", borderRadius: 8,
                }}>
                  <span style={{ fontSize: 13, color: "var(--text)" }}>{t(s.key)}</span>
                  <kbd style={{
                    padding: "3px 8px", background: "var(--bg)", borderRadius: 4,
                    fontSize: 11, fontWeight: 700, color: "var(--accent)",
                    border: "1px solid var(--border)", fontFamily: "monospace",
                  }}>{s.keys}</kbd>
                </div>
              ))}
            </div>
            <button onClick={finish} style={{
              width: "100%", padding: "10px 0",
              background: "var(--accent)", color: "#fff", border: "none",
              borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 700,
            }}>
              {t("onboarding.start")}
            </button>
          </>
        )}

        {/* Progress dots */}
        <div style={{ display: "flex", gap: 6 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} onClick={() => setStep(i)} style={{
              width: 8, height: 8, borderRadius: "50%", cursor: "pointer",
              background: step === i ? "var(--accent)" : "var(--border)",
              transition: "background 0.15s",
            }} />
          ))}
        </div>
      </div>
    </div>
  );
}
