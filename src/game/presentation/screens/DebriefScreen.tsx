import type { DebriefSummary } from '../../domain/types';
import { useI18n } from '../../i18n/I18nProvider';

export function DebriefScreen({ summary, onAllocate }: { summary: DebriefSummary; onAllocate: () => void }) {
  const { formatNumber, t } = useI18n();
  const outcomeCopy = summary.outcome === 'SUCCESS'
    ? { signal: t('debrief.successSignal'), title: t('debrief.successTitle') }
    : summary.outcome === 'PARTIAL'
      ? { signal: t('debrief.partialSignal'), title: t('debrief.partialTitle') }
      : { signal: t('debrief.failedSignal'), title: t('debrief.failedTitle') };
  return <main className="debrief-screen"><div className={`debrief-card ${summary.outcome.toLowerCase()}`}>
    <p className="eyebrow">{t('debrief.insertionComplete', { signal: outcomeCopy.signal })}</p>
    <h1>{outcomeCopy.title}</h1>
    <p className="debrief-subtitle">{t('debrief.summary', { sites: summary.destroyedInfrastructure, captives: formatPeople(summary.cargo.captives, t, formatNumber), core: formatReward(summary.cargo.coreCharge, formatNumber) })}</p>
    <div className="debrief-grid"><Stat label={t('debrief.timeInAirspace')} value={`${summary.timeSeconds.toFixed(1)}s`} /><Stat label={t('debrief.totalAbsorbed')} value={formatUnits(summary.totalAbsorbed, t, formatNumber)} accent /><Stat label={t('debrief.cargoCapacity')} value={formatUnits(summary.cargoCapacity, t, formatNumber)} /><Stat label={t('debrief.organic')} value={formatPeople(summary.absorbedByKind.ORGANIC, t, formatNumber)} /><Stat label={t('debrief.globalThreat')} value={`+${summary.globalThreatDelta.toFixed(1)}`} /></div>
    <div className="loot-strip"><span><small>{t('resource.biomass')}</small><strong>+{summary.earned.biomass.toFixed(1)}</strong></span><span><small>{t('resource.alloy')}</small><strong>+{summary.earned.alloy.toFixed(1)}</strong></span><span><small>{t('resource.intel')}</small><strong>+{summary.earned.intel.toFixed(1)}</strong></span><span><small>{t('debrief.hull')}</small><strong>{Math.round(summary.hullRatio * 100)}%</strong></span><span><small>{t('debrief.shield')}</small><strong>{Math.round(summary.shieldRatio * 100)}%</strong></span></div>
    {summary.repairAssessment ? <div className="debrief-repair"><span>{t('battle.repairAssessment')}</span><strong>{t('battle.repairCost', { biomass: summary.repairAssessment.biomassCost, alloy: summary.repairAssessment.alloyCost })}</strong>{summary.repairAssessment.unpaidBiomass > 0 || summary.repairAssessment.unpaidAlloy > 0 ? <small>{t('battle.emergencyRepair')}</small> : null}</div> : null}
    <div className="debrief-actions"><button className="primary-button" onClick={onAllocate}>{t('debrief.openAllocation')}</button></div>
  </div></main>;
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) { return <div className={`debrief-stat ${accent ? 'accent' : ''}`}><span>{label}</span><strong>{value}</strong></div>; }
function formatUnits(value: number, t: (key: string, values?: Record<string, string | number>) => string, formatNumber: (value: number) => string) { return t('debrief.units', { value: value >= 1000000 ? `${(value / 1000000).toFixed(2)}M` : formatNumber(Math.round(value)) }); }
function formatPeople(value: number, t: (key: string, values?: Record<string, string | number>) => string, formatNumber: (value: number) => string) { return t('debrief.people', { value: value >= 1000000 ? `${(value / 1000000).toFixed(2)}M` : formatNumber(Math.round(value)) }); }
function formatReward(value: number, formatNumber: (value: number) => string) { return value < 10 ? value.toFixed(1) : formatNumber(Math.round(value)); }
