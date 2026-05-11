import { useMemo } from "react";
import { BarChart2, ShieldCheck, Swords, Target, TrendingUp, Trophy, Users, Zap } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { useAppStore } from "../../store/useAppStore";
import { useMatchData } from "../../hooks/useMatchData";
import { useT } from "../../i18n";
import type { Match, Player } from "../../types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function compositeScore(p: Player) {
  return p.goals * 3 + p.assists * 2 + p.motm * 5 + Math.round(p.rating * 10);
}

function matchDate(m: Match): Date {
  const n = Number(m.timestamp);
  return new Date(n > 1e12 ? n : n * 1000);
}

function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `il y a ${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `il y a ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `il y a ${days}j`;
}

// ─── Tile wrapper ─────────────────────────────────────────────────────────────

const TILE: React.CSSProperties = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: "16px 18px",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const TILE_LABEL: React.CSSProperties = {
  fontSize: 9,
  color: "var(--muted)",
  fontFamily: "'Bebas Neue', sans-serif",
  letterSpacing: "0.12em",
  display: "flex",
  alignItems: "center",
  gap: 5,
};

const STAT_NUM: React.CSSProperties = {
  fontFamily: "'Bebas Neue', sans-serif",
  lineHeight: 1,
};

// ─── ClubOverview ─────────────────────────────────────────────────────────────

export function ClubOverview() {
  const { currentClub, players } = useAppStore();
  const t = useT();
  const lang = useAppStore((s) => s.language);
  const locale = lang === "fr" ? "fr-FR" : lang === "es" ? "es-ES" : lang === "de" ? "de-DE" : lang === "pt" ? "pt-BR" : "en-US";

  // All league matches for club stats (leagueMatch is default type)
  const { allList: leagueMatches } = useMatchData();

  // ── Derived ───────────────────────────────────────────────────────────────

  const getResult = (m: Match): "W" | "D" | "L" => {
    const c = m.clubs[currentClub?.id ?? ""] as Record<string, unknown> | undefined;
    if (c?.["wins"] === "1") return "W";
    if (c?.["losses"] === "1") return "L";
    return "D";
  };

  const getScore = (m: Match): { my: number; opp: number } => {
    const myId = currentClub?.id ?? "";
    const my = m.clubs[myId] as Record<string, unknown> | undefined;
    const opp = Object.entries(m.clubs).find(([k]) => k !== myId)?.[1] as Record<string, unknown> | undefined;
    return { my: Number(my?.["goals"] ?? 0), opp: Number(opp?.["goals"] ?? 0) };
  };

  // Sorted matches (oldest first for charts)
  const sortedMatches = useMemo(() =>
    [...leagueMatches].sort((a, b) => Number(a.timestamp) - Number(b.timestamp)),
  [leagueMatches]);

  // Form data (last 15 matches for the chart)
  const formData = useMemo(() =>
    sortedMatches.slice(-15).map((m, i) => {
      const res = getResult(m);
      return { n: i + 1, v: res === "W" ? 3 : res === "D" ? 1 : 0, r: res, label: `M${i + 1}` };
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [sortedMatches]);

  // Overall stats (all matches loaded, all types)
  const stats = useMemo(() => {
    const total = (currentClub?.wins ?? 0) + (currentClub?.losses ?? 0) + (currentClub?.ties ?? 0);
    const winPct = total > 0 ? Math.round(((currentClub?.wins ?? 0) / total) * 100) : 0;
    const goalsPerMatch = total > 0 ? ((currentClub?.goals ?? 0) / total).toFixed(1) : "0.0";
    const points = (currentClub?.wins ?? 0) * 3 + (currentClub?.ties ?? 0);
    return { total, winPct, goalsPerMatch, points };
  }, [currentClub]);

  // Streak (from all league matches)
  const streak = useMemo(() => {
    if (leagueMatches.length < 2) return null;
    const sorted = [...leagueMatches].sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
    const first = getResult(sorted[0]);
    let count = 1;
    for (let i = 1; i < sorted.length; i++) {
      if (getResult(sorted[i]) === first) count++; else break;
    }
    if (count < 2) return null;
    return { result: first, count };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueMatches]);

  // Records (from league matches)
  const records = useMemo(() => {
    let biggestWin: { score: string; margin: number; opp: string } | null = null;
    let longestWinStreak = 0, curWin = 0;
    let mostGoals = 0;

    const sorted2 = [...leagueMatches].sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
    for (const m of sorted2) {
      const res = getResult(m);
      const sc = getScore(m);
      const margin = sc.my - sc.opp;
      if (res === "W") {
        curWin++;
        longestWinStreak = Math.max(longestWinStreak, curWin);
        if (margin > (biggestWin?.margin ?? -1)) {
          const myId = currentClub?.id ?? "";
          const oppEntry = Object.entries(m.clubs).find(([k]) => k !== myId)?.[1] as Record<string, unknown> | undefined;
          const det = oppEntry?.["details"] as Record<string, unknown> | undefined;
          const oppName = String(det?.["name"] ?? oppEntry?.["name"] ?? "?");
          biggestWin = { score: `${sc.my}-${sc.opp}`, margin, opp: oppName };
        }
      } else {
        curWin = 0;
      }
      mostGoals = Math.max(mostGoals, sc.my);
    }

    const totalGoalsScored = leagueMatches.reduce((acc, m) => acc + getScore(m).my, 0);

    return { biggestWin, longestWinStreak, mostGoals, totalGoalsScored };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueMatches, currentClub?.id]);

  // Top 3 players
  const topPlayers = useMemo(() =>
    [...players]
      .filter((p) => p.gamesPlayed >= 1)
      .sort((a, b) => compositeScore(b) - compositeScore(a))
      .slice(0, 3),
  [players]);

  // Last match
  const lastMatch = useMemo(() =>
    leagueMatches.length > 0
      ? [...leagueMatches].sort((a, b) => Number(b.timestamp) - Number(a.timestamp))[0]
      : null,
  [leagueMatches]);

  // SR trend (last 5 vs average form score)
  const formTrend = useMemo(() => {
    if (formData.length < 3) return null;
    const recent5 = formData.slice(-5);
    const older5 = formData.slice(-10, -5);
    if (older5.length === 0) return null;
    const avgRecent = recent5.reduce((a, d) => a + d.v, 0) / recent5.length;
    const avgOlder = older5.reduce((a, d) => a + d.v, 0) / older5.length;
    return avgRecent > avgOlder ? "up" : avgRecent < avgOlder ? "down" : "stable";
  }, [formData]);

  const streakColor = streak?.result === "W" ? "var(--green)" : streak?.result === "D" ? "#eab308" : "var(--red)";
  const dotColor = (v: number) => v === 3 ? "var(--green)" : v === 1 ? "#eab308" : "var(--red)";

  if (!currentClub) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        color: "var(--muted)", gap: 12, flexDirection: "column" }}>
        <ShieldCheck size={48} style={{ opacity: 0.2 }} />
        <p style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 2, opacity: 0.4 }}>
          Aucun club sélectionné
        </p>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>
      <div className="club-overview-grid">

        {/* ═══ TILE A — Forme (col-span-2) ═══ */}
        <div className="club-overview-span2" style={TILE}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={TILE_LABEL}>
              <TrendingUp size={11} /> ÉVOLUTION DE FORME — {formData.length} DERNIERS MATCHS
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {formTrend && (
                <span style={{
                  fontSize: 10, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1,
                  color: formTrend === "up" ? "var(--green)" : formTrend === "down" ? "var(--red)" : "var(--muted)",
                  padding: "2px 8px", borderRadius: 4,
                  background: formTrend === "up" ? "rgba(0,255,135,0.1)" : formTrend === "down" ? "rgba(255,45,85,0.1)" : "transparent",
                }}>
                  {formTrend === "up" ? "↑ EN PROGRESSION" : formTrend === "down" ? "↓ EN BAISSE" : "→ STABLE"}
                </span>
              )}
              {streak && (
                <span style={{
                  fontSize: 10, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1,
                  color: streakColor, padding: "2px 8px", borderRadius: 4,
                  background: `${streakColor}18`, border: `1px solid ${streakColor}33`,
                }}>
                  {streak.result === "W" ? "🔥" : streak.result === "D" ? "🤝" : "📉"} SÉRIE {streak.count}
                </span>
              )}
            </div>
          </div>

          {formData.length >= 3 ? (
            <ResponsiveContainer width="100%" height={110}>
              <LineChart data={formData} margin={{ top: 8, right: 8, left: -32, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 8, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 3]} ticks={[0, 1, 3]} tick={{ fontSize: 8, fill: "var(--muted)" }}
                  axisLine={false} tickLine={false} />
                <ReferenceLine y={1} stroke="var(--border)" strokeDasharray="3 3" />
                <ReferenceLine y={2} stroke="var(--border)" strokeDasharray="2 4" strokeOpacity={0.4} />
                <Tooltip content={({ payload }: { payload?: { payload: { r: string; v: number } }[] }) => {
                  if (!payload?.length) return null;
                  const p = payload[0].payload;
                  const label = p.r === "W" ? t("match.win") : p.r === "D" ? t("match.draw") : t("match.loss");
                  return (
                    <div style={{ background: "var(--card)", border: "1px solid var(--border)",
                      borderRadius: 4, padding: "4px 10px", fontSize: 10, color: dotColor(p.v) }}>{label}</div>
                  );
                }} />
                <Line type="monotone" dataKey="v" stroke="var(--accent)" strokeWidth={2.5}
                  dot={(props: { cx: number; cy: number; payload: { v: number; n: number } }) => {
                    const { cx, cy, payload } = props;
                    return <circle key={`dot-${payload.n}`} cx={cx} cy={cy} r={5}
                      fill={dotColor(payload.v)} stroke="var(--bg)" strokeWidth={2} />;
                  }}
                  activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 110, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>Chargez des matchs pour afficher la courbe de forme</span>
            </div>
          )}

          {/* Mini bar recap */}
          <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 20 }}>
            {formData.map((d, i) => (
              <div key={i} title={d.r}
                style={{
                  flex: 1, borderRadius: 2,
                  height: d.v === 3 ? "100%" : d.v === 1 ? "55%" : "25%",
                  background: dotColor(d.v), opacity: 0.75,
                }} />
            ))}
          </div>
        </div>

        {/* ═══ TILE B — Bilan saisonnier ═══ */}
        <div style={TILE}>
          <div style={TILE_LABEL}><BarChart2 size={11} /> BILAN GLOBAL</div>

          {/* Big SR */}
          {currentClub.skillRating && (
            <div style={{ textAlign: "center", padding: "8px 0 4px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ ...STAT_NUM, fontSize: 48, color: "var(--gold)", letterSpacing: 2 }}>
                {currentClub.skillRating}
              </div>
              <div style={{ fontSize: 9, color: "var(--muted)", fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.1em" }}>
                SKILL RATING
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            {[
              { label: "V", value: currentClub.wins, color: "var(--green)" },
              { label: "N", value: currentClub.ties, color: "#eab308" },
              { label: "D", value: currentClub.losses, color: "var(--red)" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: "var(--surface)", borderRadius: 6,
                padding: "10px 4px", textAlign: "center", border: "1px solid var(--border)" }}>
                <div style={{ ...STAT_NUM, fontSize: 28, color }}>{value}</div>
                <div style={{ fontSize: 8, color: "var(--muted)", marginTop: 3, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.08em" }}>{label}</div>
              </div>
            ))}
          </div>

          {/* % victoire bar */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: "var(--muted)" }}>% Victoire</span>
              <span style={{ ...STAT_NUM, fontSize: 14,
                color: stats.winPct >= 60 ? "var(--green)" : stats.winPct >= 40 ? "#eab308" : "var(--red)" }}>
                {stats.winPct}%
              </span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: "var(--border)", overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 2, transition: "width 0.6s ease",
                width: `${stats.winPct}%`,
                background: stats.winPct >= 60 ? "var(--green)" : stats.winPct >= 40 ? "#eab308" : "var(--red)",
              }} />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ ...STAT_NUM, fontSize: 18, color: "var(--gold)" }}>{stats.goalsPerMatch}</div>
              <div style={{ fontSize: 8, color: "var(--muted)", fontFamily: "'Bebas Neue', sans-serif" }}>BF/MATCH</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ ...STAT_NUM, fontSize: 18, color: "var(--accent)" }}>{stats.points}</div>
              <div style={{ fontSize: 8, color: "var(--muted)", fontFamily: "'Bebas Neue', sans-serif" }}>POINTS</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ ...STAT_NUM, fontSize: 18, color: "var(--text)" }}>{stats.total}</div>
              <div style={{ fontSize: 8, color: "var(--muted)", fontFamily: "'Bebas Neue', sans-serif" }}>MATCHS</div>
            </div>
          </div>
        </div>

        {/* ═══ TILE C — Records & Hauts Faits ═══ */}
        <div style={TILE}>
          <div style={TILE_LABEL}><Trophy size={11} /> HAUTS FAITS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              {
                icon: "🏆",
                label: "Plus grosse victoire",
                value: records.biggestWin ? `${records.biggestWin.score} vs ${records.biggestWin.opp}` : "—",
                color: "var(--gold)",
              },
              {
                icon: "🔥",
                label: "Meilleure série V",
                value: records.longestWinStreak > 0 ? `${records.longestWinStreak} victoires` : "—",
                color: "var(--green)",
              },
              {
                icon: "⚽",
                label: "Record buts en 1 match",
                value: records.mostGoals > 0 ? `${records.mostGoals} buts` : "—",
                color: "var(--accent)",
              },
              {
                icon: "📊",
                label: "Total buts marqués",
                value: records.totalGoalsScored > 0 ? `${records.totalGoalsScored} buts` : "—",
                color: "var(--gold)",
              },
            ].map(({ icon, label, value, color }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 10,
                padding: "8px 10px", background: "var(--surface)", borderRadius: 6,
                border: "1px solid var(--border)" }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 9, color: "var(--muted)", fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.06em" }}>
                    {label}
                  </div>
                  <div style={{ fontSize: 12, color, fontWeight: 700, marginTop: 1,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {value}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ═══ TILE D — Top Joueurs ═══ */}
        <div style={TILE}>
          <div style={TILE_LABEL}><Users size={11} /> TOP JOUEURS</div>
          {topPlayers.length === 0 ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--muted)", fontSize: 11 }}>
              Aucun joueur chargé
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {topPlayers.map((p, rank) => {
                const medal = rank === 0 ? "🥇" : rank === 1 ? "🥈" : "🥉";
                const ratingColor = p.rating >= 8 ? "var(--green)" : p.rating >= 6.5 ? "#eab308" : "var(--red)";
                return (
                  <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 10,
                    padding: "9px 12px", background: "var(--surface)", borderRadius: 7,
                    border: `1px solid ${rank === 0 ? "rgba(255,215,0,0.3)" : "var(--border)"}`,
                  }}>
                    <span style={{ fontSize: 18, flexShrink: 0 }}>{medal}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: "var(--text)", fontWeight: 600,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.name}
                      </div>
                      <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 1 }}>
                        {p.gamesPlayed}MJ · {p.goals}G · {p.assists}A · {p.motm}MOTM
                      </div>
                    </div>
                    <div style={{ ...STAT_NUM, fontSize: 22, color: ratingColor, flexShrink: 0 }}>
                      {p.rating.toFixed(1)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {players.length > 3 && (
            <div style={{ fontSize: 9, color: "var(--muted)", textAlign: "center", marginTop: 2 }}>
              +{players.length - 3} autres joueurs · Voir onglet Joueurs
            </div>
          )}
        </div>

        {/* ═══ TILE E — Activité Récente ═══ */}
        <div style={TILE}>
          <div style={TILE_LABEL}><Zap size={11} /> ACTIVITÉ RÉCENTE</div>

          {lastMatch ? (() => {
            const res = getResult(lastMatch);
            const sc = getScore(lastMatch);
            const accentColor = res === "W" ? "var(--green)" : res === "L" ? "var(--red)" : "#eab308";
            const resLabel = res === "W" ? t("match.win") : res === "D" ? t("match.draw") : t("match.loss");
            const date = matchDate(lastMatch);
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ padding: "12px 14px", background: `${accentColor}10`,
                  border: `1px solid ${accentColor}33`, borderRadius: 8 }}>
                  <div style={{ fontSize: 9, color: "var(--muted)", fontFamily: "'Bebas Neue', sans-serif",
                    letterSpacing: "0.08em", marginBottom: 6 }}>
                    DERNIER MATCH CHARGÉ · {timeAgo(date)}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ ...STAT_NUM, fontSize: 40, color: accentColor, letterSpacing: 2 }}>
                      {sc.my}-{sc.opp}
                    </span>
                    <span style={{ ...STAT_NUM, fontSize: 16, color: accentColor, letterSpacing: 1 }}>
                      {resLabel}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
                    {new Date(Number(lastMatch.timestamp) > 1e12
                      ? Number(lastMatch.timestamp)
                      : Number(lastMatch.timestamp) * 1000
                    ).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })}
                  </div>
                </div>
              </div>
            );
          })() : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--muted)", fontSize: 11 }}>
              Aucun match chargé
            </div>
          )}

          {/* Club meta */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 4,
            paddingTop: 10, borderTop: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 10, color: "var(--muted)" }}>Plateforme</span>
              <span style={{ fontSize: 10, color: "var(--accent)", fontWeight: 600 }}>
                {currentClub.platform.toUpperCase()}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 10, color: "var(--muted)" }}>Club ID</span>
              <span style={{ fontSize: 10, color: "var(--muted)", fontFamily: "monospace" }}>
                {currentClub.id}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 10, color: "var(--muted)" }}>Matchs chargés</span>
              <span style={{ fontSize: 10, color: "var(--text)", fontWeight: 600 }}>
                {leagueMatches.length}
              </span>
            </div>
          </div>
        </div>

        {/* ═══ TILE F — Statistiques d'attaque ═══ */}
        <div className="club-overview-span2" style={TILE}>
          <div style={TILE_LABEL}><Target size={11} /> STATISTIQUES D'ÉQUIPE</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            {[
              { label: "BUTS MARQUÉS", value: currentClub.goals, color: "var(--gold)", icon: "⚽" },
              { label: "MATCHS JOUÉS", value: stats.total, color: "var(--accent)", icon: "🎮" },
              { label: "POINTS LIGUE", value: stats.points, color: "var(--green)", icon: "📈" },
              { label: "JOUEURS ACTIFS", value: players.filter(p => p.gamesPlayed >= 1).length, color: "var(--text)", icon: "👤" },
            ].map(({ label, value, color, icon }) => (
              <div key={label} style={{ textAlign: "center", padding: "12px 8px",
                background: "var(--surface)", borderRadius: 8, border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 18, marginBottom: 4 }}>{icon}</div>
                <div style={{ ...STAT_NUM, fontSize: 32, color }}>{value}</div>
                <div style={{ fontSize: 8, color: "var(--muted)", marginTop: 4,
                  fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.08em" }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Players performance bars */}
          {topPlayers.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
              <div style={{ fontSize: 9, color: "var(--muted)", fontFamily: "'Bebas Neue', sans-serif",
                letterSpacing: "0.08em" }}>CONTRIBUTION DES TOPS</div>
              {topPlayers.map((p) => {
                const maxScore = compositeScore(topPlayers[0]);
                const pct = maxScore > 0 ? Math.round((compositeScore(p) / maxScore) * 100) : 0;
                return (
                  <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 10, color: "var(--text)", minWidth: 100, flexShrink: 0,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                    <div style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
                      <div style={{
                        height: "100%", borderRadius: 3, background: "var(--accent)",
                        width: `${pct}%`, opacity: 0.8, transition: "width 0.6s ease",
                      }} />
                    </div>
                    <span style={{ fontSize: 9, color: "var(--muted)", minWidth: 30, textAlign: "right" }}>{pct}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ═══ TILE G — Répartition résultats ═══ */}
        <div style={TILE}>
          <div style={TILE_LABEL}><Swords size={11} /> RÉPARTITION</div>
          {stats.total > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { label: "Victoires", value: currentClub.wins, color: "var(--green)" },
                { label: "Nuls",      value: currentClub.ties, color: "#eab308" },
                { label: "Défaites",  value: currentClub.losses, color: "var(--red)" },
              ].map(({ label, value, color }) => {
                const pct = stats.total > 0 ? Math.round((value / stats.total) * 100) : 0;
                return (
                  <div key={label}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: 10, color: "var(--muted)" }}>{label}</span>
                      <span style={{ fontSize: 10, color, fontWeight: 700 }}>{value} · {pct}%</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 3, background: color, width: `${pct}%`,
                        transition: "width 0.6s ease" }} />
                    </div>
                  </div>
                );
              })}

              {/* Donut simplifié en SVG */}
              <div style={{ display: "flex", justifyContent: "center", marginTop: 6 }}>
                <svg width={90} height={90} viewBox="0 0 36 36" style={{ transform: "rotate(-90deg)" }}>
                  {(() => {
                    const total = stats.total;
                    const segments = [
                      { value: currentClub.wins,   color: "var(--green)" },
                      { value: currentClub.ties,   color: "#eab308" },
                      { value: currentClub.losses, color: "var(--red)" },
                    ];
                    let offset = 0;
                    const r = 15.9155;
                    const circ = 2 * Math.PI * r;
                    return segments.map(({ value, color }, i) => {
                      const pct2 = total > 0 ? value / total : 0;
                      const dash = pct2 * circ;
                      const gap = circ - dash;
                      const el = (
                        <circle key={i} cx="18" cy="18" r={r}
                          fill="none" stroke={color} strokeWidth="4"
                          strokeDasharray={`${dash} ${gap}`}
                          strokeDashoffset={-offset}
                          style={{ transition: "stroke-dasharray 0.6s ease" }}
                        />
                      );
                      offset += dash;
                      return el;
                    });
                  })()}
                </svg>
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--muted)", fontSize: 11 }}>
              Pas de données
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
