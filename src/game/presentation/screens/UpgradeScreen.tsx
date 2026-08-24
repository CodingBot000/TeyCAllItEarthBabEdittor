import { purchaseUpgrade, UPGRADE_DEFINITIONS, upgradeLevel } from '../../domain/campaignRules';
import type { CampaignState, ResourceWallet } from '../../domain/types';
import { useI18n } from '../../i18n/I18nProvider';
import { displayUpgrade } from '../../i18n/gameContent';

type UpgradeDefinition = typeof UPGRADE_DEFINITIONS[number];

const UPGRADE_THUMBNAIL_FRAMES: Record<UpgradeDefinition['id'], { column: number; row: number }> = {
  'beam-capacity': { column: 0, row: 0 },
  'beam-radius': { column: 1, row: 0 },
  'beam-efficiency': { column: 2, row: 0 },
  'cargo-bay': { column: 0, row: 1 },
  'plasma-damage': { column: 1, row: 1 },
  'shield-capacity': { column: 2, row: 1 },
  'energy-core': { column: 0, row: 2 },
  'scanner-array': { column: 1, row: 2 },
  'signature-dampener': { column: 2, row: 2 },
  'selective-filter': { column: 0, row: 0 },
  'neural-foundry': { column: 0, row: 1 },
  'command-bandwidth': { column: 1, row: 1 },
  'drop-capacity': { column: 2, row: 1 },
  'cohort-conditioning': { column: 0, row: 2 },
  'recovery-protocol': { column: 1, row: 2 },
  'core-reservoir': { column: 0, row: 2 },
  'capacitor-rack': { column: 2, row: 2 },
  'emp-duration': { column: 1, row: 1 },
  'emergency-bio-conversion': { column: 2, row: 0 },
  'threat-forecast': { column: 2, row: 2 },
};

export function UpgradeScreen({ campaign, onSave, onBack }: { campaign: CampaignState; onSave: (campaign: CampaignState) => void; onBack: () => void }) {
  const { language, t } = useI18n();
  return <main className="upgrade-screen">
    <header className="topbar">
      <button className="brand-button" onClick={onBack}><span className="brand-mark">◈</span> THEY CALL IT EARTH</button>
      <div className="topbar-status">{t('upgrade.systems')}</div>
      <button className="small-button" onClick={onBack}>{t('common.backToMap')}</button>
    </header>
    <section className="upgrade-layout">
      <div className="upgrade-intro">
        <p className="eyebrow">{t('upgrade.salvaged')}</p>
        <h1>{t('upgrade.title')}<br /><span>{t('upgrade.titleAccent')}</span></h1>
        <p>{t('upgrade.copy')}</p>
        <div className="resource-board">
          <Resource label={t('resource.biomass')} value={campaign.resources.biomass} color="#79e2bf" />
          <Resource label={t('resource.alloy')} value={campaign.resources.alloy} color="#f4b85a" />
          <Resource label={t('resource.intel')} value={campaign.resources.intel} color="#94a7ff" />
        </div>
        <div className="logistics-board" aria-label={t('upgrade.logistics')}>
          <LogisticsValue label={t('resource.coreCharge')} value={`${Math.floor(campaign.logistics.coreCharge)} / ${campaign.logistics.maxCoreCharge}`} />
          <LogisticsValue label={t('upgrade.overchargeCells')} value={`${campaign.logistics.maxOverchargeCells}`} />
          <LogisticsValue label={t('upgrade.cohortCapacity')} value={`${campaign.logistics.conversionCapacity}`} />
          <LogisticsValue label={t('upgrade.dropCommand')} value={`${campaign.logistics.dropCapacity} / ${campaign.logistics.commandBandwidth}`} />
        </div>
      </div>
      <div className="upgrade-list" aria-label={t('upgrade.available')}>
        {UPGRADE_DEFINITIONS.map((upgrade) => <UpgradeCard
          key={upgrade.id}
          upgrade={upgrade}
          language={language}
          level={upgradeLevel(campaign, upgrade.id)}
          resources={campaign.resources}
          onPurchase={() => {
            const result = purchaseUpgrade(campaign, upgrade.id);
            if (result.ok) onSave(result.campaign);
          }}
        />)}
      </div>
    </section>
  </main>;
}

function Resource({ label, value, color }: { label: string; value: number; color: string }) {
  return <div aria-label={`${label}: ${Math.floor(value)}`}><span style={{ color }}>{label}</span><strong>{Math.floor(value)}</strong></div>;
}

function LogisticsValue({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function UpgradeCard({ upgrade, language, level, resources, onPurchase }: { upgrade: UpgradeDefinition; language: ReturnType<typeof useI18n>['language']; level: number; resources: ResourceWallet; onPurchase: () => void }) {
  const { t } = useI18n();
  const cost = upgrade.cost(level);
  const maxed = level >= upgrade.maxLevel;
  const affordable = resources.biomass >= cost.biomass && resources.alloy >= cost.alloy && resources.intel >= cost.intel;
  const frame = UPGRADE_THUMBNAIL_FRAMES[upgrade.id];
  const presented = displayUpgrade(upgrade.id, upgrade, language);
  return <article className="upgrade-card" aria-label={t('upgrade.card', { label: presented.label })} data-group={upgrade.group}>
    <div className="upgrade-thumbnail" role="img" aria-label={t('upgrade.module', { label: presented.label })} style={{ filter: `hue-rotate(${(frame.row * 3 + frame.column) * 24}deg)` }} />
    <div className="upgrade-card-content">
      <div className="upgrade-card-head"><span className="upgrade-group">{presented.group}</span><div className="level-pips" aria-label={t('upgrade.level', { level, max: upgrade.maxLevel })}>{[0, 1, 2].map((pip) => <i key={pip} className={pip < level ? 'filled' : ''} aria-hidden="true" />)}</div></div>
      <h3>{presented.label}</h3><p>{presented.description}</p>
    </div>
    <div className="upgrade-card-foot">
      <span className="upgrade-cost" aria-label={t('upgrade.cost', { cost: formatCost(cost, t) })}>{cost.biomass > 0 && <CostItem kind="biomass" glyph="◉" value={cost.biomass} />}{cost.alloy > 0 && <CostItem kind="alloy" glyph="◆" value={cost.alloy} />}{cost.intel > 0 && <CostItem kind="intel" glyph="✦" value={cost.intel} />}</span>
      <button className="small-button" disabled={maxed || !affordable} title={!maxed && !affordable ? t('upgrade.insufficient') : undefined} onClick={onPurchase}>{maxed ? t('upgrade.maxed') : t('upgrade.install')}</button>
    </div>
  </article>;
}

function CostItem({ kind, glyph, value }: { kind: 'biomass' | 'alloy' | 'intel'; glyph: string; value: number }) {
  return <span className={`upgrade-cost-${kind}`} aria-hidden="true">{glyph} {value}</span>;
}

function formatCost(cost: ResourceWallet, t: (key: string) => string): string {
  return [cost.biomass > 0 ? `${cost.biomass} ${t('resource.biomass')}` : '', cost.alloy > 0 ? `${cost.alloy} ${t('resource.alloy')}` : '', cost.intel > 0 ? `${cost.intel} ${t('resource.intel')}` : ''].filter(Boolean).join(', ');
}
