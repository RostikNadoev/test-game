import type {
  CrystalMinesPublicState,
  Royal5x5PublicState,
  TurboTowerPublicState,
} from '../api/types';

export const makeCellKey = (row: number, col: number) => `${row}:${col}`;

export function deriveCrystalMinesPicked(
  publicState: CrystalMinesPublicState | null | undefined,
): Set<number> {
  if (!publicState?.picked?.length) return new Set();
  return new Set(publicState.picked);
}

export function mergePickedSets(local: Set<number>, derived: Set<number>): Set<number> {
  if (derived.size === 0) return local;
  const merged = new Set(local);
  derived.forEach((value) => merged.add(value));
  return merged;
}

export function deriveTurboTowerFloor(
  publicState: TurboTowerPublicState | null | undefined,
  fallback = 0,
): number {
  return publicState?.current_floor ?? fallback;
}

export function deriveTurboTowerPicked(
  publicState: TurboTowerPublicState | null | undefined,
  floors: number,
): number[] {
  if (publicState?.picked?.length === floors) {
    return [...publicState.picked];
  }
  return Array.from({ length: floors }, () => -1);
}

export function deriveRoyal5x5PickedByRow(
  publicState: Royal5x5PublicState | null | undefined,
  rows: number,
): Array<number | null> {
  if (!publicState?.picked_by_row?.length) {
    return Array.from({ length: rows }, () => null);
  }
  return publicState.picked_by_row.map((value) => (value >= 0 ? value : null));
}

export function deriveRoyal5x5Revealed(
  publicState: Royal5x5PublicState | null | undefined,
): Set<string> {
  const revealed = new Set<string>();
  if (!publicState?.picked_by_row?.length) return revealed;
  publicState.picked_by_row.forEach((col, row) => {
    if (col >= 0) revealed.add(makeCellKey(row, col));
  });
  return revealed;
}

export function deriveRoyal5x5CurrentRow(
  publicState: Royal5x5PublicState | null | undefined,
  fallback = 0,
): number {
  return publicState?.current_row ?? fallback;
}

export function mergeRevealedSets(local: Set<string>, derived: Set<string>): Set<string> {
  if (derived.size === 0) return local;
  const merged = new Set(local);
  derived.forEach((value) => merged.add(value));
  return merged;
}

export function needsSessionHydration(
  resumed: boolean,
  status: string,
  publicState: unknown,
): boolean {
  return resumed && status === 'active' && publicState != null;
}
