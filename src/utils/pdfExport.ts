import type { Session, Match, Player, ClubData } from "../types";


export function getSessionPdfFilename(session: Session): string {
  return `session-${session.clubName.replace(/\s+/g, "_")}-${new Date(session.date).toISOString().slice(0, 10)}.pdf`;
}

export function getPlayerPdfFilename(playerName: string): string {
  return `${playerName.replace(/\s+/g, "_")}_fiche.pdf`;
}

interface PlayerMvp { name: string; goals: number; assists: number; motm: number; games: number }

function aggregateSession(matches: Match[], clubId: string) {
  let goals = 0, assists = 0, passes = 0, tackles = 0, motm = 0;
  const players: Record<string, PlayerMvp> = {};

  for (const m of matches) {
    for (const clubPlayers of Object.values(m.players)) {
      for (const p of Object.values(clubPlayers as Record<string, Record<string, unknown>>)) {
        goals   += Number(p["goals"] ?? 0);
        assists += Number(p["assists"] ?? 0);
        passes  += Number(p["passesMade"] ?? p["passesmade"] ?? 0);
        tackles += Number(p["tacklesMade"] ?? p["tacklesmade"] ?? 0);
        if (p["mom"] === "1" || p["manofthematch"] === "1") motm++;
      }
    }
    const clubPlayers = m.players[clubId] as Record<string, Record<string, unknown>> | undefined;
    if (!clubPlayers) continue;
    for (const [pid, p] of Object.entries(clubPlayers)) {
      const name = String(p["name"] ?? p["playername"] ?? p["playerName"] ?? pid);
      if (!players[name]) players[name] = { name, goals: 0, assists: 0, motm: 0, games: 0 };
      players[name].goals   += Number(p["goals"] ?? 0);
      players[name].assists += Number(p["assists"] ?? 0);
      players[name].games   += 1;
      if (p["mom"] === "1" || p["manofthematch"] === "1") players[name].motm++;
    }
  }
  return { goals, assists, passes, tackles, motm, players: Object.values(players) };
}

// ─── jsPDF helpers ────────────────────────────────────────────────────────────

type DocLike = {
  setDrawColor: (r: number, g: number, b: number) => void;
  setFillColor: (r: number, g: number, b: number) => void;
  setLineWidth: (w: number) => void;
  setFontSize: (s: number) => void;
  setTextColor: (r: number, g: number, b: number) => void;
  line: (x1: number, y1: number, x2: number, y2: number) => void;
  circle: (x: number, y: number, r: number, style: string) => void;
  text: (text: string, x: number, y: number, opts?: Record<string, unknown>) => void;
  internal: { pageSize: { getHeight: () => number } };
};

/**
 * Draw a radar chart using jsPDF primitives.
 * axes: array of { label, value, max }
 */
function drawRadar(
  doc: DocLike,
  cx: number, cy: number, radius: number,
  axes: { label: string; value: number; max: number }[],
  accentR: number, accentG: number, accentB: number,
) {
  const n = axes.length;
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i: number, r: number): [number, number] => [
    cx + r * Math.cos(angle(i)),
    cy + r * Math.sin(angle(i)),
  ];

  // Background grid rings (5 levels)
  for (let lvl = 1; lvl <= 5; lvl++) {
    const r = (radius * lvl) / 5;
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.15);
    for (let i = 0; i < n; i++) {
      const [x1, y1] = pt(i, r);
      const [x2, y2] = pt((i + 1) % n, r);
      doc.line(x1, y1, x2, y2);
    }
  }

  // Axis spokes
  for (let i = 0; i < n; i++) {
    const [x, y] = pt(i, radius);
    doc.setDrawColor(160, 160, 160);
    doc.setLineWidth(0.2);
    doc.line(cx, cy, x, y);
    // Label
    const [lx, ly] = pt(i, radius + 8);
    doc.setFontSize(6.5);
    doc.setTextColor(80, 80, 80);
    doc.text(axes[i].label, lx, ly, { align: "center" });
    const val = axes[i].value;
    doc.setFontSize(6);
    doc.setTextColor(40, 40, 40);
    doc.text(String(val), lx, ly + 3.5, { align: "center" });
  }

  // Data polygon
  const dataPts: [number, number][] = axes.map((ax, i) => {
    const ratio = ax.max > 0 ? Math.min(ax.value / ax.max, 1) : 0;
    return pt(i, radius * ratio);
  });
  doc.setDrawColor(accentR, accentG, accentB);
  doc.setLineWidth(1);
  for (let i = 0; i < n; i++) {
    const [x1, y1] = dataPts[i];
    const [x2, y2] = dataPts[(i + 1) % n];
    doc.line(x1, y1, x2, y2);
  }
  // Dots at vertices
  doc.setFillColor(accentR, accentG, accentB);
  for (const [x, y] of dataPts) {
    doc.circle(x, y, 1.5, "F");
  }
}

/**
 * Draw a mini line chart using jsPDF primitives.
 * values: array of numbers, domain: [min, max]
 */
function drawLineChart(
  doc: DocLike,
  x: number, y: number, w: number, h: number,
  values: number[],
  domain: [number, number],
  accentR: number, accentG: number, accentB: number,
) {
  if (values.length < 2) return;
  const [minV, maxV] = domain;
  const range = maxV - minV || 1;

  const toX = (i: number) => x + (i / (values.length - 1)) * w;
  const toY = (v: number) => y + h - ((v - minV) / range) * h;

  // Axes
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.line(x, y, x, y + h);
  doc.line(x, y + h, x + w, y + h);

  // Horizontal grid + Y labels (4 levels)
  for (let lvl = 0; lvl <= 4; lvl++) {
    const gy = y + h - (lvl / 4) * h;
    const gv = minV + (lvl / 4) * range;
    doc.setDrawColor(210, 210, 210);
    doc.setLineWidth(0.1);
    doc.line(x, gy, x + w, gy);
    doc.setFontSize(5);
    doc.setTextColor(130, 130, 130);
    doc.text(gv.toFixed(1), x - 1, gy + 1, { align: "right" });
  }

  // Data line
  doc.setDrawColor(accentR, accentG, accentB);
  doc.setLineWidth(0.9);
  for (let i = 0; i < values.length - 1; i++) {
    doc.line(toX(i), toY(values[i]), toX(i + 1), toY(values[i + 1]));
  }

  // Data dots
  doc.setFillColor(accentR, accentG, accentB);
  for (let i = 0; i < values.length; i++) {
    doc.circle(toX(i), toY(values[i]), 0.9, "F");
  }

  // X-axis labels (every N to avoid clutter)
  const step = Math.max(1, Math.floor(values.length / 12));
  doc.setFontSize(5);
  doc.setTextColor(130, 130, 130);
  for (let i = 0; i < values.length; i += step) {
    doc.text(`M${i + 1}`, toX(i), y + h + 4, { align: "center" });
  }

  // Last value callout
  const lastX = toX(values.length - 1);
  const lastY = toY(values[values.length - 1]);
  doc.setFontSize(6);
  doc.setTextColor(accentR, accentG, accentB);
  doc.text(values[values.length - 1].toFixed(1), lastX + 2, lastY);
}

// ─── Session PDF ──────────────────────────────────────────────────────────────

export async function generateSessionPdf(session: Session) {
  const { default: jsPDF } = await import("jspdf");
  await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const accent: [number, number, number] = [0, 180, 220];
  const dark: [number, number, number] = [30, 35, 45];

  const stats = aggregateSession(session.matches, session.clubId);
  const dateStr = new Date(session.date).toLocaleString();
  const wins = session.matches.filter((m) => {
    const cd = m.clubs[session.clubId] as Record<string, unknown> | undefined;
    return cd?.["matchResult"] === "win";
  }).length;
  const losses = session.matches.filter((m) => {
    const cd = m.clubs[session.clubId] as Record<string, unknown> | undefined;
    return cd?.["matchResult"] === "loss";
  }).length;
  const draws = session.matches.length - wins - losses;

  doc.setFillColor(...dark);
  doc.rect(0, 0, 210, 36, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.text(session.clubName, 14, 18);
  doc.setFontSize(11);
  doc.setTextColor(...accent);
  doc.text(`Session du ${dateStr}`, 14, 28);

  let y = 44;
  doc.setFillColor(240, 242, 245);
  doc.rect(10, y - 4, 190, 18, "F");
  const kpis = [
    { label: "Matchs", value: String(session.matches.length) },
    { label: "V/N/D",  value: `${wins}/${draws}/${losses}` },
    { label: "Buts",   value: String(stats.goals) },
    { label: "PD",     value: String(stats.assists) },
    { label: "Passes", value: String(stats.passes) },
    { label: "MOTM",   value: String(stats.motm) },
  ];
  const kpiW = 190 / kpis.length;
  kpis.forEach(({ label, value }, i) => {
    const x = 10 + i * kpiW + kpiW / 2;
    doc.setFontSize(14);
    doc.setTextColor(...dark);
    doc.text(value, x, y + 4, { align: "center" });
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(label, x, y + 10, { align: "center" });
  });

  y = 70;
  doc.setFontSize(13);
  doc.setTextColor(...dark);
  doc.text("Meilleurs Joueurs", 14, y);
  y += 4;

  const sorted = [...stats.players].sort((a, b) => b.goals - a.goals);
  if (sorted.length > 0) {
    (doc as unknown as { autoTable: (opts: unknown) => void }).autoTable({
      startY: y,
      margin: { left: 14, right: 14 },
      head: [["Joueur", "MJ", "Buts", "PD", "MOTM"]],
      body: sorted.slice(0, 11).map((p) => [p.name, p.games, p.goals, p.assists, p.motm]),
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: accent, textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 247, 250] },
    });
  }

  const afterTable = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 10;
  let matchY = afterTable + 10;
  doc.setFontSize(13);
  doc.setTextColor(...dark);
  doc.text("Matchs Joués", 14, matchY);
  matchY += 4;

  const matchRows = session.matches.map((m) => {
    const cd = m.clubs[session.clubId] as Record<string, unknown> | undefined;
    const result = String(cd?.["matchResult"] ?? "");
    const goals  = String(cd?.["goals"] ?? "?");
    const r = result === "win" ? "V" : result === "loss" ? "D" : "N";
    const ts = Number(m.timestamp);
    const date = ts > 0 ? new Date(ts * 1000).toLocaleTimeString() : "";
    return [r, goals + " but(s)", m.matchType, date];
  });

  (doc as unknown as { autoTable: (opts: unknown) => void }).autoTable({
    startY: matchY,
    margin: { left: 14, right: 14 },
    head: [["Rés.", "Score", "Type", "Heure"]],
    body: matchRows,
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: accent, textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 247, 250] },
  });

  const pageH = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(160, 160, 160);
  doc.text("ProClubs Stats — Généré automatiquement", 105, pageH - 8, { align: "center" });

  doc.save(`session-${session.clubName.replace(/\s+/g, "_")}-${new Date(session.date).toISOString().slice(0, 10)}.pdf`);
}

// ─── Player PDF (enrichi) ─────────────────────────────────────────────────────

interface MonthlyData {
  month: string;
  goals: number;
  assists: number;
  rating: number;
  games: number;
}

export async function generatePlayerPdf(
  player: Player,
  posLabel: string,
  ratingHistory: number[],
  monthlyData?: MonthlyData[],
) {
  const { default: jsPDF } = await import("jspdf");
  await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const [aR, aG, aB]: [number, number, number] = [0, 180, 220];
  const dark: [number, number, number] = [30, 35, 45];

  // ── Page 1: header + stats + radar ──────────────────────────────────────

  // Header band
  doc.setFillColor(...dark);
  doc.rect(0, 0, 210, 40, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.text(player.name, 14, 20);
  doc.setFontSize(12);
  doc.setTextColor(aR, aG, aB);
  doc.text(posLabel, 14, 32);
  if (player.rating > 0) {
    doc.setFontSize(11);
    doc.setTextColor(255, 200, 50);
    doc.text(`Note moy. ${player.rating.toFixed(1)} ★`, 196, 32, { align: "right" });
  }

  // Stats table (left column)
  const rows: [string, string][] = [
    ["Matchs joués",    String(player.gamesPlayed)],
    ["Buts",            String(player.goals)],
    ["Passes décisives",String(player.assists)],
    ["Passes réussies", String(player.passesMade)],
    ["Tacles",          String(player.tacklesMade)],
    ["MOTM",            String(player.motm)],
    ["Note moyenne",    player.rating > 0 ? player.rating.toFixed(1) : "—"],
  ];
  if (player.shotsOnTarget)  rows.push(["Tirs cadrés",   String(player.shotsOnTarget)]);
  if (player.interceptions)  rows.push(["Interceptions",  String(player.interceptions)]);
  if (player.foulsCommitted) rows.push(["Fautes",         String(player.foulsCommitted)]);
  if (player.yellowCards)    rows.push(["Cartons jaunes", String(player.yellowCards)]);
  if (player.redCards)       rows.push(["Cartons rouges", String(player.redCards)]);
  if (player.cleanSheets)    rows.push(["Clean sheets",   String(player.cleanSheets)]);
  if (player.saveAttempts)   rows.push(["Arrêts GK",      String(player.saveAttempts)]);

  (doc as unknown as { autoTable: (opts: unknown) => void }).autoTable({
    startY: 48,
    margin: { left: 14, right: 110 },
    head: [["Statistique", "Valeur"]],
    body: rows,
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: [aR, aG, aB], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: { 1: { halign: "center" as const, fontStyle: "bold" as const } },
  });

  // Radar chart (right column, next to stats table)
  const radarCx = 165, radarCy = 85, radarR = 38;

  // Normalize radar axes relative to 90th-percentile typical values
  const radarAxes = [
    { label: "Buts",   value: player.goals,        max: Math.max(player.goals * 2, 30) },
    { label: "PD",     value: player.assists,       max: Math.max(player.assists * 2, 20) },
    { label: "Passes", value: player.passesMade,    max: Math.max(player.passesMade * 2, 200) },
    { label: "Tacles", value: player.tacklesMade,   max: Math.max(player.tacklesMade * 2, 100) },
    { label: "MOTM",   value: player.motm,          max: Math.max(player.motm * 2, 10) },
    { label: "Note",   value: player.rating > 0 ? player.rating * 10 : 0, max: 100 },
  ];

  doc.setFontSize(8);
  doc.setTextColor(...dark);
  doc.text("RADAR PERFORMANCES", radarCx, 52, { align: "center" });

  drawRadar(doc as unknown as DocLike, radarCx, radarCy, radarR, radarAxes, aR, aG, aB);

  // ── Rating evolution line chart ───────────────────────────────────────────

  const afterStatsY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 130;
  const chartY = Math.max(afterStatsY + 10, 135);

  if (ratingHistory.length > 1) {
    doc.setFontSize(10);
    doc.setTextColor(...dark);
    doc.text("ÉVOLUTION DE LA NOTE PAR MATCH", 14, chartY);

    const minR = Math.max(0, Math.min(...ratingHistory) - 0.5);
    const maxR = Math.min(10, Math.max(...ratingHistory) + 0.5);

    drawLineChart(
      doc as unknown as DocLike,
      18, chartY + 6, 174, 38,
      ratingHistory, [minR, maxR],
      aR, aG, aB,
    );

    // Trend annotation
    if (ratingHistory.length >= 3) {
      const n = ratingHistory.length;
      const xMean = (n - 1) / 2;
      const yMean = ratingHistory.reduce((a, b) => a + b, 0) / n;
      let num = 0, den = 0;
      ratingHistory.forEach((y2, x) => { num += (x - xMean) * (y2 - yMean); den += (x - xMean) ** 2; });
      const slope = den !== 0 ? num / den : 0;
      const avg5 = ratingHistory.slice(-5).reduce((a, b) => a + b, 0) / Math.min(5, ratingHistory.length);
      const direction = slope > 0.05 ? "↑ En progression" : slope < -0.05 ? "↓ En baisse" : "→ Stable";
      doc.setFontSize(7);
      doc.setTextColor(aR, aG, aB);
      doc.text(`Tendance : ${direction}  |  Moy. 5 derniers : ${avg5.toFixed(1)}  |  Pente : ${slope > 0 ? "+" : ""}${slope.toFixed(3)}/match`, 18, chartY + 50);
    }
  }

  // ── Monthly breakdown table (page 2 if data available) ────────────────────

  const hasMonthly = monthlyData && monthlyData.length > 0;
  const hasEvoTable = ratingHistory.length > 1;

  if (hasEvoTable || hasMonthly) {
    const currentY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
    const sectionY = ratingHistory.length > 1 ? (chartY + 60) : (currentY ? currentY + 10 : 160);

    if (hasMonthly) {
      const monthY = sectionY + 6;
      if (monthY > 240) {
        (doc as unknown as { addPage: () => void }).addPage();
        doc.setFontSize(10);
        doc.setTextColor(...dark);
        doc.text("ÉVOLUTION MENSUELLE", 14, 20);
        (doc as unknown as { autoTable: (opts: unknown) => void }).autoTable({
          startY: 26,
          margin: { left: 14, right: 14 },
          head: [["Mois", "MJ", "Buts", "PD", "Note moy."]],
          body: monthlyData!.map((m) => [m.month, m.games, m.goals, m.assists, m.rating > 0 ? m.rating.toFixed(1) : "—"]),
          styles: { fontSize: 9, cellPadding: 2.5 },
          headStyles: { fillColor: [aR, aG, aB], textColor: [255, 255, 255], fontStyle: "bold" },
          alternateRowStyles: { fillColor: [245, 247, 250] },
          columnStyles: { 0: { fontStyle: "bold" as const } },
        });
      } else {
        doc.setFontSize(10);
        doc.setTextColor(...dark);
        doc.text("ÉVOLUTION MENSUELLE", 14, monthY);
        (doc as unknown as { autoTable: (opts: unknown) => void }).autoTable({
          startY: monthY + 4,
          margin: { left: 14, right: 14 },
          head: [["Mois", "MJ", "Buts", "PD", "Note moy."]],
          body: monthlyData!.map((m) => [m.month, m.games, m.goals, m.assists, m.rating > 0 ? m.rating.toFixed(1) : "—"]),
          styles: { fontSize: 9, cellPadding: 2.5 },
          headStyles: { fillColor: [aR, aG, aB], textColor: [255, 255, 255], fontStyle: "bold" },
          alternateRowStyles: { fillColor: [245, 247, 250] },
          columnStyles: { 0: { fontStyle: "bold" as const } },
        });
      }
    }
  }

  // ── Footer on all pages ───────────────────────────────────────────────────

  const totalPages = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    (doc as unknown as { setPage: (n: number) => void }).setPage(i);
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFontSize(7);
    doc.setTextColor(160, 160, 160);
    doc.text(`ProClubs Stats — Fiche joueur · Page ${i}/${totalPages}`, 105, pageH - 7, { align: "center" });
  }

  doc.save(`${player.name.replace(/\s+/g, "_")}_fiche.pdf`);
}

// ─── Club Comparison PDF ───────────────────────────────────────────────────────

interface CompareH2H {
  date: string;
  scoreA: number;
  scoreB: number;
}

export async function generateComparePdf(
  clubs: ClubData[],
  h2hMatches?: CompareH2H[],
  saveAs?: string,
) {
  const { default: jsPDF } = await import("jspdf");
  await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const accent: [number, number, number] = [0, 180, 220];
  const dark: [number, number, number] = [30, 35, 45];
  const CLUB_COLORS_HEX = ["#00d4ff", "#8b5cf6", "#ff6b35", "#57f287"];

  const dateStr = new Date().toLocaleDateString();
  const names = clubs.map(c => c.club.name || `Club #${c.club.id}`);

  // ── Header band ──────────────────────────────────────────────────────────────
  doc.setFillColor(...dark);
  doc.rect(0, 0, 210, 38, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.text("COMPARAISON DE CLUBS", 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(...accent);
  doc.text(names.join("  vs  "), 14, 29);
  doc.setFontSize(8);
  doc.setTextColor(160, 180, 200);
  doc.text(`Rapport généré le ${dateStr}`, 196, 34, { align: "right" });

  // ── Club color legend ────────────────────────────────────────────────────────
  let y = 46;
  clubs.forEach((c, i) => {
    const hex = CLUB_COLORS_HEX[i % CLUB_COLORS_HEX.length];
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    doc.setFillColor(r, g, b);
    doc.rect(14 + i * 52, y, 10, 3, "F");
    doc.setFontSize(8);
    doc.setTextColor(...dark);
    doc.text(c.club.name || `Club #${c.club.id}`, 26 + i * 52, y + 2.5);
  });
  y += 10;

  // ── Stats table ──────────────────────────────────────────────────────────────
  doc.setFontSize(12);
  doc.setTextColor(...dark);
  doc.text("Statistiques comparées", 14, y);
  y += 4;

  type StatRow = { label: string; values: string[]; lowerBetter?: boolean };
  const statRows: StatRow[] = clubs[0] ? [
    {
      label: "Skill Rating",
      values: clubs.map(c => c.club.skillRating ?? "—"),
    },
    {
      label: "Victoires",
      values: clubs.map(c => String(c.club.wins)),
    },
    {
      label: "Nuls",
      values: clubs.map(c => String(c.club.ties)),
    },
    {
      label: "Défaites",
      values: clubs.map(c => String(c.club.losses)),
      lowerBetter: true,
    },
    {
      label: "% Victoires",
      values: clubs.map(c => {
        const t = c.club.wins + c.club.losses + c.club.ties;
        return t > 0 ? ((c.club.wins / t) * 100).toFixed(1) + "%" : "—";
      }),
    },
    {
      label: "Buts",
      values: clubs.map(c => String(c.club.goals)),
    },
    {
      label: "Buts/Match",
      values: clubs.map(c => {
        const t = c.club.wins + c.club.losses + c.club.ties;
        return t > 0 ? (c.club.goals / t).toFixed(2) : "—";
      }),
    },
    {
      label: "Joueurs",
      values: clubs.map(c => String(c.players.length)),
    },
    {
      label: "Note moy. joueurs",
      values: clubs.map(c => {
        const n = c.players.length;
        if (!n) return "—";
        const avg = c.players.reduce((s, p) => s + p.rating, 0) / n;
        return avg > 0 ? avg.toFixed(2) : "—";
      }),
    },
    {
      label: "MOTM total",
      values: clubs.map(c => String(c.players.reduce((s, p) => s + p.motm, 0))),
    },
  ] : [];

  const tableHead = [["Statistique", ...names]];
  const tableBody = statRows.map(row => {
    const nums = row.values.map(v => parseFloat(v.replace("%", "")));
    const allNum = nums.every(n => !isNaN(n));
    const maxV = allNum ? Math.max(...nums) : null;
    const minV = allNum ? Math.min(...nums) : null;
    return [
      row.label,
      ...row.values.map((v, i) => {
        const n = nums[i];
        const wins = allNum && !isNaN(n) && maxV !== minV &&
          (row.lowerBetter ? n === minV : n === maxV);
        return wins ? `★ ${v}` : v;
      }),
    ];
  });

  (doc as unknown as { autoTable: (opts: unknown) => void }).autoTable({
    startY: y,
    margin: { left: 14, right: 14 },
    head: tableHead,
    body: tableBody,
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: accent, textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: { 0: { fontStyle: "bold" as const } },
  });

  const afterStats = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 10;

  // ── Radar chart ──────────────────────────────────────────────────────────────
  const radarY = afterStats + 12;
  const pageH = doc.internal.pageSize.getHeight();

  if (radarY + 70 < pageH - 20) {
    doc.setFontSize(12);
    doc.setTextColor(...dark);
    doc.text("Radar des performances", 14, radarY);

    // Compute radar stats per club
    const radarStatsList = clubs.map(c => {
      const t = c.club.wins + c.club.losses + c.club.ties;
      const n = c.players.length;
      return {
        winPct: t > 0 ? (c.club.wins / t) * 100 : 0,
        goalsPerGame: t > 0 ? c.club.goals / t : 0,
        avgRating: n > 0 ? c.players.reduce((s, p) => s + p.rating, 0) / n : 0,
        totalMotm: c.players.reduce((s, p) => s + p.motm, 0),
        avgTackles: n > 0 ? c.players.reduce((s, p) => s + p.tacklesMade, 0) / n : 0,
      };
    });

    const radarKeys: { key: keyof typeof radarStatsList[0]; label: string }[] = [
      { key: "winPct", label: "V%" },
      { key: "goalsPerGame", label: "Buts/M" },
      { key: "avgRating", label: "Note" },
      { key: "totalMotm", label: "MOTM" },
      { key: "avgTackles", label: "Tacles" },
    ];

    // Draw one radar per club (overlaid)
    const cx = 105;
    const cy = radarY + 40;
    const radius = 32;
    const n = radarKeys.length;
    const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const pt = (i: number, r: number): [number, number] => [
      cx + r * Math.cos(angle(i)),
      cy + r * Math.sin(angle(i)),
    ];

    // Grid rings
    for (let lvl = 1; lvl <= 4; lvl++) {
      const r = (radius * lvl) / 4;
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.15);
      for (let i = 0; i < n; i++) {
        const [x1, y1] = pt(i, r);
        const [x2, y2] = pt((i + 1) % n, r);
        doc.line(x1, y1, x2, y2);
      }
    }

    // Axis labels
    radarKeys.forEach(({ label }, i) => {
      const [x, y2] = pt(i, radius + 8);
      doc.setDrawColor(150, 150, 150);
      doc.setLineWidth(0.2);
      const [lx, ly] = pt(i, radius);
      doc.line(cx, cy, lx, ly);
      doc.setFontSize(6.5);
      doc.setTextColor(80, 80, 80);
      doc.text(label, x, y2, { align: "center" });
    });

    // Club data polygons
    clubs.forEach((_, ci) => {
      const clubStats = radarStatsList[ci];
      const maxVals = radarKeys.map(({ key }) =>
        Math.max(...radarStatsList.map(s => s[key] as number), 1)
      );
      const hex = CLUB_COLORS_HEX[ci % CLUB_COLORS_HEX.length];
      const cr = parseInt(hex.slice(1, 3), 16);
      const cg = parseInt(hex.slice(3, 5), 16);
      const cb = parseInt(hex.slice(5, 7), 16);

      const dataPts: [number, number][] = radarKeys.map(({ key }, i) => {
        const ratio = maxVals[i] > 0 ? Math.min((clubStats[key] as number) / maxVals[i], 1) : 0;
        return pt(i, radius * ratio);
      });

      doc.setDrawColor(cr, cg, cb);
      doc.setLineWidth(0.8);
      for (let i = 0; i < n; i++) {
        const [x1, y1] = dataPts[i];
        const [x2, y2] = dataPts[(i + 1) % n];
        doc.line(x1, y1, x2, y2);
      }
      doc.setFillColor(cr, cg, cb);
      for (const [x, y2] of dataPts) {
        doc.circle(x, y2, 1.2, "F");
      }
    });

    // Radar legend
    clubs.forEach((c, ci) => {
      const hex = CLUB_COLORS_HEX[ci % CLUB_COLORS_HEX.length];
      const cr = parseInt(hex.slice(1, 3), 16);
      const cg = parseInt(hex.slice(3, 5), 16);
      const cb = parseInt(hex.slice(5, 7), 16);
      doc.setFillColor(cr, cg, cb);
      doc.rect(14 + ci * 50, cy + radius + 14, 8, 2.5, "F");
      doc.setFontSize(7.5);
      doc.setTextColor(...dark);
      doc.text(c.club.name || `Club #${c.club.id}`, 24 + ci * 50, cy + radius + 16);
    });
  } else {
    // New page for radar
    (doc as unknown as { addPage: () => void }).addPage();
    doc.setFontSize(12);
    doc.setTextColor(...dark);
    doc.text("Radar des performances", 14, 20);
  }

  // ── H2H section ──────────────────────────────────────────────────────────────
  if (h2hMatches && h2hMatches.length > 0 && clubs.length >= 2) {
    (doc as unknown as { addPage: () => void }).addPage();
    doc.setFillColor(...dark);
    doc.rect(0, 0, 210, 20, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.text(`H2H — ${clubs[0].club.name} vs ${clubs[1].club.name}`, 14, 13);

    let wins = 0, losses = 0, draws = 0;
    h2hMatches.forEach(m => {
      if (m.scoreA > m.scoreB) wins++;
      else if (m.scoreA < m.scoreB) losses++;
      else draws++;
    });

    const kpiH2H = [
      { label: "Victoires", val: wins, color: accent },
      { label: "Nuls", val: draws, color: [140, 140, 140] as [number, number, number] },
      { label: "Défaites", val: losses, color: [218, 55, 60] as [number, number, number] },
      { label: "Total matchs", val: h2hMatches.length, color: [80, 80, 80] as [number, number, number] },
    ];

    const kpiW = 182 / kpiH2H.length;
    doc.setFillColor(240, 242, 245);
    doc.rect(14, 24, 182, 18, "F");
    kpiH2H.forEach(({ label, val, color }, i) => {
      const kx = 14 + i * kpiW + kpiW / 2;
      doc.setFontSize(16);
      doc.setTextColor(...color);
      doc.text(String(val), kx, 34, { align: "center" });
      doc.setFontSize(7);
      doc.setTextColor(100, 100, 100);
      doc.text(label, kx, 39, { align: "center" });
    });

    (doc as unknown as { autoTable: (opts: unknown) => void }).autoTable({
      startY: 50,
      margin: { left: 14, right: 14 },
      head: [[clubs[0].club.name, "Score", clubs[1].club.name, "Date"]],
      body: h2hMatches.map(m => [
        m.scoreA > m.scoreB ? `★ ${clubs[0].club.name}` : clubs[0].club.name,
        `${m.scoreA} – ${m.scoreB}`,
        m.scoreA < m.scoreB ? `★ ${clubs[1].club.name}` : clubs[1].club.name,
        m.date,
      ]),
      styles: { fontSize: 8.5, cellPadding: 2 },
      headStyles: { fillColor: dark, textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      columnStyles: { 1: { halign: "center" as const, fontStyle: "bold" as const } },
    });
  }

  // ── Footer on all pages ───────────────────────────────────────────────────────
  const totalPages = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    (doc as unknown as { setPage: (n: number) => void }).setPage(i);
    const ph = doc.internal.pageSize.getHeight();
    doc.setFontSize(7);
    doc.setTextColor(160, 160, 160);
    doc.text(`ProClubs Stats — Comparaison de clubs · Page ${i}/${totalPages}`, 105, ph - 7, { align: "center" });
  }

  const filename = saveAs ||
    `comparaison_${clubs.map(c => c.club.name.replace(/\s+/g, "_")).join("_vs_")}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}

// ─── Rapport hebdomadaire PDF ─────────────────────────────────────────────────

export async function generateWeeklyReport(
  sessions: Session[],
  clubName: string,
  weekStart?: Date,
) {
  const { default: jsPDF } = await import("jspdf");
  await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const accent: [number, number, number] = [0, 180, 220];
  const dark: [number, number, number] = [30, 35, 45];

  // Determine week range (Mon–Sun)
  const now = weekStart ?? new Date();
  const dayOfWeek = now.getDay(); // 0=Sun
  const diffToMon = (dayOfWeek === 0 ? -6 : 1 - dayOfWeek);
  const mon = new Date(now); mon.setDate(now.getDate() + diffToMon); mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23, 59, 59, 999);

  // Filter sessions for the week
  const weekSessions = sessions.filter((s) => {
    const d = new Date(s.date);
    return d >= mon && d <= sun;
  });

  // Aggregate
  let totalMatches = 0, wins = 0, draws = 0, losses = 0, goals = 0, assists = 0;
  const playerMap = new Map<string, { goals: number; assists: number; motm: number; games: number }>();

  for (const s of weekSessions) {
    totalMatches += s.matches.length;
    for (const m of s.matches) {
      const cd = m.clubs[s.clubId] as Record<string, unknown> | undefined;
      if (!cd) continue;
      if (String(cd.matchResult) === "win")       wins++;
      else if (String(cd.matchResult) === "loss")  losses++;
      else                                         draws++;
      // Player stats
      const playersObj = m.players?.[s.clubId];
      if (playersObj) {
        for (const p of Object.values(playersObj)) {
          const name = String(p.name ?? p.playername ?? p.playerName ?? "?");
          const cur = playerMap.get(name) ?? { goals: 0, assists: 0, motm: 0, games: 0 };
          const g = Number(p.goals ?? 0); const a = Number(p.assists ?? 0);
          const mm = Number(p.manOfTheMatch ?? 0);
          cur.goals += g; cur.assists += a; cur.motm += mm; cur.games += 1;
          goals += g; assists += a;
          playerMap.set(name, cur);
        }
      }
    }
  }

  const formScore = totalMatches > 0 ? Math.round(((wins * 3 + draws) / (totalMatches * 3)) * 100) : 0;
  const weekLabel = `Semaine du ${mon.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} au ${sun.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`;

  // ── Header
  doc.setFillColor(...dark);
  doc.rect(0, 0, 210, 38, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.text(`RAPPORT HEBDOMADAIRE — ${clubName.toUpperCase()}`, 14, 16);
  doc.setFontSize(10);
  doc.setTextColor(...accent);
  doc.text(weekLabel, 14, 28);
  doc.setTextColor(180, 180, 180);
  doc.text(`Généré le ${new Date().toLocaleDateString("fr-FR")}`, 14, 34);

  // ── KPIs row
  let y = 46;
  doc.setFillColor(240, 242, 245);
  doc.rect(10, y - 4, 190, 20, "F");
  const kpis = [
    { label: "Sessions", value: String(weekSessions.length) },
    { label: "Matchs",   value: String(totalMatches) },
    { label: "V/N/D",    value: `${wins}/${draws}/${losses}` },
    { label: "Buts",     value: String(goals) },
    { label: "PD",       value: String(assists) },
    { label: "Forme",    value: `${formScore}/100` },
  ];
  const kpiW = 190 / kpis.length;
  kpis.forEach(({ label, value }, i) => {
    const x = 10 + i * kpiW + kpiW / 2;
    doc.setFontSize(15); doc.setTextColor(...dark);
    doc.text(value, x, y + 6, { align: "center" });
    doc.setFontSize(7); doc.setTextColor(120, 120, 120);
    doc.text(label, x, y + 12, { align: "center" });
  });

  // ── No sessions message
  if (weekSessions.length === 0) {
    y = 80;
    doc.setFontSize(12); doc.setTextColor(120, 120, 120);
    doc.text("Aucune session cette semaine.", 105, y, { align: "center" });
    doc.setFontSize(8); doc.setTextColor(160, 160, 160);
    doc.text("ProClubs Stats — Rapport hebdomadaire", 105, doc.internal.pageSize.getHeight() - 8, { align: "center" });
    doc.save(`rapport_semaine_${mon.toISOString().slice(0, 10)}.pdf`);
    return;
  }

  // ── Player ranking table
  y = 76;
  doc.setFontSize(12); doc.setTextColor(...dark);
  doc.text("Classement joueurs (semaine)", 14, y);
  y += 2;

  const playerRows = [...playerMap.entries()]
    .sort(([, a], [, b]) => b.goals - a.goals || b.assists - a.assists)
    .slice(0, 10)
    .map(([name, p]) => [name, p.games, p.goals, p.assists, p.motm]);

  (doc as unknown as { autoTable: (opts: unknown) => void }).autoTable({
    startY: y,
    margin: { left: 14, right: 14 },
    head: [["Joueur", "MJ", "Buts", "PD", "MOTM"]],
    body: playerRows,
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: accent, textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 247, 250] },
  });

  // ── Sessions list
  const afterTable = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 40;
  let sessY = afterTable + 10;
  doc.setFontSize(12); doc.setTextColor(...dark);
  doc.text("Sessions de la semaine", 14, sessY);
  sessY += 2;

  const sessRows = weekSessions.map((s) => {
    const w = s.matches.filter((m) => String((m.clubs[s.clubId] as Record<string, unknown>)?.["matchResult"]) === "win").length;
    const l = s.matches.filter((m) => String((m.clubs[s.clubId] as Record<string, unknown>)?.["matchResult"]) === "loss").length;
    const d = s.matches.length - w - l;
    return [
      new Date(s.date).toLocaleDateString("fr-FR"),
      String(s.matches.length),
      `${w}V ${d}N ${l}D`,
      s.tags?.join(", ") || "—",
    ];
  });

  (doc as unknown as { autoTable: (opts: unknown) => void }).autoTable({
    startY: sessY,
    margin: { left: 14, right: 14 },
    head: [["Date", "Matchs", "Bilan", "Tags"]],
    body: sessRows,
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: accent, textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 247, 250] },
  });

  doc.setFontSize(8); doc.setTextColor(160, 160, 160);
  doc.text("ProClubs Stats — Rapport hebdomadaire", 105, doc.internal.pageSize.getHeight() - 8, { align: "center" });
  doc.save(`rapport_semaine_${mon.toISOString().slice(0, 10)}.pdf`);
}
