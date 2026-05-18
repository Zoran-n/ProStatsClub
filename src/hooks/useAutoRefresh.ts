import { useEffect, useRef, useState } from "react";

/**
 * Always-on background refresh — fires `load(clubId, platform)` every `intervalMs`.
 * Active as soon as clubId + platform are defined. No toggle needed.
 * Returns `progress` (0→1) that resets on each cycle, for the progress bar UI.
 */
export function useAutoRefresh(
  clubId: string | undefined,
  platform: string | undefined,
  load: (id: string, p: string) => void,
  intervalMs = 60_000,
) {
  const [progress, setProgress] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (!clubId || !platform) {
      setProgress(0);
      return;
    }

    const startedAt = Date.now();
    setProgress(0);

    const refreshTimer = setInterval(() => {
      loadRef.current(clubId, platform);
    }, intervalMs);

    const frameTimer = setInterval(() => {
      const elapsed = (Date.now() - startedAt) % intervalMs;
      setProgress(elapsed / intervalMs);
    }, 250);

    return () => {
      clearInterval(refreshTimer);
      clearInterval(frameTimer);
    };
  }, [clubId, platform, intervalMs]);

  return { progress };
}
