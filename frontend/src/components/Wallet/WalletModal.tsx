import { useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowDownToLine, ArrowRight, ArrowUpFromLine, Link2, X } from 'lucide-react';
import { useAuth } from '../../auth/useAuth';
import tonIcon from '../../assets/header/ton.svg';
import coinIcon from '../../assets/solo/scratch/icon-coin.webp';

type WalletTab = 'deposit' | 'withdraw';

type WalletModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

const TON_TO_GAME_RATE = 10;
const GAME_TO_TON_RATE = 1 / TON_TO_GAME_RATE;

const tabs: Array<{ id: WalletTab; label: string; icon: LucideIcon }> = [
  { id: 'deposit', label: 'Ввод', icon: ArrowDownToLine },
  { id: 'withdraw', label: 'Вывод', icon: ArrowUpFromLine },
];

const formatBalance = (value: number, maximumFractionDigits = 4) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits }).format(value);

const parseAmount = (value: string) => {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

const sanitizeAmount = (value: string) => {
  const cleaned = value.replace(/[^\d.,]/g, '');
  const separatorIndex = cleaned.search(/[.,]/);

  if (separatorIndex === -1) {
    return cleaned;
  }

  const separator = cleaned[separatorIndex];
  const integerPart = cleaned.slice(0, separatorIndex).replace(/[.,]/g, '');
  const fractionPart = cleaned.slice(separatorIndex + 1).replace(/[.,]/g, '').slice(0, 4);

  return `${integerPart || '0'}${separator}${fractionPart}`;
};

export const WalletModal = ({ isOpen, onClose }: WalletModalProps) => {
  const { user } = useAuth();
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isVisible, setIsVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<WalletTab>('deposit');
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');

  const parsedDepositTon = useMemo(() => parseAmount(depositAmount), [depositAmount]);
  const parsedWithdrawGame = useMemo(() => parseAmount(withdrawAmount), [withdrawAmount]);

  const depositGameAmount = useMemo(() => {
    if (parsedDepositTon <= 0) return 0;
    return parsedDepositTon * TON_TO_GAME_RATE;
  }, [parsedDepositTon]);

  const withdrawTonAmount = useMemo(() => {
    if (parsedWithdrawGame <= 0) return 0;
    return parsedWithdrawGame * GAME_TO_TON_RATE;
  }, [parsedWithdrawGame]);

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

  return (
    <div className={`wallet-modal-root ${isVisible ? 'is-open' : 'is-closed'}`}>
      <button type="button" aria-label="Закрыть" className="wallet-modal-backdrop" onClick={onClose} />

      <section role="dialog" aria-modal="true" aria-label="Кошелёк" className="wallet-modal-sheet">
        <div className="wallet-modal-header">
          <div className="min-w-0">
            <p className="wallet-modal-kicker">Wallet</p>
            <h2 className="wallet-modal-title">Кошелёк</h2>
            <p className="wallet-modal-subtitle">Баланс, ввод и вывод средств</p>
          </div>

          <button type="button" onClick={onClose} aria-label="Закрыть" className="pressable wallet-modal-close">
            <X size={15} />
          </button>
        </div>

        <div className="wallet-balance-grid">
          <div className="wallet-balance-card is-ton">
            <div className="wallet-balance-top">
              <p className="wallet-balance-label">TON</p>
              <img src={tonIcon} alt="" className="wallet-mini-icon" draggable={false} decoding="async" />
            </div>
            <p className="wallet-balance-value">{formatBalance(user?.balance_ton ?? 0)}</p>
          </div>

          <div className="wallet-balance-card is-game">
            <div className="wallet-balance-top">
              <p className="wallet-balance-label">GAME</p>
              <img src={coinIcon} alt="" className="wallet-mini-icon is-game" draggable={false} decoding="async" />
            </div>
            <p className="wallet-balance-value">{formatBalance(user?.balance_game ?? 0, 2)}</p>
          </div>
        </div>

        <div className="wallet-modal-body">
          <div className="wallet-tabs">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`wallet-tab ${isActive ? 'is-active' : ''}`}
                >
                  <Icon size={12} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="wallet-content">
            {activeTab === 'deposit' && (
              <div className="wallet-action-section">
                <div className="wallet-action-head">
                  <div className="min-w-0">
                    <h3 className="wallet-section-title">Пополнение</h3>
                    <p className="wallet-section-text">Укажи сумму в TON. Курс: 1 TON = 10 GAME.</p>
                  </div>

                  <button type="button" disabled className="pressable wallet-connect-button">
                    <Link2 size={13} />
                    <span>Подключить кошелёк</span>
                  </button>
                </div>

                <div className="wallet-conversion-row">
                  <label className="wallet-amount-box">
                    <span className="wallet-field-label">Отдаёшь</span>
                    <div className="wallet-input-wrap">
                      <input
                        value={depositAmount}
                        onChange={(event) => setDepositAmount(sanitizeAmount(event.target.value))}
                        inputMode="decimal"
                        placeholder="0,1"
                        className="wallet-input"
                      />
                      <img src={tonIcon} alt="" className="wallet-currency-icon" draggable={false} decoding="async" />
                    </div>
                  </label>

                  <div className="wallet-arrow-box" aria-hidden="true">
                    <ArrowRight size={15} />
                  </div>

                  <div className="wallet-result-box">
                    <span className="wallet-field-label">Получишь</span>
                    <div className="wallet-result-value">
                      <strong>{depositGameAmount > 0 ? formatBalance(depositGameAmount, 2) : '0'}</strong>
                      <img src={coinIcon} alt="" className="wallet-currency-icon is-game" draggable={false} decoding="async" />
                    </div>
                  </div>
                </div>

                <div className="wallet-rate-note">Пополнение пока не отправляет транзакции. Кнопка подключения кошелька подготовлена под будущую интеграцию.</div>

                <button type="button" disabled className="pressable wallet-submit-button">
                  <span>Пополнение временно недоступно</span>
                </button>
              </div>
            )}

            {activeTab === 'withdraw' && (
              <div className="wallet-action-section">
                <div className="wallet-action-head">
                  <div className="min-w-0">
                    <h3 className="wallet-section-title">Вывод</h3>
                    <p className="wallet-section-text">Укажи сумму GAME. Курс: 10 GAME = 1 TON.</p>
                  </div>
                </div>

                <div className="wallet-conversion-row">
                  <label className="wallet-amount-box">
                    <span className="wallet-field-label">Отдаёшь</span>
                    <div className="wallet-input-wrap">
                      <input
                        value={withdrawAmount}
                        onChange={(event) => setWithdrawAmount(sanitizeAmount(event.target.value))}
                        inputMode="decimal"
                        placeholder="10"
                        className="wallet-input"
                      />
                      <img src={coinIcon} alt="" className="wallet-currency-icon is-game" draggable={false} decoding="async" />
                    </div>
                  </label>

                  <div className="wallet-arrow-box" aria-hidden="true">
                    <ArrowRight size={15} />
                  </div>

                  <div className="wallet-result-box">
                    <span className="wallet-field-label">Получишь</span>
                    <div className="wallet-result-value">
                      <strong>{withdrawTonAmount > 0 ? formatBalance(withdrawTonAmount, 4) : '0'}</strong>
                      <img src={tonIcon} alt="" className="wallet-currency-icon" draggable={false} decoding="async" />
                    </div>
                  </div>
                </div>

                <div className="wallet-rate-note">Вывод пока отключён. UI готов под backend-метод заявки на вывод.</div>

                <button type="button" disabled className="pressable wallet-submit-button">
                  <span>Вывести</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
