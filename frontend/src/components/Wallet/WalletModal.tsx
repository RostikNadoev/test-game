import { useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  Check,
  Clock3,
  History,
  Loader2,
  LogOut,
  ShieldCheck,
  WalletCards,
  X,
} from 'lucide-react';
import {
  THEME,
  useIsConnectionRestored,
  useTonAddress,
  useTonConnectUI,
  useTonWallet,
} from '@tonconnect/ui-react';
import { useAuth } from '../../auth/useAuth';
import tonIcon from '../../assets/header/ton.svg';
import coinIcon from '../../assets/solo/scratch/icon-coin.webp';
import { useLanguage } from '../../i18n/LanguageContext';

type WalletTab = 'deposit' | 'withdraw' | 'history';

type WalletModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

const GAME_TO_TON_RATE = 0.1;

const tabs: Array<{ id: WalletTab; label: readonly [string, string]; icon: LucideIcon }> = [
  { id: 'deposit', label: ['Deposit', 'Ввод'], icon: ArrowDownToLine },
  { id: 'withdraw', label: ['Withdraw', 'Вывод'], icon: ArrowUpFromLine },
  { id: 'history', label: ['History', 'История'], icon: History },
];

const historyItems = [
  {
    id: 'withdraw-success',
    type: 'withdraw' as const,
    amount: '-12.40 TON',
    date: ['29 Jul · 18:42', '29 июл · 18:42'] as const,
    status: 'success' as const,
  },
  {
    id: 'deposit-success',
    type: 'deposit' as const,
    amount: '+5.00 TON',
    date: ['28 Jul · 11:06', '28 июл · 11:06'] as const,
    status: 'success' as const,
  },
  {
    id: 'withdraw-pending',
    type: 'withdraw' as const,
    amount: '-2.75 TON',
    date: ['Today · 09:18', 'Сегодня · 09:18'] as const,
    status: 'pending' as const,
  },
] as const;

const parseAmount = (value: string) => {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

const sanitizeAmount = (value: string) => {
  const cleaned = value.replace(/[^\d.,]/g, '');
  const separatorIndex = cleaned.search(/[.,]/);

  if (separatorIndex === -1) return cleaned;

  const separator = cleaned[separatorIndex];
  const integerPart = cleaned.slice(0, separatorIndex).replace(/[.,]/g, '');
  const fractionPart = cleaned.slice(separatorIndex + 1).replace(/[.,]/g, '').slice(0, 4);

  return `${integerPart || '0'}${separator}${fractionPart}`;
};

const shortenAddress = (address: string) => {
  if (address.length <= 14) return address;
  return `${address.slice(0, 7)}…${address.slice(-5)}`;
};

export const WalletModal = ({ isOpen, onClose }: WalletModalProps) => {
  const { user } = useAuth();
  const { language, locale, tr } = useLanguage();
  const [tonConnectUI, setTonConnectOptions] = useTonConnectUI();
  const tonWallet = useTonWallet();
  const tonAddress = useTonAddress();
  const isConnectionRestored = useIsConnectionRestored();
  const formatBalance = (value: number, maximumFractionDigits = 4) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isVisible, setIsVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<WalletTab>('deposit');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [walletAction, setWalletAction] = useState<'connect' | 'disconnect' | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);

  const parsedWithdrawGame = useMemo(() => parseAmount(withdrawAmount), [withdrawAmount]);
  const withdrawTonAmount = parsedWithdrawGame > 0 ? parsedWithdrawGame * GAME_TO_TON_RATE : 0;
  const isTonConnected = Boolean(tonWallet && tonAddress);
  const walletName = tonWallet?.device.appName || tr('TON wallet', 'TON-кошелёк');

  useEffect(() => {
    setTonConnectOptions({
      language,
      uiPreferences: { theme: THEME.DARK },
    });
  }, [language, setTonConnectOptions]);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      const frame = window.requestAnimationFrame(() => setIsVisible(true));
      return () => window.cancelAnimationFrame(frame);
    }

    setIsVisible(false);
    const timer = window.setTimeout(() => setShouldRender(false), 220);
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

  const connectWallet = async () => {
    setWalletError(null);
    setWalletAction('connect');
    try {
      await tonConnectUI.openModal();
    } catch {
      setWalletError(tr('Could not open TON Connect', 'Не удалось открыть TON Connect'));
    } finally {
      setWalletAction(null);
    }
  };

  const disconnectWallet = async () => {
    setWalletError(null);
    setWalletAction('disconnect');
    try {
      await tonConnectUI.disconnect();
    } catch {
      setWalletError(tr('Could not disconnect wallet', 'Не удалось отключить кошелёк'));
    } finally {
      setWalletAction(null);
    }
  };

  if (!shouldRender) return null;

  const isHistory = activeTab === 'history';
  const isDeposit = activeTab === 'deposit';

  return (
    <div className={`wallet-simple-root ${isVisible ? 'is-open' : 'is-closed'}`}>
      <button type="button" className="wallet-simple-backdrop" onClick={onClose} aria-label={tr('Close', 'Закрыть')} />

      <section role="dialog" aria-modal="true" aria-labelledby="wallet-simple-title" className="wallet-simple-sheet">
        <div className="wallet-simple-handle" />

        <header className="wallet-simple-header">
          <div>
            <span>{tr('Balance', 'Баланс')}</span>
            <h2 id="wallet-simple-title">{tr('Wallet', 'Кошелёк')}</h2>
          </div>
          <button type="button" onClick={onClose} className="wallet-simple-close press" aria-label={tr('Close', 'Закрыть')}>
            <X size={17} />
          </button>
        </header>

        <div className="wallet-simple-balances">
          <div className="wallet-simple-balance">
            <div>
              <img src={coinIcon} alt="" className="is-game" draggable={false} />
              <span>GAME</span>
            </div>
            <strong>{formatBalance(user?.balance_game ?? 0, 2)}</strong>
          </div>
        </div>

        <div className="wallet-simple-tabs" role="tablist" aria-label={tr('Operation', 'Операция')}>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className={`wallet-simple-tab press ${isActive ? 'is-active' : ''}`}
              >
                <Icon size={14} />
                {tr(tab.label[0], tab.label[1])}
              </button>
            );
          })}
        </div>

        {isHistory ? (
          <div className="wallet-history" role="tabpanel">
            <div className="wallet-history-heading">
              <span>{tr('Recent activity', 'Последние операции')}</span>
              <small>{tr('TON transactions', 'Операции TON')}</small>
            </div>

            <div className="wallet-history-list">
              {historyItems.map((item) => {
                const isPending = item.status === 'pending';
                const isDepositItem = item.type === 'deposit';
                const Icon = isDepositItem ? ArrowDownToLine : ArrowUpFromLine;

                return (
                  <article className="wallet-history-item" key={item.id}>
                    <div className={`wallet-history-icon is-${item.type}`}>
                      <Icon size={15} />
                    </div>

                    <div className="wallet-history-copy">
                      <strong>
                        {isDepositItem
                          ? tr('Deposit', 'Пополнение')
                          : tr('Withdrawal', 'Вывод')}
                      </strong>
                      <span>{tr(item.date[0], item.date[1])}</span>
                    </div>

                    <div className="wallet-history-value">
                      <strong className={isDepositItem ? 'is-positive' : ''}>
                        {item.amount}
                      </strong>
                      <span className={isPending ? 'is-pending' : 'is-success'}>
                        {isPending ? <Clock3 size={9} /> : <Check size={9} />}
                        {isPending
                          ? tr('Pending', 'В ожидании')
                          : tr('Successful', 'Успешно')}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ) : isDeposit ? (
          <div className="wallet-ton-connect" role="tabpanel">
            <div className={`wallet-ton-status ${isTonConnected ? 'is-connected' : ''}`}>
              <div className="wallet-ton-status-icon">
                {isTonConnected ? <ShieldCheck size={20} /> : <WalletCards size={20} />}
              </div>

              <div className="wallet-ton-status-copy">
                <span>
                  {isTonConnected
                    ? tr('Wallet connected', 'Кошелёк подключён')
                    : 'TON Connect'}
                </span>
                <strong>
                  {isTonConnected
                    ? walletName
                    : tr('Connect your TON wallet', 'Подключите TON-кошелёк')}
                </strong>
                <small>
                  {isTonConnected
                    ? shortenAddress(tonAddress)
                    : tr(
                        'Choose any compatible wallet in the secure TON Connect window.',
                        'Выберите любой совместимый кошелёк в безопасном окне TON Connect.',
                      )}
                </small>
              </div>
            </div>

            {!isConnectionRestored ? (
              <button type="button" disabled className="wallet-ton-button is-loading">
                <Loader2 size={15} className="animate-spin" />
                {tr('Checking connection', 'Проверяем подключение')}
              </button>
            ) : isTonConnected ? (
              <button
                type="button"
                className="wallet-ton-button is-disconnect press"
                disabled={walletAction !== null}
                onClick={() => void disconnectWallet()}
              >
                {walletAction === 'disconnect' ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <LogOut size={15} />
                )}
                {tr('Disconnect wallet', 'Отключить кошелёк')}
              </button>
            ) : (
              <button
                type="button"
                className="wallet-ton-button press"
                disabled={walletAction !== null}
                onClick={() => void connectWallet()}
              >
                {walletAction === 'connect' ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <WalletCards size={15} />
                )}
                {tr('Connect wallet', 'Подключить кошелёк')}
              </button>
            )}

            <p className={`wallet-ton-note ${walletError ? 'is-error' : ''}`}>
              {walletError || tr(
                  'Deposits are not enabled yet. Connecting does not initiate a transaction.',
                  'Пополнение пока отключено. Подключение не запускает транзакцию.',
                )}
            </p>
          </div>
        ) : (
          <>
            <div className="wallet-simple-conversion" role="tabpanel">
              <label className="wallet-simple-amount">
                <span>{tr('You pay', 'Отдаёшь')}</span>
                <div>
                  <input
                    value={withdrawAmount}
                    onChange={(event) => setWithdrawAmount(sanitizeAmount(event.target.value))}
                    inputMode="decimal"
                    placeholder="10"
                  />
                  <span className="wallet-simple-currency">
                    <img src={coinIcon} alt="" className="is-game" draggable={false} />
                    GAME
                  </span>
                </div>
              </label>

              <div className="wallet-simple-arrow" aria-hidden="true">
                <ArrowRight size={16} />
              </div>

              <div className="wallet-simple-result">
                <span>{tr('You receive', 'Получишь')}</span>
                <div>
                  <strong>{withdrawTonAmount > 0 ? formatBalance(withdrawTonAmount, 4) : '0'}</strong>
                  <span className="wallet-simple-currency">
                    <img src={tonIcon} alt="" draggable={false} />
                    TON
                  </span>
                </div>
              </div>
            </div>

            <div className="wallet-simple-rate">
              10 GAME = 1 TON
            </div>

            <button type="button" disabled className="wallet-simple-submit">
              {isDeposit
                ? tr('Deposits will be available soon', 'Пополнение скоро будет доступно')
                : tr('Withdrawals will be available soon', 'Вывод скоро будет доступен')}
            </button>
          </>
        )}
      </section>
    </div>
  );
};
