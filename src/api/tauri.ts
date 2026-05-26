import { invoke } from "@tauri-apps/api/core";
import type { Club, ClubData, Match, Player, Settings } from "../types";

export const searchClub = (name: string, platform?: string) =>
  invoke<Club[]>("search_club", { name, platform: platform ?? null });

export const loadClub = (clubId: string, platform: string) =>
  invoke<ClubData>("load_club", { clubId, platform });

const _inflightMatches = new Map<string, Promise<Match[]>>();

export function getMatches(clubId: string, platform: string, matchType: string, matchTimeVal?: string | null): Promise<Match[]> {
  const key = `${clubId}:${platform}:${matchType}:${matchTimeVal ?? ""}`;
  const existing = _inflightMatches.get(key);
  if (existing) return existing;
  const p = invoke<Match[]>("get_matches", { clubId, platform, matchType, matchTimeVal: matchTimeVal ?? null })
    .finally(() => _inflightMatches.delete(key));
  _inflightMatches.set(key, p);
  return p;
}

export const getSeasonHistory = (clubId: string, platform: string) =>
  invoke<unknown>("get_season_history", { clubId, platform });

export const getLeaderboard = (platform: string, maxCount?: number) =>
  invoke<unknown>("get_leaderboard", { platform, maxCount: maxCount ?? null });

export const getMembers = (clubId: string, platform: string) =>
  invoke<Player[]>("get_members", { clubId, platform });

export const getLogo = (crestId: string) =>
  invoke<string>("get_logo", { crestId });

export const saveSettings = (settings: Settings) =>
  invoke<void>("save_settings", { settings });

export const loadSettings = () =>
  invoke<Settings>("load_settings");

export const pollSession = (clubId: string, platform: string, knownIds: string[]) =>
  invoke<Match[]>("poll_session", { clubId, platform, knownIds });

export const detectPlatform = (clubId: string) =>
  invoke<string>("detect_platform", { clubId });

export const checkProxy = () =>
  invoke<string | null>("check_proxy");

export const setProxy = (proxyUrl: string | null) =>
  invoke<void>("set_proxy", { proxyUrl });

export const getClubInfo = (clubId: string, platform: string) =>
  invoke<unknown>("get_club_info", { clubId, platform });
