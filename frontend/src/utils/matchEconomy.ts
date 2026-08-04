export const MATCH_RAKE_PERCENT = 0.08;

const roundMoney = (value: number) => Math.round(value * 100) / 100;

export function calculateMatchWinnerProfit(betCoins: number): number {
  const bet = Number.isFinite(betCoins) ? Math.max(0, betCoins) : 0;
  const pot = roundMoney(bet * 2);
  const payout = roundMoney(pot * (1 - MATCH_RAKE_PERCENT));

  return roundMoney(payout - bet);
}
