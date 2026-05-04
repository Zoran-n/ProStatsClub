import { describe, it, expect } from 'vitest';
import { detectPerformanceAnomaly, suggestPosition } from '../src/utils/aiEngine';
import { Player } from '../src/types';

describe('AI Engine - Heuristics', () => {
  it('should detect a performance peak', () => {
    const matches = [
      { rating: 7.0 }, { rating: 7.2 }, { rating: 7.1 }, { rating: 7.0 }, { rating: 9.5 }
    ];
    expect(detectPerformanceAnomaly(matches)).toBe('peak');
  });

  it('should detect a performance slump', () => {
    const matches = [
      { rating: 8.0 }, { rating: 8.2 }, { rating: 8.1 }, { rating: 8.0 }, { rating: 5.5 }
    ];
    expect(detectPerformanceAnomaly(matches)).toBe('slump');
  });

  it('should suggest ST for high goal scorers', () => {
    const player: Partial<Player> = {
      goals: 50,
      assists: 5,
      rating: 8.5,
      gamesPlayed: 10,
      passesMade: 100,
      tacklesMade: 2
    };
    const suggestions = suggestPosition(player as Player);
    expect(suggestions[0].pos).toBe('ST');
  });

  it('should suggest GK for players with many saves', () => {
    const player: Partial<Player> = {
      goals: 0,
      assists: 0,
      rating: 7.5,
      saveAttempts: 100,
      cleanSheets: 20,
      gamesPlayed: 20
    };
    const suggestions = suggestPosition(player as Player);
    expect(suggestions[0].pos).toBe('GK');
  });
});
