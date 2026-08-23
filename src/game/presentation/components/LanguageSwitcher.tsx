import { useI18n, type Language } from '../../i18n/I18nProvider';

const OPTIONS: readonly Language[] = ['ko', 'en'];

export function LanguageSwitcher() {
  const { language, setLanguage, t } = useI18n();
  return <div className="language-switcher" role="group" aria-label={t('language.selector')}>
    {OPTIONS.map((option) => <button
      key={option}
      type="button"
      className={language === option ? 'active' : ''}
      aria-pressed={language === option}
      data-testid={`language-${option}`}
      onClick={() => setLanguage(option)}
    >{option === 'ko' ? t('language.korean') : t('language.english')}</button>)}
  </div>;
}
