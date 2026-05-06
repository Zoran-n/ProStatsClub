import { useState, useMemo, useRef, useEffect, Fragment } from "react";
import { Download } from "lucide-react";
import {
  PieChart, Pie, Cell, Label, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis,
} from "recharts";
import { useAppStore } from "../../store/useAppStore";
import { ExportModal } from "../Modals/ExportModal";
import { getSeasonHistory, getLeaderboard } from "../../api/tauri";
import { useT } from "../../i18n";
import type { Match, Player } from "../../types";

function aggregateMatchPlayers(matches: Match[], clubId: string): Player[] {
  const acc: Record<string, { goals: number; assists: number; passesMade: number }> = {};
  for (const m of matches) {
    const clubPlayers = m.players[clubId] as Record<string, Record<string, string>> | undefined;
    if (!clubPlayers || typeof clubPlayers !== "object") continue;
    for (const [_id, s] of Object.entries(clubPlayers)) {
      const name = s.name || s.playername || s.playerName || _id;
      if (!acc[name]) acc[name] = { goals: 0, assists: 0, passesMade: 0 };
      acc[name].goals      += Number(s.goals)      || 0;
      acc[name].assists    += Number(s.assists)     || 0;
      acc[name].passesMade += Number(s.passesMade) || Number(s.passesmade) || 0;
    }
  }
  return Object.entries(acc).map(([name, s]) => ({
    name, goals: s.goals, assists: s.assists, passesMade: s.passesMade,
    position: "", tacklesMade: 0, motm: 0, rating: 0, gamesPlayed: 0,
  }));
}

type Mode = "last10" | "alltime";

const BTN: React.CSSProperties = {
  padding: "6px 10px", background: "var(--card)", border: "1px solid var(--border)",
  borderRadius: 6, cursor: "pointer", color: "var(--muted)", fontSize: 11,
  display: "flex", alignItems: "center", gap: 0,
};

function ChartCard({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ background: "var(--card)", borderRadius: 8, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <p style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.12em",
          fontFamily: "'Bebas Neue', sans-serif", margin: 0 }}>{title}</p>
        {action}
      </div>
      {children}
    </div>
  );
}

function NoData({ text = "Aucune donnée" }: { text?: string }) {
  return <p style={{ fontSize: 12, color: "var(--muted)", textAlign: "center", padding: "16px 0" }}>{text}</p>;
}

function DonutCenter({ viewBox, value, sub }: { viewBox?: { cx: number; cy: number }; value: number | string; sub: string }) {
  const cx = viewBox?.cx ?? 0, cy = viewBox?.cy ?? 0;
  return (
    <g>
      <text x={cx} y={cy - 4} textAnchor="middle" fill="#fff" fontFamily="'Bebas Neue', sans-serif" fontSize={30} dominantBaseline="auto">{value}</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fill="#64748b" fontSize={10} dominantBaseline="auto">{sub}</text>
    </g>
  );
}

function DonutChart({ data, centerValue, centerSub }: {
  data: { name: string; value: number; color: string }[];
  centerValue: number | string; centerSub: string;
}) {
  const safe = data.every(d => d.value === 0) ? data.map(d => ({ ...d, value: 1 })) : data;
  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart>
        <Pie data={safe} cx="50%" cy="50%" innerRadius={52} outerRadius={78}
          dataKey="value" startAngle={90} endAngle={-270} strokeWidth={2} stroke="var(--card)">
          {safe.map((d, i) => <Cell key={i} fill={d.color} />)}
          <Label content={(props: unknown) => {
            const p = props as { viewBox?: { cx: number; cy: number } };
            return <DonutCenter viewBox={p.viewBox} value={centerValue} sub={centerSub} />;
          }} />
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}

function WdlLegend({ data, total }: { data: { name: string; value: number; color: string }[]; total: number }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 18, marginTop: 4 }}>
      {data.map((d) => {
        const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
        return (
          <div key={d.name} style={{ textAlign: "center" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: d.color, display: "inline-block" }} />
              <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, color: "#fff" }}>{d.value}</span>
            </div>
            <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.06em" }}>{d.name}</div>
            <div style={{ fontSize: 9, color: d.color }}>({pct}%)</div>
          </div>
        );
      })}
    </div>
  );
}

const GRADIENTS: Record<string, string> = {
  cyan: "linear-gradient(90deg, #0098b8, #00d4ff)",
  orange: "linear-gradient(90deg, #c2410c, #f97316)",
  purple: "linear-gradient(90deg, #6d28d9, #a855f7)",
};
const VALUE_COLORS: Record<string, string> = {
  cyan: "#00d4ff", orange: "#f97316", purple: "#a855f7",
};

function HBarChart({ players, valueKey, color }: {
  players: Player[]; valueKey: keyof Player; color: "cyan" | "orange" | "purple";
}) {
  const maxVal = Math.max(...players.map((p) => Number(p[valueKey]) || 0), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {players.map((p) => {
        const val = Number(p[valueKey]) || 0;
        return (
          <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 82, textAlign: "right", fontSize: 11, color: "var(--muted)",
              flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
            <div style={{ flex: 1, background: "var(--bg)", borderRadius: 3, height: 30, overflow: "hidden" }}>
              <div style={{ width: `${(val / maxVal) * 100}%`, height: "100%",
                background: GRADIENTS[color], borderRadius: "0 3px 3px 0", transition: "width 0.5s ease" }} />
            </div>
            <div style={{ width: 32, fontSize: 13, fontWeight: 700, color: VALUE_COLORS[color], flexShrink: 0, textAlign: "right" }}>{val}</div>
          </div>
        );
      })}
    </div>
  );
}

interface SeasonRow { wins: number; losses: number; ties: number; goals: number; goalDiff: number; label: string; sr?: number }
interface LeaderRow { rank: number; name: string; wins: number; losses: number; ties: number; goals: number; sr: string }

function parseSeasonHistory(raw: unknown, clubId: string): SeasonRow[] {
  if (!raw || typeof raw !== "object") return [];
  const obj = raw as Record<string, unknown>;
  const seasons: unknown[] = (
    (obj[clubId] as Record<string, unknown>)?.["history"] as unknown[]
    ?? obj["history"] as unknown[]
    ?? (Array.isArray(raw) ? raw : [])
  );
  return seasons.map((s) => {
    const v = s as Record<string, string | number>;
    const w = Number(v["wins"] ?? 0), l = Number(v["losses"] ?? 0), t = Number(v["ties"] ?? 0);
    const g = Number(v["goals"] ?? 0), ga = Number(v["goalsAgainst"] ?? 0);
    const sid = String(v["seasonId"] ?? v["season"] ?? "");
    const sr = Number(v["skillRating"] ?? v["skill_rating"] ?? 0) || undefined;
    return { wins: w, losses: l, ties: t, goals: g, goalDiff: g - ga, label: sid ? `S${sid}` : "?", sr };
  }).filter((s) => s.wins + s.losses + s.ties > 0).slice(-10);
}

function parseLeaderboard(raw: unknown, myClubId: string): LeaderRow[] {
  if (!raw || typeof raw !== "object") return [];
  const arr: unknown[] = Array.isArray(raw) ? raw
    : (raw as Record<string, unknown[]>)["clubs"] ?? (raw as Record<string, unknown[]>)["data"] ?? [];
  return arr.slice(0, 20).map((entry, i) => {
    const v = entry as Record<string, string | number>;
    const cid = String(v["clubId"] ?? v["id"] ?? "");
    return {
      rank: i + 1, name: String(v["name"] ?? v["clubName"] ?? `Club #${cid}`),
      wins: Number(v["wins"] ?? 0), losses: Number(v["losses"] ?? 0), ties: Number(v["ties"] ?? 0),
      goals: Number(v["goals"] ?? 0), sr: String(v["skillRating"] ?? "—"),
    };
  }).filter((r) => r.wins + r.losses + r.ties > 0 || r.name !== `Club #`);
  void myClubId;
}

// ─── Season History ────────────────────────────────────────────────────────────
function SeasonHistorySection({ clubId, platform }: { clubId: string; platform: string }) {
  const t = useT();
  const [seasons, setSeasons] = useState<SeasonRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    setSeasons([]); setTried(false);
  }, [clubId]);

  const load = () => {
    if (tried) return;
    setLoading(true); setTried(true);
    getSeasonHistory(clubId, platform)
      .then((raw) => setSeasons(parseSeasonHistory(raw, clubId)))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const maxW = Math.max(...seasons.map((s) => s.wins), 1);

  return (
    <div style={{ background: "var(--card)", borderRadius: 8, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <p style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.12em", fontFamily: "'Bebas Neue', sans-serif" }}>
          {t("charts.seasonHistory")}
        </p>
        {!tried && (
          <button onClick={load} style={{
            fontSize: 10, padding: "4px 10px", borderRadius: 4, cursor: "pointer",
            background: "none", border: "1px solid var(--accent)", color: "var(--accent)",
            fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.08em",
          }}>
            {t("charts.load")}
          </button>
        )}
      </div>
      {loading && <p style={{ fontSize: 12, color: "var(--muted)", textAlign: "center" }}>{t("misc.loading")}</p>}
      {tried && !loading && seasons.length === 0 && (
        <p style={{ fontSize: 12, color: "var(--muted)", textAlign: "center" }}>{t("charts.noDataClub")}</p>
      )}
      {seasons.length > 0 && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {seasons.map((s) => {
              const total = s.wins + s.losses + s.ties;
              const pct = total > 0 ? Math.round((s.wins / total) * 100) : 0;
              return (
                <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 28, fontSize: 9, color: "var(--muted)", flexShrink: 0, fontFamily: "'Bebas Neue', sans-serif" }}>{s.label}</div>
                  <div style={{ flex: 1, background: "var(--bg)", borderRadius: 3, height: 24, overflow: "hidden" }}>
                    <div style={{ width: `${(s.wins / maxW) * 100}%`, height: "100%",
                      background: "linear-gradient(90deg,#16a34a,#22c55e)", borderRadius: "0 3px 3px 0", minWidth: 4 }} />
                  </div>
                  <div style={{ display: "flex", gap: 8, fontSize: 10, flexShrink: 0 }}>
                    <span style={{ color: "#22c55e" }}>{s.wins}V</span>
                    <span style={{ color: "#eab308" }}>{s.ties}N</span>
                    <span style={{ color: "var(--red)" }}>{s.losses}D</span>
                    <span style={{ color: "var(--muted)" }}>{pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Stacked bar chart N vs N-1 */}
          {seasons.length >= 2 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.12em",
                fontFamily: "'Bebas Neue', sans-serif", marginBottom: 6 }}>
                V / N / D PAR SAISON
              </div>
              <ResponsiveContainer width="100%" height={80}>
                <BarChart data={seasons} margin={{ top: 0, right: 4, left: -28, bottom: 0 }} barSize={14}>
                  <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 8 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "var(--muted)", fontSize: 8 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 10 }}
                    formatter={(v: number | string, name: string) => [v, name === "wins" ? "V" : name === "ties" ? "N" : "D"]}
                  />
                  <Bar dataKey="wins" stackId="a" fill="#22c55e" name="V" />
                  <Bar dataKey="ties" stackId="a" fill="#eab308" name="N" />
                  <Bar dataKey="losses" stackId="a" fill="#ef4444" name="D" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Season comparison N vs N-1 */}
          {seasons.length >= 2 && (() => {
            const cur  = seasons[seasons.length - 1];
            const prev = seasons[seasons.length - 2];
            const curT  = cur.wins  + cur.losses  + cur.ties;
            const prevT = prev.wins + prev.losses + prev.ties;
            const curWr  = curT  > 0 ? Math.round(cur.wins  / curT  * 100) : 0;
            const prevWr = prevT > 0 ? Math.round(prev.wins / prevT * 100) : 0;
            const rows: { label: string; c: number; p: number; color: string; fmt?: (v: number) => string }[] = [
              { label: t("main.wins"),   c: cur.wins,   p: prev.wins,   color: "#22c55e" },
              { label: t("main.draws"),  c: cur.ties,   p: prev.ties,   color: "#eab308" },
              { label: t("main.losses"), c: cur.losses, p: prev.losses, color: "var(--red)" },
              { label: t("main.goals"),  c: cur.goals,  p: prev.goals,  color: "var(--accent)" },
              { label: t("main.winRate"), c: curWr, p: prevWr, color: "var(--text)", fmt: (v) => `${v}%` },
            ];
            return (
              <div style={{ marginTop: 14, padding: "10px 12px", background: "var(--bg)", borderRadius: 8, border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.12em", fontFamily: "'Bebas Neue', sans-serif", marginBottom: 8 }}>
                  {t("charts.seasonCompare")}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 60px 1fr", gap: "3px 8px" }}>
                  <div style={{ textAlign: "right", fontSize: 10, color: "var(--accent)", fontFamily: "'Bebas Neue', sans-serif" }}>{cur.label}</div>
                  <div />
                  <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "'Bebas Neue', sans-serif" }}>{prev.label}</div>
                  {rows.map(({ label, c, p, color, fmt }) => {
                    const f = fmt ?? String;
                    return (
                      <Fragment key={label}>
                        <div style={{ textAlign: "right", fontSize: 14, fontFamily: "'Bebas Neue', sans-serif", color: c >= p ? color : "var(--muted)" }}>{f(c)}</div>
                        <div style={{ textAlign: "center", fontSize: 9, color: "var(--muted)", fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.06em", alignSelf: "center" }}>{label}</div>
                        <div style={{ fontSize: 14, fontFamily: "'Bebas Neue', sans-serif", color: p > c ? color : "var(--muted)" }}>{f(p)}</div>
                      </Fragment>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}

// ─── SR Evolution ──────────────────────────────────────────────────────────────
function SrEvolutionSection({ clubId, platform }: { clubId: string; platform: string }) {
  const t = useT();
  const [seasons, setSeasons] = useState<SeasonRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [tried, setTried] = useState(false);

  useEffect(() => { setSeasons([]); setTried(false); }, [clubId]);

  const load = () => {
    if (tried) return;
    setLoading(true); setTried(true);
    getSeasonHistory(clubId, platform)
      .then((raw) => setSeasons(parseSeasonHistory(raw, clubId)))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const srData = seasons.filter((s) => s.sr && s.sr > 0).map((s) => ({ label: s.label, sr: s.sr! }));

  return (
    <div style={{ background: "var(--card)", borderRadius: 8, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <p style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.12em", fontFamily: "'Bebas Neue', sans-serif" }}>
          ÉVOLUTION DU SKILL RATING
        </p>
        {!tried && (
          <button onClick={load} style={{
            fontSize: 10, padding: "4px 10px", borderRadius: 4, cursor: "pointer",
            background: "none", border: "1px solid var(--accent)", color: "var(--accent)",
            fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.08em",
          }}>
            {t("charts.load")}
          </button>
        )}
      </div>
      {loading && <p style={{ fontSize: 12, color: "var(--muted)", textAlign: "center" }}>{t("misc.loading")}</p>}
      {tried && !loading && srData.length === 0 && (
        <p style={{ fontSize: 12, color: "var(--muted)", textAlign: "center" }}>SR non disponible pour ce club</p>
      )}
      {srData.length > 0 && (
        <>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={srData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 9 }} />
              <YAxis tick={{ fill: "var(--muted)", fontSize: 9 }} domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 11 }}
                labelStyle={{ color: "var(--muted)" }}
                itemStyle={{ color: "var(--accent)" }}
                formatter={(v: number | string) => [v, "SR"]}
              />
              <Line type="monotone" dataKey="sr" stroke="var(--accent)" strokeWidth={2}
                dot={{ fill: "var(--accent)", r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", justifyContent: "space-around", marginTop: 8 }}>
            {[
              { label: "MIN", value: Math.min(...srData.map((s) => s.sr)), color: "var(--red)" },
              { label: "MAX", value: Math.max(...srData.map((s) => s.sr)), color: "var(--green)" },
              { label: "ACTUEL", value: srData[srData.length - 1].sr, color: "var(--accent)" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color, lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.08em", marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Leaderboard ───────────────────────────────────────────────────────────────
function LeaderboardSection({ clubId, platform }: { clubId: string; platform: string }) {
  const t = useT();
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [tried, setTried] = useState(false);

  useEffect(() => { setRows([]); setTried(false); }, [clubId]);

  const load = () => {
    if (tried) return;
    setLoading(true); setTried(true);
    getLeaderboard(platform, 25)
      .then((raw) => setRows(parseLeaderboard(raw, clubId)))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  return (
    <div style={{ background: "var(--card)", borderRadius: 8, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <p style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.12em", fontFamily: "'Bebas Neue', sans-serif" }}>
          {t("charts.leaderboardTitle") + " — " + platform.toUpperCase()}
        </p>
        {!tried && (
          <button onClick={load} style={{
            fontSize: 10, padding: "4px 10px", borderRadius: 4, cursor: "pointer",
            background: "none", border: "1px solid var(--accent)", color: "var(--accent)",
            fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.08em",
          }}>
            {t("charts.load")}
          </button>
        )}
      </div>
      {loading && <p style={{ fontSize: 12, color: "var(--muted)", textAlign: "center" }}>{t("misc.loading")}</p>}
      {tried && !loading && rows.length === 0 && (
        <p style={{ fontSize: 12, color: "var(--muted)", textAlign: "center" }}>{t("charts.noData")}</p>
      )}
      {rows.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["#", "Club", "V", "N", "D", "Buts", "SR"].map((h) => (
                  <th key={h} style={{ padding: "4px 8px", textAlign: "left", fontSize: 10, color: "var(--muted)", fontWeight: "normal" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.rank} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "5px 8px", color: r.rank <= 3 ? "#ffd700" : "var(--muted)",
                    fontFamily: "'Bebas Neue', sans-serif", fontSize: 14 }}>{r.rank}</td>
                  <td style={{ padding: "5px 8px", color: "var(--text)", fontWeight: 600,
                    maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</td>
                  <td style={{ padding: "5px 8px", color: "#22c55e" }}>{r.wins}</td>
                  <td style={{ padding: "5px 8px", color: "#eab308" }}>{r.ties}</td>
                  <td style={{ padding: "5px 8px", color: "var(--red)" }}>{r.losses}</td>
                  <td style={{ padding: "5px 8px", color: "var(--accent)" }}>{r.goals}</td>
                  <td style={{ padding: "5px 8px", color: "var(--muted)" }}>{r.sr}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Radar collectif ──────────────────────────────────────────────────────────
function TeamRadarSection({ matches, clubId }: { matches: Match[]; clubId: string }) {
  const data = useMemo(() => {
    if (matches.length === 0) return [];
    let totalPoss = 0, totalShots = 0, totalPasses = 0, totalGoals = 0, totalWins = 0, possCount = 0;
    for (const m of matches) {
      const club = m.clubs[clubId] as Record<string, unknown> | undefined;
      if (!club) continue;
      const poss = Number(club["possession"] ?? club["possessionPercentage"] ?? -1);
      if (poss >= 0 && poss <= 100) { totalPoss += poss; possCount++; }
      totalShots  += Number(club["shots"]  ?? club["shotsTotal"]  ?? 0);
      totalPasses += Number(club["passesCompleted"] ?? club["passesMade"] ?? club["passesmade"] ?? 0);
      totalGoals  += Number(club["goals"]  ?? 0);
      if (club["wins"] === "1") totalWins++;
    }
    const n = matches.length;
    const clamp = (v: number, max: number) => Math.min(Math.round((v / max) * 100), 100);
    return [
      { label: "Possession", value: possCount > 0 ? Math.round(totalPoss / possCount) : 50 },
      { label: "Tirs/match",  value: clamp(totalShots  / n, 15) },
      { label: "Passes/match", value: clamp(totalPasses / n, 200) },
      { label: "Buts/match",  value: clamp(totalGoals  / n, 4) },
      { label: "% Victoires", value: Math.round((totalWins / n) * 100) },
    ];
  }, [matches, clubId]);

  return (
    <ChartCard title="RADAR COLLECTIF">
      {data.length === 0 ? <NoData text="Aucun match chargé" /> : (
        <>
          <ResponsiveContainer width="100%" height={180}>
            <RadarChart data={data} margin={{ top: 10, right: 20, left: 20, bottom: 10 }}>
              <PolarGrid stroke="var(--border)" />
              <PolarAngleAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 9 }} />
              <Radar name="Équipe" dataKey="value" stroke="var(--accent)"
                fill="var(--accent)" fillOpacity={0.22} strokeWidth={1.5} />
              <Tooltip
                contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 10 }}
                formatter={(v: number | string) => [`${v} / 100`, ""]}
              />
            </RadarChart>
          </ResponsiveContainer>
          <p style={{ fontSize: 9, color: "var(--muted)", textAlign: "center", marginTop: 2 }}>
            Normalisé · {matches.length} match{matches.length > 1 ? "s" : ""}
          </p>
        </>
      )}
    </ChartCard>
  );
}

// ─── Graphique de possession ──────────────────────────────────────────────────
function PossessionTrendSection({ matches, clubId }: { matches: Match[]; clubId: string }) {
  const data = useMemo(() => {
    const sorted = [...matches].sort((a, b) => Number(a.timestamp) - Number(b.timestamp)).slice(-20);
    return sorted.map((m, i) => {
      const club = m.clubs[clubId] as Record<string, unknown> | undefined;
      const poss = Number(club?.["possession"] ?? club?.["possessionPercentage"] ?? -1);
      return { n: i + 1, poss: poss >= 0 && poss <= 100 ? poss : null };
    }).filter(d => d.poss !== null) as { n: number; poss: number }[];
  }, [matches, clubId]);

  const avg = data.length > 0 ? Math.round(data.reduce((s, d) => s + d.poss, 0) / data.length) : null;

  return (
    <ChartCard
      title="POSSESSION MOYENNE"
      action={avg !== null ? (
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18,
          color: avg >= 50 ? "var(--green)" : "var(--red)" }}>{avg}%</span>
      ) : undefined}
    >
      {data.length < 3 ? <NoData text="Données de possession non disponibles" /> : (
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={data} margin={{ top: 4, right: 8, left: -28, bottom: 0 }}>
            <XAxis dataKey="n" tick={{ fontSize: 8, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]}
              tick={{ fontSize: 8, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <Tooltip
              contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 10 }}
              formatter={(v: number | string) => [`${v}%`, "Possession"]}
            />
            <Line type="monotone" dataKey="poss" stroke="var(--accent)" strokeWidth={2}
              dot={{ fill: "var(--accent)", r: 3 }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

// ─── Distribution des scores ──────────────────────────────────────────────────
function ScoreDistSection({ matches, clubId }: { matches: Match[]; clubId: string }) {
  const data = useMemo(() => {
    const map: Record<string, { score: string; count: number; win: number; draw: number; loss: number }> = {};
    for (const m of matches) {
      const my  = m.clubs[clubId] as Record<string, unknown> | undefined;
      const opp = Object.entries(m.clubs).find(([k]) => k !== clubId)?.[1] as Record<string, unknown> | undefined;
      if (!my || !opp) continue;
      const myG  = Number(my["goals"]  ?? 0);
      const oppG = Number(opp["goals"] ?? 0);
      const key  = `${myG}-${oppG}`;
      if (!map[key]) map[key] = { score: key, count: 0, win: 0, draw: 0, loss: 0 };
      map[key].count++;
      if      (my["wins"]   === "1") map[key].win++;
      else if (my["losses"] === "1") map[key].loss++;
      else                            map[key].draw++;
    }
    return Object.values(map).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [matches, clubId]);

  return (
    <ChartCard title="DISTRIBUTION DES SCORES">
      {data.length === 0 ? <NoData text="Aucun match chargé" /> : (
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }} barSize={20}>
            <XAxis dataKey="score" tick={{ fontSize: 9, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 8, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 10 }}
              formatter={(v: number | string, name: string) => [v, name === "win" ? "Victoire" : name === "draw" ? "Nul" : "Défaite"]}
            />
            <Bar dataKey="win"  stackId="a" fill="#22c55e" name="win" />
            <Bar dataKey="draw" stackId="a" fill="#eab308" name="draw" />
            <Bar dataKey="loss" stackId="a" fill="#ef4444" name="loss" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

// ─── Heatmap jour / heure ─────────────────────────────────────────────────────
function DayHourHeatmapSection({ matches, clubId }: { matches: Match[]; clubId: string }) {
  const { grid, days, hours } = useMemo(() => {
    const days  = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
    const hours = ["00h", "04h", "08h", "12h", "16h", "20h"];
    const map: Record<string, { wins: number; total: number }> = {};
    for (const m of matches) {
      const ts = Number(m.timestamp);
      const d  = new Date(ts > 1e12 ? ts : ts * 1000);
      const day  = (d.getDay() + 6) % 7; // 0=Mon
      const hour = Math.floor(d.getHours() / 4); // 0=00h, 5=20h
      const key  = `${day}-${hour}`;
      if (!map[key]) map[key] = { wins: 0, total: 0 };
      map[key].total++;
      const club = m.clubs[clubId] as Record<string, unknown> | undefined;
      if (club?.["wins"] === "1") map[key].wins++;
    }
    return { grid: map, days, hours };
  }, [matches, clubId]);

  const hasData = Object.values(grid).some(v => v.total > 0);

  return (
    <ChartCard title="HEATMAP JOUR / HEURE (% VICTOIRES)">
      {!hasData ? <NoData text="Aucun match chargé" /> : (
        <div style={{ overflowX: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: `32px repeat(7, 1fr)`, gap: 2, minWidth: 280 }}>
            <div />
            {days.map(d => (
              <div key={d} style={{ textAlign: "center", fontSize: 8, color: "var(--muted)",
                fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.06em", paddingBottom: 2 }}>{d}</div>
            ))}
            {hours.map((h, hi) => (
              <Fragment key={h}>
                <div style={{ fontSize: 8, color: "var(--muted)", alignSelf: "center",
                  fontFamily: "'Bebas Neue', sans-serif" }}>{h}</div>
                {days.map((_, di) => {
                  const cell = grid[`${di}-${hi}`];
                  const wr   = cell && cell.total > 0 ? cell.wins / cell.total : -1;
                  const bg   = wr < 0 ? "var(--bg)"
                    : `hsl(${Math.round(wr * 120)}, 65%, ${wr > 0.5 ? "30%" : "25%"})`;
                  return (
                    <div key={di} title={cell ? `${cell.wins}V/${cell.total}M (${Math.round(wr * 100)}%)` : ""}
                      style={{ height: 22, borderRadius: 3, background: bg,
                        border: "1px solid var(--border)", display: "flex", alignItems: "center",
                        justifyContent: "center" }}>
                      {cell && cell.total > 0 && (
                        <span style={{ fontSize: 8, fontWeight: 700,
                          color: wr > 0.6 ? "#86efac" : wr > 0.4 ? "#fde68a" : "#fca5a5" }}>
                          {Math.round(wr * 100)}%
                        </span>
                      )}
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
          <p style={{ fontSize: 9, color: "var(--muted)", marginTop: 6, textAlign: "center" }}>
            Basé sur {matches.length} match{matches.length > 1 ? "s" : ""}
          </p>
        </div>
      )}
    </ChartCard>
  );
}

// ─── Évolution de l'effectif ──────────────────────────────────────────────────
function PlayerCountSection({ matches, clubId }: { matches: Match[]; clubId: string }) {
  const data = useMemo(() =>
    [...matches]
      .sort((a, b) => Number(a.timestamp) - Number(b.timestamp))
      .slice(-20)
      .map((m, i) => {
        const clubPlayers = m.players[clubId] as Record<string, unknown> | undefined;
        const count = clubPlayers ? Object.keys(clubPlayers).length : 0;
        return { n: i + 1, count };
      }),
  [matches, clubId]);

  const avg = data.length > 0 ? (data.reduce((s, d) => s + d.count, 0) / data.length).toFixed(1) : null;

  return (
    <ChartCard
      title="ÉVOLUTION DE L'EFFECTIF"
      action={avg !== null ? (
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, color: "var(--accent)" }}>
          Moy. {avg}
        </span>
      ) : undefined}
    >
      {data.length < 2 ? <NoData text="Aucun match chargé" /> : (
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={data} margin={{ top: 4, right: 8, left: -28, bottom: 0 }}>
            <XAxis dataKey="n" tick={{ fontSize: 8, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 8, fill: "var(--muted)" }} axisLine={false} tickLine={false} allowDecimals={false} />
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <Tooltip
              contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 10 }}
              formatter={(v: number | string) => [v, "Joueurs"]}
            />
            <Line type="monotone" dataKey="count" stroke="#a855f7" strokeWidth={2}
              dot={{ fill: "#a855f7", r: 3 }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

// ─── Heatmap de forme (GitHub-style calendar) ─────────────────────────────────
function FormCalendarSection({ matches, clubId }: { matches: Match[]; clubId: string }) {
  const today = useMemo(() => { const d = new Date(); d.setHours(23, 59, 59, 0); return d; }, []);

  const resultMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of matches) {
      const ts = Number(m.timestamp);
      const d = new Date(ts > 1e12 ? ts : ts * 1000);
      const key = d.toISOString().slice(0, 10);
      const club = m.clubs[clubId] as Record<string, unknown> | undefined;
      if (!club) continue;
      const prev = map[key];
      const res = Number(club.wins) > 0 ? "W" : Number(club.ties) > 0 ? "D" : "L";
      if (!prev || (prev === "L" && res !== "L") || (prev === "D" && res === "W")) map[key] = res;
    }
    return map;
  }, [matches, clubId]);

  const { weeks, monthLabels } = useMemo(() => {
    const days = 91;
    const start = new Date(today);
    start.setDate(start.getDate() - days + 1);
    const dow = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - dow);
    const weeksArr: { date: Date; key: string; result: string | null }[][] = [];
    const cur = new Date(start);
    while (cur <= today) {
      const week: typeof weeksArr[number] = [];
      for (let d = 0; d < 7; d++) {
        const key = cur.toISOString().slice(0, 10);
        week.push({ date: new Date(cur), key, result: cur >= start && cur <= today ? (resultMap[key] ?? null) : null });
        cur.setDate(cur.getDate() + 1);
      }
      weeksArr.push(week);
    }
    const labels: { label: string; col: number }[] = [];
    let lastM = -1;
    weeksArr.forEach((w, ci) => {
      const mo = w[0].date.getMonth();
      if (mo !== lastM) { labels.push({ label: w[0].date.toLocaleString("fr", { month: "short" }), col: ci }); lastM = mo; }
    });
    return { weeks: weeksArr, monthLabels: labels };
  }, [today, resultMap]);

  const counts = useMemo(() => {
    const c = { W: 0, D: 0, L: 0 };
    Object.values(resultMap).forEach(r => { if (r in c) c[r as keyof typeof c]++; });
    return c;
  }, [resultMap]);

  return (
    <ChartCard title="HEATMAP DE FORME — 3 MOIS">
      <div style={{ display: "grid", gridTemplateColumns: `20px repeat(${weeks.length}, 1fr)`, gap: 2, marginBottom: 2 }}>
        <div />
        {weeks.map((_, ci) => {
          const ml = monthLabels.find(m => m.col === ci);
          return <div key={ci} style={{ fontSize: 7, color: "var(--muted)", textAlign: "center", fontFamily: "'Bebas Neue', sans-serif", overflow: "hidden" }}>{ml?.label ?? ""}</div>;
        })}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `20px repeat(${weeks.length}, 1fr)`, gap: 2 }}>
        {(["L","M","M","J","V","S","D"] as const).map((dl, di) => (
          <Fragment key={di}>
            <div style={{ fontSize: 7, color: di % 2 === 0 ? "var(--muted)" : "transparent", fontFamily: "'Bebas Neue', sans-serif", alignSelf: "center", textAlign: "right", paddingRight: 2, gridRow: di + 2 }}>{dl}</div>
            {weeks.map((week, ci) => {
              const cell = week[di];
              const isFuture = cell.date > today;
              const bg = isFuture ? "transparent" : !cell.result ? "var(--bg)" : cell.result === "W" ? "#22c55e" : cell.result === "D" ? "#eab308" : "#ef4444";
              return (
                <div key={`${ci}-${di}`}
                  title={cell.result ? `${cell.key} — ${cell.result === "W" ? "Victoire" : cell.result === "D" ? "Nul" : "Défaite"}` : cell.key}
                  style={{ height: 11, borderRadius: 2, background: bg, opacity: !cell.result && !isFuture ? 0.3 : 1,
                    border: "1px solid rgba(255,255,255,0.04)", gridColumn: ci + 2, gridRow: di + 2, transition: "transform 0.1s", cursor: cell.result ? "default" : undefined }}
                  onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.3)")}
                  onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
                />
              );
            })}
          </Fragment>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginTop: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: 2, background: "#22c55e" }} /><span style={{ fontSize: 9, color: "var(--muted)" }}>{counts.W}V</span>
        <div style={{ width: 8, height: 8, borderRadius: 2, background: "#eab308" }} /><span style={{ fontSize: 9, color: "var(--muted)" }}>{counts.D}N</span>
        <div style={{ width: 8, height: 8, borderRadius: 2, background: "#ef4444" }} /><span style={{ fontSize: 9, color: "var(--muted)" }}>{counts.L}D</span>
      </div>
    </ChartCard>
  );
}

// ─── ChartsTab ────────────────────────────────────────────────────────────────
export function ChartsTab() {
  const t = useT();
  const [mode, setMode] = useState<Mode>("last10");
  const [exportModal, setExportModal] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const { currentClub, players, matches } = useAppStore();

  const last10 = useMemo(() => {
    if (!currentClub || matches.length === 0)
      return { wins: 0, ties: 0, losses: 0, goals: 0, assists: 0, count: 0 };
    const sorted = [...matches].sort((a, b) => Number(a.timestamp) - Number(b.timestamp)).slice(-10);
    let wins = 0, ties = 0, losses = 0, goals = 0, assists = 0;
    for (const m of sorted) {
      const c = m.clubs[currentClub.id] as Record<string, string> | undefined;
      if (!c) continue;
      if (Number(c.wins) > 0) wins++;
      else if (Number(c.ties) > 0) ties++;
      else losses++;
      goals   += Number(c.goals)   || 0;
      assists += Number(c.assists) || 0;
    }
    return { wins, ties, losses, goals, assists, count: sorted.length };
  }, [matches, currentClub]);

  const allTimeAssists = useMemo(() => players.reduce((s, p) => s + p.assists, 0), [players]);

  const wdlData = useMemo(() => {
    if (!currentClub) return [];
    const src = mode === "alltime"
      ? { wins: currentClub.wins, ties: currentClub.ties, losses: currentClub.losses }
      : last10;
    return [
      { name: t("charts.winsShort"),   value: src.wins,   color: "#22c55e" },
      { name: t("charts.drawsShort"),  value: src.ties,   color: "#eab308" },
      { name: t("charts.lossesShort"), value: src.losses, color: "#ef4444" },
    ];
  }, [currentClub, mode, last10]);

  const wdlTotal = wdlData.reduce((s, d) => s + d.value, 0);

  const butsData = useMemo(() => {
    if (!currentClub) return { data: [], total: 0 };
    const goals   = mode === "alltime" ? currentClub.goals : last10.goals;
    const assists = mode === "alltime" ? allTimeAssists    : last10.assists;
    return {
      data: [
        { name: t("charts.goalsShort"),   value: goals,   color: "#00d4ff" },
        { name: t("charts.assistsShort"), value: assists, color: "#22c55e" },
      ],
      total: goals + assists,
    };
  }, [currentClub, mode, last10, allTimeAssists]);

  const playerSource = useMemo(() => {
    if (mode === "alltime" || !currentClub) return players;
    const sorted = [...matches].sort((a, b) => Number(a.timestamp) - Number(b.timestamp)).slice(-10);
    return aggregateMatchPlayers(sorted, currentClub.id);
  }, [mode, players, matches, currentClub]);

  const topScorers = useMemo(() => [...playerSource].sort((a, b) => b.goals     - a.goals).slice(0, 5),     [playerSource]);
  const topAssists = useMemo(() => [...playerSource].sort((a, b) => b.assists    - a.assists).slice(0, 5),   [playerSource]);
  const topPasses  = useMemo(() => [...playerSource].sort((a, b) => b.passesMade - a.passesMade).slice(0, 5), [playerSource]);

  if (!currentClub) return null;

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "16px 20px" }}>

      {/* Toggle + export */}
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginBottom: 20 }}>
        {(["last10", "alltime"] as Mode[]).map((m) => (
          <button key={m} onClick={() => setMode(m)} style={{
            padding: "6px 18px", borderRadius: 20, fontSize: 11,
            fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.1em", cursor: "pointer",
            border: `1px solid ${mode === m ? "var(--accent)" : "var(--border)"}`,
            background: "transparent", color: mode === m ? "var(--accent)" : "var(--muted)",
            transition: "all 0.15s",
          }}>
            {m === "last10" ? t("charts.last10") : t("charts.allTime")}
          </button>
        ))}
        <button onClick={() => setExportModal(true)} style={{ ...BTN, marginLeft: 8 }}>
          <Download size={11} /> PNG
        </button>
      </div>

      <div ref={contentRef} style={{ background: "var(--card)" }}>
        {/* Row 1: WDL + Goals + Top Scorers */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
          <ChartCard title={t("charts.wdl")}>
            <DonutChart data={wdlData} centerValue={wdlTotal} centerSub={t("charts.matchesLabel")} />
            <WdlLegend data={wdlData} total={wdlTotal} />
          </ChartCard>
          <ChartCard title={t("charts.goalsAssists")}>
            <DonutChart data={butsData.data} centerValue={butsData.total} centerSub={t("charts.totalLabel")} />
            <WdlLegend data={butsData.data} total={butsData.total} />
          </ChartCard>
          <ChartCard title={t("charts.topScorers")}>
            <HBarChart players={topScorers} valueKey="goals" color="cyan" />
          </ChartCard>
        </div>

        {/* Row 2: Top Assists + Top Passes */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
          <ChartCard title={t("charts.topAssists")}>
            <HBarChart players={topAssists} valueKey="assists" color="orange" />
          </ChartCard>
          <ChartCard title={t("charts.topPasses")}>
            <HBarChart players={topPasses} valueKey="passesMade" color="purple" />
          </ChartCard>
        </div>

        {/* Row 3: Season History + SR Evolution + Leaderboard */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
          <SeasonHistorySection clubId={currentClub.id} platform={currentClub.platform} />
          <SrEvolutionSection   clubId={currentClub.id} platform={currentClub.platform} />
          <LeaderboardSection   clubId={currentClub.id} platform={currentClub.platform} />
        </div>

        {/* Row 4: Team Radar + Possession + Player Count */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
          <TeamRadarSection       matches={matches} clubId={currentClub.id} />
          <PossessionTrendSection matches={matches} clubId={currentClub.id} />
          <PlayerCountSection     matches={matches} clubId={currentClub.id} />
        </div>

        {/* Row 5: Score Distribution + Day/Hour Heatmap */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
          <ScoreDistSection      matches={matches} clubId={currentClub.id} />
          <DayHourHeatmapSection matches={matches} clubId={currentClub.id} />
        </div>

        {/* Row 6: Form Calendar Heatmap */}
        <FormCalendarSection matches={matches} clubId={currentClub.id} />
      </div>

      {exportModal && (
        <ExportModal type="png" pngSourceEl={contentRef.current}
          defaultFilename={`graphiques-${new Date().toISOString().slice(0, 10)}`}
          onClose={() => setExportModal(false)} />
      )}
    </div>
  );
}
