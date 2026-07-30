import { Loader2, Shuffle, Swords, X } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';

export const TurboMatchmakingOverlay = ({
  error,
  onCancel,
}: {
  error?: string | null;
  onCancel: () => void;
}) => {
  const { tr } = useLanguage();

  return (
    <div className="turbo-matchmaking-overlay" role="dialog" aria-modal="true">
      <div className="turbo-matchmaking-card">
        <button
          type="button"
          onClick={onCancel}
          className="turbo-matchmaking-close"
          aria-label={tr('Cancel search', 'Отменить поиск')}
        >
          <X size={16} />
        </button>

        <div className="turbo-matchmaking-core">
          <span className="turbo-search-ring is-one" />
          <span className="turbo-search-ring is-two" />
          <Loader2 size={28} />
        </div>

        <span className="turbo-matchmaking-kicker">
          <Swords size={11} />
          Turbo
        </span>
        <h2>{tr('Searching for an opponent', 'Ищем соперника')}</h2>
        <p>
          {tr(
            'The series starts automatically as soon as another player enters the queue.',
            'Серия начнётся автоматически, как только в очередь войдёт второй игрок.',
          )}
        </p>

        <div className="turbo-matchmaking-meta">
          <span><Shuffle size={12} /> {tr('3 random games', '3 случайные игры')}</span>
          <span>Best of 3</span>
          <strong>100</strong>
        </div>

        {error && <div className="turbo-matchmaking-error">{error}</div>}
      </div>
    </div>
  );
};
