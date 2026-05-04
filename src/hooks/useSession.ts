import { useState, useEffect, useRef } from "react";
import { pollSession } from "../api/tauri";
import { useAppStore } from "../store/useAppStore";
import { notifyNewMatches } from "../utils/notifications";
import type { Match, RecordEntry } from "../types";

function matchToastMessage(m: Match, clubId: string): string {
  const ourClub = m.clubs[clubId] as Record<string, unknown> | undefined;
  const ourGoals = Number(ourClub?.["goals"] ?? 0);
  const oppEntry = Object.entries(m.clubs).find(([id]) => id !== clubId);
  const oppGoals = Number((oppEntry?.[1] as Record<string, unknown>)?.["goals"] ?? 0);
  const result = ourClub?.["matchResult"];
  const label = result === "win" ? "Victoire" : result === "loss" ? "Défaite" : "Nul";
  return `${label} ${ourGoals} – ${oppGoals}`;
}

function checkPersonalRecords(newMatches: Match[], storeState: ReturnType<typeof useAppStore.getState>) {
  const { currentClub, eaProfile, personalRecords, updateRecords, addRecordAlert } = storeState;
  if (!currentClub || !eaProfile) return;

  const clubId = currentClub.id;
  const newRecords: RecordEntry[] = [];

  for (const m of newMatches) {
    const clubPlayers = m.players[clubId] as Record<string, Record<string, unknown>> | undefined;
    if (!clubPlayers) continue;

    const pEntry = Object.entries(clubPlayers).find(([pid, p]) => {
      const name = String(p["name"] ?? p["playername"] ?? p["playerName"] ?? pid);
      return name.toLowerCase() === eaProfile.gamertag.toLowerCase();
    });

    if (!pEntry) continue;
    const [playerId, p] = pEntry;
    const playerName = String(p["name"] ?? p["playername"] ?? p["playerName"] ?? playerId);

    const matchId = m.matchId;
    const date = new Date(Number(m.timestamp) * 1000).toISOString();

    const stats = {
      goals: Number(p["goals"] ?? 0),
      assists: Number(p["assists"] ?? 0),
      rating: Number(p["rating"] ?? 0),
      motm: (p["mom"] === "1" || p["manofthematch"] === "1") ? 1 : 0
    };

    const types: ("goals"|"assists"|"rating"|"motm")[] = ["goals", "assists", "rating", "motm"];
    for (const t of types) {
      if (stats[t] <= 0) continue;
      
      const existing = personalRecords.find(r => r.playerId === playerId && r.type === t);
      const prev = existing ? existing.new : 0;
      
      // Notify only if it beats previous record, except MOTM which is just binary 1 or 0 per match, 
      // but the feature request is: "plus de buts en un match, série, meilleure note". Let's treat MOTM as a notable event or record if they never got it? 
      // Actually MOTM can just be if (t === "motm" && !existing) or we just ignore MOTM as a "record". Wait, the feature said: "plus de buts, meilleure note, PD, MOTM".
      // Let's notify for MOTM only if they didn't have one before? No, MOTM is always a good notification! Let's notify every MOTM as a "Record" alert for simplicity.
      
      const isRecord = t === "motm" ? stats[t] === 1 : stats[t] > prev;
      
      if (isRecord) {
        const r: RecordEntry = { playerId, playerName, type: t, previous: prev, new: stats[t], matchId, date };
        newRecords.push(r);
        addRecordAlert(r);
      }
    }
  }
  
  if (newRecords.length > 0) {
    updateRecords(newRecords);
  }
}

export function useSession() {
  const { activeSession, currentClub } = useAppStore();
  const [countdown, setCountdown] = useState(30);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sessionId = activeSession?.id;
  const clubId = currentClub?.id;
  const platform = currentClub?.platform;

  useEffect(() => {
    if (!sessionId || !clubId || !platform) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countRef.current) clearInterval(countRef.current);
      return;
    }

    const doPoll = async () => {
      setCountdown(30);
      const storeState = useAppStore.getState();
      const current = storeState.activeSession;
      if (!current) return;
      const knownIds = current.matches.map((m) => m.matchId);
      // Only keep matches played AFTER the session started
      const sessionStartSec = Math.floor(new Date(current.date).getTime() / 1000);
      try {
        const fetched = await pollSession(clubId, platform, knownIds);
        const newMatches = fetched.filter(
          (m) => Number(m.timestamp) >= sessionStartSec
        );
        if (newMatches.length > 0) {
          storeState.addSessionMatch(newMatches);
          storeState.addLog(`Session: ${newMatches.length} nouveau(x) match(s)`);
          notifyNewMatches(newMatches, clubId).catch(() => {});
          // Check personal records
          checkPersonalRecords(newMatches, storeState);
          
          // In-app toast for each new match
          for (const m of newMatches) {
            const msg = matchToastMessage(m, clubId);
            const result = (m.clubs[clubId] as Record<string, unknown> | undefined)?.["matchResult"];
            const type = result === "win" ? "success" : result === "loss" ? "error" : "info";
            storeState.addToast(`Nouveau match — ${msg}`, type);
          }
        }
      } catch { /* ignore */ }
    };

    doPoll();
    intervalRef.current = setInterval(doPoll, 30_000);
    countRef.current = setInterval(() => setCountdown((c) => (c <= 1 ? 30 : c - 1)), 1_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countRef.current) clearInterval(countRef.current);
    };
  }, [sessionId, clubId, platform]);

  return { countdown };
}
