import { useLanguage } from '../../i18n/LanguageContext';

export const LanguageSwitcher = () => {
  const { language, setLanguage, tr } = useLanguage();

  return (
    <div
      className="language-switcher"
      role="group"
      aria-label={tr('Language', 'Язык')}
    >
      {(['en', 'ru'] as const).map((option) => (
        <button
          key={option}
          type="button"
          className={language === option ? 'is-active' : ''}
          onClick={() => setLanguage(option)}
          aria-pressed={language === option}
        >
          {option.toUpperCase()}
        </button>
      ))}
    </div>
  );
};
