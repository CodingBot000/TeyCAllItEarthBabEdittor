import { LanguageSwitcher } from '../components/LanguageSwitcher';

interface MainMenuScreenProps {
  hasSave: boolean;
  onNewGame: () => void;
  onContinue: () => void;
  onQuickBattle?: () => void;
  onQuickNightBattle?: () => void;
  onReset: () => void;
}

export function MainMenuScreen({ hasSave, onNewGame, onContinue, onQuickBattle, onQuickNightBattle, onReset }: MainMenuScreenProps) {
  const { t } = useI18n();
  return (
    <main className="menu-screen scanlines">
      <LanguageSwitcher />
      <img className="menu-key-art" src="/assets/runtime/cards/main-menu-key-art.webp" alt="" aria-hidden="true" />
      <div className="menu-orbit orbit-a" />
      <div className="menu-orbit orbit-b" />
      <section className="menu-card">
        <div className="menu-center">
          <h1>{t('brand.theyCallIt')} <span>{t('brand.earth')}</span></h1>
          <p className="menu-subtitle">{t('main.subtitle')}</p>
        </div>
        <div className="menu-actions">
          <button className="primary-button" onClick={onNewGame}>{t('main.newCampaign')}</button>
          <button className="secondary-button" onClick={onContinue} disabled={!hasSave}>{t('main.continue')}</button>
          {onQuickBattle ? <button className="secondary-button quick-battle-button" onClick={onQuickBattle}>{t('main.quickBattle')}</button> : null}
          {onQuickNightBattle ? <button className="secondary-button quick-battle-button quick-night-battle-button" onClick={onQuickNightBattle}>{t('main.quickNightBattle')}</button> : null}
        </div>
        <button className="text-button" onClick={onReset} disabled={!hasSave}>{t('main.erase')}</button>
      </section>
    </main>
  );
}
import { useI18n } from '../../i18n/I18nProvider';
