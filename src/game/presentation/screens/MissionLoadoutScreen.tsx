'use client';

import { useMemo, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { displayCityName, displayEnum, displayRuntimeText } from '../../i18n/gameContent';
import { CITIES } from '../../data/cities';
import { BALANCE } from '../../domain/balance';
import { upgradeLevel } from '../../domain/campaignRules';
import { calculateCellChargeCost, calculateTravelChargeCost, canStartOccupation, validateMissionLoadout } from '../../domain/logisticsRules';
import type { CampaignState, CityDefinition, CohortState, MissionLoadout, MissionType } from '../../domain/types';

interface MissionLoadoutScreenProps {
  campaign: CampaignState;
  city: CityDefinition;
  existingLoadout: MissionLoadout | null;
  onCancel: () => void;
  onConfirm: (loadout: MissionLoadout) => void;
  onResume: () => void;
  onEmergencyCharge: () => void;
}

export function MissionLoadoutScreen({ campaign, city, existingLoadout, onCancel, onConfirm, onResume, onEmergencyCharge }: MissionLoadoutScreenProps) {
  const { formatNumber, language, t } = useI18n();
  const [missionType, setMissionType] = useState<MissionType>(existingLoadout?.missionType ?? 'RAID');
  const [selectedCohortIds, setSelectedCohortIds] = useState<string[]>(existingLoadout?.cohortIds ?? []);
  const [overchargeCells, setOverchargeCells] = useState(existingLoadout?.overchargeCells ?? 0);
  const availableCohorts = useMemo(() => Object.values(campaign.cohorts).filter((cohort) => cohort.status === 'RESERVE'), [campaign.cohorts]);
  const cityState = campaign.cities[city.id];
  const origin = campaign.currentCityId ? CITIES.find((candidate) => candidate.id === campaign.currentCityId) ?? null : null;
  const travelCost = existingLoadout?.travelChargeCost ?? calculateTravelChargeCost(campaign, origin, city);
  const cellCost = existingLoadout?.cellChargeCost ?? calculateCellChargeCost(overchargeCells);
  const totalCost = travelCost + cellCost;
  const draft = existingLoadout ?? {
    id: `mission-${campaign.campaignId}-${Math.round(campaign.currentTimeMinutes * 60)}-${city.id}`,
    cityId: city.id,
    missionType,
    cohortIds: selectedCohortIds,
    overchargeCells,
    travelChargeCost: travelCost,
    cellChargeCost: cellCost,
    createdAtMinutes: campaign.currentTimeMinutes,
  } satisfies MissionLoadout;
  const validation = existingLoadout ? { ok: true } : validateMissionLoadout(campaign, draft);
  const maxCohorts = Math.min(campaign.logistics.dropCapacity, campaign.logistics.commandBandwidth);
  const occupationAvailable = canStartOccupation(campaign, city.id);
  const insufficientCore = totalCost > campaign.logistics.coreCharge;
  const emergencyCharge = BALANCE.conquest.emergencyTravelCharge + upgradeLevel(campaign, 'emergency-bio-conversion') * 4;
  const lockedReason = cityState?.conquest.controlState === 'UNTOUCHED' || cityState?.conquest.controlState === 'RAIDED' ? t('mission.breachFirst') : t('mission.occupationAvailable');

  const toggleCohort = (cohort: CohortState) => {
    if (existingLoadout) return;
    setSelectedCohortIds((current) => current.includes(cohort.id)
      ? current.filter((id) => id !== cohort.id)
      : current.length >= maxCohorts ? current : [...current, cohort.id]);
  };

  return <main className="loadout-screen"><div className="loadout-card">
    <header className="loadout-header"><div><p className="eyebrow">{t('mission.control', { city: displayCityName(city, language).toUpperCase() })}</p><h1>{existingLoadout ? t('mission.ready') : t('mission.plan')}</h1><p className="loadout-copy">{t('mission.copy')}</p></div><button className="small-button" onClick={onCancel}>{t('common.backToMap')}</button></header>
    <div className="loadout-city-readout"><span>{t('mission.powerPotential')} <strong>{rating(city.resourceRating)}</strong></span><span>{t('mission.techIndex')} <strong>{rating(city.technologyRating)}</strong></span><span>{t('mission.airDefense')} <strong>{rating(city.defenseRating)}</strong></span><span>{t('mission.controlState')} <strong>{cityState ? displayEnum(cityState.conquest.controlState, language) : t('common.unknown')}</strong></span><span>{t('mission.resistance')} <strong>{Math.round(cityState?.conquest.resistance ?? 0)}%</strong></span></div>
    <div className="loadout-resource-board"><span><small>{t('resource.coreCharge')}</small><strong>{formatNumber(Math.floor(campaign.logistics.coreCharge))} / {formatNumber(campaign.logistics.maxCoreCharge)}</strong></span><span><small>{t('mission.travelCost')}</small><strong>{travelCost}</strong></span><span><small>{t('mission.cellCost')}</small><strong>{cellCost}</strong></span><span><small>{t('mission.afterLaunch')}</small><strong className={insufficientCore ? 'is-danger' : ''}>{formatNumber(Math.floor(campaign.logistics.coreCharge - totalCost))}</strong></span></div>
    <section className="loadout-section"><div className="loadout-section-heading"><div><span className="panel-kicker">{t('mission.typeStep')}</span><h2>{t('mission.choosePressure')}</h2></div><span className="loadout-city-state">{cityState ? displayEnum(cityState.conquest.controlState, language) : t('common.unknown')}</span></div><div className="mission-type-grid"><button className={`mission-type-card ${missionType === 'RAID' ? 'selected' : ''}`} disabled={Boolean(existingLoadout)} onClick={() => setMissionType('RAID')}><span>{t('mission.raid')}</span><strong>{t('mission.raidTitle')}</strong><small>{t('mission.raidCopy')}</small></button><button className={`mission-type-card ${missionType === 'OCCUPATION' ? 'selected' : ''} ${!occupationAvailable ? 'locked' : ''}`} disabled={Boolean(existingLoadout) || !occupationAvailable} onClick={() => setMissionType('OCCUPATION')}><span>{t('mission.occupation')}</span><strong>{t('mission.occupationTitle')}</strong><small>{occupationAvailable ? t('mission.occupationCopy') : lockedReason}</small></button></div></section>
    <section className="loadout-section"><div className="loadout-section-heading"><div><span className="panel-kicker">{t('mission.cohortStep')}</span><h2>{t('mission.reserveDeployment')}</h2></div><span className="loadout-capacity">{t('mission.selected', { count: selectedCohortIds.length, max: maxCohorts })}</span></div><div className="cohort-loadout-list">{availableCohorts.length ? availableCohorts.map((cohort) => <button key={cohort.id} className={`cohort-loadout-row ${selectedCohortIds.includes(cohort.id) ? 'selected' : ''}`} disabled={Boolean(existingLoadout)} onClick={() => toggleCohort(cohort)}><span className="cohort-check">{selectedCohortIds.includes(cohort.id) ? '✓' : '○'}</span><span><strong>{cohort.id} / {displayEnum(cohort.type, language)}</strong><small>{t('mission.strength')} {Math.round(cohort.strength)} · {t('mission.cohesion')} {Math.round(cohort.cohesion)} · {t('mission.controlValue')} {Math.round(cohort.control)}</small></span><em>{displayEnum(cohort.status, language)}</em></button>) : <div className="loadout-empty"><span className="status-dot" /> {t('mission.noReserve')}</div>}</div><div className="loadout-limits"><span>{t('mission.dropCapacity')} <strong>{campaign.logistics.dropCapacity}</strong></span><span>{t('mission.commandBandwidth')} <strong>{campaign.logistics.commandBandwidth}</strong></span><span>{t('mission.assaultOnly')} <strong>{t('mission.active')}</strong></span></div></section>
    <section className="loadout-section"><div className="loadout-section-heading"><div><span className="panel-kicker">{t('mission.overchargeStep')}</span><h2>{t('mission.heavyOptions')}</h2></div><span className="loadout-capacity">{t('mission.cells', { count: overchargeCells, max: campaign.logistics.maxOverchargeCells })}</span></div><div className="cell-selector"><div><strong>{t('mission.overchargeCells')}</strong><small>{t('mission.overchargeCopy')}</small></div><div className="cell-stepper"><button aria-label={t('mission.removeCell')} disabled={Boolean(existingLoadout) || overchargeCells <= 0} onClick={() => setOverchargeCells((count) => Math.max(0, count - 1))}>−</button><strong>{overchargeCells}</strong><button aria-label={t('mission.addCell')} disabled={Boolean(existingLoadout) || overchargeCells >= campaign.logistics.maxOverchargeCells} onClick={() => setOverchargeCells((count) => Math.min(campaign.logistics.maxOverchargeCells, count + 1))}>+</button></div></div></section>
    <footer className="loadout-footer"><div className={`loadout-validation ${validation.ok ? 'valid' : 'invalid'}`}><span className="status-dot" />{existingLoadout ? t('mission.routeConfirmed') : validation.reason ? displayRuntimeText(validation.reason, language) : t('mission.loadoutValid')}</div><div className="loadout-actions">{insufficientCore && !existingLoadout && <button className="secondary-button" onClick={onEmergencyCharge} disabled={campaign.logistics.coreCharge >= campaign.logistics.maxCoreCharge}>{t('mission.emergencyCore', { count: emergencyCharge })}</button>}{existingLoadout ? <button className="primary-button" onClick={onResume}>{t('mission.enterAirspace')} <span>↗</span></button> : <button className="primary-button" disabled={!validation.ok} onClick={() => onConfirm(draft)}>{t('mission.commit')} <span>→</span></button>}</div></footer>
  </div></main>;
}

function rating(value: number) { return '◆'.repeat(value) + '◇'.repeat(5 - value); }
