import { describe, expect, it } from 'vitest';
import { calculateMatchWinnerProfit } from './matchEconomy';

describe('calculateMatchWinnerProfit', () => {
  it('applies the 8% commission to the full two-player pot', () => {
    expect(calculateMatchWinnerProfit(100)).toBe(84);
  });

  it('keeps fractional coin amounts rounded to two decimals', () => {
    expect(calculateMatchWinnerProfit(2.5)).toBe(2.1);
  });
});
