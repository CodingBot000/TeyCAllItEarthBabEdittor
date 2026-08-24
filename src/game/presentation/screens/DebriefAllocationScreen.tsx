'use client';

import { useMemo, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { displayEnum, displayRuntimeText } from '../../i18n/gameContent';
import { BALANCE } from '../../domain/balance';
import { defaultConversionPlan, previewConversion, type ConversionDoctrine, type ConversionPlan } from '../../domain/conversionRules';
import type { CampaignState, PendingDebriefState } from '../../domain/types';

export function DebriefAllocationScreen({ campaign, pending, onFinalize }: { campaign: CampaignState; pending: PendingDebriefState; onFinalize: (plan: ConversionPlan) => void }) {
  const { formatNumber, language, t } = useI18n();
  const initial = defaultConversionPlan(campaign, pending, 'BALANCED');
  const [doctrine, setDoctrine] = useState<ConversionDoctrine>(initial.doctrine);
  const [cohortCount, setCohortCount] = useState(initial.cohortCount);
  const [reserveCaptives, setReserveCaptives] = useState(initial.reserveCaptives);
  const occupationNeedsGarrison = pending.missionType === 'OCCUPATION' && pending.outcome === 'SUCCESS';
  const [garrisonCohortIds, setGarrisonCohortIds] = useState<string[]>(occupationNeedsGarrison ? pending.garrisonCandidateIds.slice(0, BALANCE.occupation.requiredGarrisonCohorts) : []);
  const maxCohorts = Math.min(campaign.logistics.conversionCapacity, Math.floor(pending.cargoRecovered.captives / BALANCE.conversion.captivesPerCohort));
  const plan = useMemo<ConversionPlan>(() => ({
    doctrine,
    cohortCount,
    reserveCaptives,
    biomassCaptives: Math.floor(pending.cargoRecovered.captives) - cohortCount * BALANCE.conversion.captivesPerCohort - reserveCaptives,
    garrisonCohortIds: occupationNeedsGarrison ? garrisonCohortIds : undefined,
  }), [cohortCount, doctrine, garrisonCohortIds, occupationNeedsGarrison, pending.cargoRecovered.captives, reserveCaptives]);
  const preview = previewConversion(campaign, pending, plan);
  const chooseDoctrine = (next: ConversionDoctrine) => {
    const preset = defaultConversionPlan(campaign, pending, next);
    setDoctrine(next);
    setCohortCount(preset.cohortCount);
    setReserveCaptives(preset.reserveCaptives);
  };
  const adjustCohorts = (delta: number) => setCohortCount((value) => Math.max(0, Math.min(maxCohorts, value + delta)));
  const adjustReserve = (delta: number) => setReserveCaptives((value) => Math.max(0, Math.min(campaign.logistics.maxCaptiveReserve - campaign.logistics.captiveReserve, value + delta)));
  const toggleGarrison = (cohortId: string) => setGarrisonCohortIds((current) => current.includes(cohortId) ? current.filter((id) => id !== cohortId) : [...current, cohortId]);
  return <main className="debrief-allocation-screen"><section className="debrief-allocation-card">
    <p className="eyebrow">{t('allocation.pending', { city: pending.cityId.toUpperCase() })}</p>
    <h1>{t('allocation.title')}</h1>
    <p className="debrief-subtitle">{t('allocation.copy')}</p>
    <div className="allocation-facts"><span><small>{t('allocation.outcome')}</small><strong>{displayEnum(pending.outcome, language)}</strong></span><span><small>{t('allocation.recovered')}</small><strong>{formatNumber(pending.cargoRecovered.captives)}</strong></span><span><small>{t('resource.coreCharge')}</small><strong>+{pending.cargoRecovered.coreCharge.toFixed(1)}</strong></span><span><small>{t('allocation.reserveSpace')}</small><strong>{formatNumber(campaign.logistics.captiveReserve)} / {formatNumber(campaign.logistics.maxCaptiveReserve)}</strong></span></div>
    <div className="allocation-doctrines" role="group" aria-label={t('allocation.doctrine')}>{(['LEGION', 'BALANCED', 'SUSTAIN'] as const).map((item) => <button key={item} className={`doctrine-button ${doctrine === item ? 'active' : ''}`} onClick={() => chooseDoctrine(item)}><strong>{displayEnum(item, language)}</strong><small>{item === 'LEGION' ? t('allocation.legionPressure') : item === 'SUSTAIN' ? t('allocation.sustainPressure') : t('allocation.balancedPressure')}</small></button>)}</div>
    <div className="allocation-controls"><AllocationControl label={t('allocation.cohorts')} value={`${cohortCount} / ${maxCohorts}`} hint={t('allocation.captivesEach', { count: formatNumber(BALANCE.conversion.captivesPerCohort) })} onMinus={() => adjustCohorts(-1)} onPlus={() => adjustCohorts(1)} /><AllocationControl label={t('allocation.reserve')} value={formatNumber(reserveCaptives)} hint={t('allocation.storedLater')} onMinus={() => adjustReserve(-100)} onPlus={() => adjustReserve(100)} /></div>
    {occupationNeedsGarrison && <div className="garrison-selection"><div><span>{t('allocation.garrison')}</span><small>{t('allocation.selectGarrison', { count: BALANCE.occupation.requiredGarrisonCohorts })}</small></div><div className="garrison-candidates">{pending.garrisonCandidateIds.map((cohortId) => <button key={cohortId} className={garrisonCohortIds.includes(cohortId) ? 'selected' : ''} onClick={() => toggleGarrison(cohortId)}><strong>{cohortId.toUpperCase()}</strong><small>{garrisonCohortIds.includes(cohortId) ? t('allocation.garrisonLocked') : t('common.available')}</small></button>)}</div></div>}
    <div className="allocation-preview"><div><span>{t('allocation.cohortInput')}</span><strong>{formatNumber(preview.cohortCaptives)}</strong></div><div><span>{t('allocation.biomassInput')}</span><strong>{formatNumber(preview.biomassCaptives)}</strong></div><div><span>{t('allocation.biomassGained')}</span><strong>+{formatNumber(preview.biomassGained)}</strong></div><div><span>{t('allocation.finalReserve')}</span><strong>{formatNumber(preview.finalCaptiveReserve)}</strong></div></div>
    {!preview.valid && <p className="allocation-error" role="alert">{preview.reason && displayRuntimeText(preview.reason, language)}</p>}
    <div className="debrief-actions"><button className="primary-button" disabled={!preview.valid} onClick={() => onFinalize(plan)}>{t('allocation.finalize')}</button></div>
  </section></main>;
}

function AllocationControl({ label, value, hint, onMinus, onPlus }: { label: string; value: string; hint: string; onMinus: () => void; onPlus: () => void }) {
  return <div className="allocation-control"><div><span>{label}</span><small>{hint}</small></div><div className="allocation-stepper"><button aria-label={`${label} 감소`} onClick={onMinus}>−</button><strong>{value}</strong><button aria-label={`${label} 증가`} onClick={onPlus}>+</button></div></div>;
}
