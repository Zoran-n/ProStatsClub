import { Match, Player } from '../types';

/**
 * Worker pour le calcul intensif des statistiques
 */

self.onmessage = (e: MessageEvent) => {
  const { action, payload } = e.data;

  if (action === 'PROCESS_MATCHES') {
    const { matches, clubId } = payload;
    const stats = processMatches(matches, clubId);
    self.postMessage({ action: 'MATCHES_PROCESSED', payload: stats });
  }

  if (action === 'CALCULATE_RANKINGS') {
    const { players } = payload;
    const rankings = calculateRankings(players);
    self.postMessage({ action: 'RANKINGS_CALCULATED', payload: rankings });
  }
};

function processMatches(matches: Match[], clubId: string) {
  let goals = 0, assists = 0, games = 0, wins = 0;
  
  for (const m of matches) {
    const c = m.clubs[clubId];
    if (!c) continue;
    games++;
    goals += Number(c.goals || 0);
    if (Number(c.wins) > 0) wins++;
  }

  return { goals, games, wins, winRate: games > 0 ? (wins / games) * 100 : 0 };
}

function calculateRankings(players: Player[]) {
  // Tri complexe par score composite
  return [...players].sort((a, b) => {
    const scoreA = a.goals * 3 + a.assists * 2 + a.motm * 5 + a.rating * 10;
    const scoreB = b.goals * 3 + b.assists * 2 + b.motm * 5 + b.rating * 10;
    return scoreB - scoreA;
  });
}
