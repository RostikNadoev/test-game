import { describe, expect, it } from 'vitest';
import {
  deriveCrystalMinesPicked,
  deriveRoyal5x5CurrentRow,
  deriveRoyal5x5PickedByRow,
  deriveRoyal5x5Revealed,
  deriveTurboTowerFloor,
  deriveTurboTowerPicked,
  mergePickedSets,
  mergeRevealedSets,
  needsSessionHydration,
} from './soloSessionState';

describe('soloSessionState helpers', () => {
  it('derives crystal mines picked cells', () => {
    expect([...deriveCrystalMinesPicked({ picked: [1, 4], safe_picks: 2 })]).toEqual([1, 4]);
  });

  it('merges local and derived picked sets', () => {
    const merged = mergePickedSets(new Set([2]), new Set([1, 4]));
    expect([...merged]).toEqual([2, 1, 4]);
  });

  it('derives turbo tower floor and picked doors', () => {
    expect(deriveTurboTowerFloor({ current_floor: 3, cleared_floors: 3, picked: [0, 1, 2, -1, -1, -1, -1, -1] })).toBe(3);
    expect(deriveTurboTowerPicked({ current_floor: 1, cleared_floors: 1, picked: [2, -1, -1, -1, -1, -1, -1, -1] }, 8)).toEqual([
      2, -1, -1, -1, -1, -1, -1, -1,
    ]);
  });

  it('derives royal trail revealed cells from picked_by_row', () => {
    const revealed = deriveRoyal5x5Revealed({
      current_row: 2,
      opened_rows: 2,
      picked_by_row: [1, 3, -1, -1, -1, -1, -1],
    });
    expect([...revealed]).toEqual(['0:1', '1:3']);
    expect(deriveRoyal5x5PickedByRow(
      { current_row: 2, opened_rows: 2, picked_by_row: [1, 3, -1, -1, -1, -1, -1] },
      7,
    )).toEqual([1, 3, null, null, null, null, null]);
    expect(deriveRoyal5x5CurrentRow({ current_row: 4, opened_rows: 4, picked_by_row: [] })).toBe(4);
  });

  it('merges revealed sets for resume hydration', () => {
    const merged = mergeRevealedSets(new Set(['2:2']), new Set(['0:1', '1:3']));
    expect([...merged]).toEqual(['2:2', '0:1', '1:3']);
  });

  it('detects when active resumed session needs hydration', () => {
    expect(needsSessionHydration(true, 'active', { picked: [] })).toBe(true);
    expect(needsSessionHydration(false, 'active', { picked: [] })).toBe(false);
    expect(needsSessionHydration(true, 'active', null)).toBe(false);
  });
});
