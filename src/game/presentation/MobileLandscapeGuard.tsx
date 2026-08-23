import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/I18nProvider';

interface LockableScreenOrientation extends ScreenOrientation {
  lock?: (orientation: 'landscape') => Promise<void>;
}

async function requestLandscapeLock(enterFullscreen: boolean): Promise<boolean> {
  if (enterFullscreen && !document.fullscreenElement && document.documentElement.requestFullscreen) {
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // iOS Safari and embedded browsers can reject fullscreen while still allowing manual rotation.
    }
  }

  const orientation = screen.orientation as LockableScreenOrientation | undefined;
  if (!orientation?.lock) return false;

  try {
    await orientation.lock('landscape');
    return true;
  } catch {
    return false;
  }
}

export function MobileLandscapeGuard() {
  const [automaticLockFailed, setAutomaticLockFailed] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    const tryAutomaticLock = () => {
      if (window.matchMedia('(pointer: coarse)').matches && window.innerHeight > window.innerWidth) {
        void requestLandscapeLock(false);
      }
    };

    tryAutomaticLock();
    window.addEventListener('resize', tryAutomaticLock);
    screen.orientation?.addEventListener('change', tryAutomaticLock);
    return () => {
      window.removeEventListener('resize', tryAutomaticLock);
      screen.orientation?.removeEventListener('change', tryAutomaticLock);
    };
  }, []);

  const enterLandscape = async () => {
    const locked = await requestLandscapeLock(true);
    setAutomaticLockFailed(!locked);
  };

  return <aside className="mobile-landscape-guard" role="alertdialog" aria-modal="true" aria-labelledby="landscape-guard-title">
    <div className="landscape-device-icon" aria-hidden="true"><span /></div>
    <p className="eyebrow">{t('mobile.display')}</p>
    <h2 id="landscape-guard-title">{t('mobile.landscapeTitle')}</h2>
    <p>{t('mobile.landscapeCopy')}</p>
    <button className="primary-button" onClick={enterLandscape}>{t('mobile.startLandscape')}</button>
    {automaticLockFailed && <small>{t('mobile.rotationUnsupported')}</small>}
  </aside>;
}
