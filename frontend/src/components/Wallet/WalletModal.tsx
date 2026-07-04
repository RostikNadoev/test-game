import { useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowRightLeft, ArrowUpFromLine, Coins, Loader2, X } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';

type WalletTab = 'deposit' | 'withdraw' | 'exchange';

type WalletModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

const formatBalance = (value: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 4 }).format(value);

const tabs: Array<{ id: WalletTab; label: string; icon: typeof ArrowDownToLine }> = [
  { id: 'deposit', label: 'Пополнить', icon: ArrowDownToLine },
  { id: 'withdraw', label: 'Вывод', icon: ArrowUpFromLine },
  { id: 'exchange', label: 'Обмен', icon: ArrowRightLeft },
];

export const WalletModal = ({ isOpen, onClose }: WalletModalProps) => {
  const { user, exchangeTonToGame, refreshProfile } = useAuth();
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isVisible, setIsVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<WalletTab>('exchange');
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parsedAmount = useMemo(() => Number(amount.replace(',', '.')), [amount]);
  const canExchange = Number.isFinite(parsedAmount) && parsedAmount > 0 && !isSubmitting;

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      const frame = window.requestAnimationFrame(() => setIsVisible(true));
      return () => window.cancelAnimationFrame(frame);
    }
    setIsVisible(false);
    const timer = window.setTimeout(() => setShouldRender(false), 240);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!shouldRender) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shouldRender, onClose]);

  if (!shouldRender) return null;

  const handleExchange = async () => {
    if (!canExchange) return;
    setIsSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      const balance = await exchangeTonToGame(parsedAmount);
      setAmount('');
      setMessage(`Готово · TON ${formatBalance(balance.ton)} · GAME ${formatBalance(balance.game)}`);
      await refreshProfile();
    } catch (exchangeError) {
      setError(exchangeError instanceof Error ? exchangeError.message : 'Не удалось выполнить обмен');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTabChange = (tab: WalletTab) => {
    setActiveTab(tab);
    setMessage(null);
    setError(null);
  };

  const handleAmountChange = (value: string) => {
    setAmount(value.replace(/[^\d.,]/g, ''));
  };

  return (
    <div className={`wallet-modal-root ${isVisible ? 'is-open' : 'is-closed'}`}>
      <button type="button" aria-label="Закрыть" className="wallet-modal-backdrop" onClick={onClose} />
      <section role="dialog" aria-modal="true" aria-label="Кошелёк" className="wallet-modal-sheet">
        <div className="wallet-modal-header">
          <div className="min-w-0"><p className="wallet-modal-kicker">Wallet</p><h2 className="wallet-modal-title">Кошелёк</h2><p className="wallet-modal-subtitle">Баланс и быстрый обмен</p></div>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="pressable wallet-modal-close"><X size={15} /></button>
        </div>
        <div className="wallet-balance-grid">
          <div className="wallet-balance-card is-ton"><p className="wallet-balance-label">TON</p><p className="wallet-balance-value">{formatBalance(user?.balance_ton ?? 0)}</p></div>
          <div className="wallet-balance-card is-game"><p className="wallet-balance-label">GAME</p><p className="wallet-balance-value">{formatBalance(user?.balance_game ?? 0)}</p></div>
        </div>
        <div className="wallet-modal-body">
          <div className="wallet-tabs">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return <button key={tab.id} type="button" onClick={() => handleTabChange(tab.id)} className={`wallet-tab ${isActive ? 'is-active' : ''}`}><Icon size={12} /><span>{tab.label}</span></button>;
            })}
          </div>
          <div className="wallet-content">
            {activeTab === 'deposit' && (
              <div className="wallet-empty-section"><div><div className="wallet-section-icon is-orange"><ArrowDownToLine size={18} /></div><h3 className="wallet-section-title">Пополнение скоро</h3><p className="wallet-section-text">UI готов. Реальное пополнение можно подключить отдельным backend-методом.</p></div><button type="button" disabled className="wallet-disabled-button">Скоро</button></div>
            )}
            {activeTab === 'withdraw' && (
              <div className="wallet-empty-section"><div><div className="wallet-section-icon is-blue"><ArrowUpFromLine size={18} /></div><h3 className="wallet-section-title">Вывод скоро</h3><p className="wallet-section-text">Раздел уже на месте. Запросы на вывод пока не отправляются.</p></div><button type="button" disabled className="wallet-disabled-button">Скоро</button></div>
            )}
            {activeTab === 'exchange' && (
              <div className="wallet-exchange">
                <div className="wallet-exchange-head"><div className="min-w-0"><h3 className="wallet-section-title">TON → GAME</h3><p className="wallet-section-text">Курс 1:1. Введи сумму TON.</p></div><div className="wallet-swap-orb"><Coins size={17} /></div></div>
                <label className="wallet-field"><span className="wallet-field-label">Сумма TON</span><input value={amount} onChange={(event) => handleAmountChange(event.target.value)} inputMode="decimal" placeholder="Например, 3" className="wallet-input" /></label>
                <div className="wallet-output-row"><span>Получишь</span><strong>{Number.isFinite(parsedAmount) && parsedAmount > 0 ? formatBalance(parsedAmount) : '0'} GAME</strong></div>
                {message && <div className="wallet-alert is-success">{message}</div>}
                {error && <div className="wallet-alert is-error">{error}</div>}
                <button type="button" disabled={!canExchange} onClick={handleExchange} className="pressable wallet-submit-button">{isSubmitting && <Loader2 size={14} className="animate-spin" />}<span>Обменять</span></button>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
