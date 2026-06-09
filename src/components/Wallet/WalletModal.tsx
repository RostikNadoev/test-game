import { useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowRightLeft, ArrowUpFromLine, Coins, Loader2, X } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';

type WalletTab = 'deposit' | 'withdraw' | 'exchange';

type WalletModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

const formatBalance = (value: number) =>
  new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 4,
  }).format(value);

const tabs: Array<{
  id: WalletTab;
  label: string;
  icon: typeof ArrowDownToLine;
}> = [
  { id: 'deposit', label: 'Пополнение', icon: ArrowDownToLine },
  { id: 'withdraw', label: 'Вывод', icon: ArrowUpFromLine },
  { id: 'exchange', label: 'Обмен', icon: ArrowRightLeft },
];

export const WalletModal = ({ isOpen, onClose }: WalletModalProps) => {
  const { user, exchangeTonToGame, refreshProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<WalletTab>('exchange');
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parsedAmount = useMemo(() => Number(amount.replace(',', '.')), [amount]);
  const canExchange = Number.isFinite(parsedAmount) && parsedAmount > 0 && !isSubmitting;

  if (!isOpen) return null;

  const handleExchange = async () => {
    if (!canExchange) return;

    setIsSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      const balance = await exchangeTonToGame(parsedAmount);
      setAmount('');
      setMessage(`Готово: TON ${formatBalance(balance.ton)} · GAME ${formatBalance(balance.game)}`);
      await refreshProfile();
    } catch (exchangeError) {
      setError(exchangeError instanceof Error ? exchangeError.message : 'Не удалось выполнить обмен');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/65 px-3 pb-3 pt-10 backdrop-blur-md">
      <button
        type="button"
        aria-label="Закрыть"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />

      <section className="relative w-full max-w-[456px] overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#090910] text-white shadow-[0_30px_90px_rgba(0,0,0,0.7)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(242,199,102,0.16),transparent_38%),radial-gradient(circle_at_100%_35%,rgba(82,255,229,0.13),transparent_42%)]" />

        <div className="relative flex items-start justify-between gap-3 border-b border-white/[0.07] p-4">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#52FFE5]/60">
              Wallet
            </p>
            <h2 className="mt-0.5 text-[24px] font-black tracking-[-0.07em]">
              Кошелёк
            </h2>
            <p className="mt-1 text-[12px] font-medium text-white/42">
              Пополнение, вывод и обмен баланса.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="press grid h-10 w-10 shrink-0 place-items-center rounded-[16px] border border-white/[0.08] bg-white/[0.06] text-white/60 active:bg-white/[0.1]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="relative grid grid-cols-2 gap-2 p-4 pb-2">
          <div className="overflow-hidden rounded-[20px] border border-[#F2C766]/18 bg-[#F2C766]/[0.08] p-3">
            <p className="text-[8px] font-black uppercase tracking-[0.18em] text-[#FFE0A3]/55">
              TON
            </p>
            <p className="mt-1.5 text-[24px] font-black leading-none tracking-[-0.06em] tabular-nums">
              {formatBalance(user?.balance_ton ?? 0)}
            </p>
          </div>

          <div className="overflow-hidden rounded-[20px] border border-[#52FFE5]/18 bg-[#52FFE5]/[0.07] p-3">
            <p className="text-[8px] font-black uppercase tracking-[0.18em] text-[#52FFE5]/55">
              GAME
            </p>
            <p className="mt-1.5 text-[24px] font-black leading-none tracking-[-0.06em] tabular-nums">
              {formatBalance(user?.balance_game ?? 0)}
            </p>
          </div>
        </div>

        <div className="relative px-4 pb-4">
          <div className="grid grid-cols-3 gap-1.5 rounded-[18px] border border-white/[0.07] bg-black/25 p-1.5">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id);
                    setMessage(null);
                    setError(null);
                  }}
                  className={`press flex items-center justify-center gap-1 rounded-[13px] px-2 py-2 text-[10px] font-black tracking-[-0.02em] transition ${
                    isActive ? 'bg-white text-[#08080C]' : 'text-white/48 active:bg-white/[0.08]'
                  }`}
                >
                  <Icon size={13} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="mt-3 min-h-[188px] overflow-hidden rounded-[22px] border border-white/[0.07] bg-white/[0.04] p-3.5">
            {activeTab === 'deposit' && (
              <div className="flex min-h-[160px] flex-col justify-between">
                <div>
                  <div className="grid h-12 w-12 place-items-center rounded-[18px] bg-[#F2C766]/10 text-[#F2C766]">
                    <ArrowDownToLine size={22} />
                  </div>
                  <h3 className="mt-4 text-[19px] font-black tracking-[-0.05em]">
                    Пополнение скоро
                  </h3>
                  <p className="mt-1.5 text-[12px] font-medium leading-snug text-white/44">
                    Backend-метод для реального пополнения пока не подключаем. Кнопку оставил как готовый UI-раздел.
                  </p>
                </div>
                <button
                  type="button"
                  disabled
                  className="mt-5 rounded-[16px] border border-white/[0.07] bg-white/[0.04] px-3 py-3 text-[12px] font-black text-white/28"
                >
                  Метод пока не активен
                </button>
              </div>
            )}

            {activeTab === 'withdraw' && (
              <div className="flex min-h-[160px] flex-col justify-between">
                <div>
                  <div className="grid h-12 w-12 place-items-center rounded-[18px] bg-[#52FFE5]/10 text-[#52FFE5]">
                    <ArrowUpFromLine size={22} />
                  </div>
                  <h3 className="mt-4 text-[19px] font-black tracking-[-0.05em]">
                    Вывод скоро
                  </h3>
                  <p className="mt-1.5 text-[12px] font-medium leading-snug text-white/44">
                    Раздел уже есть в модалке, но запросы на вывод пока не отправляем.
                  </p>
                </div>
                <button
                  type="button"
                  disabled
                  className="mt-5 rounded-[16px] border border-white/[0.07] bg-white/[0.04] px-3 py-3 text-[12px] font-black text-white/28"
                >
                  Метод пока не активен
                </button>
              </div>
            )}

            {activeTab === 'exchange' && (
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-[19px] font-black tracking-[-0.05em]">
                      TON → GAME
                    </h3>
                    <p className="mt-1 text-[12px] font-medium leading-snug text-white/44">
                      Курс 1:1. Введи количество TON для обмена на игровые коины.
                    </p>
                  </div>
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[16px] border border-white/[0.08] bg-white/[0.06]">
                    <Coins size={20} className="text-[#F2C766]" />
                  </div>
                </div>

                <label className="mt-4 block">
                  <span className="mb-1.5 block text-[9px] font-black uppercase tracking-[0.18em] text-white/34">
                    Сумма TON
                  </span>
                  <input
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    inputMode="decimal"
                    placeholder="Например, 3"
                    className="h-12 w-full rounded-[17px] border border-white/[0.08] bg-black/25 px-3 text-[18px] font-black tracking-[-0.03em] text-white outline-none placeholder:text-white/20 focus:border-[#52FFE5]/40"
                  />
                </label>

                <div className="mt-2 rounded-[15px] border border-white/[0.07] bg-black/20 px-3 py-2 text-[11px] font-bold text-white/42">
                  Получишь:{' '}
                  <span className="text-[#52FFE5]">
                    {Number.isFinite(parsedAmount) && parsedAmount > 0 ? formatBalance(parsedAmount) : '0'} GAME
                  </span>
                </div>

                {message && (
                  <div className="mt-2 rounded-[15px] border border-[#52FFE5]/20 bg-[#52FFE5]/10 px-3 py-2 text-[11px] font-bold text-[#9FFFF4]">
                    {message}
                  </div>
                )}

                {error && (
                  <div className="mt-2 rounded-[15px] border border-[#FF7A90]/20 bg-[#FF7A90]/10 px-3 py-2 text-[11px] font-bold text-[#FFB5C1]">
                    {error}
                  </div>
                )}

                <button
                  type="button"
                  disabled={!canExchange}
                  onClick={handleExchange}
                  className="press mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-[17px] bg-white text-[13px] font-black uppercase tracking-[0.08em] text-[#08080C] disabled:cursor-not-allowed disabled:bg-white/[0.08] disabled:text-white/24"
                >
                  {isSubmitting && <Loader2 size={16} className="animate-spin" />}
                  Обменять
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
