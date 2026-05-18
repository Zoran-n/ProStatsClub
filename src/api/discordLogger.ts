import { useEffect, useState } from "react";

export interface DiscordLog {
  id: number;
  ts: string;
  url: string;
  payload: string;
  status: number | null;
  error: string | null;
}

let _logId = 0;
const _discordLogs: DiscordLog[] = [];
const _listeners = new Set<() => void>();

export function addDiscordLog(entry: Omit<DiscordLog, "id" | "ts">) {
  _discordLogs.unshift({ ...entry, id: ++_logId, ts: new Date().toISOString() });
  if (_discordLogs.length > 50) _discordLogs.pop();
  _listeners.forEach((fn) => fn());
}

export function useDiscordLogs() {
  const [, tick] = useState(0);
  useEffect(() => {
    const fn = () => tick((n) => n + 1);
    _listeners.add(fn);
    return () => { _listeners.delete(fn); };
  }, []);
  return _discordLogs;
}

export function clearDiscordLogs() {
  _discordLogs.splice(0);
  _listeners.forEach((fn) => fn());
}
