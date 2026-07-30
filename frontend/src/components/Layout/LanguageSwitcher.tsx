import { useLanguage } from '../../i18n/LanguageContext';

export const LanguageSwitcher = () => {
  const { language, toggleLanguage, tr } = useLanguage();

  return (
    <button
      type="button"
      className={`language-switcher is-${language}`}
      onClick={toggleLanguage}
      aria-label={tr(
        `Switch language to ${language === 'en' ? 'Russian' : 'English'}`,
        `Переключить язык на ${language === 'en' ? 'русский' : 'английский'}`,
      )}
    >
      <span className="language-switcher-thumb" aria-hidden="true" />
      <span
        className={`language-switcher-label ${language === 'en' ? 'is-active' : ''}`}
        aria-hidden="true"
      >
        EN
      </span>
      <span
        className={`language-switcher-label ${language === 'ru' ? 'is-active' : ''}`}
        aria-hidden="true"
      >
        RU
      </span>
    </button>
  );
};
