import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { LegacyGameTranslationBridge } from './LegacyGameTranslationBridge';

export type AppLanguage = 'en' | 'ru';

type LanguageContextValue = {
  language: AppLanguage;
  locale: 'en-US' | 'ru-RU';
  setLanguage: (language: AppLanguage) => void;
  toggleLanguage: () => void;
  tr: (english: string, russian: string) => string;
  localize: (message: string) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

const MESSAGE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['API error', 'Ошибка API'],
  ['Failed to fetch', 'Не удалось подключиться к серверу'],
  ['Authentication error', 'Ошибка авторизации'],
  [
    'No Telegram initData. Open the app via @twingames_bot.',
    'Нет Telegram initData. Открой приложение через бота @twingames_bot.',
  ],
  ['Failed to load rating', 'Не удалось загрузить рейтинг'],
  ['Unknown error', 'Неизвестная ошибка'],
  ['Not enough coins', 'Недостаточно монет'],
  ['Not enough coins for this bet', 'Недостаточно монет для этой ставки'],
  ['Game code not found', 'Не найден код игры'],
  ['Lobby ID not found', 'ID лобби не найден'],
  ['Game connection error', 'Ошибка подключения к игре'],
  ['No game connection', 'Нет подключения к игре'],
  ['WebSocket error', 'Ошибка WebSocket'],
];

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguage] = useState<AppLanguage>('en');

  const toggleLanguage = useCallback(() => {
    setLanguage((current) => (current === 'en' ? 'ru' : 'en'));
  }, []);

  const tr = useCallback(
    (english: string, russian: string) =>
      language === 'en' ? english : russian,
    [language],
  );

  const localize = useCallback(
    (message: string) => {
      const cleanMessage = message.trim();
      const pair = MESSAGE_PAIRS.find(
        ([english, russian]) =>
          cleanMessage === english || cleanMessage === russian,
      );

      if (!pair) return message;
      return language === 'en' ? pair[0] : pair[1];
    },
    [language],
  );

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      locale: language === 'en' ? 'en-US' : 'ru-RU',
      setLanguage,
      toggleLanguage,
      tr,
      localize,
    }),
    [language, localize, toggleLanguage, tr],
  );

  return (
    <LanguageContext.Provider value={value}>
      <LegacyGameTranslationBridge language={language} />
      {children}
    </LanguageContext.Provider>
  );
};

// Kept beside the provider so every consumer imports a single i18n module.
// eslint-disable-next-line react-refresh/only-export-components
export const useLanguage = () => {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error('useLanguage must be used inside LanguageProvider');
  }

  return context;
};
