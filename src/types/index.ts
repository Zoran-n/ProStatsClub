export interface RecordEntry {
  playerId: string;
  playerName: string;
  type: "goals" | "assists" | "rating" | "motm";
  previous: number;
  new: number;
  matchId: string;
  date: string;
}

export interface Club {
  id: string;
  name: string;
  platform: string;
  skillRating?: string;
  wins: number;
  losses: number;
  ties: number;
  goals: number;
  crestAssetId?: string;
  customKit?: Record<string, unknown>;
}

export interface Player {
  name: string;
  position: string;
  goals: number;
  assists: number;
  passesMade: number;
  tacklesMade: number;
  motm: number;
  rating: number;
  gamesPlayed: number;
  // Statistiques avancées (optionnelles)
  interceptions?: number;
  foulsCommitted?: number;
  yellowCards?: number;
  redCards?: number;
  cleanSheets?: number;
  saveAttempts?: number;
  shotsOnTarget?: number;
}

export interface SeasonStats {
  seasonId: string;
  wins: number;
  losses: number;
  ties: number;
  goals: number;
  goalsAgainst: number;
  skillRating?: string;
  division?: number;
}

export interface LeaderboardEntry {
  rank: number;
  clubId: string;
  clubName: string;
  wins: number;
  losses: number;
  ties: number;
  goals: number;
  skillRating?: string;
}

/** Shape of a club entry returned by the EA API inside a match */
export interface EaMatchClub {
  goals?: string;
  wins?: string;
  losses?: string;
  ties?: string;
  details?: {
    name?: string;
    clubId?: string;
    regionId?: string;
    customKit?: Record<string, string>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** Shape of a player entry returned by the EA API inside a match */
export interface EaMatchPlayer {
  name?: string;
  playername?: string;
  playerName?: string;
  goals?: string;
  assists?: string;
  passesMade?: string;
  passesmade?: string;
  tacklesMade?: string;
  tacklesmade?: string;
  interceptions?: string;
  foulsCommited?: string;
  foulscommited?: string;
  yellowCards?: string;
  yellowcards?: string;
  redCards?: string;
  redcards?: string;
  rating?: string;
  ratingAve?: string;
  mom?: string;
  manofthematch?: string;
  shotsOnTarget?: string;
  cleanSheetDef?: string;
  savedGoals?: string;
  [key: string]: unknown;
}

export interface Match {
  matchId: string;
  timestamp: string;
  matchDuration?: number;
  clubs: Record<string, EaMatchClub>;
  players: Record<string, Record<string, EaMatchPlayer>>;
  matchType: string;
}

export interface Tactic {
  id: string;
  name: string;
  formation: string;
  sliders: Record<string, number>;
  notes: string;
  eaCode?: string;
}

export interface Session {
  id: string;
  clubName: string;
  clubId: string;
  platform: string;
  date: string;
  matches: Match[];
  archived?: boolean;
  notes?: string;
  tags?: string[];
  goal?: number;
  advancedGoals?: { maxLosses?: number; minRating?: number };
  mergedFrom?: string[];
}

export interface SessionTemplate {
  id: string;
  name: string;
  tags?: string[];
  notes?: string;
  goal?: number;
  advancedGoals?: { maxLosses?: number; minRating?: number };
}

export interface CompareEntry {
  id: string;
  date: string;
  clubA: { id: string; name: string; platform: string };
  clubB: { id: string; name: string; platform: string };
}

export interface SavedComparison {
  id: string;
  name: string;
  date: string;
  clubs: { id: string; name: string; platform: string }[];
}

export interface EaProfile {
  gamertag: string;
  platform: string;
  clubId: string;
  clubName: string;
}

export interface SyncEntry {
  ts: string;
  clubId: string;
  clubName: string;
  matchCount: number;
  status: "ok" | "error";
  note?: string;
}

export interface PublicProfileConfig {
  selectedStats: string[];
  objective?: {
    targetStat: string;
    targetValue: number;
    title: string;
  };
  theme?: string;
}

export interface Settings {
  history: Club[];
  favs: Club[];
  tactics: Tactic[];
  sessions: Session[];
  compareHistory?: CompareEntry[];
  eaProfile?: EaProfile;
  eaProfiles?: EaProfile[];
  syncHistory?: SyncEntry[];
  theme: string;
  darkMode: boolean;
  proxyUrl?: string;
  showGrid?: boolean;
  showAnimations?: boolean;
  showLogs?: boolean;
  showIdSearch?: boolean;
  fontSize?: string;
  fontFamily?: string;
  customAccent?: string;
  customBg?: string;
  customSurface?: string;
  customCard?: string;
  language?: string;
  onboarded?: boolean;
  matchCache?: Record<string, Match[]>;
  cacheTimestamps?: Record<string, number>;
  cacheOwners?: Record<string, string>;
  discordWebhook?: string;
  autoUpdate?: boolean;
  matchAnnotations?: Record<string, string>;
  visibleKpis?: string[];
  navLayout?: "horizontal" | "vertical" | "right" | "bottom";
  sessionTemplates?: SessionTemplate[];
  favFolders?: { id: string; name: string; clubIds: string[] }[];
  srAlerts?: string[];
  savedComparisons?: SavedComparison[];
  publicProfileConfig?: PublicProfileConfig;
}

export interface ClubData {
  club: Club;
  players: Player[];
  matches: Match[];
  info: unknown;
}

export const PLATFORMS = [
  { label: "PS5 / Xbox Series X", value: "common-gen5" },
  { label: "PS4 / Xbox One", value: "common-gen4" },
  { label: "PC", value: "pc" },
] as const;

export const FORMATIONS = ["433", "4231", "442", "4141", "4321", "352", "343", "532", "541"] as const;

export const THEMES = [
  { id: "cyan",     color: "#00d4ff", label: "Cyan" },
  { id: "violet",   color: "#8b5cf6", label: "Violet" },
  { id: "orange",   color: "#ff6b35", label: "Orange" },
  { id: "green",    color: "#00ff88", label: "Vert" },
  { id: "red",      color: "#ff3355", label: "Rouge" },
  { id: "blurple",  color: "#5865f2", label: "Discord" },
  { id: "midnight", color: "#6366f1", label: "Midnight" },
  { id: "gold",     color: "#f59e0b", label: "Gold" },
  { id: "matrix",   color: "#00ff41", label: "Matrix" },
  { id: "rose",     color: "#f43f5e", label: "Rose" },
] as const;

export const PALETTE_PRESETS = [
  {
    id: "eafc",
    label: "EA FC",
    accent: "#F9C00C",
    bg: "#08090F",
    surface: "#0F1320",
    card: "#171D30",
    border: "#252E48",
    preview: ["#F9C00C", "#08090F", "#0F1320"],
  },
  {
    id: "blood",
    label: "Blood",
    accent: "#C0392B",
    bg: "#0D0606",
    surface: "#1A0A0A",
    card: "#230E0E",
    border: "#3D1515",
    preview: ["#C0392B", "#0D0606", "#1A0A0A"],
  },
  {
    id: "ocean",
    label: "Ocean",
    accent: "#0EA5E9",
    bg: "#040D1A",
    surface: "#0B1930",
    card: "#0F2440",
    border: "#1A3A60",
    preview: ["#0EA5E9", "#040D1A", "#0B1930"],
  },
  {
    id: "forest",
    label: "Forest",
    accent: "#22C55E",
    bg: "#060E07",
    surface: "#0B1A0C",
    card: "#112413",
    border: "#1A3A1F",
    preview: ["#22C55E", "#060E07", "#0B1A0C"],
  },
  {
    id: "discord-classic",
    label: "Classic",
    accent: "#5865F2",
    bg: "#1e1f22",
    surface: "#2b2d31",
    card: "#313338",
    border: "#3f4147",
    preview: ["#5865F2", "#1e1f22", "#2b2d31"],
  },
] as const;

export type MatchType = "leagueMatch" | "playoffMatch" | "friendlyMatch";
