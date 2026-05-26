import { useState, useEffect, useRef } from "react";
import { getMatches } from "../api/tauri";
import { useAppStore } from "../store/useAppStore";
import type { Match } from "../types";

// Re-export store instance for inline access after sync
export { useAppStore };

const EMPTY_MATCH_LIST: Match[] = [];

export type MatchTabType = "leagueMatch" | "playoffMatch" | "friendlyMatch";

function oldestTimestamp(list: Match[]): string | null {
  if (list.length === 0) return null;
  return [...list].sort((a, b) => Number(a.timestamp) - Number(b.timestamp))[0]?.timestamp ?? null;
}

/**
 * Centralises all match fetching logic (previously inline in MatchesTab).
 * Handles: type switching, pagination, cache lookup, background auto-loading.
 */
export function useMatchData() {
  const currentClub    = useAppStore((s) => s.currentClub);
  const eaProfile      = useAppStore((s) => s.eaProfile);
  const leagueCache    = useAppStore((s) => s.matches);
  const matchCache     = useAppStore((s) => s.matchCache);
  const setMatchCache  = useAppStore((s) => s.setMatchCache);
  const syncMatchCache = useAppStore((s) => s.syncMatchCache);
  const persistSettings = useAppStore((s) => s.persistSettings);

  const [type, setType] = useState<MatchTabType>("leagueMatch");
  const [pages, setPages] = useState<Partial<Record<string, Match[]>>>({ leagueMatch: leagueCache });
  const [cursors, setCursors] = useState<Partial<Record<string, string | null>>>({});
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(loading);
  loadingRef.current = loading;

  // Derive the matchCache entry for the current type — used to react to background loader updates
  const cacheKey = currentClub ? `${currentClub.id}_${currentClub.platform}_${type}` : null;
  const cachedForCurrentType = cacheKey ? matchCache[cacheKey] : undefined;

  // ── Sync store leagueCache → local pages ─────────────────────────────────
  useEffect(() => {
    if (currentClub && leagueCache.length) {
      const key = `${currentClub.id}_${currentClub.platform}_leagueMatch`;
      // Merge instead of replace to avoid losing cached history
      syncMatchCache(key, leagueCache);
      const full = useAppStore.getState().matchCache[key] ?? leagueCache;
      setPages((p) => ({ ...p, leagueMatch: full }));
    } else {
      setPages((p) => ({ ...p, leagueMatch: leagueCache }));
    }
  }, [leagueCache]);

  // ── Reset when club changes ───────────────────────────────────────────────
  useEffect(() => {
    setPages({ leagueMatch: leagueCache });
    setCursors({});
   
  }, [currentClub?.id]);

  // ── Load type on demand (cache-first) ────────────────────────────────────
  useEffect(() => {
    if (!currentClub || pages[type] !== undefined) return;
    const key = `${currentClub.id}_${currentClub.platform}_${type}`;
    const cached = matchCache[key];
    if (cached?.length) {
      setPages((p) => ({ ...p, [type]: cached }));
      setCursors((c) => ({ ...c, [type]: cached.length >= 10 ? oldestTimestamp(cached) : null }));
      return;
    }
    if (!navigator.onLine) {
      // Offline and no cache: mark as empty so we don't retry
      setPages((p) => ({ ...p, [type]: [] }));
      setCursors((c) => ({ ...c, [type]: null }));
      return;
    }
    setLoading(true);
    getMatches(currentClub.id, currentClub.platform, type)
      .then((data) => {
        syncMatchCache(key, data);
        const merged = useAppStore.getState().matchCache[key] ?? data;
        setPages((p) => ({ ...p, [type]: merged }));
        setCursors((c) => ({ ...c, [type]: data.length >= 10 ? oldestTimestamp(data) : null }));
        persistSettings();
      })
      .finally(() => setLoading(false));
   
  }, [type, currentClub?.id]);

  // ── Load next page ────────────────────────────────────────────────────────
  const loadMore = () => {
    if (!currentClub || loading) return;
    if (!navigator.onLine) return;
    const cursor = cursors[type];
    if (!cursor) return;
    setLoading(true);
    const key = `${currentClub.id}_${currentClub.platform}_${type}`;
    getMatches(currentClub.id, currentClub.platform, type, cursor)
      .then((data) => {
        setPages((p) => {
          const prev = p[type] ?? [];
          const existing = new Set(prev.map((m) => m.matchId));
          const fresh = data.filter((m) => !existing.has(m.matchId));
          const combined = [...prev, ...fresh];
          setMatchCache(key, combined);
          return { ...p, [type]: combined };
        });
        persistSettings();
        setCursors((c) => ({ ...c, [type]: data.length >= 10 ? oldestTimestamp(data) : null }));
      })
      .finally(() => setLoading(false));
  };

  // ── Background auto-loader (when eaProfile is linked) ────────────────────
  useEffect(() => {
    if (!currentClub || !eaProfile || loading) return;
    const cursor = cursors[type];
    if (cursor === undefined || cursor === null) return;
    const timer = setTimeout(() => loadMore(), 800);
    return () => clearTimeout(timer);

  }, [cursors[type], type, currentClub?.id, eaProfile?.gamertag, loading]);

  // ── React to matchCache updates from the background loader ───────────────
  // When useAutoLoad adds matches (pagination or periodic sync), update pages[type]
  // so the match list and calendar reflect the full accumulated history.
  useEffect(() => {
    if (!cachedForCurrentType?.length) return;
    setPages((p) => ({ ...p, [type]: cachedForCurrentType }));
    setCursors((c) => ({
      ...c,
      [type]: cachedForCurrentType.length >= 10 ? oldestTimestamp(cachedForCurrentType) : null,
    }));
  }, [cachedForCurrentType, type]);

  // ── Periodic auto-refresh for new matches ─────────────────────────────────
  useEffect(() => {
    if (!currentClub) return;
    const club = currentClub;

    const doRefresh = async () => {
      if (!navigator.onLine || loadingRef.current) return;
      const key = `${club.id}_${club.platform}_${type}`;
      try {
        const latestPage = await getMatches(club.id, club.platform, type);
        const added = syncMatchCache(key, latestPage);
        if (added > 0) {
          const fresh = useAppStore.getState().matchCache[key];
          if (fresh) {
            setPages((p) => ({ ...p, [type]: fresh }));
            persistSettings();
          }
        }
      } catch {
        // Silently ignore — auto-refresh is best-effort
      }
    };

    const intervalId = setInterval(doRefresh, 60_000);
    return () => clearInterval(intervalId);
  }, [currentClub?.id, type]);

  const allList = pages[type] ?? EMPTY_MATCH_LIST;
  const hasMore  = (cursors[type] ?? null) !== null && !loading;

  return { type, setType, allList, loading, loadMore, hasMore, cursors, eaProfile };
}
