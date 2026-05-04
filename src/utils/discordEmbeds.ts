import type { Club, Player, Match, Session } from "../types";
import type { DiscordEmbed } from "../api/discord";

function oppInfo(match: Match, clubId: string) {
  const myData  = match.clubs[clubId] as Record<string, unknown> | undefined;
  const oppEntry = Object.entries(match.clubs).find(([k]) => k !== clubId);
  const oppData  = oppEntry?.[1] as Record<string, unknown> | undefined;
  const oppDet   = oppData?.["details"] as Record<string, unknown> | undefined;
  const oppName  = String(oppDet?.["name"] ?? oppData?.["name"] ?? "?");
  const myGoals  = String(myData?.["goals"]  ?? "?");
  const oppGoals = String(oppData?.["goals"] ?? "?");
  const res = myData?.["wins"] === "1" ? "✅" : myData?.["losses"] === "1" ? "❌" : "🟡";
  return { oppName, myGoals, oppGoals, res };
}

function matchTypeDots(matches: Match[], clubId: string, type: string): string {
  const filtered = matches
    .filter((m) => m.matchType === type)
    .sort((a, b) => Number(b.timestamp) - Number(a.timestamp))
    .slice(0, 12);
  if (filtered.length === 0) return "No recent matches found.";
  return filtered
    .reverse()
    .map((m) => {
      const c = m.clubs[clubId] as Record<string, unknown> | undefined;
      return c?.["wins"] === "1" ? "🟢" : c?.["losses"] === "1" ? "🔴" : "🟡";
    })
    .join("");
}

export function buildClubOverviewEmbed(club: Club, players: Player[], matches: Match[] = []): DiscordEmbed {
  const total    = club.wins + club.losses + club.ties;
  const winRate  = total > 0 ? Math.round((club.wins / total) * 100) : 0;
  const color    = winRate >= 60 ? 0x23a559 : winRate >= 45 ? 0xfaa81a : 0xda373c;

  // Goals against from match data
  const goalsAgainst = matches.reduce((sum, m) => {
    const opp = Object.entries(m.clubs).find(([k]) => k !== club.id);
    return sum + Number((opp?.[1] as Record<string, unknown>)?.["goals"] ?? 0);
  }, 0);
  const goalDiff = club.goals - goalsAgainst;
  const goalDiffStr = goalDiff > 0 ? `+${goalDiff}` : String(goalDiff);

  // Top players
  const sorted   = (fn: (p: Player) => number) => players.length > 0 ? [...players].sort((a, b) => fn(b) - fn(a))[0] : null;
  const topAppearances = sorted((p) => p.gamesPlayed);
  const topMotm        = sorted((p) => p.motm);
  const topScorer      = sorted((p) => p.goals);
  const topAssister    = sorted((p) => p.assists);
  const topPasser      = sorted((p) => p.passesMade);
  const topTackler     = sorted((p) => p.tacklesMade);

  const fields: DiscordEmbed["fields"] = [
    { name: "Games Played",    value: String(total),                                                          inline: true },
    ...(club.skillRating ? [{ name: "Skill Rating", value: club.skillRating,                                  inline: true as const }] : []),
    { name: "Record (W/D/L)", value: `${club.wins} / ${club.ties} / ${club.losses}`,                          inline: true },
    { name: "Goals (F/A/D)",  value: `${club.goals} / ${goalsAgainst > 0 ? goalsAgainst : "?"} / ${goalsAgainst > 0 ? goalDiffStr : "?"}`, inline: true },
    { name: "Win Rate",       value: `${winRate}%`,                                                           inline: true },
  ];

  if (topAppearances && topAppearances.gamesPlayed > 0)
    fields.push({ name: "👕 Most Appearances", value: `${topAppearances.name}\n${topAppearances.gamesPlayed} matches played`, inline: true });
  if (topMotm && topMotm.motm > 0)
    fields.push({ name: "🏆 Most MOTM",        value: `${topMotm.name}\n${topMotm.motm} times MOTM`,                          inline: true });
  if (topScorer && topScorer.goals > 0)
    fields.push({ name: "🎯 Top Goal Scorer",  value: `${topScorer.name}\n${topScorer.goals} goals`,                          inline: true });
  if (topAssister && topAssister.assists > 0)
    fields.push({ name: "🤝 Top Assister",     value: `${topAssister.name}\n${topAssister.assists} assists`,                  inline: true });
  if (topPasser && topPasser.passesMade > 0)
    fields.push({ name: "🎯 Top Passer",       value: `${topPasser.name}\n${topPasser.passesMade} passes`,                   inline: true });
  if (topTackler && topTackler.tacklesMade > 0)
    fields.push({ name: "🛡️ Top Tackler",     value: `${topTackler.name}\n${topTackler.tacklesMade} tackles`,                inline: true });

  if (matches.length > 0) {
    fields.push({ name: "⚽ League Match Results",   value: matchTypeDots(matches, club.id, "leagueMatch"),   inline: false });
    fields.push({ name: "🏆 Playoff Match Results",  value: matchTypeDots(matches, club.id, "playoffMatch"),  inline: false });
    fields.push({ name: "🤝 Friendly Match Results", value: matchTypeDots(matches, club.id, "friendlyMatch"), inline: false });
  }

  return {
    title: `Statistics for ${club.name}`,
    color,
    fields,
    footer: { text: "ProClubs Stats" },
  };
}

export function buildPlayersEmbed(players: Player[], clubName: string): DiscordEmbed {
  const topScorers   = [...players].sort((a, b) => b.goals   - a.goals).slice(0, 5).filter(p => p.goals > 0);
  const topAssisters = [...players].sort((a, b) => b.assists - a.assists).slice(0, 5).filter(p => p.assists > 0);
  const topRatings   = [...players].sort((a, b) => b.rating  - a.rating).slice(0, 5).filter(p => p.rating > 0);
  const fields: DiscordEmbed["fields"] = [];
  if (topScorers.length)   fields.push({ name: "⚽ Top Buteurs",        value: topScorers.map(p =>   `${p.name} (${p.goals})`).join(", "),         inline: false });
  if (topAssisters.length) fields.push({ name: "🅰️ Top Passeurs",       value: topAssisters.map(p => `${p.name} (${p.assists})`).join(", "),       inline: false });
  if (topRatings.length)   fields.push({ name: "⭐ Meilleures Notes",    value: topRatings.map(p =>   `${p.name} ${p.rating.toFixed(1)}`).join(", "), inline: false });
  return {
    title: `👥 Joueurs — ${clubName}`,
    color: 0x00d4ff,
    description: `${players.length} joueur${players.length !== 1 ? "s" : ""}`,
    fields: fields.length ? fields : undefined,
    footer: { text: "ProClubs Stats" },
  };
}

export function buildMatchesEmbed(matches: Match[], clubId: string, clubName: string): DiscordEmbed {
  const lines = matches.slice(0, 8).map(m => {
    const { oppName, myGoals, oppGoals, res } = oppInfo(m, clubId);
    return `${res} **${myGoals}—${oppGoals}** vs ${oppName}`;
  });
  return {
    title: `⚽ Matchs récents — ${clubName}`,
    color: 0x00d4ff,
    description: lines.length > 0 ? lines.join("\n") : "Aucun match récent",
    footer: { text: "ProClubs Stats" },
  };
}

export function buildChartsEmbed(club: Club): DiscordEmbed {
  const total   = club.wins + club.losses + club.ties;
  const winRate = total > 0 ? Math.round((club.wins / total) * 100) : 0;
  const color   = winRate >= 60 ? 0x23a559 : winRate >= 45 ? 0xfaa81a : 0xda373c;
  return {
    title: `📊 Statistiques — ${club.name}`,
    color,
    fields: [
      { name: "Matchs joués", value: String(total),         inline: true },
      { name: "✅ Victoires",  value: String(club.wins),     inline: true },
      { name: "🟡 Nuls",      value: String(club.ties),      inline: true },
      { name: "❌ Défaites",  value: String(club.losses),    inline: true },
      { name: "⚽ Buts",       value: String(club.goals),    inline: true },
      { name: "📈 Win Rate",  value: `${winRate}%`,          inline: true },
      ...(club.skillRating ? [{ name: "⭐ Skill Rating", value: club.skillRating, inline: true as const }] : []),
    ],
    footer: { text: "ProClubs Stats" },
  };
}

// ── Session summary (used for auto post-match) ──────────────────────────────
export function buildSessionSummaryEmbed(session: Session): DiscordEmbed {
  // V/N/D
  let w = 0, l = 0, d = 0, goals = 0, assists = 0, motm = 0;
  const playerAcc: Record<string, { name: string; goals: number; assists: number; motm: number }> = {};

  for (const m of session.matches) {
    const c = m.clubs[session.clubId] as Record<string, unknown> | undefined;
    if (c?.["wins"] === "1" || c?.["wins"] === 1) w++;
    else if (c?.["losses"] === "1" || c?.["losses"] === 1) l++;
    else d++;

    const clubPlayers = m.players[session.clubId] as Record<string, Record<string, unknown>> | undefined;
    if (clubPlayers) {
      for (const [pid, p] of Object.entries(clubPlayers)) {
        const name = String(p["name"] ?? p["playername"] ?? p["playerName"] ?? pid);
        if (!playerAcc[name]) playerAcc[name] = { name, goals: 0, assists: 0, motm: 0 };
        playerAcc[name].goals   += Number(p["goals"]   ?? 0);
        playerAcc[name].assists += Number(p["assists"] ?? 0);
        goals   += Number(p["goals"]   ?? 0);
        assists += Number(p["assists"] ?? 0);
        if (p["mom"] === "1" || p["manofthematch"] === "1") { playerAcc[name].motm++; motm++; }
      }
    }
  }

  const all = Object.values(playerAcc);
  const topScorer   = all.length > 0 ? all.reduce((a, b) => b.goals   > a.goals   ? b : a) : null;
  const topAssister = all.length > 0 ? all.reduce((a, b) => b.assists > a.assists ? b : a) : null;
  const topMotm     = all.length > 0 ? all.reduce((a, b) => b.motm    > a.motm    ? b : a) : null;

  const total   = session.matches.length;
  const winPct  = total > 0 ? Math.round((w / total) * 100) : 0;
  const color   = winPct >= 60 ? 0x23a559 : winPct >= 40 ? 0xfaa81a : 0xda373c;

  // Last 8 matches as dots
  const recentDots = [...session.matches]
    .sort((a, b) => Number(a.timestamp) - Number(b.timestamp))
    .slice(-8)
    .map((m) => {
      const c = m.clubs[session.clubId] as Record<string, unknown> | undefined;
      return c?.["wins"] === "1" || c?.["wins"] === 1 ? "🟢" : c?.["losses"] === "1" || c?.["losses"] === 1 ? "🔴" : "🟡";
    })
    .join(" ");

  const fields: DiscordEmbed["fields"] = [
    { name: "📊 Bilan", value: `🟢 **${w}V** · 🟡 **${d}N** · 🔴 **${l}D** · **${winPct}%** victoires`, inline: false },
    { name: "⚽ Buts", value: String(goals), inline: true },
    { name: "🅰️ Passes D.", value: String(assists), inline: true },
    { name: "★ MOTM", value: String(motm), inline: true },
  ];

  if (recentDots) fields.push({ name: "📈 Forme", value: recentDots, inline: false });
  if (topScorer && topScorer.goals > 0)
    fields.push({ name: "🥇 Top buteur", value: `**${topScorer.name}** — ${topScorer.goals} buts`, inline: true });
  if (topAssister && topAssister.assists > 0)
    fields.push({ name: "🥇 Top passeur", value: `**${topAssister.name}** — ${topAssister.assists} PD`, inline: true });
  if (topMotm && topMotm.motm > 0)
    fields.push({ name: "🏅 MOTM", value: `**${topMotm.name}** — ${topMotm.motm}×`, inline: true });
  if (session.notes?.trim())
    fields.push({ name: "📝 Notes", value: session.notes.slice(0, 512), inline: false });
  if (session.tags && session.tags.length > 0)
    fields.push({ name: "🏷️ Tags", value: session.tags.join(" · "), inline: false });

  const dateStr = new Date(session.date).toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long",
  });

  return {
    title: `📤 SESSION TERMINÉE — ${session.clubName.toUpperCase()}`,
    color,
    description: `📅 ${dateStr} · **${total} match${total !== 1 ? "s" : ""}**`,
    fields,
    footer: { text: "ProClubs Stats · Post-match auto" },
    timestamp: new Date().toISOString(),
  };
}
