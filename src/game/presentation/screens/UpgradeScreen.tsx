import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react';
import { purchaseUpgrade, upgradeLevel } from '../../domain/campaignRules';
import { UPGRADE_BY_ID, UPGRADE_DEFINITIONS, type CatalogUpgradeDefinition, type UpgradeId } from '../../domain/upgradeCatalog';
import {
  missingRequirements,
  requirementsMet,
  UPGRADE_TREE_BRANCHES,
  UPGRADE_TREE_BRANCH_BY_ID,
  UPGRADE_TREE_CORE,
  UPGRADE_TREE_NODE_BY_ID,
  UPGRADE_TREE_NODES,
  UPGRADE_TREE_SIZE,
  upgradeNodeState,
  type UpgradeBranchId,
  type UpgradeNodeState,
} from '../../domain/upgradeTree';
import type { CampaignState, ResourceWallet } from '../../domain/types';
import { useI18n } from '../../i18n/I18nProvider';
import { displayUpgrade } from '../../i18n/gameContent';

interface TreeView { x: number; y: number; scale: number }
interface DragState { pointerId: number; clientX: number; clientY: number; viewX: number; viewY: number }

const NODE_SYMBOLS: Record<UpgradeBranchId, string> = {
  harvest: '◉', weapon: '⌁', defense: '◇', utility: '✦', army: '⬡', energy: 'ϟ',
};

export function UpgradeScreen({ campaign, onSave, onBack }: { campaign: CampaignState; onSave: (campaign: CampaignState) => void; onBack: () => void }) {
  const { language, t } = useI18n();
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [selectedId, setSelectedId] = useState<UpgradeId>('beam-capacity');
  const [view, setView] = useState<TreeView>({ x: 0, y: 0, scale: 0.6 });

  const fitTree = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const padding = 80;
    const scale = Math.min(0.92, Math.max(0.32, Math.min((viewport.clientWidth - padding) / UPGRADE_TREE_SIZE.width, (viewport.clientHeight - padding) / UPGRADE_TREE_SIZE.height)));
    setView({
      scale,
      x: (viewport.clientWidth - UPGRADE_TREE_SIZE.width * scale) / 2,
      y: (viewport.clientHeight - UPGRADE_TREE_SIZE.height * scale) / 2,
    });
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(fitTree);
    observer.observe(viewport);
    fitTree();
    return () => observer.disconnect();
  }, [fitTree]);

  const focusPoint = useCallback((x: number, y: number, targetScale = 0.72) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    setView({ x: viewport.clientWidth / 2 - x * targetScale, y: viewport.clientHeight / 2 - y * targetScale, scale: targetScale });
  }, []);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, viewX: view.x, viewY: view.y };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setView((current) => ({ ...current, x: drag.viewX + event.clientX - drag.clientX, y: drag.viewY + event.clientY - drag.clientY }));
  };
  const stopDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };
  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const cursorX = event.clientX - bounds.left;
    const cursorY = event.clientY - bounds.top;
    setView((current) => {
      const scale = Math.min(1.2, Math.max(0.28, current.scale * Math.exp(-event.deltaY * 0.001)));
      const worldX = (cursorX - current.x) / current.scale;
      const worldY = (cursorY - current.y) / current.scale;
      return { scale, x: cursorX - worldX * scale, y: cursorY - worldY * scale };
    });
  };

  const totalLevels = useMemo(() => UPGRADE_DEFINITIONS.reduce((sum, upgrade) => sum + Math.min(upgrade.maxLevel, upgradeLevel(campaign, upgrade.id)), 0), [campaign]);
  const maximumLevels = UPGRADE_DEFINITIONS.reduce((sum, upgrade) => sum + upgrade.maxLevel, 0);
  const selectedUpgrade = UPGRADE_BY_ID.get(selectedId) ?? UPGRADE_DEFINITIONS[0];

  return <main className="upgrade-screen skill-tree-screen">
    <header className="topbar skill-tree-topbar">
      <button className="brand-button" onClick={onBack}><span className="brand-mark">◈</span> THEY CALL IT EARTH</button>
      <div className="skill-tree-top-status">
        <span>{t('upgrade.tree')}</span>
        <ResourceCompact label={t('resource.biomass')} value={campaign.resources.biomass} kind="biomass" />
        <ResourceCompact label={t('resource.alloy')} value={campaign.resources.alloy} kind="alloy" />
        <ResourceCompact label={t('resource.intel')} value={campaign.resources.intel} kind="intel" />
        <strong>{t('upgrade.progress')} {totalLevels}/{maximumLevels}</strong>
      </div>
      <button className="small-button" onClick={onBack}>{t('common.backToMap')}</button>
    </header>

    <section className="skill-tree-layout">
      <aside className="skill-tree-legend">
        <p className="eyebrow">{t('upgrade.salvaged')}</p>
        <h1>{t('upgrade.title')} <span>{t('upgrade.titleAccent')}</span></h1>
        <p>{t('upgrade.copy')}</p>
        <nav aria-label={t('upgrade.tree')}>
          {UPGRADE_TREE_BRANCHES.map((branch) => <button key={branch.id} style={{ '--branch-color': branch.color } as CSSProperties} onClick={() => focusPoint(branch.x, branch.y)}>
            <i aria-hidden="true" />{t(`upgrade.branch.${branch.id}`)}
          </button>)}
        </nav>
        <div className="skill-tree-logistics" aria-label={t('upgrade.logistics')}>
          <LogisticsValue label={t('resource.coreCharge')} value={`${Math.floor(campaign.logistics.coreCharge)} / ${campaign.logistics.maxCoreCharge}`} />
          <LogisticsValue label={t('upgrade.overchargeCells')} value={`${campaign.logistics.maxOverchargeCells}`} />
          <LogisticsValue label={t('upgrade.cohortCapacity')} value={`${campaign.logistics.conversionCapacity}`} />
          <LogisticsValue label={t('upgrade.dropCommand')} value={`${campaign.logistics.dropCapacity} / ${campaign.logistics.commandBandwidth}`} />
        </div>
      </aside>

      <div className="skill-tree-map-shell">
        <div className="skill-tree-controls">
          <button aria-label={t('upgrade.zoomOut')} onClick={() => setView((current) => ({ ...current, scale: Math.max(0.28, current.scale - 0.1) }))}>−</button>
          <button onClick={fitTree}>{t('upgrade.fit')}</button>
          <button aria-label={t('upgrade.zoomIn')} onClick={() => setView((current) => ({ ...current, scale: Math.min(1.2, current.scale + 0.1) }))}>+</button>
        </div>
        <span className="skill-tree-pan-hint">{t('upgrade.panHint')}</span>
        <div
          ref={viewportRef}
          className="skill-tree-viewport"
          data-testid="upgrade-skill-tree"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
          onWheel={onWheel}
        >
          <div className="skill-tree-world" style={{ width: UPGRADE_TREE_SIZE.width, height: UPGRADE_TREE_SIZE.height, transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})` }}>
            <TreeConnections campaign={campaign} />
            <div className="skill-tree-core" style={{ left: UPGRADE_TREE_CORE.x, top: UPGRADE_TREE_CORE.y }}><span>◈</span><strong>{t('upgrade.core')}</strong></div>
            {UPGRADE_TREE_BRANCHES.map((branch) => <div key={branch.id} className="skill-tree-branch-hub" style={{ left: branch.x, top: branch.y, '--branch-color': branch.color } as CSSProperties}>
              <span>{NODE_SYMBOLS[branch.id]}</span><strong>{t(`upgrade.branch.${branch.id}`)}</strong>
            </div>)}
            {UPGRADE_TREE_NODES.map((node) => {
              const upgrade = UPGRADE_BY_ID.get(node.id)!;
              const state = upgradeNodeState(campaign, node.id, upgrade.maxLevel);
              const level = upgradeLevel(campaign, node.id);
              const branch = UPGRADE_TREE_BRANCH_BY_ID.get(node.branch)!;
              const presented = displayUpgrade(node.id, upgrade, language);
              return <button
                key={node.id}
                className={`skill-tree-node is-${state.toLowerCase()} ${selectedId === node.id ? 'is-selected' : ''}`}
                data-testid={`upgrade-node-${node.id}`}
                data-state={state}
                aria-label={`${presented.label}, ${t('upgrade.level', { level, max: upgrade.maxLevel })}`}
                aria-pressed={selectedId === node.id}
                style={{ left: node.x, top: node.y, '--branch-color': branch.color } as CSSProperties}
                onClick={() => setSelectedId(node.id)}
              >
                <span className="skill-tree-node-symbol" aria-hidden="true">{state === 'LOCKED' ? '▣' : NODE_SYMBOLS[node.branch]}</span>
                <strong>{presented.label}</strong>
                <span className="skill-tree-node-level">{level}/{upgrade.maxLevel}</span>
                <LevelPips level={level} max={upgrade.maxLevel} />
              </button>;
            })}
          </div>
        </div>
      </div>

      <UpgradeDetail campaign={campaign} upgrade={selectedUpgrade} onPurchase={() => {
        const result = purchaseUpgrade(campaign, selectedUpgrade.id);
        if (result.ok) onSave(result.campaign);
      }} />
    </section>
  </main>;
}

function TreeConnections({ campaign }: { campaign: CampaignState }) {
  return <svg className="skill-tree-connections" width={UPGRADE_TREE_SIZE.width} height={UPGRADE_TREE_SIZE.height} aria-hidden="true">
    {UPGRADE_TREE_BRANCHES.map((branch) => <TreePath key={`core-${branch.id}`} from={UPGRADE_TREE_CORE} to={branch} color={branch.color} active />)}
    {UPGRADE_TREE_NODES.filter((node) => node.requirements.length === 0).map((node) => {
      const branch = UPGRADE_TREE_BRANCH_BY_ID.get(node.branch)!;
      return <TreePath key={`hub-${node.id}`} from={branch} to={node} color={branch.color} active />;
    })}
    {UPGRADE_TREE_NODES.flatMap((node) => node.requirements.map((requirement) => {
      const parent = UPGRADE_TREE_NODE_BY_ID.get(requirement.id)!;
      const branch = UPGRADE_TREE_BRANCH_BY_ID.get(node.branch)!;
      const active = (campaign.upgrades[requirement.id] ?? 0) >= requirement.level;
      return <TreePath key={`${requirement.id}-${node.id}`} from={parent} to={node} color={branch.color} active={active} />;
    }))}
  </svg>;
}

function TreePath({ from, to, color, active }: { from: { x: number; y: number }; to: { x: number; y: number }; color: string; active: boolean }) {
  const bendX = (from.x + to.x) / 2;
  return <path d={`M ${from.x} ${from.y} C ${bendX} ${from.y}, ${bendX} ${to.y}, ${to.x} ${to.y}`} className={active ? 'is-active' : ''} style={{ '--branch-color': color } as CSSProperties} />;
}

function UpgradeDetail({ campaign, upgrade, onPurchase }: { campaign: CampaignState; upgrade: CatalogUpgradeDefinition; onPurchase: () => void }) {
  const { language, t } = useI18n();
  const level = upgradeLevel(campaign, upgrade.id);
  const state = upgradeNodeState(campaign, upgrade.id, upgrade.maxLevel);
  const cost = upgrade.cost(level);
  const affordable = hasResources(campaign.resources, cost);
  const missing = missingRequirements(campaign, upgrade.id);
  const presented = displayUpgrade(upgrade.id, upgrade, language);
  const branch = UPGRADE_TREE_NODE_BY_ID.get(upgrade.id)?.branch ?? 'utility';
  const branchColor = UPGRADE_TREE_BRANCH_BY_ID.get(branch)?.color;
  const buttonDisabled = state === 'LOCKED' || state === 'MAXED' || !affordable;
  const buttonTitle = state === 'LOCKED' ? t('upgrade.lockedReason') : !affordable ? t('upgrade.insufficient') : undefined;

  return <aside className="skill-tree-detail" style={{ '--branch-color': branchColor } as CSSProperties}>
    <p className="eyebrow">{t('upgrade.details')}</p>
    <span className={`skill-tree-state is-${state.toLowerCase()}`}>{stateLabel(state, t)}</span>
    <h2>{presented.label}</h2>
    <span className="skill-tree-detail-group">{t(`upgrade.branch.${branch}`)}{' // '}{t('upgrade.level', { level, max: upgrade.maxLevel })}</span>
    <LevelPips level={level} max={upgrade.maxLevel} />
    <p className="skill-tree-effect">{presented.description}</p>

    <div className="skill-tree-requirements">
      <strong>{t('upgrade.prerequisites')}</strong>
      {UPGRADE_TREE_NODE_BY_ID.get(upgrade.id)?.requirements.length
        ? UPGRADE_TREE_NODE_BY_ID.get(upgrade.id)!.requirements.map((requirement) => {
          const requirementUpgrade = UPGRADE_BY_ID.get(requirement.id)!;
          const requirementLabel = displayUpgrade(requirement.id, requirementUpgrade, language).label;
          const met = !missing.some((item) => item.id === requirement.id);
          return <span key={requirement.id} className={met ? 'is-met' : ''}>{met ? '✓' : '○'} {t('upgrade.requiresLevel', { label: requirementLabel, level: requirement.level })}</span>;
        })
        : <span className="is-met">✓ {t('upgrade.noPrerequisites')}</span>}
    </div>

    {state !== 'MAXED' && <div className="skill-tree-next-cost">
      <strong>{t('upgrade.nextLevel')}</strong>
      <div>
        {cost.biomass > 0 && <CostItem kind="biomass" glyph="◉" value={cost.biomass} />}
        {cost.alloy > 0 && <CostItem kind="alloy" glyph="◆" value={cost.alloy} />}
        {cost.intel > 0 && <CostItem kind="intel" glyph="✦" value={cost.intel} />}
      </div>
    </div>}
    <button className="skill-tree-install" disabled={buttonDisabled} title={buttonTitle} onClick={onPurchase}>
      {state === 'MAXED' ? t('upgrade.maxed') : state === 'LOCKED' ? t('upgrade.locked') : t('upgrade.install')}
    </button>
    {!requirementsMet(campaign, upgrade.id) && level > 0 && <small>{t('upgrade.owned')} · {t('upgrade.availableState')}</small>}
  </aside>;
}

function ResourceCompact({ label, value, kind }: { label: string; value: number; kind: 'biomass' | 'alloy' | 'intel' }) {
  return <span className={`skill-tree-resource is-${kind}`} aria-label={`${label}: ${Math.floor(value)}`}><i aria-hidden="true" />{label}<b>{Math.floor(value)}</b></span>;
}

function LogisticsValue({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function LevelPips({ level, max }: { level: number; max: number }) {
  return <span className="skill-tree-level-pips" aria-hidden="true">{Array.from({ length: max }, (_, index) => <i key={index} className={index < level ? 'is-filled' : ''} />)}</span>;
}

function CostItem({ kind, glyph, value }: { kind: 'biomass' | 'alloy' | 'intel'; glyph: string; value: number }) {
  return <span className={`upgrade-cost-${kind}`}>{glyph} {value}</span>;
}

function hasResources(resources: ResourceWallet, cost: ResourceWallet): boolean {
  return resources.biomass >= cost.biomass && resources.alloy >= cost.alloy && resources.intel >= cost.intel;
}

function stateLabel(state: UpgradeNodeState, t: (key: string) => string): string {
  if (state === 'LOCKED') return t('upgrade.locked');
  if (state === 'OWNED') return t('upgrade.owned');
  if (state === 'MAXED') return t('upgrade.maxedState');
  return t('upgrade.availableState');
}
