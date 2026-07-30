import { useEffect } from 'react';
import type { AppLanguage } from './LanguageContext';

const LEGACY_GAME_TEXT: ReadonlyArray<readonly [string, string]> = [
  ['Player', 'Игрок'],
  ['Opponent', 'Соперник'],
  ['You', 'Ты'],
  ['Victory', 'Победа'],
  ['Defeat', 'Поражение'],
  ['Draw', 'Ничья'],
  ['Result', 'Результат'],
  ['Match result', 'Результат матча'],
  ['Match complete', 'Матч завершён'],
  ['Game complete', 'Игра завершена'],
  ['Game started', 'Игра началась'],
  ['Game connected', 'Игра подключена'],
  ['Waiting', 'Ожидание'],
  ['Waiting for opponent', 'Ожидание соперника'],
  ['Connecting', 'Подключение'],
  ['Connected', 'Подключено'],
  ['Connection lost', 'Связь потеряна'],
  ['No connection', 'Нет подключения'],
  ['No game connection', 'Нет подключения к игре'],
  ['Connection error', 'Ошибка подключения'],
  ['Game connection error', 'Ошибка подключения к игре'],
  ['WebSocket error', 'Ошибка WebSocket'],
  ['Ready', 'Готово'],
  ['Get ready', 'Готовься'],
  ['Your turn', 'Твой ход'],
  ["Opponent's turn", 'Ход соперника'],
  ['Play', 'Играть'],
  ['Start', 'Старт'],
  ['Start again', 'Заново'],
  ['Again', 'Снова'],
  ['Back', 'Назад'],
  ['Back to lobby', 'К лобби'],
  ['Leave lobby', 'Выйти из лобби'],
  ['Bet', 'Ставка'],
  ['Current bet', 'Текущая ставка'],
  ['Winnings', 'Выигрыш'],
  ['Payout', 'Выплата'],
  ['Refund', 'Возврат'],
  ['Final amount', 'Итог'],
  ['Multiplier', 'Множитель'],
  ['Current', 'Сейчас'],
  ['Next', 'Далее'],
  ['Floor', 'Этаж'],
  ['Steps', 'Шагов'],
  ['Open', 'Открыто'],
  ['How to play', 'Как играется'],
  ['How it works', 'Как это работает'],
  ['Rewards', 'Выплаты'],
  ['Best match result', 'Лучший результат матча'],
  ['Same result', 'Одинаковый результат'],
  ['Net amount', 'Чистая сумма'],
  ['Bet refunded', 'Ставка возвращена'],
  ['Searching', 'Поиск'],
  ['Searching…', 'Ищем…'],
  ['Cancelling…', 'Отменяем…'],
  ['Reconnect', 'Переподключиться'],
  ['Try again', 'Повторить'],
  ['Close', 'Закрыть'],
  ['Information', 'Информация'],
];

const translateKnownText = (value: string, language: AppLanguage) => {
  const leading = value.match(/^\s*/)?.[0] ?? '';
  const trailing = value.match(/\s*$/)?.[0] ?? '';
  const cleanValue = value.trim();
  const pair = LEGACY_GAME_TEXT.find(
    ([english, russian]) =>
      cleanValue === english || cleanValue === russian,
  );

  if (!pair) return value;
  const translated = language === 'en' ? pair[0] : pair[1];
  return `${leading}${translated}${trailing}`;
};

export const LegacyGameTranslationBridge = ({
  language,
}: {
  language: AppLanguage;
}) => {
  useEffect(() => {
    const translateNode = (root: Node) => {
      if (root.nodeType === Node.TEXT_NODE && root.textContent) {
        const nextValue = translateKnownText(root.textContent, language);
        if (nextValue !== root.textContent) root.textContent = nextValue;
        return;
      }

      if (!(root instanceof Element)) return;
      if (root.matches('script, style')) return;

      for (const attribute of ['aria-label', 'placeholder', 'title'] as const) {
        const value = root.getAttribute(attribute);
        if (!value) continue;
        const nextValue = translateKnownText(value, language);
        if (nextValue !== value) root.setAttribute(attribute, nextValue);
      }

      root.childNodes.forEach(translateNode);
    };

    translateNode(document.body);

    const observer = new MutationObserver((records) => {
      records.forEach((record) => {
        if (record.type === 'attributes') {
          translateNode(record.target);
          return;
        }

        record.addedNodes.forEach(translateNode);
      });
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-label', 'placeholder', 'title'],
    });

    return () => observer.disconnect();
  }, [language]);

  return null;
};
