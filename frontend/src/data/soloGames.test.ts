import { describe, expect, it } from 'vitest';
import { SOLO_GAMES } from './soloGames';

describe('solo game catalog', () => {
  it('exposes the five supported solo games', () => {
    expect(SOLO_GAMES.map((game) => game.id)).toEqual([
      'fruit_cascade',
      'crystal_mines',
      'royal_5x5',
      'neon_scratch',
      'royal_vault',
    ]);
  });
});
