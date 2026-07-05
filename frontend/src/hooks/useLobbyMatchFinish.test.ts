import { describe, expect, it } from 'vitest';
import {
  readStoredPlayersInfo,
  resolveWinnerUserId,
  validateFinishOutcome,
} from './useLobbyMatchFinish';

describe('useLobbyMatchFinish helpers', () => {
  it('resolves winner as current user on win', () => {
    const winner = resolveWinnerUserId(10, 'win', [
      { id: 10, tg_user: '@a', photo_url: '' },
      { id: 20, tg_user: '@b', photo_url: '' },
    ]);
    expect(winner).toBe(10);
  });

  it('resolves winner as opponent on loss', () => {
    const winner = resolveWinnerUserId(10, 'loss', [
      { id: 10, tg_user: '@a', photo_url: '' },
      { id: 20, tg_user: '@b', photo_url: '' },
    ]);
    expect(winner).toBe(20);
  });

  it('returns null on draw', () => {
    const winner = resolveWinnerUserId(10, 'draw', [
      { id: 10, tg_user: '@a', photo_url: '' },
      { id: 20, tg_user: '@b', photo_url: '' },
    ]);
    expect(winner).toBeNull();
  });

  it('returns empty players info when storage is missing', () => {
    expect(readStoredPlayersInfo()).toEqual([]);
  });

  it('rejects loss without opponent instead of treating it as draw', () => {
    const result = validateFinishOutcome(10, 'loss', [{ id: 10, tg_user: '@a', photo_url: '' }]);
    expect(result).toEqual({ ok: false, error: 'Opponent not found' });
  });

  it('allows draw without opponent metadata', () => {
    const result = validateFinishOutcome(10, 'draw', []);
    expect(result).toEqual({ ok: true, winnerUserId: null });
  });
});
