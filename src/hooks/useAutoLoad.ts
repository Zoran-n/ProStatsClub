import { useEffect, useRef } from "react";
import { getMatches } from "../api/tauri";
import { useClub } from "./useClub";
import { useAppStore } from "../store/useAppStore";

const MATCH_TYPES = ["leagueMatch", "playoffMatch", "friendlyMatch"] as const;
const CACHE_LIMIT = 2000;

function oldestTimestamp(matches: { timestamp: string }[]): string | null {
  if (matches.length === 0) return null;
  return [...matches].sort((a, b) => Number(a.timestamp) - Number(b.timestamp))[0]?.timestamp ?? null;
}

/**
 * Two automatic behaviours:
 * 1. Load the linked club at startup when an EA profile is configured.
 * 2. Silently load every match type in the background whenever a club is loaded
 *    (regardless of EA profile) so the calendar is fully populated.
 *
 * Synchronisation incrémentale : when the cache already has entries, only the
 * newest page is fetched and new matches are prepended — avoiding a full re-download.
 * Full backward pagination only happens on the very first load (empty cache).
 */
export function useAutoLoad() {
  const settingsLoaded  = useAppStore((s) => s.settingsLoaded);
  const eaProfile       = useAppStore((s) => s.eaProfile);
  const currentClub     = useAppStore((s) => s.currentClub);
  const matchCache      = useAppStore((s) => s.matchCache);
  const setMatchCache   = useAppStore((s) => s.setMatchCache);
  const persistSettings = useAppStore((s) => s.persistSettings);
  const { load } = useClub();
  const didAutoLoad = useRef(false);

  // ── 1. Auto-load club on startup ─────────────────────────────────────────
  useEffect(() => {
    if (!settingsLoaded) return;
    if (!eaProfile?.clubId) return;
    if (didAutoLoad.current) return;
    didAutoLoad.current = true;
    load(eaProfile.clubId, eaProfile.platform);
   
  }, [settingsLoaded, eaProfile?.clubId]);

  // ── 2. Background full-match loader with incremental sync ─────────────────
  // Runs whenever the loaded club changes (manual search or EA profile auto-load).
  // • Cache empty → full backward pagination to build complete history
  // • Cache has entries → fetch newest page only, prepend new matches (incremental)
  useEffect(() => {
    if (!currentClub) return;

    let cancelled = false;
    const club = currentClub;

    async function loadTypeIncremental(matchType: typeof MATCH_TYPES[number]) {
      const key = `${club.id}_${club.platform}_${matchType}`;
      const cached = matchCache[key] ?? [];
      let accumulated = [...cached];
      const existingIds = new Set(accumulated.map((m) => m.matchId));

      if (!navigator.onLine) return;

      // ── Always fetch the newest page first ──────────────────────────────
      // This provides incremental sync when cache already has data, and
      // starts the initial load when cache is empty.
      let firstPage: typeof accumulated;
      try {
        firstPage = await getMatches(club.id, club.platform, matchType);
        if (cancelled) return;
      } catch {
        return;
      }

      const freshFromFirst = firstPage.filter((m) => !existingIds.has(m.matchId));

      if (freshFromFirst.length > 0) {
        // New matches found — prepend to existing cache (newest at front)
        accumulated = [...freshFromFirst, ...accumulated].slice(0, CACHE_LIMIT);
        setMatchCache(key, accumulated);
        freshFromFirst.forEach((m) => existingIds.add(m.matchId));
      }

      // ── If cache was empty, paginate backwards to load full history ──────
      if (cached.length === 0 && firstPage.length >= 10) {
        await sleep(600);
        let cursor = oldestTimestamp(firstPage);
        while (cursor && !cancelled && accumulated.length < CACHE_LIMIT) {
          if (!navigator.onLine) break;
          try {
            const page = await getMatches(club.id, club.platform, matchType, cursor);
            if (cancelled) return;
            const fresh = page.filter((m) => !existingIds.has(m.matchId));
            if (fresh.length === 0) break;
            accumulated = [...accumulated, ...fresh].slice(0, CACHE_LIMIT);
            setMatchCache(key, accumulated);
            fresh.forEach((m) => existingIds.add(m.matchId));
            if (page.length < 10 || accumulated.length >= CACHE_LIMIT) break;
            cursor = oldestTimestamp(page);
            await sleep(800);
          } catch {
            break;
          }
        }
      }
    }

    let running = false;

    async function run() {
      if (running) return;
      running = true;
      try {
        for (const matchType of MATCH_TYPES) {
          if (cancelled) break;
          await loadTypeIncremental(matchType);
          // Persist after each type so partial progress survives app close
          if (!cancelled) await persistSettings();
          await sleep(500);
        }
      } finally {
        running = false;
      }
    }

    run();

    // Periodic background sync every 3 minutes to catch new matches
    const intervalId = setInterval(() => { if (!cancelled) run(); }, 3 * 60_000);

    return () => { cancelled = true; clearInterval(intervalId); };

  }, [currentClub?.id]);
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
