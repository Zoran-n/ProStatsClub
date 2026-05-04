import { Session, Match, Club, Player } from '../types';

/**
 * Moteur d'IA Heuristique pour ProClubs Stats
 * Fournit des analyses, résumés et prédictions basés sur les données statistiques.
 */

// --- TYPES ---

export interface AISummary {
  title: string;
  narrative: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  keyPoints: string[];
}

export interface AIGoal {
  id: string;
  label: string;
  target: number;
  current: number;
  type: 'rating' | 'goals' | 'defense' | 'passing';
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface PredictionResult {
  win: number;
  draw: number;
  loss: number;
  confidence: number;
  factors: { label: string; impact: number }[];
}

// --- ENGINE ---

/**
 * Génère un résumé narratif pour une session terminée
 */
export function generateSessionSummary(session: Session): AISummary {
  const total = session.matches.length;
  if (total === 0) {
    return {
      title: "Session vide",
      narrative: "Aucun match n'a été enregistré pour cette session.",
      sentiment: 'neutral',
      keyPoints: []
    };
  }

  let wins = 0, draws = 0, losses = 0;
  let goalsFor = 0, goalsAgainst = 0;
  
  for (const m of session.matches) {
    const c = m.clubs[session.clubId];
    if (!c) continue;
    if (Number(c.wins) > 0) wins++;
    else if (Number(c.ties) > 0) draws++;
    else losses++;
    goalsFor += Number(c.goals);
    goalsAgainst += Number(c.goalsAgainst);
  }

  const winRate = (wins / total) * 100;
  const diff = goalsFor - goalsAgainst;
  
  let sentiment: 'positive' | 'neutral' | 'negative' = 'neutral';
  if (winRate >= 60) sentiment = 'positive';
  else if (winRate <= 30) sentiment = 'negative';

  const titles = {
    positive: ["Domination totale", "Session de gala", "Série de victoires"],
    neutral: ["Bilan équilibré", "Session de transition", "Statu quo"],
    negative: ["Session difficile", "Manque de réussite", "Défense en difficulté"]
  };

  const title = titles[sentiment][Math.floor(Math.random() * titles[sentiment].length)];

  const narratives = {
    positive: [
      `Une performance impressionnante avec ${wins} victoires sur ${total} matchs. L'attaque a été particulièrement prolifique avec ${goalsFor} buts marqués.`,
      `Votre club a survolé cette session. Avec un taux de victoire de ${winRate.toFixed(0)}%, vous semblez avoir trouvé la formule tactique idéale.`,
    ],
    neutral: [
      `Une session mitigée qui se termine sur un bilan de ${wins}V, ${draws}N et ${losses}D. Le contenu est encourageant mais manque de régularité.`,
      `Bilan équilibré pour cette session. Les matchs ont été serrés, comme en témoigne la différence de buts de ${diff > 0 ? '+' : ''}${diff}.`,
    ],
    negative: [
      `Session compliquée avec seulement ${wins} victoire(s). La défense a concédé ${goalsAgainst} buts, ce qui a pesé sur les résultats finaux.`,
      `Manque de réussite flagrant. Malgré les efforts, l'équipe n'a pas réussi à imposer son rythme, finissant avec ${losses} défaites.`,
    ]
  };

  const narrative = narratives[sentiment][Math.floor(Math.random() * narratives[sentiment].length)];

  const keyPoints = [];
  if (goalsFor / total >= 2) keyPoints.push("🔥 Attaque de feu (avg > 2 buts)");
  if (goalsAgainst / total < 1) keyPoints.push("🛡️ Défense de fer (avg < 1 but)");
  if (winRate === 100) keyPoints.push("🏆 Invaincus sur toute la session");
  if (diff > 5) keyPoints.push("📈 Domination statistique nette");

  return { title, narrative, sentiment, keyPoints };
}

/**
 * Propose des objectifs basés sur les tendances récentes
 */
export function generateSmartGoals(recentMatches: Match[], clubId: string): AIGoal[] {
  if (recentMatches.length < 5) return [];

  const goals: AIGoal[] = [];
  
  // Analyse des 10 derniers matchs (ou moins si dispo)
  const last10 = recentMatches.slice(-10);
  let totalRating = 0, playerCount = 0;
  let cleanSheets = 0;
  let totalPasses = 0, successfulPasses = 0;
  
  for (const m of last10) {
    const players = m.players[clubId] || [];
    for (const p of players) {
      totalRating += Number(p.rating);
      playerCount++;
    }
    const c = m.clubs[clubId];
    if (c && Number(c.goalsAgainst) === 0) cleanSheets++;
  }

  const avgRating = playerCount > 0 ? totalRating / playerCount : 0;
  const csRate = cleanSheets / last10.length;

  // Objectif 1 : Note moyenne
  goals.push({
    id: 'goal-rating',
    label: "Atteindre une note moyenne d'équipe de 7.8",
    target: 7.8,
    current: Number(avgRating.toFixed(2)),
    type: 'rating',
    difficulty: avgRating < 7.2 ? 'hard' : avgRating > 7.6 ? 'easy' : 'medium'
  });

  // Objectif 2 : Clean Sheets
  goals.push({
    id: 'goal-defense',
    label: "Réaliser 40% de Clean Sheets",
    target: 0.4,
    current: Number(csRate.toFixed(2)),
    type: 'defense',
    difficulty: csRate < 0.2 ? 'hard' : 'medium'
  });

  // Objectif 3 : Série de victoires
  goals.push({
    id: 'goal-wins',
    label: "Enchaîner 3 victoires consécutives",
    target: 3,
    current: 0, // À calculer dynamiquement dans le composant si besoin
    type: 'goals',
    difficulty: 'medium'
  });

  return goals;
}

/**
 * Calcule la probabilité de victoire pour le prochain match
 */
export function predictNextMatch(club: Club, matches: Match[]): PredictionResult {
  const last10 = matches.slice(-10);
  let pts = 0;
  for (const m of last10) {
    const c = m.clubs[club.id];
    if (!c) continue;
    if (Number(c.wins) > 0) pts += 3;
    else if (Number(c.ties) > 0) pts += 1;
  }
  
  const formFactor = pts / 30; // 0 à 1
  const srFactor = Math.min((club.skillRating || 0) / 2500, 1);
  
  // Simulation simplifiée
  const winBase = 0.35 + (formFactor * 0.2) + (srFactor * 0.1);
  const drawBase = 0.25;
  const lossBase = 1 - winBase - drawBase;

  return {
    win: Math.round(winBase * 100),
    draw: Math.round(drawBase * 100),
    loss: Math.round(lossBase * 100),
    confidence: 65,
    factors: [
      { label: "Forme (10 derniers matchs)", impact: Math.round(formFactor * 100) },
      { label: "Niveau Skill Rating", impact: Math.round(srFactor * 100) }
    ]
  };
}

/**
 * Suggère le meilleur XI basé sur les notes moyennes par poste
 */
export function suggestOptimalXI(players: Player[]): { players: Player[], formation: string } {
  // Simplification : on prend les 11 meilleures notes
  // En production, il faudrait trier par poste (GK, DF, MF, FW)
  const sorted = [...players].sort((a, b) => b.rating - a.rating);
  return {
    players: sorted.slice(0, 11),
    formation: "4-3-3"
  };
}

/**
 * Détecte les anomalies de performance pour un joueur
 */
export function detectPerformanceAnomaly(playerMatches: { rating: number }[]): 'peak' | 'slump' | null {
  if (playerMatches.length < 5) return null;
  
  const ratings = playerMatches.map(m => m.rating);
  const mean = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  const latest = ratings[ratings.length - 1];
  
  // Calcul de l'écart-type simplifié
  const variance = ratings.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / ratings.length;
  const stdDev = Math.sqrt(variance);

  if (latest > mean + 1.5 * stdDev) return 'peak';
  if (latest < mean - 1.5 * stdDev) return 'slump';
  
  return null;
}

/**
 * Suggère la meilleure position pour un joueur selon ses stats réelles
 */
export function suggestPosition(p: Player): { pos: string; score: number }[] {
  const scores: { pos: string; score: number }[] = [
    { pos: 'ST',  score: (p.goals * 5 + (p.rating > 7.5 ? 10 : 0)) },
    { pos: 'CAM', score: (p.assists * 4 + p.passesMade * 0.05) },
    { pos: 'CDM', score: (p.tacklesMade * 3 + p.interceptions * 2) },
    { pos: 'CB',  score: (p.tacklesMade * 4 + p.interceptions * 3) },
    { pos: 'GK',  score: (p.saveAttempts * 5 + p.cleanSheets * 10) },
  ];

  return scores.sort((a, b) => b.score - a.score);
}

