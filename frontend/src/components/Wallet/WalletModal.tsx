import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  Check,
  ChevronRight,
  Clock3,
  CircleAlert,
  CircleCheck,
  History,
  LockKeyhole,
  Loader2,
  LogOut,
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
import { api, ApiError, type WithdrawalEligibility, type WithdrawalItem } from '../../api';
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

const sanitizeWholeAmount = (value: string) => value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');

const createIdempotencyKey = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `withdraw_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
};

const shortenAddress = (address: string) => {
  if (address.length <= 14) return address;
  return `${address.slice(0, 7)}…${address.slice(-5)}`;
};

export const WalletModal = ({ isOpen, onClose }: WalletModalProps) => {
  const { user, refreshBalance } = useAuth();
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
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawalKey, setWithdrawalKey] = useState(createIdempotencyKey);
  const [withdrawals, setWithdrawals] = useState<WithdrawalItem[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawalEligibility, setWithdrawalEligibility] = useState<WithdrawalEligibility | null>(null);
  const [isEligibilityLoading, setIsEligibilityLoading] = useState(false);
  const [eligibilityError, setEligibilityError] = useState<string | null>(null);
  const [isEligibilityOpen, setIsEligibilityOpen] = useState(false);
  const [withdrawalFeedback, setWithdrawalFeedback] = useState<{
    kind: 'error' | 'wallet' | 'success';
    message: string;
  } | null>(null);
  const [walletAction, setWalletAction] = useState<'connect' | 'disconnect' | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);

  const parsedDepositTon = useMemo(() => parseAmount(depositAmount), [depositAmount]);
  const depositGameAmount = parsedDepositTon > 0 ? parsedDepositTon / GAME_TO_TON_RATE : 0;
  const parsedWithdrawGame = useMemo(() => parseAmount(withdrawAmount), [withdrawAmount]);
  const withdrawTonAmount = parsedWithdrawGame > 0 ? parsedWithdrawGame * GAME_TO_TON_RATE : 0;
  const isTonConnected = Boolean(tonWallet && tonAddress);
  const walletName = tonWallet?.device.appName || tr('TON wallet', 'TON-кошелёк');

  const loadWithdrawalEligibility = useCallback(async () => {
    setIsEligibilityLoading(true);
    try {
      const response = await api.wallet.withdrawalEligibility(tonAddress);
      setWithdrawalEligibility(response);
      setEligibilityError(null);
    } catch (error) {
      setWithdrawalEligibility(null);
      setEligibilityError(
        error instanceof Error
          ? error.message
          : tr('Could not check withdrawal access', 'Не удалось проверить доступ к выводу'),
      );
    } finally {
      setIsEligibilityLoading(false);
    }
  }, [tonAddress, tr]);

  const loadWithdrawalHistory = useCallback(async (withSpinner = false) => {
    if (withSpinner) setIsHistoryLoading(true);
    try {
      const response = await api.wallet.withdrawalHistory();
      setWithdrawals(response.withdrawals);
      setHistoryError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : tr('Could not load history', 'Не удалось загрузить историю');
      setHistoryError(message);
    } finally {
      if (withSpinner) setIsHistoryLoading(false);
    }
  }, [tr]);

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
      if (event.key !== 'Escape') return;
      if (isEligibilityOpen) {
        setIsEligibilityOpen(false);
        return;
      }
      onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEligibilityOpen, shouldRender, onClose]);

  useEffect(() => {
    setWithdrawalKey(createIdempotencyKey());
  }, [withdrawAmount, tonAddress]);

  useEffect(() => {
    if (!isOpen) return;

    void loadWithdrawalHistory(activeTab === 'history');
    if (activeTab !== 'history') return;

    const timer = window.setInterval(() => {
      void loadWithdrawalHistory(false);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [activeTab, isOpen, loadWithdrawalHistory]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'withdraw') return;
    void loadWithdrawalEligibility();
  }, [activeTab, isOpen, loadWithdrawalEligibility]);

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

  const submitWithdrawal = async () => {
    setWithdrawalFeedback(null);

    if (!withdrawalEligibility?.eligible) {
      setIsEligibilityOpen(true);
      return;
    }

    if (!isConnectionRestored) {
      setWithdrawalFeedback({
        kind: 'error',
        message: tr('Wait while the wallet connection is checked.', 'Подожди, пока проверяется подключение кошелька.'),
      });
      return;
    }
    if (!isTonConnected) {
      setWithdrawalFeedback({
        kind: 'wallet',
        message: tr(
          'Connect a TON wallet first. Open Deposit and tap Connect wallet.',
          'Сначала подключи TON-кошелёк. Открой «Ввод» и нажми «Подключить кошелёк».',
        ),
      });
      return;
    }

    const amount = Number(withdrawAmount);
    const minimumAmount = withdrawalEligibility.minimum_amount;
    if (!Number.isSafeInteger(amount) || amount < minimumAmount) {
      setWithdrawalFeedback({
        kind: 'error',
        message: tr(
          `Enter a whole amount of at least ${minimumAmount} GAME.`,
          `Введи целую сумму не меньше ${minimumAmount} GAME.`,
        ),
      });
      return;
    }
    if (amount > Math.floor(user?.balance_game ?? 0)) {
      setWithdrawalFeedback({
        kind: 'error',
        message: tr('Not enough GAME on your balance.', 'Недостаточно GAME на балансе.'),
      });
      return;
    }

    setIsWithdrawing(true);
    try {
      const response = await api.wallet.createWithdrawal(amount, tonAddress, withdrawalKey);
      setWithdrawals((current) => [
        response.withdrawal,
        ...current.filter((item) => item.id !== response.withdrawal.id),
      ]);
      try {
        await refreshBalance();
      } catch {
        // The global balance poll will retry; the withdrawal itself already exists.
      }
      setWithdrawAmount('');
      void loadWithdrawalEligibility();
      setWithdrawalFeedback({
        kind: 'success',
        message: tr(
          'Withdrawal request sent. You can track it in History.',
          'Заявка на вывод отправлена. Её статус можно отслеживать в истории.',
        ),
      });
    } catch (error) {
      let message = error instanceof Error ? error.message : tr('Could not create withdrawal', 'Не удалось создать заявку');
      if (error instanceof ApiError) {
        if (error.status === 423) {
          message = tr('Withdrawal conditions are not completed yet.', 'Условия вывода пока не выполнены.');
          setIsEligibilityOpen(true);
          void loadWithdrawalEligibility();
        } else if (error.status === 409) {
          message = tr('Not enough GAME on your balance.', 'Недостаточно GAME на балансе.');
        } else if (error.status === 503) {
          message = tr('Withdrawals are temporarily unavailable.', 'Вывод временно недоступен.');
        }
      }
      setWithdrawalFeedback({ kind: 'error', message });
    } finally {
      setIsWithdrawing(false);
    }
  };

  if (!shouldRender) return null;

  const isHistory = activeTab === 'history';
  const isDeposit = activeTab === 'deposit';
  const eligibilityChecks = withdrawalEligibility ? [
    {
      key: 'wallet',
      label: tr('Deposit wallet confirmed', 'Кошелёк пополнения подтверждён'),
      value: withdrawalEligibility.wallet_verified
        ? tr('Confirmed', 'Подтверждён')
        : tr('Connect the wallet used for the latest deposit', 'Подключи кошелёк последнего пополнения'),
      complete: withdrawalEligibility.wallet_verified,
    },
    {
      key: 'games',
      label: tr('Completed paid games', 'Завершённые платные игры'),
      value: `${Math.min(withdrawalEligibility.games_completed, withdrawalEligibility.games_required)} / ${withdrawalEligibility.games_required}`,
      complete: withdrawalEligibility.games_completed >= withdrawalEligibility.games_required,
    },
    {
      key: 'wager',
      label: tr('Wagering progress', 'Прогресс отыгрыша'),
      value: `${formatBalance(Math.min(withdrawalEligibility.wagered_game, withdrawalEligibility.wager_required_game), 2)} / ${formatBalance(withdrawalEligibility.wager_required_game, 2)} GAME`,
      complete: withdrawalEligibility.wagered_game >= withdrawalEligibility.wager_required_game,
    },
    {
      key: 'balance',
      label: tr('Minimum withdrawal balance', 'Минимальный баланс для вывода'),
      value: `${formatBalance(withdrawalEligibility.balance_game, 2)} / ${withdrawalEligibility.minimum_amount} GAME`,
      complete: withdrawalEligibility.balance_ready,
    },
    {
      key: 'pending',
      label: tr('No pending request', 'Нет заявки в обработке'),
      value: withdrawalEligibility.no_pending_withdrawal
        ? tr('Ready', 'Готово')
        : tr('Wait for the current request', 'Дождись текущей заявки'),
      complete: withdrawalEligibility.no_pending_withdrawal,
    },
    {
      key: 'game',
      label: tr('No active game', 'Нет активной игры'),
      value: withdrawalEligibility.no_active_game
        ? tr('Ready', 'Готово')
        : tr('Finish the current game', 'Заверши текущую игру'),
      complete: withdrawalEligibility.no_active_game,
    },
    {
      key: 'cooldown',
      label: tr('Wallet security period', 'Период безопасности кошелька'),
      value: withdrawalEligibility.wallet_cooldown_ready
        ? tr('Ready', 'Готово')
        : withdrawalEligibility.wallet_cooldown_until
          ? new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(withdrawalEligibility.wallet_cooldown_until))
          : tr('Up to 24 hours', 'До 24 часов'),
      complete: withdrawalEligibility.wallet_cooldown_ready,
    },
  ] : [];
  const completedEligibilityChecks = eligibilityChecks.filter((item) => item.complete).length;

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
              <span>{tr('Withdrawal history', 'История выводов')}</span>
              <small>{withdrawals.length}</small>
            </div>

            {isHistoryLoading ? (
              <div className="wallet-history-state">
                <Loader2 size={19} className="animate-spin" />
                <span>{tr('Loading history', 'Загружаем историю')}</span>
              </div>
            ) : historyError ? (
              <div className="wallet-history-state is-error">
                <CircleAlert size={18} />
                <span>{historyError}</span>
                <button type="button" className="press" onClick={() => void loadWithdrawalHistory(true)}>
                  {tr('Retry', 'Повторить')}
                </button>
              </div>
            ) : withdrawals.length === 0 ? (
              <div className="wallet-history-state">
                <History size={19} />
                <span>{tr('No withdrawal requests yet', 'Заявок на вывод пока нет')}</span>
              </div>
            ) : (
              <div className="wallet-history-list">
                {withdrawals.map((item) => {
                  const isPending = item.status === 'pending';
                  const createdAt = new Intl.DateTimeFormat(locale, {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  }).format(new Date(item.created_at));

                  return (
                    <article className="wallet-history-item" key={item.id}>
                      <div className="wallet-history-icon is-withdraw">
                        <ArrowUpFromLine size={15} />
                      </div>

                      <div className="wallet-history-copy">
                        <strong>{tr('Withdrawal', 'Вывод')} · {formatBalance(item.game_amount, 0)} GAME</strong>
                        <span>{createdAt} · #{item.id}</span>
                      </div>

                      <div className="wallet-history-value">
                        <strong>{item.ton_amount} TON</strong>
                        <span className={isPending ? 'is-pending' : 'is-success'}>
                          {isPending ? <Clock3 size={9} /> : <Check size={9} />}
                          {isPending
                            ? tr('Pending', 'В ожидании')
                            : tr('Completed', 'Выполнено')}
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        ) : isDeposit ? (
          <div className="wallet-ton-connect" role="tabpanel">
            {!isConnectionRestored ? (
              <button type="button" disabled className="wallet-ton-button is-loading">
                <Loader2 size={15} className="animate-spin" />
                {tr('Checking connection', 'Проверяем подключение')}
              </button>
            ) : !isTonConnected ? (
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
            ) : (
              <>
                <div className="wallet-connected-row">
                  <div className="wallet-connected-icon">
                    <WalletCards size={17} />
                  </div>
                  <div className="wallet-connected-copy">
                    <strong>{walletName}</strong>
                    <span>{shortenAddress(tonAddress)}</span>
                  </div>
                  <button
                    type="button"
                    className="wallet-connected-disconnect press"
                    disabled={walletAction !== null}
                    onClick={() => void disconnectWallet()}
                    aria-label={tr('Disconnect wallet', 'Отключить кошелёк')}
                  >
                    {walletAction === 'disconnect' ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <LogOut size={14} />
                    )}
                    <span>{tr('Disconnect', 'Отключить')}</span>
                  </button>
                </div>

                <div className="wallet-simple-conversion wallet-deposit-conversion">
                  <label className="wallet-simple-amount">
                    <span>{tr('You pay', 'Отдаёшь')}</span>
                    <div>
                      <input
                        value={depositAmount}
                        onChange={(event) => setDepositAmount(sanitizeAmount(event.target.value))}
                        inputMode="decimal"
                        placeholder="1"
                      />
                      <span className="wallet-simple-currency">
                        <img src={tonIcon} alt="" draggable={false} />
                        TON
                      </span>
                    </div>
                  </label>

                  <div className="wallet-simple-arrow" aria-hidden="true">
                    <ArrowRight size={16} />
                  </div>

                  <div className="wallet-simple-result">
                    <span>{tr('You receive', 'Получишь')}</span>
                    <div>
                      <strong>{depositGameAmount > 0 ? formatBalance(depositGameAmount, 2) : '0'}</strong>
                      <span className="wallet-simple-currency">
                        <img src={coinIcon} alt="" className="is-game" draggable={false} />
                        GAME
                      </span>
                    </div>
                  </div>
                </div>

                <div className="wallet-simple-rate">1 TON = 10 GAME</div>

                <button type="button" disabled className="wallet-simple-submit">
                  {tr('Deposit', 'Пополнить')}
                </button>
              </>
            )}

            {walletError && <p className="wallet-ton-note is-error">{walletError}</p>}
          </div>
        ) : (
          <div className="wallet-withdraw-panel" role="tabpanel">
            {isEligibilityLoading && !withdrawalEligibility ? (
              <div className="wallet-withdraw-lock is-loading">
                <Loader2 size={22} className="animate-spin" />
                <strong>{tr('Checking withdrawal access', 'Проверяем доступ к выводу')}</strong>
              </div>
            ) : eligibilityError ? (
              <div className="wallet-withdraw-lock is-error">
                <CircleAlert size={23} />
                <strong>{tr('Withdrawal is unavailable', 'Вывод пока недоступен')}</strong>
                <span>{tr('Access could not be checked. Try again.', 'Не удалось проверить условия. Попробуй ещё раз.')}</span>
                <button type="button" className="press" onClick={() => void loadWithdrawalEligibility()}>
                  {tr('Try again', 'Повторить')}
                </button>
              </div>
            ) : !withdrawalEligibility?.eligible ? (
              <div className="wallet-withdraw-lock">
                <div className="wallet-withdraw-lock-icon"><LockKeyhole size={22} /></div>
                <strong>{tr('Withdrawal is locked', 'Вывод пока закрыт')}</strong>
                <span>
                  {tr(
                    'Complete all conditions to unlock withdrawal.',
                    'Выполни все условия, чтобы открыть вывод.',
                  )}
                </span>
                <div className="wallet-withdraw-lock-progress">
                  <div><i style={{ width: `${(completedEligibilityChecks / Math.max(eligibilityChecks.length, 1)) * 100}%` }} /></div>
                  <small>{completedEligibilityChecks} / {eligibilityChecks.length || 7}</small>
                </div>
                <button type="button" className="wallet-withdraw-rules-button press" onClick={() => setIsEligibilityOpen(true)}>
                  {tr('View conditions', 'Посмотреть условия')}
                  <ChevronRight size={14} />
                </button>
              </div>
            ) : (
              <>
            {isTonConnected && (
              <div className="wallet-withdraw-destination">
                <div>
                  <span>{tr('Destination wallet', 'Кошелёк получателя')}</span>
                  <strong>{shortenAddress(tonAddress)}</strong>
                </div>
                <span className="wallet-withdraw-connected">
                  <i aria-hidden="true" />
                  {tr('Connected', 'Подключён')}
                </span>
              </div>
            )}

            <div className="wallet-simple-conversion">
              <label className="wallet-simple-amount">
                <span>{tr('Withdraw', 'Вывести')}</span>
                <div>
                  <input
                    value={withdrawAmount}
                    onChange={(event) => {
                      setWithdrawAmount(sanitizeWholeAmount(event.target.value));
                      setWithdrawalFeedback(null);
                    }}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    min={withdrawalEligibility.minimum_amount}
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
              10 GAME = 1 TON · {tr('Whole GAME only', 'Только целое количество GAME')}
            </div>

            {withdrawalFeedback && (
              <div className={`wallet-withdraw-feedback is-${withdrawalFeedback.kind}`}>
                <div>
                  {withdrawalFeedback.kind === 'success' ? <Check size={15} /> : <CircleAlert size={15} />}
                  <span>{withdrawalFeedback.message}</span>
                </div>
                {withdrawalFeedback.kind === 'wallet' && (
                  <button type="button" className="press" onClick={() => setActiveTab('deposit')}>
                    {tr('Open Deposit', 'Перейти во «Ввод»')}
                    <ArrowRight size={12} />
                  </button>
                )}
                {withdrawalFeedback.kind === 'success' && (
                  <button type="button" className="press" onClick={() => setActiveTab('history')}>
                    {tr('Open History', 'Открыть историю')}
                    <ArrowRight size={12} />
                  </button>
                )}
              </div>
            )}

            <button
              type="button"
              disabled={isWithdrawing}
              className="wallet-simple-submit is-primary press"
              onClick={() => void submitWithdrawal()}
            >
              {isWithdrawing && <Loader2 size={14} className="animate-spin" />}
              {tr('Request withdrawal', 'Отправить заявку')}
            </button>
              </>
            )}
          </div>
        )}
      </section>

      {isEligibilityOpen && (
        <div className="wallet-eligibility-root">
          <button
            type="button"
            className="wallet-eligibility-backdrop"
            aria-label={tr('Close conditions', 'Закрыть условия')}
            onClick={() => setIsEligibilityOpen(false)}
          />
          <section className="wallet-eligibility-card" role="dialog" aria-modal="true" aria-labelledby="wallet-eligibility-title">
            <header>
              <div className="wallet-eligibility-mark"><LockKeyhole size={18} /></div>
              <div>
                <span>{tr('Withdrawal access', 'Доступ к выводу')}</span>
                <h3 id="wallet-eligibility-title">
                  {withdrawalEligibility?.eligible
                    ? tr('Withdrawal is open', 'Вывод открыт')
                    : tr('Complete the conditions', 'Выполни условия')}
                </h3>
              </div>
              <button type="button" className="wallet-eligibility-close press" onClick={() => setIsEligibilityOpen(false)} aria-label={tr('Close', 'Закрыть')}>
                <X size={16} />
              </button>
            </header>

            {isEligibilityLoading && !withdrawalEligibility ? (
              <div className="wallet-eligibility-loading"><Loader2 size={21} className="animate-spin" /></div>
            ) : (
              <>
                <div className="wallet-eligibility-summary">
                  <div><i style={{ width: `${(completedEligibilityChecks / Math.max(eligibilityChecks.length, 1)) * 100}%` }} /></div>
                  <span>{completedEligibilityChecks} {tr('of', 'из')} {eligibilityChecks.length || 7}</span>
                </div>

                <div className="wallet-eligibility-list">
                  {eligibilityChecks.map((item) => (
                    <article key={item.key} className={item.complete ? 'is-complete' : ''}>
                      <div className="wallet-eligibility-status">
                        {item.complete ? <CircleCheck size={17} /> : <LockKeyhole size={14} />}
                      </div>
                      <div>
                        <strong>{item.label}</strong>
                        <span>{item.value}</span>
                      </div>
                    </article>
                  ))}
                </div>

                <p className="wallet-eligibility-note">
                  {tr(
                    'Deposits require 1× wagering; bonus GAME requires 3×. Progress restarts after a completed withdrawal.',
                    'Пополнения отыгрываются ×1, бонусные GAME — ×3. Прогресс начинается заново после завершённого вывода.',
                  )}
                </p>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
};
