import { Coins } from 'lucide-react';

const formatNumber = (value: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);

export function SoloBalanceBar({
  balance,
  error,
}: {
  balance: number;
  error?: string | null;
}) {
  return (
    <div className="solo-balance-bar">
      <div className="solo-balance-chip">
        <Coins size={14} />
        <span>{formatNumber(balance)} GAME</span>
      </div>
      {error ? <p className="solo-balance-error">{error}</p> : null}
    </div>
  );
}
