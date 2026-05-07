import { useState, useMemo, useRef, useEffect } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  Send, FileText, CreditCard, BrainCircuit,
  Target, Shield, Star, Swords, TrendingUp, Activity,
} from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { useT } from "../../i18n";
import { sendDiscordWebhook, sendDiscordFile } from "../../api/discord";
import { generatePlayerPdf, getPlayerPdfFilename } from "../../utils/pdfExport";
import { suggestPosition, detectPerformanceAnomaly } from "../../utils/aiEngine";
import { PdfSaveModal } from "./PdfSaveModal";
import type { Player, Match } from "../../types";

// ─── Constants ────────────────────────────────────────────────────────────────

export const POS_LABELS: Record<string, string> = {
  "0":"GK","1":"RB","2":"RB","3":"CB","4":"CB","5":"LB","6":"LB",
  "7":"CDM","8":"CM","9":"CM","10":"CAM","11":"RM","12":"LM",
  "13":"RW","14":"LW","15":"RF","16":"CF","17":"LF","18":"ST","19":"ST",
  "20":"ST","25":"CF","26":"CAM",
};

export const AVATAR_COLORS = ["#5865f2","#eb459e","#57f287","#fee75c","#ed4245","#ff6b35","#8b5cf6","#00d4ff"];

export function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function PlayerAvatar({ name, size = 28 }: { name: string; size?: number }) {
  const initials = name.split(/\s+/).map((w) => w[0]?.toUpperCase() ?? "").join("").slice(0, 2) || "?";
  const bg = avatarColor(name);
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: bg, color: "#fff", fontSize: size * 0.4, fontWeight: 700,
      fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.04em",
    }}>
      {initials}
    </div>
  );
}

export function ratingColor(r: number) {
  if (r >= 9)   return "#ffd700";
  if (r >= 7.5) return "#22c55e";
  if (r >= 6.5) return "#eab308";
  if (r > 0)    return "#ef4444";
  return "#6b7280";
}

// ─── Linear regression ────────────────────────────────────────────────────────

function linearRegression(values: number[]): { slope: number; intercept: number } {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0 };
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  values.forEach((y, x) => { num += (x - xMean) * (y - yMean); den += (x - xMean) ** 2; });
  const slope = den !== 0 ? num / den : 0;
  const intercept = yMean - slope * xMean;
  return { slope, intercept };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMatchesFromCache(matchCache: Record<string, Match[]>, clubId: string, platform: string): Match[] {
  const all: Match[] = [];
  for (const type of ["leagueMatch", "playoffMatch", "friendlyMatch"]) {
    const key = `${clubId}_${platform}_${type}`;
    all.push(...(matchCache[key] ?? []));
  }
  return all;
}

// ─── FIFA-style player card (canvas) ─────────────────────────────────────────

const TIER = {
  gold:   { bg1: "#2a1f00", bg2: "#0d0900", accent: "#F9C00C", glow: "rgba(249,192,12,0.4)" },
  silver: { bg1: "#1f2028", bg2: "#0a0b0f", accent: "#C8C8C8", glow: "rgba(200,200,200,0.35)" },
  bronze: { bg1: "#1f1008", bg2: "#0a0500", accent: "#CD7F32", glow: "rgba(205,127,50,0.4)" },
} as const;

function drawPlayerCard(canvas: HTMLCanvasElement, player: Player, posLabel: string, clubName: string): void {
  canvas.width = 300; canvas.height = 420;
  const ctx = canvas.getContext("2d")!;
  const ovr = Math.min(99, Math.max(0, Math.round(player.rating * 10)));
  const tc  = ovr >= 85 ? TIER.gold : ovr >= 65 ? TIER.silver : TIER.bronze;
  const F   = "'Bebas Neue', Impact, sans-serif";

  const bgGrad = ctx.createLinearGradient(0, 0, 0, 420);
  bgGrad.addColorStop(0, tc.bg1); bgGrad.addColorStop(1, tc.bg2);
  ctx.fillStyle = bgGrad;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(0, 0, 300, 420, 12); else ctx.rect(0, 0, 300, 420);
  ctx.fill();

  const topGrad = ctx.createLinearGradient(0, 0, 300, 0);
  topGrad.addColorStop(0, tc.accent + "00"); topGrad.addColorStop(0.5, tc.accent + "18"); topGrad.addColorStop(1, tc.accent + "00");
  ctx.fillStyle = topGrad; ctx.fillRect(0, 0, 300, 100);

  ctx.strokeStyle = tc.accent; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.45;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(1, 1, 298, 418, 11); else ctx.rect(1, 1, 298, 418);
  ctx.stroke(); ctx.globalAlpha = 1;

  ctx.font = `bold 58px ${F}`; ctx.fillStyle = tc.accent; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.fillText(String(ovr), 22, 72);
  ctx.font = `bold 15px ${F}`; ctx.fillStyle = tc.accent; ctx.fillText(posLabel, 25, 90);

  ctx.strokeStyle = tc.accent; ctx.lineWidth = 1; ctx.globalAlpha = 0.3;
  ctx.beginPath(); ctx.moveTo(20, 100); ctx.lineTo(280, 100); ctx.stroke(); ctx.globalAlpha = 1;

  const cx = 150, cy = 182, r = 54;
  const glowGrad = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 1.7);
  glowGrad.addColorStop(0, tc.glow); glowGrad.addColorStop(1, "transparent");
  ctx.fillStyle = glowGrad; ctx.beginPath(); ctx.arc(cx, cy, r * 1.7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = avatarColor(player.name); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = tc.accent; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.75;
  ctx.beginPath(); ctx.arc(cx, cy, r + 1.5, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;

  const initials = player.name.split(/\s+/).map((w) => w[0]?.toUpperCase() ?? "").join("").slice(0, 2) || "?";
  ctx.font = `bold 36px ${F}`; ctx.fillStyle = "#ffffff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(initials, cx, cy);

  ctx.font = `bold 21px ${F}`; ctx.fillStyle = "#ffffff"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  ctx.fillText(player.name.toUpperCase(), 150, 256);

  ctx.strokeStyle = tc.accent; ctx.lineWidth = 1; ctx.globalAlpha = 0.3;
  ctx.beginPath(); ctx.moveTo(40, 264); ctx.lineTo(260, 264); ctx.stroke(); ctx.globalAlpha = 1;

  const stats = [
    { label: "BUTS",  value: String(player.goals) },
    { label: "PD",    value: String(player.assists) },
    { label: "MJ",    value: String(player.gamesPlayed) },
    { label: "NOTE",  value: player.rating > 0 ? player.rating.toFixed(1) : "—" },
    { label: "MOTM",  value: String(player.motm) },
    { label: "TACLK", value: String(player.tacklesMade) },
  ];
  const colW = 100, rowH = 52, gridY = 276;
  stats.forEach((s, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const sx = col * colW + 50, sy = gridY + row * rowH;
    ctx.font = `bold 26px ${F}`; ctx.fillStyle = tc.accent; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(s.value, sx, sy + 13);
    ctx.font = `10px ${F}`; ctx.fillStyle = "rgba(255,255,255,0.42)"; ctx.fillText(s.label, sx, sy + 31);
  });
  ctx.textBaseline = "alphabetic";

  ctx.strokeStyle = tc.accent; ctx.lineWidth = 1; ctx.globalAlpha = 0.22;
  ctx.beginPath(); ctx.moveTo(20, 384); ctx.lineTo(280, 384); ctx.stroke(); ctx.globalAlpha = 1;
  ctx.font = `11px ${F}`; ctx.fillStyle = "rgba(255,255,255,0.38)"; ctx.textAlign = "center";
  ctx.fillText(clubName.toUpperCase(), 150, 407);
}

// ─── PlayerCardModal ──────────────────────────────────────────────────────────

function PlayerCardModal({ player, posLabel, clubName, onClose }: {
  player: Player; posLabel: string; clubName: string; onClose: () => void;
}) {
  const { discordWebhook, addToast } = useAppStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    document.fonts.ready.then(() => {
      if (canvasRef.current) drawPlayerCard(canvasRef.current, player, posLabel, clubName);
    });
  }, [player, posLabel, clubName]);

  const handleDownload = () => {
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.download = `${player.name.replace(/\s+/g, "_")}_card.png`;
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  };

  const handleSendDiscord = async () => {
    if (!discordWebhook || !canvasRef.current) return;
    setSending(true);
    try {
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvasRef.current!.toBlob((b) => b ? resolve(b) : reject(new Error("Canvas vide")), "image/png")
      );
      await sendDiscordFile(discordWebhook, blob, `${player.name.replace(/\s+/g, "_")}_card.png`);
      addToast("Carte envoyée sur Discord !", "success");
      onClose();
    } catch (e) {
      addToast(`Erreur: ${String(e)}`, "error");
    } finally { setSending(false); }
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.85)" }} onClick={onClose}>
      <div className="rounded-lg p-6" style={{ background: "var(--card)", border: "1px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>
        <p className="font-['Bebas_Neue'] text-sm text-[var(--muted)] tracking-widest mb-4 text-center">CARTE JOUEUR</p>
        <canvas ref={canvasRef} width={300} height={420} className="block rounded-xl shadow-2xl" />
        <div className="flex gap-2 mt-4 justify-center">
          <button onClick={handleDownload} className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/10 border border-orange-500/30 rounded-lg text-orange-400 text-xs font-semibold hover:bg-orange-500/20 transition-colors cursor-pointer">
            ↓ PNG
          </button>
          {discordWebhook && (
            <button onClick={handleSendDiscord} disabled={sending} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/15 border border-indigo-500/35 rounded-lg text-indigo-400 text-xs font-semibold hover:bg-indigo-500/25 transition-colors cursor-pointer disabled:opacity-50">
              <Send size={11} /> Discord
            </button>
          )}
          <button onClick={onClose} className="px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-[var(--muted)] text-xs hover:text-[var(--text)] transition-colors cursor-pointer">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, color, icon, large = false }: {
  label: string; value: string | number; color: string; icon?: React.ReactNode; large?: boolean;
}) {
  return (
    <div className={`relative flex flex-col items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg)] text-center transition-all hover:border-[var(--accent)]/40 ${large ? "py-4 px-3" : "py-3 px-2"}`}>
      {icon && <div className="absolute top-2 right-2 opacity-30">{icon}</div>}
      <div
        className={`font-['Bebas_Neue'] leading-none ${large ? "text-4xl" : "text-2xl"}`}
        style={{ color }}
      >
        {String(value)}
      </div>
      <div className="text-[9px] text-[var(--muted)] tracking-widest mt-1.5 font-['Bebas_Neue'] uppercase">
        {label}
      </div>
    </div>
  );
}

// ─── PlayerModal ──────────────────────────────────────────────────────────────

export function PlayerModal({ player, onClose }: { player: Player; onClose: () => void }) {
  const t = useT();
  const { matches, matchCache, currentClub, discordWebhook, addToast } = useAppStore();
  const [evoStat, setEvoStat]       = useState<"rating" | "goals" | "assists">("rating");
  const [showTrend, setShowTrend]   = useState(false);
  const [chartView, setChartView]   = useState<"match" | "monthly">("match");
  const [sharing, setSharing]       = useState(false);
  const [exporting, setExporting]   = useState(false);
  const [showPdfModal, setShowPdfModal]   = useState(false);
  const [showPeriods, setShowPeriods]     = useState(false);
  const [periodA, setPeriodA] = useState({ start: "", end: "" });
  const [periodB, setPeriodB] = useState({ start: "", end: "" });
  const [showCardModal, setShowCardModal] = useState(false);
  const posLabel = POS_LABELS[player.position] ?? player.position ?? "—";

  // ── Per-match evolution ────────────────────────────────────────────────────
  const evoData = useMemo(() => {
    if (!currentClub) return [];
    const points: { match: string; value: number; date: string }[] = [];
    const sorted = [...matches].sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
    for (const m of sorted) {
      const clubPlayers = m.players[currentClub.id] as Record<string, Record<string, unknown>> | undefined;
      if (!clubPlayers) continue;
      for (const p of Object.values(clubPlayers)) {
        const name = String(p["name"] ?? p["playername"] ?? p["playerName"] ?? "");
        if (name.toLowerCase() !== player.name.toLowerCase()) continue;
        const val = evoStat === "rating"
          ? Number(p["rating"] ?? p["ratingAve"] ?? 0)
          : evoStat === "goals" ? Number(p["goals"] ?? 0)
          : Number(p["assists"] ?? 0);
        const ts = Number(m.timestamp);
        const date = ts > 0 ? new Date(ts > 1e12 ? ts : ts * 1000).toLocaleDateString() : "";
        points.push({ match: `M${points.length + 1}`, value: Math.round(val * 100) / 100, date });
      }
    }
    return points;
  }, [matches, currentClub, player.name, evoStat]);

  // ── Trend line ─────────────────────────────────────────────────────────────
  const trendChartData = useMemo(() => {
    if (!showTrend || evoStat !== "rating" || evoData.length < 3) return evoData;
    const values = evoData.map((d) => d.value);
    const { slope, intercept } = linearRegression(values);
    const clamp = (v: number) => Math.max(0, Math.min(10, Math.round(v * 100) / 100));
    const withTrend = evoData.map((d, i) => ({
      ...d, trendValue: clamp(slope * i + intercept), projected: undefined as number | undefined,
    }));
    for (let i = 0; i < 5; i++) {
      withTrend.push({
        match: `P${i + 1}`, value: null as unknown as number, date: "Projection",
        trendValue: clamp(slope * (values.length + i) + intercept),
        projected: clamp(slope * (values.length + i) + intercept),
      });
    }
    return withTrend;
  }, [evoData, showTrend, evoStat]);

  // ── Monthly grouping ───────────────────────────────────────────────────────
  const monthlyData = useMemo(() => {
    if (!currentClub) return [];
    const allMatches = getMatchesFromCache(matchCache, currentClub.id, currentClub.platform);
    const byMonth = new Map<string, { goals: number; assists: number; ratings: number[]; games: number }>();
    const sorted = [...allMatches].sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
    for (const m of sorted) {
      const clubPlayers = m.players[currentClub.id] as Record<string, Record<string, unknown>> | undefined;
      if (!clubPlayers) continue;
      for (const p of Object.values(clubPlayers)) {
        const name = String(p["name"] ?? p["playername"] ?? p["playerName"] ?? "");
        if (name.toLowerCase() !== player.name.toLowerCase()) continue;
        const ts = Number(m.timestamp);
        const d = new Date(ts > 1e12 ? ts : ts * 1000);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (!byMonth.has(key)) byMonth.set(key, { goals: 0, assists: 0, ratings: [], games: 0 });
        const entry = byMonth.get(key)!;
        entry.goals += Number(p["goals"] ?? 0);
        entry.assists += Number(p["assists"] ?? 0);
        const r = Number(p["rating"] ?? p["ratingAve"] ?? 0);
        if (r > 0) entry.ratings.push(r);
        entry.games += 1;
      }
    }
    return Array.from(byMonth.entries()).map(([month, d]) => ({
      month, goals: d.goals, assists: d.assists,
      rating: d.ratings.length > 0 ? Math.round((d.ratings.reduce((a, b) => a + b, 0) / d.ratings.length) * 10) / 10 : 0,
      games: d.games,
    }));
  }, [matchCache, currentClub, player.name]);

  // ── All evo data ───────────────────────────────────────────────────────────
  const allEvoData = useMemo(() => {
    if (!currentClub) return { rating: [], goals: [], assists: [] };
    const sorted = [...matches].sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
    const rating: number[] = [], goals: number[] = [], assists: number[] = [];
    for (const m of sorted) {
      const clubPlayers = m.players[currentClub.id] as Record<string, Record<string, unknown>> | undefined;
      if (!clubPlayers) continue;
      for (const p of Object.values(clubPlayers)) {
        const name = String(p["name"] ?? p["playername"] ?? p["playerName"] ?? "");
        if (name.toLowerCase() !== player.name.toLowerCase()) continue;
        rating.push(Math.round(Number(p["rating"] ?? p["ratingAve"] ?? 0) * 10) / 10);
        goals.push(Number(p["goals"] ?? 0));
        assists.push(Number(p["assists"] ?? 0));
      }
    }
    return { rating, goals, assists };
  }, [matches, currentClub, player.name]);

  // ── Trend summary ──────────────────────────────────────────────────────────
  const trendSummary = useMemo(() => {
    const values = allEvoData.rating;
    if (values.length < 3) return null;
    const { slope } = linearRegression(values);
    const last5 = values.slice(-5);
    const avg5 = last5.reduce((a, b) => a + b, 0) / last5.length;
    const n = values.length;
    const { slope: s, intercept: ic } = linearRegression(values);
    const projected = Array.from({ length: 5 }, (_, i) =>
      Math.max(0, Math.min(10, Math.round((s * (n + i) + ic) * 10) / 10))
    );
    return {
      slope: Math.round(slope * 1000) / 1000,
      avg5: Math.round(avg5 * 10) / 10,
      projectedAvg: Math.round(projected.reduce((a, b) => a + b, 0) / projected.length * 10) / 10,
      direction: slope > 0.05 ? "↑ En progression" : slope < -0.05 ? "↓ En baisse" : "→ Stable",
      dirColor: slope > 0.05 ? "#22c55e" : slope < -0.05 ? "#ef4444" : "#eab308",
    };
  }, [allEvoData.rating]);

  // ── Discord share ──────────────────────────────────────────────────────────
  const handleShareDiscord = async () => {
    if (!discordWebhook) { addToast(t("discord.noWebhook"), "error"); return; }
    setSharing(true);
    try {
      const colorHex = avatarColor(player.name);
      const color = parseInt(colorHex.replace("#", ""), 16);
      const fields: { name: string; value: string; inline?: boolean }[] = [
        { name: "🎮 MJ",          value: String(player.gamesPlayed), inline: true },
        { name: "⚽ Buts",        value: String(player.goals),       inline: true },
        { name: "🅰️ Passes D.",  value: String(player.assists),     inline: true },
        { name: "🎯 Passes",      value: String(player.passesMade),  inline: true },
        { name: "🛡️ Tacles",     value: String(player.tacklesMade), inline: true },
        { name: "★ MOTM",         value: `${player.motm}x`,          inline: true },
      ];
      if (player.shotsOnTarget)  fields.push({ name: "🎯 Tirs cadrés",   value: String(player.shotsOnTarget),  inline: true });
      if (player.interceptions)  fields.push({ name: "🔵 Interceptions", value: String(player.interceptions),  inline: true });
      if (player.yellowCards)    fields.push({ name: "🟨 Cartons J.",    value: String(player.yellowCards),    inline: true });
      if (player.redCards)       fields.push({ name: "🟥 Cartons R.",    value: String(player.redCards),       inline: true });
      if (player.cleanSheets)    fields.push({ name: "🧤 Clean sheets",  value: String(player.cleanSheets),    inline: true });
      if (player.saveAttempts)   fields.push({ name: "🧤 Arrêts",        value: String(player.saveAttempts),   inline: true });
      const BLOCKS = ["▁","▂","▃","▄","▅","▆","▇","█"];
      const ratingSparkline = (arr: number[]) => {
        const min = Math.min(...arr), max = Math.max(...arr), range = max - min || 1;
        const bar = arr.map(v => BLOCKS[Math.round(((v - min) / range) * (BLOCKS.length - 1))]).join("");
        const avg = (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1);
        return `\`${bar}\`\nMoy. **${avg}** ★  |  Min ${min.toFixed(1)}  |  Max ${max.toFixed(1)}  |  ${arr.length} matchs`;
      };
      const countSparkline = (arr: number[], emoji: string) => {
        const squares = arr.map(v => v === 0 ? "⬜" : v === 1 ? "🟩" : v === 2 ? "🟨" : "🟥").join("");
        return `${squares}\nTotal : **${arr.reduce((a, b) => a + b, 0)}** ${emoji} sur ${arr.length} matchs`;
      };
      if (allEvoData.rating.length > 1)
        fields.push({ name: "📈 Évolution Note", value: ratingSparkline(allEvoData.rating).slice(0, 1024) });
      if (allEvoData.goals.length > 1 && allEvoData.goals.some(v => v > 0))
        fields.push({ name: "⚽ Évolution Buts", value: countSparkline(allEvoData.goals, "⚽").slice(0, 1024) });
      if (allEvoData.assists.length > 1 && allEvoData.assists.some(v => v > 0))
        fields.push({ name: "🅰️ Évolution PD", value: countSparkline(allEvoData.assists, "🅰️").slice(0, 1024) });
      if (trendSummary)
        fields.push({ name: "📊 Tendance", value: `${trendSummary.direction}  |  Avg 5 derniers : **${trendSummary.avg5}**  |  Proj. : **${trendSummary.projectedAvg}**` });
      await sendDiscordWebhook(discordWebhook, [{
        title: `👤 ${player.name} — ${posLabel}`,
        color,
        description: player.rating > 0 ? `Note moyenne : **${player.rating.toFixed(1)}** ★` : undefined,
        fields,
        footer: { text: "ProClubs Stats" },
      }]);
      addToast(t("discord.sent"), "success");
    } catch (e) {
      addToast(`Discord: ${String(e)}`, "error");
    } finally { setSharing(false); }
  };

  // ── Derived data ───────────────────────────────────────────────────────────
  const aiPosition  = suggestPosition(player)[0].pos;
  const aiAnomaly   = allEvoData.rating.length >= 5
    ? detectPerformanceAnomaly(allEvoData.rating.map(r => ({ rating: r })))
    : null;

  const anomalyLabel = aiAnomaly === "peak"  ? { text: "🔥 Exceptionnelle", cls: "text-green-400" }
    : aiAnomaly === "slump" ? { text: "⚠️ En baisse",      cls: "text-red-400"   }
    : { text: "Standard", cls: "" };

  const advStats: { label: string; value: number; color: string; icon: React.ReactNode }[] = [
    ...(player.shotsOnTarget  ? [{ label: t("players.shotsOnTarget"), value: player.shotsOnTarget, color: "var(--accent)", icon: <Target size={12} /> }] : []),
    ...(player.interceptions  ? [{ label: t("players.interceptions"), value: player.interceptions, color: "var(--text)",   icon: <Shield size={12} /> }] : []),
    ...(player.foulsCommitted ? [{ label: t("players.fouls"),         value: player.foulsCommitted,color: "#6b7280",       icon: <Swords size={12} /> }] : []),
    ...(player.yellowCards    ? [{ label: t("players.yellowCards"),    value: player.yellowCards,   color: "#eab308",       icon: <span className="text-xs">🟨</span> }] : []),
    ...(player.redCards       ? [{ label: t("players.redCards"),       value: player.redCards,      color: "#ef4444",       icon: <span className="text-xs">🟥</span> }] : []),
    ...(player.cleanSheets    ? [{ label: t("players.cleanSheets"),    value: player.cleanSheets,   color: "#22c55e",       icon: <Shield size={12} /> }] : []),
    ...(player.saveAttempts   ? [{ label: t("players.saves"),          value: player.saveAttempts,  color: "var(--text)",   icon: <Activity size={12} /> }] : []),
  ];

  const computePeriodStats = (start: string, end: string) => {
    if (!currentClub || !start || !end) return null;
    const allMatches = getMatchesFromCache(matchCache, currentClub.id, currentClub.platform);
    const startTs = new Date(start).getTime(), endTs = new Date(end).getTime() + 86399999;
    let games = 0, goals = 0, assists = 0, motm = 0;
    const ratings: number[] = [];
    for (const m of allMatches) {
      const ts = Number(m.timestamp);
      const mTs = ts > 1e12 ? ts : ts * 1000;
      if (mTs < startTs || mTs > endTs) continue;
      const clubPlayers = m.players[currentClub.id] as Record<string, Record<string, unknown>> | undefined;
      if (!clubPlayers) continue;
      for (const p of Object.values(clubPlayers)) {
        const name = String(p["name"] ?? p["playername"] ?? p["playerName"] ?? "");
        if (name.toLowerCase() !== player.name.toLowerCase()) continue;
        games++; goals += Number(p["goals"] ?? 0); assists += Number(p["assists"] ?? 0);
        if (Number(p["manofthematch"] ?? p["manOfTheMatch"] ?? 0) > 0) motm++;
        const r = Number(p["rating"] ?? p["ratingAve"] ?? 0);
        if (r > 0) ratings.push(r);
      }
    }
    const avgRating = ratings.length > 0 ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : 0;
    return { games, goals, assists, motm, avgRating };
  };

  return (
    <>
      {/* ── Backdrop ── */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.8)" }}
        onClick={onClose}
      >
        <div
          className="relative w-full max-w-[540px] max-h-[92vh] overflow-y-auto rounded-lg shadow-2xl"
          style={{ background: "var(--main-bg)", border: "1px solid var(--border)", animation: "fadeSlideIn 0.15s ease-out" }}
          onClick={(e) => e.stopPropagation()}
        >

          {/* ══ HEADER ══════════════════════════════════════════════════════ */}
          <div className="sticky top-0 z-10 px-5 py-4 rounded-t-lg"
            style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
            <div className="flex items-start justify-between gap-3">
              {/* Avatar + name + badges */}
              <div className="flex items-center gap-3">
                <PlayerAvatar name={player.name} size={48} />
                <div>
                  <h3 className="font-['Bebas_Neue'] text-2xl tracking-wide leading-tight" style={{ color: "var(--text)" }}>
                    {player.name.toUpperCase()}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="px-2 py-0.5 rounded text-[10px] font-['Bebas_Neue'] tracking-widest"
                      style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--muted)" }}>
                      {posLabel}
                    </span>
                    {trendSummary && (
                      <span className="text-xs font-bold" style={{ color: trendSummary.dirColor }}>
                        {trendSummary.direction}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button onClick={() => setShowCardModal(true)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded text-[11px] font-semibold transition-colors cursor-pointer"
                  style={{ background: "#f59e0b18", border: "1px solid #f59e0b44", color: "#fcd34d" }}>
                  <CreditCard size={11} /> Carte
                </button>
                <button onClick={() => setShowPdfModal(true)} disabled={exporting}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-50"
                  style={{ background: "#fb923c18", border: "1px solid #fb923c44", color: "#fb923c" }}>
                  <FileText size={11} /> PDF
                </button>
                {discordWebhook && (
                  <button onClick={handleShareDiscord} disabled={sharing}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-50"
                    style={{ background: "var(--active)", border: "1px solid var(--accent)", color: "var(--accent)" }}>
                    <Send size={11} /> {sharing ? "…" : "Discord"}
                  </button>
                )}
                <button onClick={onClose} className="win-btn">✕</button>
              </div>
            </div>
          </div>

          <div className="px-5 py-4 space-y-4">

            {/* ══ IA INSIGHT ══════════════════════════════════════════════ */}
            <div className="rounded-lg p-3.5" style={{ border: "1px solid var(--accent)33", background: "var(--active)" }}>
              <div className="flex items-center gap-2 mb-3">
                <BrainCircuit size={14} style={{ color: "var(--accent)" }} />
                <span className="font-['Bebas_Neue'] text-[11px] tracking-widest" style={{ color: "var(--accent)" }}>CONSEILS IA</span>
                <span className="ml-auto text-[9px] italic" style={{ color: "var(--muted)" }}>analyse heuristique</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span style={{ color: "var(--muted)" }}>Position recommandée</span>
                <span className="font-bold px-2 py-0.5 rounded" style={{ color: "var(--green)", background: "var(--green)18" }}>{aiPosition}</span>
              </div>
              {aiAnomaly && (
                <div className="flex items-center justify-between text-xs mt-2">
                  <span style={{ color: "var(--muted)" }}>Analyse de forme</span>
                  <span className={`font-bold ${anomalyLabel.cls}`}>{anomalyLabel.text}</span>
                </div>
              )}
            </div>

            {/* ══ NOTE DOMINANTE + STATS CLÉS ══════════════════════════════ */}
            <div>
              <p className="category-header mb-2">STATISTIQUES CLÉS</p>
              {/* Note en vedette */}
              {player.rating > 0 && (
                <div className="flex items-center justify-between mb-3 px-4 py-3 rounded-lg"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                  <div className="flex items-center gap-2">
                    <Star size={16} className="text-yellow-400" />
                    <span className="text-sm font-medium" style={{ color: "var(--muted)" }}>{t("players.rating")}</span>
                  </div>
                  <span
                    className="font-['Bebas_Neue'] text-5xl leading-none"
                    style={{ color: ratingColor(player.rating) }}
                  >
                    {player.rating.toFixed(1)}
                  </span>
                </div>
              )}
              {/* Grille stats */}
              <div className="grid grid-cols-3 gap-2">
                <StatCard label={t("players.gp")}      value={player.gamesPlayed} color="var(--text)"   icon={<Activity size={12}/>} />
                <StatCard label={t("players.goals")}   value={player.goals}       color="var(--accent)" icon={<span className="text-xs">⚽</span>} />
                <StatCard label={t("players.assists")} value={player.assists}     color="#8b5cf6"       icon={<span className="text-xs">🅰️</span>} />
                <StatCard label={t("players.passes")}  value={player.passesMade}  color="#6b7280"       icon={<TrendingUp size={12}/>} />
                <StatCard label={t("players.tackles")} value={player.tacklesMade} color="#6b7280"       icon={<Shield size={12}/>} />
                <StatCard label={t("session.motm")}    value={player.motm}        color="#ffd700"       icon={<Star size={12}/>} />
              </div>
            </div>

            {/* ══ STATS AVANCÉES ═══════════════════════════════════════════ */}
            {advStats.length > 0 && (
              <div>
                <p className="category-header mb-2">{t("players.advancedStats")}</p>
                <div className="grid grid-cols-4 gap-2">
                  {advStats.map(({ label, value, color, icon }) => (
                    <StatCard key={label} label={label} value={value} color={color} icon={icon} />
                  ))}
                </div>
              </div>
            )}

            {/* ══ GRAPHIQUE D'ÉVOLUTION ════════════════════════════════════ */}
            {(evoData.length > 1 || monthlyData.length > 1) && (
              <div className="rounded-lg p-4" style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <p className="category-header">{t("players.evolution")}</p>
                  <div className="flex gap-1 rounded p-0.5" style={{ background: "var(--bg)" }}>
                    {(["match", "monthly"] as const).map((v) => (
                      <button key={v} onClick={() => setChartView(v)}
                        className="px-2.5 py-1 rounded text-[10px] font-semibold transition-all cursor-pointer"
                        style={chartView === v
                          ? { background: "var(--accent)", color: "#fff" }
                          : { color: "var(--muted)", background: "transparent" }}>
                        {v === "match" ? "Par match" : "Par mois"}
                      </button>
                    ))}
                  </div>
                </div>

                {chartView === "match" && (
                  <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                    {(["rating", "goals", "assists"] as const).map((s) => (
                      <button key={s} onClick={() => setEvoStat(s)}
                        className="px-2.5 py-1 rounded text-[10px] font-semibold transition-all cursor-pointer"
                        style={evoStat === s
                          ? { background: "var(--accent)", border: "1px solid var(--accent)", color: "#fff" }
                          : { background: "var(--bg)", border: "1px solid var(--border)", color: "var(--muted)" }}>
                        {s === "rating" ? t("players.rating") : s === "goals" ? t("players.goals") : t("players.assistsShort")}
                      </button>
                    ))}
                    {evoStat === "rating" && evoData.length >= 3 && (
                      <button onClick={() => setShowTrend(v => !v)}
                        className="px-2.5 py-1 rounded text-[10px] font-semibold transition-all cursor-pointer"
                        style={showTrend
                          ? { background: "#8b5cf618", border: "1px solid #8b5cf655", color: "#c4b5fd" }
                          : { background: "var(--bg)", border: "1px solid var(--border)", color: "var(--muted)" }}>
                        📈 Tendance
                      </button>
                    )}
                  </div>
                )}

                {chartView === "match" && evoData.length > 1 && (
                  <>
                    <ResponsiveContainer width="100%" height={150}>
                      <LineChart data={trendChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="match" tick={{ fill: "var(--muted)", fontSize: 9 }} />
                        <YAxis tick={{ fill: "var(--muted)", fontSize: 9 }} domain={evoStat === "rating" ? [0, 10] : [0, "auto"]} />
                        <Tooltip
                          contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 11 }}
                          labelStyle={{ color: "var(--muted)" }}
                          formatter={(v: unknown, name: unknown) => {
                            const n = Number(v); if (isNaN(n)) return [null, String(name)];
                            const nameStr = String(name ?? "");
                            const label = nameStr === "trendValue" ? "Tendance" : nameStr === "projected" ? "Projection"
                              : evoStat === "rating" ? t("players.rating") : evoStat === "goals" ? t("players.goals") : t("players.assistsShort");
                            return [evoStat === "rating" ? n.toFixed(1) : n, label];
                          }}
                          labelFormatter={(_l: unknown, payload: unknown) => {
                            const p = payload as Array<{ payload?: { date?: string } }>;
                            return p?.[0]?.payload?.date ?? "";
                          }}
                        />
                        <Line type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3, fill: "var(--accent)" }} connectNulls={false} />
                        {showTrend && evoStat === "rating" && (
                          <Line type="monotone" dataKey="trendValue" stroke="#8b5cf6" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                        )}
                        {showTrend && evoStat === "rating" && (
                          <Line type="monotone" dataKey="projected" stroke="#8b5cf6" strokeWidth={1.5} strokeDasharray="2 2" dot={{ r: 2, fill: "#8b5cf6" }} connectNulls={false} />
                        )}
                        {showTrend && evoData.length > 0 && (
                          <ReferenceLine x={`M${evoData.length}`} stroke="var(--border)" strokeDasharray="3 3" />
                        )}
                      </LineChart>
                    </ResponsiveContainer>

                    {showTrend && trendSummary && (
                      <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                          <span className="font-bold" style={{ color: trendSummary.dirColor }}>{trendSummary.direction}</span>
                          <span style={{ color: "var(--muted)" }}>Moy. 5 derniers : <strong style={{ color: "var(--text)" }}>{trendSummary.avg5}</strong></span>
                          <span style={{ color: "var(--muted)" }}>Projection : <strong style={{ color: "#c4b5fd" }}>{trendSummary.projectedAvg}</strong></span>
                          <span style={{ color: "var(--muted)" }}>Pente : <strong style={{ color: "var(--text)" }}>{trendSummary.slope > 0 ? "+" : ""}{trendSummary.slope}</strong> / match</span>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {chartView === "monthly" && monthlyData.length > 0 && (
                  <>
                    <ResponsiveContainer width="100%" height={190}>
                      <BarChart data={monthlyData} margin={{ top: 4, right: 4, bottom: 4, left: -10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="month" tick={{ fill: "var(--muted)", fontSize: 8 }} />
                        <YAxis yAxisId="left" tick={{ fill: "var(--muted)", fontSize: 8 }} />
                        <YAxis yAxisId="right" orientation="right" domain={[0, 10]} tick={{ fill: "var(--muted)", fontSize: 8 }} />
                        <Tooltip
                          contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 11 }}
                          formatter={(v: unknown, name: unknown) => {
                            const labels: Record<string, string> = { goals: "Buts", assists: "PD", rating: "Note moy", games: "MJ" };
                            return [Number(v), labels[String(name ?? "")] ?? String(name)];
                          }}
                        />
                        <Bar yAxisId="left" dataKey="goals"   fill="var(--accent)" opacity={0.9} radius={[2,2,0,0]} />
                        <Bar yAxisId="left" dataKey="assists" fill="#8b5cf6"        opacity={0.8} radius={[2,2,0,0]} />
                        <Bar yAxisId="left" dataKey="games"   fill="var(--border)"  opacity={0.6} radius={[2,2,0,0]} />
                        <Line yAxisId="right" type="monotone" dataKey="rating" stroke="var(--gold)" strokeWidth={2} dot={{ r: 3, fill: "var(--gold)" }} />
                      </BarChart>
                    </ResponsiveContainer>
                    <p className="text-[9px] text-center mt-1" style={{ color: "var(--muted)" }}>{monthlyData.length} mois · tous types de matchs</p>
                  </>
                )}
              </div>
            )}

            {/* ══ COMPARAISON DE PÉRIODES ══════════════════════════════════ */}
            <div>
              <button
                onClick={() => setShowPeriods(v => !v)}
                className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg text-[11px] font-['Bebas_Neue'] tracking-widest transition-all cursor-pointer"
                style={showPeriods
                  ? { background: "var(--active)", border: "1px solid var(--accent)", color: "var(--accent)" }
                  : { background: "var(--surface)", border: "1px solid var(--border)", color: "var(--muted)" }}>
                <span>COMPARER 2 PÉRIODES</span>
                <span className="text-xs">{showPeriods ? "▲" : "▼"}</span>
              </button>

              {showPeriods && (() => {
                const statsA = computePeriodStats(periodA.start, periodA.end);
                const statsB = computePeriodStats(periodB.start, periodB.end);
                const arrow = (a: number, b: number) =>
                  a === 0 && b === 0 ? { icon: "→", cls: "" }
                  : a > b            ? { icon: "↑", cls: "text-green-400" }
                  : a < b            ? { icon: "↓", cls: "text-red-400" }
                  :                    { icon: "=", cls: "text-yellow-400" };

                const ROWS: { label: string; key: keyof NonNullable<typeof statsA> }[] = [
                  { label: "Matchs joués", key: "games" },
                  { label: "Buts",         key: "goals" },
                  { label: "Passes D.",    key: "assists" },
                  { label: "MOTM",         key: "motm" },
                  { label: "Note moy.",    key: "avgRating" },
                ];

                const DateInput = ({ label, field, period, setter }: {
                  label: string; field: "start" | "end";
                  period: typeof periodA; setter: typeof setPeriodA;
                }) => (
                  <div className="flex-1">
                    <p className="text-[9px] mb-1" style={{ color: "var(--muted)" }}>{label}</p>
                    <input type="date" value={period[field]}
                      onChange={e => setter(p => ({ ...p, [field]: e.target.value }))}
                      className="w-full rounded px-2 py-1.5 text-[11px] outline-none"
                      style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)", colorScheme: "dark" }}
                      onFocus={e => { e.target.style.borderColor = "var(--accent)"; }}
                      onBlur={e => { e.target.style.borderColor = "var(--border)"; }} />
                  </div>
                );

                return (
                  <div className="mt-2 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg p-3" style={{ background: "var(--surface)", border: "1px solid var(--accent)33" }}>
                        <p className="font-['Bebas_Neue'] text-[10px] tracking-widest mb-2" style={{ color: "var(--accent)" }}>PÉRIODE A</p>
                        <div className="flex gap-2">
                          <DateInput label="Début" field="start" period={periodA} setter={setPeriodA} />
                          <DateInput label="Fin"   field="end"   period={periodA} setter={setPeriodA} />
                        </div>
                      </div>
                      <div className="rounded-lg p-3" style={{ background: "var(--surface)", border: "1px solid #8b5cf633" }}>
                        <p className="font-['Bebas_Neue'] text-[10px] tracking-widest mb-2" style={{ color: "#c4b5fd" }}>PÉRIODE B</p>
                        <div className="flex gap-2">
                          <DateInput label="Début" field="start" period={periodB} setter={setPeriodB} />
                          <DateInput label="Fin"   field="end"   period={periodB} setter={setPeriodB} />
                        </div>
                      </div>
                    </div>

                    {(statsA || statsB) && (
                      <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                        <div className="grid grid-cols-[1fr_auto_auto_auto] text-[9px] font-['Bebas_Neue'] tracking-widest"
                          style={{ background: "var(--card)" }}>
                          <div className="px-3 py-2" style={{ color: "var(--muted)" }}>STAT</div>
                          <div className="px-4 py-2 text-center" style={{ color: "var(--accent)" }}>A</div>
                          <div className="px-3 py-2 text-center" style={{ color: "var(--muted)" }}></div>
                          <div className="px-4 py-2 text-center" style={{ color: "#c4b5fd" }}>B</div>
                        </div>
                        {ROWS.map(({ label, key }) => {
                          const a = statsA?.[key] ?? 0, b = statsB?.[key] ?? 0;
                          const { icon, cls } = arrow(Number(a), Number(b));
                          return (
                            <div key={key} className="grid grid-cols-[1fr_auto_auto_auto] items-center"
                              style={{ borderTop: "1px solid var(--border)" }}>
                              <div className="px-3 py-2 text-xs" style={{ color: "var(--text)" }}>{label}</div>
                              <div className="px-4 py-2 font-['Bebas_Neue'] text-sm text-cyan-400 text-center min-w-[48px]">
                                {statsA ? String(key === "avgRating" ? Number(a).toFixed(1) : a) : "—"}
                              </div>
                              <div className={`px-2 py-2 text-sm font-bold text-center ${cls}`}>{icon}</div>
                              <div className="px-4 py-2 font-['Bebas_Neue'] text-sm text-violet-400 text-center min-w-[48px]">
                                {statsB ? String(key === "avgRating" ? Number(b).toFixed(1) : b) : "—"}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {!statsA && !statsB && (periodA.start || periodB.start) && (
                      <p className="text-xs text-center py-2" style={{ color: "var(--muted)" }}>
                        Aucune donnée trouvée pour {player.name} dans ces plages.
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      {showPdfModal && (
        <PdfSaveModal
          filename={getPlayerPdfFilename(player.name)}
          onConfirm={async () => {
            setShowPdfModal(false); setExporting(true);
            try { await generatePlayerPdf(player, posLabel, allEvoData.rating, monthlyData); }
            finally { setExporting(false); }
          }}
          onCancel={() => setShowPdfModal(false)}
        />
      )}
      {showCardModal && (
        <PlayerCardModal
          player={player} posLabel={posLabel}
          clubName={currentClub?.name ?? "ProStatClub"}
          onClose={() => setShowCardModal(false)}
        />
      )}
    </>
  );
}
