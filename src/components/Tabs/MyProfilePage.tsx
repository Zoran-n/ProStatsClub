import { useMemo } from "react";
import { Trophy, Target, Star, TrendingUp, Shield, Swords, FileText } from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useAppStore } from "../../store/useAppStore";
import { logger } from "../../utils/logger";
import type { Match } from "../../types";
import { PublicProfileSection } from "../profile/PublicProfileSection";

function getDivision(sr: number): { div: string; color: string } {
  if (sr >= 3000) return { div: "Elite",  color: "#f59e0b" };
  if (sr >= 2700) return { div: "Div 1",  color: "#f59e0b" };
  if (sr >= 2400) return { div: "Div 2",  color: "#f59e0b" };
  if (sr >= 2100) return { div: "Div 3",  color: "#a855f7" };
  if (sr >= 1800) return { div: "Div 4",  color: "#a855f7" };
  if (sr >= 1500) return { div: "Div 5",  color: "#3b82f6" };
  if (sr >= 1300) return { div: "Div 6",  color: "#3b82f6" };
  if (sr >= 1100) return { div: "Div 7",  color: "#22c55e" };
  if (sr >= 900)  return { div: "Div 8",  color: "#22c55e" };
  if (sr >= 700)  return { div: "Div 9",  color: "#6b7280" };
  return              { div: "Div 10", color: "#6b7280" };
}

const kpiCardStyle: React.CSSProperties = {
  background: "var(--hover)", borderRadius: 8, padding: "14px 10px",
  textAlign: "center", border: "1px solid var(--border)",
};

const sectionStyle: React.CSSProperties = {
  background: "var(--surface)", borderRadius: 10, padding: "16px",
  border: "1px solid var(--border)", marginBottom: 16,
};

interface PerMatchStat {
  matchId: string;
  date: string;
  goals: number;
  assists: number;
  rating: number;
  motm: boolean;
  result: "W" | "D" | "L";
  position: string;
}

export function MyProfilePage() {
  const { eaProfile, currentClub, players, sessions, matches, matchCache } = useAppStore();

  // ── Season stats from the API (the real totals) ────────────────────
  const seasonPlayer = useMemo(() => {
    if (!eaProfile?.gamertag) return null;
    return players.find(p => p.name.toLowerCase() === eaProfile.gamertag.toLowerCase()) ?? null;
  }, [eaProfile, players]);

  // ── Collect ALL matches where this player appears ──────────────────
  const allPlayerMatches = useMemo(() => {
    if (!eaProfile?.gamertag || !eaProfile?.clubId) return [];
    const gt = eaProfile.gamertag.toLowerCase();
    const cid = eaProfile.clubId;
    const seen = new Set<string>();
    const result: PerMatchStat[] = [];

    const processMatch = (m: Match) => {
      if (seen.has(m.matchId)) return;
      const clubPlayers = m.players?.[cid] as Record<string, Record<string, unknown>> | undefined;
      if (!clubPlayers) return;
      const entry = Object.entries(clubPlayers).find(([, v]) => {
        const name = String(v["name"] ?? v["playername"] ?? v["playerName"] ?? "").toLowerCase();
        return name === gt;
      });
      if (!entry) return;
      seen.add(m.matchId);

      const p = entry[1];
      const myClub = m.clubs?.[cid] as Record<string, unknown> | undefined;
      // Result via wins/losses flags (same method as MatchModal)
      const res = myClub?.["wins"] === "1" ? "W" : myClub?.["losses"] === "1" ? "L" : "D";

      result.push({
        matchId: m.matchId,
        date: m.timestamp,
        goals: Number(p["goals"] ?? 0),
        assists: Number(p["assists"] ?? 0),
        rating: Number(p["rating"] ?? p["ratingAve"] ?? 0),
        motm: p["mom"] === "1" || p["manofthematch"] === "1",
        result: res,
        position: String(p["vproPos"] ?? p["favoritePosition"] ?? ""),
      });
    };

    // From sessions
    for (const s of sessions) {
      if (s.clubId === cid) s.matches.forEach(processMatch);
    }
    // From current matches
    matches.forEach(processMatch);
    // From match cache
    for (const key of Object.keys(matchCache)) {
      if (key.startsWith(`${cid}_`)) {
        matchCache[key]?.forEach(processMatch);
      }
    }

    // Sort by date newest first
    result.sort((a, b) => {
      const ta = Number(a.date) || new Date(a.date).getTime();
      const tb = Number(b.date) || new Date(b.date).getTime();
      return tb - ta;
    });

    return result;
  }, [eaProfile, sessions, matches, matchCache]);

  // ── Aggregated stats (season from API when available) ───────────────
  const matchWins = allPlayerMatches.filter((m: PerMatchStat) => m.result === "W").length;
  const matchDraws = allPlayerMatches.filter((m: PerMatchStat) => m.result === "D").length;
  const matchLosses = allPlayerMatches.filter((m: PerMatchStat) => m.result === "L").length;

  const agg = useMemo(() => {
    // Prefer season stats from the API (real totals)
    if (seasonPlayer) {
      const sp = seasonPlayer;
      const clubW = currentClub?.wins ?? matchWins;
      const clubD = currentClub?.ties ?? matchDraws;
      const clubL = currentClub?.losses ?? matchLosses;
      const clubTotal = clubW + clubD + clubL;
      const winRate = clubTotal > 0 ? Math.round((clubW / clubTotal) * 100) : 0;
      return {
        games: sp.gamesPlayed, totalGoals: sp.goals, totalAssists: sp.assists,
        totalMotm: sp.motm, avgRating: sp.rating,
        wins: clubW, draws: clubD, losses: clubL, winRate,
        passesMade: sp.passesMade, tacklesMade: sp.tacklesMade,
        source: "season" as const,
      };
    }
    // Fallback to match-by-match analysis
    const ms = allPlayerMatches;
    if (!ms.length) return null;
    const rated = ms.filter((m: PerMatchStat) => m.rating > 0);
    const avgRating = rated.length > 0 ? rated.reduce((s: number, m: PerMatchStat) => s + m.rating, 0) / rated.length : 0;
    return {
      games: ms.length,
      totalGoals: ms.reduce((s: number, m: PerMatchStat) => s + m.goals, 0),
      totalAssists: ms.reduce((s: number, m: PerMatchStat) => s + m.assists, 0),
      totalMotm: ms.filter((m: PerMatchStat) => m.motm).length,
      avgRating,
      wins: matchWins, draws: matchDraws, losses: matchLosses,
      winRate: ms.length > 0 ? Math.round((matchWins / ms.length) * 100) : 0,
      passesMade: 0, tacklesMade: 0,
      source: "matches" as const,
    };
  }, [seasonPlayer, currentClub, allPlayerMatches, matchWins, matchDraws, matchLosses]);

  // ── Rating evolution (last 40 matches, oldest first) ───────────────
  const ratingData = useMemo(() => {
    return allPlayerMatches
      .slice(0, 40)
      .reverse()
      .filter((m: PerMatchStat) => m.rating > 0)
      .map((m: PerMatchStat, i: number) => ({ idx: i + 1, rating: Number(m.rating.toFixed(2)), result: m.result }));
  }, [allPlayerMatches]);

  // ── Goals + Assists per batch of 5 matches ─────────────────────────
  const batchData = useMemo(() => {
    const reversed = [...allPlayerMatches].reverse();
    const batches: { label: string; goals: number; assists: number }[] = [];
    for (let i = 0; i < Math.min(reversed.length, 50); i += 5) {
      const chunk = reversed.slice(i, i + 5);
      batches.push({
        label: `${i + 1}-${i + chunk.length}`,
        goals: chunk.reduce((s, m) => s + m.goals, 0),
        assists: chunk.reduce((s, m) => s + m.assists, 0),
      });
    }
    return batches;
  }, [allPlayerMatches]);

  // ── Position breakdown ─────────────────────────────────────────────
  const positionStats = useMemo(() => {
    const map: Record<string, { count: number; goals: number; assists: number; ratingSum: number; ratingCount: number }> = {};
    for (const m of allPlayerMatches) {
      const pos = m.position || "Inconnu";
      if (!map[pos]) map[pos] = { count: 0, goals: 0, assists: 0, ratingSum: 0, ratingCount: 0 };
      map[pos].count++;
      map[pos].goals += m.goals;
      map[pos].assists += m.assists;
      if (m.rating > 0) { map[pos].ratingSum += m.rating; map[pos].ratingCount++; }
    }
    return Object.entries(map)
      .map(([pos, d]) => ({
        pos, count: d.count, goals: d.goals, assists: d.assists,
        avgRating: d.ratingCount > 0 ? (d.ratingSum / d.ratingCount).toFixed(2) : "—",
      }))
      .sort((a, b) => b.count - a.count);
  }, [allPlayerMatches]);

  // ── SR / Division ──────────────────────────────────────────────────
  const srNum = currentClub?.id === eaProfile?.clubId && currentClub?.skillRating
    ? Number(currentClub.skillRating) || null : null;
  const division = srNum ? getDivision(srNum) : null;

  if (!eaProfile?.clubId) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: 14 }}>
        Lie un profil EA pour voir tes statistiques personnelles.
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 24 }}>
          <div style={{
            width: 72, height: 72, borderRadius: "50%",
            background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center",
            border: "3px solid var(--border)", flexShrink: 0,
          }}>
            <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 34, color: "#fff" }}>
              {eaProfile.gamertag[0].toUpperCase()}
            </span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: "var(--text)", letterSpacing: "0.04em" }}>
              {eaProfile.gamertag}
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>
              {eaProfile.clubName} · {eaProfile.platform}
              {agg && (
                <span style={{ marginLeft: 8, color: "var(--accent)" }}>
                  {agg.games} matchs
                  {agg.source === "season" && allPlayerMatches.length > 0 && (
                    <span style={{ color: "var(--muted)", marginLeft: 6, fontSize: 11 }}>
                      ({allPlayerMatches.length} analysés)
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>
          {division && (
            <div style={{
              padding: "8px 16px", borderRadius: 8, background: division.color + "22",
              border: `1px solid ${division.color}44`, textAlign: "center",
            }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: division.color }}>
                {division.div}
              </div>
              {srNum && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{srNum} SR</div>}
            </div>
          )}
        </div>

        {/* ── KPI Cards ── */}
        {agg && (() => {
          const kpis = [
            { label: "MATCHS", value: agg.games, color: "var(--accent)", icon: <Swords size={14} /> },
            { label: "BUTS", value: agg.totalGoals, color: "var(--green)", icon: <Target size={14} /> },
            { label: "PASSES D.", value: agg.totalAssists, color: "var(--accent)", icon: <TrendingUp size={14} /> },
            { label: "MOTM", value: agg.totalMotm, color: "var(--gold)", icon: <Trophy size={14} /> },
            { label: "NOTE MOY.", value: agg.avgRating > 0 ? agg.avgRating.toFixed(2) : "—", color: "var(--text)", icon: <Star size={14} /> },
            { label: "% VICTOIRES", value: `${agg.winRate}%`, color: agg.winRate >= 50 ? "var(--green)" : "var(--red)", icon: <Shield size={14} /> },
          ];
          if (agg.source === "season" && agg.passesMade > 0) {
            kpis.push({ label: "PASSES", value: agg.passesMade, color: "var(--text)", icon: <TrendingUp size={14} /> });
          }
          if (agg.source === "season" && agg.tacklesMade > 0) {
            kpis.push({ label: "TACLES", value: agg.tacklesMade, color: "var(--text)", icon: <Shield size={14} /> });
          }
          const cols = kpis.length <= 6 ? 6 : kpis.length <= 8 ? 4 : 6;
          return (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 10, marginBottom: 20 }}>
            {kpis.map(({ label, value, color, icon }) => (
              <div key={label} style={kpiCardStyle}>
                <div style={{ color: "var(--muted)", marginBottom: 6, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                  {icon}
                </div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color, lineHeight: 1 }}>
                  {value}
                </div>
                <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 6, letterSpacing: "0.06em" }}>
                  {label}
                </div>
              </div>
            ))}
          </div>
          );
        })()}

        {/* ── Win/Draw/Loss bar ── */}
        {agg && agg.games > 0 && (
          <div style={{ ...sectionStyle, padding: "12px 16px" }}>
            <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", gap: 2 }}>
              <div style={{ width: `${(agg.wins / agg.games) * 100}%`, background: "var(--green)", borderRadius: 4 }} />
              <div style={{ width: `${(agg.draws / agg.games) * 100}%`, background: "var(--gold)", borderRadius: 4 }} />
              <div style={{ width: `${(agg.losses / agg.games) * 100}%`, background: "var(--red)", borderRadius: 4 }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 11 }}>
              <span style={{ color: "var(--green)" }}>{agg.wins}V</span>
              <span style={{ color: "var(--gold)" }}>{agg.draws}N</span>
              <span style={{ color: "var(--red)" }}>{agg.losses}D</span>
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          {/* ── Rating evolution chart ── */}
          {ratingData.length >= 3 && (
            <div style={sectionStyle}>
              <div style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.1em",
                fontFamily: "'Bebas Neue', sans-serif", marginBottom: 12 }}>
                ÉVOLUTION DE LA NOTE · {ratingData.length} derniers matchs
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={ratingData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="idx" tick={{ fontSize: 10, fill: "var(--muted)" }} />
                  <YAxis domain={[5, 10]} tick={{ fontSize: 10, fill: "var(--muted)" }} />
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 11 }} />
                  <Line type="monotone" dataKey="rating" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3, fill: "var(--accent)" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── Goals + Assists per 5 matches ── */}
          {batchData.length >= 2 && (
            <div style={sectionStyle}>
              <div style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.1em",
                fontFamily: "'Bebas Neue', sans-serif", marginBottom: 12 }}>
                BUTS & PASSES D. PAR TRANCHE DE 5 MATCHS
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={batchData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: "var(--muted)" }} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--muted)" }} />
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 11 }} />
                  <Bar dataKey="goals" fill="var(--green)" name="Buts" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="assists" fill="var(--accent)" name="Passes D." radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* ── Position breakdown ── */}
        {positionStats.length > 0 && positionStats[0].pos !== "Inconnu" && (
          <div style={sectionStyle}>
            <div style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.1em",
              fontFamily: "'Bebas Neue', sans-serif", marginBottom: 12 }}>
              RÉPARTITION PAR POSTE
            </div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(positionStats.length, 5)}, 1fr)`, gap: 8 }}>
              {positionStats.slice(0, 5).map(({ pos, count, goals, assists, avgRating }: { pos: string; count: number; goals: number; assists: number; avgRating: string }) => (
                <div key={pos} style={{
                  background: "var(--hover)", borderRadius: 6, padding: "10px",
                  border: "1px solid var(--border)", textAlign: "center",
                }}>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: "var(--accent)" }}>
                    {pos}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>{count} matchs</div>
                  <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 6, fontSize: 11 }}>
                    <span style={{ color: "var(--green)" }}>{goals}B</span>
                    <span style={{ color: "var(--accent)" }}>{assists}PD</span>
                  </div>
                  <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>Moy. {avgRating}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Recent performances table ── */}
        {allPlayerMatches.length > 0 && (
          <div style={sectionStyle}>
            <div style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.1em",
              fontFamily: "'Bebas Neue', sans-serif", marginBottom: 12 }}>
              DERNIÈRES PERFORMANCES · {Math.min(allPlayerMatches.length, 25)} matchs
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    {["Date", "Résultat", "Buts", "PD", "Note", "MOTM", "Poste"].map(h => (
                      <th key={h} style={{
                        padding: "6px 8px", textAlign: "center", fontSize: 10,
                        color: "var(--muted)", fontFamily: "'Bebas Neue', sans-serif",
                        letterSpacing: "0.06em", fontWeight: 400,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allPlayerMatches.slice(0, 25).map((m: PerMatchStat) => {
                    const ts = Number(m.date) ? new Date(Number(m.date) * 1000) : new Date(m.date);
                    const dateStr = ts.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
                    const resColor = m.result === "W" ? "var(--green)" : m.result === "L" ? "var(--red)" : "var(--gold)";
                    const resLabel = m.result === "W" ? "V" : m.result === "L" ? "D" : "N";
                    return (
                      <tr key={m.matchId} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "6px 8px", textAlign: "center", color: "var(--muted)", fontSize: 11 }}>{dateStr}</td>
                        <td style={{ padding: "6px 8px", textAlign: "center" }}>
                          <span style={{
                            display: "inline-block", width: 22, height: 22, lineHeight: "22px",
                            borderRadius: 4, background: resColor + "22", color: resColor,
                            fontWeight: 700, fontSize: 11, textAlign: "center",
                          }}>{resLabel}</span>
                        </td>
                        <td style={{ padding: "6px 8px", textAlign: "center", color: m.goals > 0 ? "var(--green)" : "var(--muted)", fontWeight: m.goals > 0 ? 700 : 400 }}>
                          {m.goals}
                        </td>
                        <td style={{ padding: "6px 8px", textAlign: "center", color: m.assists > 0 ? "var(--accent)" : "var(--muted)", fontWeight: m.assists > 0 ? 700 : 400 }}>
                          {m.assists}
                        </td>
                        <td style={{ padding: "6px 8px", textAlign: "center", color: m.rating >= 7.5 ? "var(--green)" : m.rating >= 6.5 ? "var(--text)" : m.rating > 0 ? "var(--red)" : "var(--muted)" }}>
                          {m.rating > 0 ? m.rating.toFixed(1) : "—"}
                        </td>
                        <td style={{ padding: "6px 8px", textAlign: "center" }}>
                          {m.motm && <Trophy size={13} color="var(--gold)" />}
                        </td>
                        <td style={{ padding: "6px 8px", textAlign: "center", color: "var(--muted)", fontSize: 11 }}>
                          {m.position || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty state */}
        {allPlayerMatches.length === 0 && (
          <div style={{ ...sectionStyle, textAlign: "center", padding: "40px 20px", color: "var(--muted)" }}>
            <Swords size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
            <div style={{ fontSize: 14 }}>Aucune donnée de match trouvée pour <strong style={{ color: "var(--accent)" }}>{eaProfile.gamertag}</strong></div>
            <div style={{ fontSize: 12, marginTop: 6 }}>Charge ton club via le bouton "Charger mon club" dans les paramètres du profil pour remplir le cache de matchs.</div>
          </div>
        )}

        {/* ── Public Player Card ── */}
        <div style={{ ...sectionStyle, padding: 0, overflow: "hidden", marginBottom: 16 }}>
          <div style={{ padding: 20, borderBottom: "1px solid var(--border)", background: "rgba(0,0,0,0.2)" }}>
            <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, margin: 0, color: "var(--text)" }}>
              CARTE JOUEUR PUBLIQUE <span style={{ fontSize: 12, verticalAlign: "middle", background: "var(--accent)", color: "#fff", padding: "2px 6px", borderRadius: 4, marginLeft: 8 }}>NOUVEAU</span>
            </h2>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
              Configurez, prévisualisez et exportez votre carte de joueur personnalisée pour Discord.
            </div>
          </div>
          <div style={{ padding: "0 20px 20px 20px" }}>
            <PublicProfileSection />
          </div>
        </div>

        {/* ── Logging Section ── */}
        <div style={{ ...sectionStyle, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.1em",
              fontFamily: "'Bebas Neue', sans-serif", marginBottom: 4 }}>
              LOGS SYSTÈME
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              Télécharge les logs de diagnostic pour le support technique.
            </div>
          </div>
          <button onClick={() => logger.downloadLogs()}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px",
              background: "rgba(0,212,255,0.1)", border: "1px solid var(--accent)",
              borderRadius: 6, color: "var(--accent)", fontSize: 12, cursor: "pointer",
              fontFamily: "'Bebas Neue', sans-serif" }}>
            <FileText size={14} /> EXPORTER LES LOGS
          </button>
        </div>
      </div>
    </div>
  );
}
