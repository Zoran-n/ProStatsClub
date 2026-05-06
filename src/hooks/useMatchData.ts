import { useState, useEffect } from "react";
import { getMatches } from "../api/tauri";
import { useAppStore } from "../store/useAppStore";
import type { Match } from "../types";

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
  const {
    currentClub, eaProfile,
    matches: leagueCache,
    matchCache, setMatchCache, persistSettings,
  } = useAppStore();

  const [type, setType] = useState<MatchTabType>("leagueMatch");
  const [pages, setPages] = useState<Partial<Record<string, Match[]>>>({ leagueMatch: leagueCache });
  const [cursors, setCursors] = useState<Partial<Record<string, string | null>>>({});
  const [loading, setLoading] = useState(false);

  // ── Sync store leagueCache → local pages ─────────────────────────────────
  useEffect(() => {
    setPages((p) => ({ ...p, leagueMatch: leagueCache }));
    if (currentClub && leagueCache.length) {
      setMatchCache(`${currentClub.id}_${currentClub.platform}_leagueMatch`, leagueCache);
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
        setPages((p) => ({ ...p, [type]: data }));
        setCursors((c) => ({ ...c, [type]: data.length >= 10 ? oldestTimestamp(data) : null }));
        setMatchCache(key, data);
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

  const allList = pages[type] ?? [];
  const hasMore  = (cursors[type] ?? null) !== null && !loading;

  return { type, setType, allList, loading, loadMore, hasMore, cursors, eaProfile };
}
