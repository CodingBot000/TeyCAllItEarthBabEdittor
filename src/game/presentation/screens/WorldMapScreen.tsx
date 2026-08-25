import { useEffect, useMemo, useRef, useState } from 'react';
import { isPlayableCity, PLAYABLE_CITY_IDS } from '../../data/playableCities';
import { COUNTRIES, COUNTRY_GEOMETRY_BY_ID, MAP_CONTENT_BOUNDS } from '../../data/world';
import { getCampaignVictoryProgress } from '../../domain/campaignRules';
import { lonLatToNormalized } from '../../domain/travelRules';
import type { CampaignState, CityDefinition, CountryDefinition } from '../../domain/types';
import { useI18n } from '../../i18n/I18nProvider';
import { displayCityName, displayCountryName, displayEnum } from '../../i18n/gameContent';
import { LanguageSwitcher } from '../components/LanguageSwitcher';

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;
const TIER_ONE_ZOOM = 1.45;
const COUNTRY_NAME_ZOOM = 3.35;
const CITY_CLUSTER_ZOOM = 3;
const MAX_VISIBLE_CITY_CLUSTERS = 48;
const CITY_CLUSTER_ATLAS = '/assets/runtime/sprites/world-map-cities-5x2.webp';
const CITY_CLUSTER_COLUMNS = 5;
const CITY_CLUSTER_VARIANTS = 10;
const CITY_CLUSTER_CELL_WIDTH = 128;
const CITY_CLUSTER_CELL_HEIGHT = 160;
const CITY_CLUSTER_WIDTH_BY_POPULATION_TIER = [34, 40, 46, 52, 58, 65, 72, 80] as const;
const PLAYABLE_CITY_LABEL_OFFSETS: Record<(typeof PLAYABLE_CITY_IDS)[number], { x: number; y: number }> = {
  seoul: { x: 12, y: -8 },
  tokyo: { x: 12, y: 15 },
  'new-york': { x: 12, y: 4 },
  london: { x: 12, y: -8 },
  shanghai: { x: 12, y: 4 },
  paris: { x: 12, y: 15 },
  dubai: { x: 12, y: 4 },
  cairo: { x: 12, y: 4 },
};
const DEFAULT_CITY_LABEL_OFFSET = { x: 12, y: 4 } as const;
const COUNTRY_MARKER_OFFSETS: Partial<Record<string, { x: number; y: number }>> = {
  KR: { x: -28, y: -16 },
  JP: { x: 28, y: -16 },
  GB: { x: -28, y: -18 },
  FR: { x: -28, y: 18 },
  AE: { x: -28, y: 18 },
  EG: { x: -28, y: -18 },
};
const COUNTRY_LABELS = COUNTRIES.map((country) => {
  const area = projectedPathArea(COUNTRY_GEOMETRY_BY_ID[country.geometryId].path);
  return { country, area, fontSize: countryLabelFontSize(area), point: project(country.labelCoordinate) };
});

interface TravelState {
  fromCityId: string | null;
  toCityId: string;
  progress: number;
  duration: number;
}

export interface WorldMapViewState {
  projection: 'equirectangular-wgs84';
  zoom: number;
  offset: { x: number; y: number };
  visibleCountryIds: string[];
  visibleCityIds: string[];
  cityTierLimit: 0 | 1 | 2 | 3;
}

interface WorldMapScreenProps {
  campaign: CampaignState;
  cities: CityDefinition[];
  selectedCityId: string | null;
  travel: TravelState | null;
  onSelectCity: (id: string | null) => void;
  onMove: () => void;
  onEngage: () => void;
  onOpenUpgrades: () => void;
  onReturnMenu: () => void;
  notice?: string | null;
  onMapViewChange?: (state: WorldMapViewState) => void;
}

export function WorldMapScreen({ campaign, cities, selectedCityId, travel, notice, onSelectCity, onMove, onEngage, onOpenUpgrades, onReturnMenu, onMapViewChange }: WorldMapScreenProps) {
  const { language, t } = useI18n();
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [generatedMapAvailable, setGeneratedMapAvailable] = useState(true);
  const [selectedCountryId, setSelectedCountryId] = useState<string | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const stageRef = useRef<HTMLDivElement | null>(null);
  const stageSizeRef = useRef<{ width: number; height: number } | null>(null);
  const mapTransformRef = useRef({ zoom, selectedCountryId });
  const dragRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchDistanceRef = useRef<number | null>(null);
  const selectedCity = cities.find((city) => city.id === selectedCityId) ?? null;
  const selectedCountry = selectedCountryId ? COUNTRIES.find((country) => country.id === selectedCountryId) ?? null : null;
  const currentCity = cities.find((city) => city.id === campaign.currentCityId) ?? null;
  const victoryProgress = getCampaignVictoryProgress(campaign);
  const cityTierLimit = tierLimitForZoom(zoom);
  const selectedCountryPlayableCityCount = useMemo(() => selectedCountryId ? cities.reduce((count, city) => count + Number(city.countryId === selectedCountryId && isPlayableCity(city.id)), 0) : 0, [cities, selectedCountryId]);
  const renderedCities = useMemo(() => [...cities].sort((a, b) => Number(isPlayableCity(a.id)) - Number(isPlayableCity(b.id)) || Number(a.id === selectedCityId || a.id === campaign.currentCityId) - Number(b.id === selectedCityId || b.id === campaign.currentCityId) || a.population - b.population), [campaign.currentCityId, cities, selectedCityId]);
  const cityLabelIds = useMemo(() => {
    const labels = visibleLabelIds(cityTierLimit > 0 ? cities : [], zoom, selectedCityId, campaign.currentCityId);
    PLAYABLE_CITY_IDS.forEach((cityId) => labels.add(cityId));
    return labels;
  }, [campaign.currentCityId, cities, cityTierLimit, selectedCityId, zoom]);
  const countryNameScale = stageSize.width > 0 ? 1000 / stageSize.width / zoom : 1 / zoom;
  const visibleCityClusterIds = useMemo(() => {
    if (zoom < CITY_CLUSTER_ZOOM || stageSize.width <= 0 || stageSize.height <= 0) return new Set<string>();
    const margin = 76;
    const candidates = renderedCities.flatMap((city) => {
      const point = project(city);
      const screenX = stageSize.width / 2 + (point.x / 1000 * stageSize.width - stageSize.width / 2) * zoom + offset.x;
      const screenY = stageSize.height / 2 + (point.y / 500 * stageSize.height - stageSize.height / 2) * zoom + offset.y;
      if (screenX < -margin || screenX > stageSize.width + margin || screenY < -margin || screenY > stageSize.height + margin) return [];
      const emphasized = city.id === selectedCityId || city.id === campaign.currentCityId;
      const clusterWidth = cityClusterWidth(city, emphasized);
      const collisionRadius = Math.max(20, clusterWidth * stageSize.width / 1000 * .46);
      return [{ city, screenX, screenY, collisionRadius }];
    });
    candidates.sort((a, b) => Number(b.city.id === selectedCityId || b.city.id === campaign.currentCityId) - Number(a.city.id === selectedCityId || a.city.id === campaign.currentCityId) || a.city.mapTier - b.city.mapTier || b.city.population - a.city.population);
    const accepted: typeof candidates = [];
    for (const candidate of candidates) {
      if (accepted.length >= MAX_VISIBLE_CITY_CLUSTERS) break;
      const emphasized = candidate.city.id === selectedCityId || candidate.city.id === campaign.currentCityId;
      const overlaps = accepted.some((placed) => Math.hypot(candidate.screenX - placed.screenX, candidate.screenY - placed.screenY) < candidate.collisionRadius + placed.collisionRadius);
      if (!emphasized && overlaps) continue;
      accepted.push(candidate);
    }
    return new Set(accepted.map(({ city }) => city.id));
  }, [campaign.currentCityId, offset.x, offset.y, renderedCities, selectedCityId, stageSize.height, stageSize.width, zoom]);
  const shipPosition = useMemo(() => {
    if (!travel) return currentCity ? project(currentCity) : { x: 500, y: 250 };
    const from = travel.fromCityId ? cities.find((city) => city.id === travel.fromCityId) : null;
    const to = cities.find((city) => city.id === travel.toCityId);
    const fromPoint = from ? project(from) : { x: 500, y: 250 };
    const toPoint = to ? project(to) : fromPoint;
    return { x: fromPoint.x + (toPoint.x - fromPoint.x) * travel.progress, y: fromPoint.y + (toPoint.y - fromPoint.y) * travel.progress };
  }, [cities, currentCity, travel]);

  useEffect(() => {
    mapTransformRef.current = { zoom, selectedCountryId };
  }, [selectedCountryId, zoom]);

  useEffect(() => {
    onMapViewChange?.({
      projection: 'equirectangular-wgs84',
      zoom: round(zoom, 3),
      offset: { x: round(offset.x, 1), y: round(offset.y, 1) },
      visibleCountryIds: COUNTRIES.map((country) => country.id),
      visibleCityIds: cities.map((city) => city.id),
      cityTierLimit,
    });
  }, [cities, cityTierLimit, offset, onMapViewChange, zoom]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const nextSize = { width: entry.contentRect.width, height: entry.contentRect.height };
      const previousSize = stageSizeRef.current;
      const sizeChanged = !previousSize || Math.abs(previousSize.width - nextSize.width) >= 1 || Math.abs(previousSize.height - nextSize.height) >= 1;
      if (!sizeChanged) return;
      stageSizeRef.current = nextSize;
      setStageSize(nextSize);
      if (!previousSize) return;
      const view = mapTransformRef.current;
      const focusedCountry = view.selectedCountryId ? COUNTRIES.find((country) => country.id === view.selectedCountryId) : null;
      setOffset((currentOffset) => {
        if (focusedCountry) {
          const point = project(focusedCountry.labelCoordinate);
          return clampOffset({
            x: -(point.x / 1000 * nextSize.width - nextSize.width / 2) * view.zoom,
            y: -(point.y / 500 * nextSize.height - nextSize.height / 2) * view.zoom,
          }, view.zoom, nextSize);
        }
        return clampOffset({
          x: currentOffset.x * nextSize.width / previousSize.width,
          y: currentOffset.y * nextSize.height / previousSize.height,
        }, view.zoom, nextSize);
      });
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isPanelOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsPanelOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isPanelOpen]);

  const changeZoom = (requestedZoom: number, clientAnchor?: { x: number; y: number }) => {
    const nextZoom = clamp(requestedZoom, MIN_ZOOM, MAX_ZOOM);
    const bounds = stageRef.current?.getBoundingClientRect();
    if (!bounds) {
      setZoom(nextZoom);
      return;
    }
    const focusedCountry = selectedCountryId ? COUNTRIES.find((country) => country.id === selectedCountryId) : null;
    const focusedPoint = focusedCountry ? project(focusedCountry.labelCoordinate) : null;
    const focusAnchor = focusedPoint ? {
      x: bounds.left + bounds.width / 2 + (focusedPoint.x / 1000 * bounds.width - bounds.width / 2) * zoom + offset.x,
      y: bounds.top + bounds.height / 2 + (focusedPoint.y / 500 * bounds.height - bounds.height / 2) * zoom + offset.y,
    } : null;
    const anchor = clientAnchor ?? focusAnchor ?? { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
    const relative = { x: anchor.x - bounds.left - bounds.width / 2, y: anchor.y - bounds.top - bounds.height / 2 };
    setOffset((currentOffset) => clampOffset({
      x: relative.x - ((relative.x - currentOffset.x) / zoom) * nextZoom,
      y: relative.y - ((relative.y - currentOffset.y) / zoom) * nextZoom,
    }, nextZoom, bounds));
    setZoom(nextZoom);
    if (nextZoom < TIER_ONE_ZOOM) setSelectedCountryId(null);
  };

  const focusCountry = (country: CountryDefinition) => {
    if (travel) return;
    const bounds = stageRef.current?.getBoundingClientRect();
    const targetZoom = Math.max(3, zoom);
    const point = project(country.labelCoordinate);
    setSelectedCountryId(country.id);
    onSelectCity(null);
    setIsPanelOpen(false);
    setZoom(targetZoom);
    if (bounds) {
      setOffset(clampOffset({
        x: -(point.x / 1000 * bounds.width - bounds.width / 2) * targetZoom,
        y: -(point.y / 500 * bounds.height - bounds.height / 2) * targetZoom,
      }, targetZoom, bounds));
    }
  };

  const selectCity = (city: CityDefinition) => {
    if (travel) return;
    setSelectedCountryId(city.countryId);
    onSelectCity(city.id);
    setIsPanelOpen(true);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (travel) return;
    if (event.target instanceof Element && event.target.closest('button, a, [role="button"], .country-shapes path')) return;
    event.preventDefault();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* synthetic test events may not have an active pointer */ }
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 1) {
      dragRef.current = { x: event.clientX, y: event.clientY, startX: offset.x, startY: offset.y };
    } else {
      dragRef.current = null;
      pinchDistanceRef.current = pointerDistance(pointersRef.current);
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    event.preventDefault();
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size >= 2) {
      const distance = pointerDistance(pointersRef.current);
      const midpoint = pointerMidpoint(pointersRef.current);
      if (pinchDistanceRef.current !== null) changeZoom(zoom + (distance - pinchDistanceRef.current) * 0.008, midpoint);
      pinchDistanceRef.current = distance;
      return;
    }
    if (!dragRef.current) return;
    const bounds = stageRef.current?.getBoundingClientRect();
    const next = { x: dragRef.current.startX + event.clientX - dragRef.current.x, y: dragRef.current.startY + event.clientY - dragRef.current.y };
    setOffset(bounds ? clampOffset(next, zoom, bounds) : next);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchDistanceRef.current = null;
    dragRef.current = null;
  };

  const onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    changeZoom(zoom + (event.deltaY > 0 ? -0.22 : 0.22), { x: event.clientX, y: event.clientY });
  };

  return (
    <main className="map-screen">
      <LanguageSwitcher />
      <header className="topbar">
        <button className="brand-button" onClick={onReturnMenu}>
          <span className="brand-mark" aria-hidden="true">◈</span> {t('brand.theyCallIt')} <span>{t('brand.earth')}</span>
        </button>
        <div className="topbar-status"><span className="status-dot" /> {t('map.orbitalStable')} <span className="divider" /> {t('map.cycle', { count: String(campaign.completedBattles + 1).padStart(2, '0') })}</div>
        <div className="topbar-actions"><button className="small-button" onClick={onOpenUpgrades}>{t('map.upgrades')}</button><button className="small-button" onClick={onReturnMenu}>{t('common.menu')}</button></div>
      </header>
      <section className={`map-layout ${isPanelOpen ? 'has-panel' : ''}`}>
        <div className="map-stage-wrap">
          <div ref={stageRef} className="map-stage" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel}>
            <div className="map-scale" style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}>
              <svg className="world-map" viewBox="0 0 1000 500" preserveAspectRatio="xMidYMid meet" role="img" aria-label={t('map.worldAria')}>
                <defs>
                  <pattern id="map-grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(91,180,188,.14)" strokeWidth="1" /></pattern>
                  <linearGradient id="ocean" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#0d2632" /><stop offset="1" stopColor="#07161f" /></linearGradient>
                  <filter id="glow"><feGaussianBlur stdDeviation="3" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
                  <clipPath id="mothership-marker-clip"><circle r="20" /></clipPath>
                  {Array.from({ length: CITY_CLUSTER_VARIANTS }, (_, index) => <symbol key={index} id={`world-map-city-cluster-${index}`} className="city-cluster-symbol" viewBox={`${index % CITY_CLUSTER_COLUMNS * CITY_CLUSTER_CELL_WIDTH} ${Math.floor(index / CITY_CLUSTER_COLUMNS) * CITY_CLUSTER_CELL_HEIGHT} ${CITY_CLUSTER_CELL_WIDTH} ${CITY_CLUSTER_CELL_HEIGHT}`} overflow="hidden">
                    <image href={CITY_CLUSTER_ATLAS} x="0" y="0" width="640" height="320" />
                  </symbol>)}
                </defs>
                <rect width="1000" height="500" fill="url(#ocean)" />
                <image className="generated-world-map" href="/assets/runtime/maps/world-map.webp" x="0" y="0" width="1000" height="500" preserveAspectRatio="xMidYMid meet" onError={() => setGeneratedMapAvailable(false)} />
                <rect width="1000" height="500" fill="url(#map-grid)" />
                <g className="continents" opacity=".9" visibility={generatedMapAvailable ? 'hidden' : 'visible'}>
                  <path d="M91 120 L151 86 225 91 283 126 268 174 224 188 190 228 127 209 105 171 69 154Z" />
                  <path d="M276 252 L333 234 371 260 362 308 336 349 345 424 313 458 280 410 286 354 260 305Z" />
                  <path d="M452 120 L524 87 586 105 620 142 606 190 551 212 518 246 473 219 445 180Z" />
                  <path d="M531 252 L595 234 659 257 707 299 689 352 643 367 618 416 573 405 551 356 507 325Z" />
                  <path d="M685 143 L757 117 829 134 890 171 868 212 818 223 783 199 741 221 697 194Z" />
                  <path d="M815 330 L859 313 911 336 933 380 906 418 858 407 824 379Z" />
                </g>
                <g className="country-shapes">
                  {COUNTRIES.map((country) => <path key={country.id} d={COUNTRY_GEOMETRY_BY_ID[country.geometryId].path} className={`${selectedCountryId === country.id ? 'selected' : ''}`} data-country-id={country.id} onClick={(event) => { event.stopPropagation(); focusCountry(country); }} />)}
                </g>
                {zoom >= COUNTRY_NAME_ZOOM ? <g className="country-name-overlays" aria-hidden="true" data-minimum-zoom={COUNTRY_NAME_ZOOM}>
                  {COUNTRY_LABELS.map(({ country, area, fontSize, point }) => <g key={country.id} className={`country-name-overlay ${selectedCountryId === country.id ? 'selected' : ''}`} data-country-id={country.id} data-country-area={Math.round(area)} data-font-size={fontSize} transform={`translate(${point.x} ${point.y})`}>
                    <g transform={`scale(${countryNameScale})`}><text style={{ fontSize }}>{displayCountryName(country, language).toUpperCase()}</text></g>
                  </g>)}
                </g> : null}
                <g className={`country-markers ${cityTierLimit > 0 ? 'city-level' : 'overview-level'}`}>
                  {COUNTRIES.map((country) => {
                    const point = project(country.labelCoordinate);
                    const markerOffset = COUNTRY_MARKER_OFFSETS[country.id] ?? { x: 0, y: 0 };
                    return <g key={country.id} className={`country-marker ${selectedCountryId === country.id ? 'selected' : ''}`} transform={`translate(${point.x + markerOffset.x / zoom} ${point.y + markerOffset.y / zoom})`}>
                      <g transform={`scale(${1 / zoom})`}><circle r="8" role="button" tabIndex={0} aria-label={`${displayCountryName(country, language)} (${country.id})`} onClick={(event) => { event.stopPropagation(); focusCountry(country); }} onKeyDown={(event) => { if (event.key === 'Enter') focusCountry(country); }} /><text className="country-code" y="3">{country.id}</text><text className="country-name" y="17">{displayCountryName(country, language).toUpperCase()}</text></g>
                    </g>;
                  })}
                </g>
                {currentCity && selectedCity && isPlayableCity(selectedCity.id) && currentCity.id !== selectedCity.id && !travel && <path className="travel-path" d={pathFor(currentCity, selectedCity)} />}
                {travel && <path className="travel-path active-path" d={pathFor(cities.find((city) => city.id === travel.fromCityId) ?? { ...cities[0], latitude: 0, longitude: 0 }, cities.find((city) => city.id === travel.toCityId) ?? cities[0])} />}
                {renderedCities.map((city) => {
                  const point = project(city);
                  const state = campaign.cities[city.id];
                  const playable = isPlayableCity(city.id);
                  const isSelected = city.id === selectedCityId;
                  const isCurrent = city.id === campaign.currentCityId;
                  const showLabel = cityLabelIds.has(city.id);
                  const showCluster = visibleCityClusterIds.has(city.id);
                  const populationTier = cityPopulationTier(city.population);
                  const clusterWidth = cityClusterWidth(city, isSelected || isCurrent);
                  const clusterHeight = clusterWidth * 1.25;
                  const clusterVariant = cityClusterVariant(city);
                  const labelOffset = cityLabelOffset(city.id);
                  const controlState = state?.conquest.controlState ?? 'UNTOUCHED';
                  const markerColor = controlState === 'OCCUPIED' || controlState === 'ASSIMILATED' ? '#d788ff' : controlState === 'BREACHED' ? '#f4b85a' : controlState === 'RAIDED' ? '#f17d8b' : city.colorAccent;
                  return <g key={city.id} data-city-id={city.id} data-country-id={city.countryId} data-map-tier={city.mapTier} data-population={city.population} data-population-tier={populationTier} data-cluster-width={clusterWidth} data-playable={playable} data-control-state={controlState} className={`city-marker tier-${city.mapTier} population-tier-${populationTier} control-${controlState.toLowerCase()} ${playable ? 'playable' : 'unavailable'} ${isSelected ? 'selected' : ''} ${isCurrent ? 'current' : ''}`} transform={`translate(${point.x} ${point.y})`}>
                    <g transform={`scale(${1 / zoom})`}>
                      {showCluster ? <use className="city-cluster-sprite" href={`#world-map-city-cluster-${clusterVariant}`} x={-clusterWidth / 2} y={-clusterHeight + 5} width={clusterWidth} height={clusterHeight} data-city-cluster-index={clusterVariant} data-population-tier={populationTier} aria-hidden="true" /> : null}
                      <circle className="marker-hit" r={playable ? 15 : 9} role="button" tabIndex={0} aria-label={playable ? displayCityName(city, language).toUpperCase() : `${displayCityName(city, language).toUpperCase()} — ${t('map.unavailable')}`} onClick={(event) => { event.stopPropagation(); selectCity(city); }} onKeyDown={(event) => { if (event.key === 'Enter') selectCity(city); }} />
                      <circle className="marker-pulse" r={playable ? isSelected ? 17 : 13 : 7} />
                      <circle className="marker-core" r={playable ? isSelected ? 7 : city.mapTier === 1 ? 5.5 : 5 : 3} fill={playable ? markerColor : '#5f747a'} />
                      {showLabel && <text x={labelOffset.x} y={labelOffset.y}>{displayCityName(city, language).toUpperCase()}</text>}
                      {showLabel && state?.destruction > 0 && <text className="marker-meta" x={labelOffset.x} y={labelOffset.y + 13}>{t('map.damage', { value: Math.round(state.destruction) })}</text>}
                    </g>
                  </g>;
                })}
                <g className={`ship-marker ${travel ? 'is-traveling' : ''}`} transform={`translate(${shipPosition.x} ${shipPosition.y})`}>
                  <g transform={`scale(${1 / zoom})`}>
                    <circle className="ship-marker-halo" r="25" />
                    <circle className="ship-marker-disc" r="20" />
                    <path className="ship-marker-silhouette" d="M -14 2 Q 0 -12 14 2 Q 0 7 -14 2Z" aria-hidden="true" />
                    <circle className="ship-marker-rim" r="20" />
                    <circle className="ship-marker-reactor" r="2.6" />
                  </g>
                </g>
              </svg>
            </div>
            <div className="map-compass">N<br /><span>⌖</span></div>
            <div className="map-controls"><button aria-label={t('map.zoomIn')} onClick={() => changeZoom(zoom + 0.35)}>+</button><span>{Math.round(zoom * 100)}%</span><button aria-label={t('map.zoomOut')} onClick={() => changeZoom(zoom - 0.35)}>−</button></div>
            <div className="map-status-rail" aria-label={t('map.statusAria')}>
              <div className="map-status-chip">
                <div className="map-status-title"><span>{t('map.strategicTheater')}</span><h1>{t('map.worldMap')}</h1></div>
                <div className="map-threat-compact"><span>{t('map.globalThreat')}</span><strong>{Math.round(campaign.globalThreat)}<small>/100</small></strong></div>
                <div className="progress-track"><span style={{ width: `${campaign.globalThreat}%` }} /></div>
              </div>
              <div className="map-status-chip map-control-chip">
                <div className="map-status-title"><span>{t('map.occupationArray')}</span><h1>{victoryProgress.occupiedCityCount} / {victoryProgress.targetCityCount}</h1></div>
                <div className="map-threat-compact"><span>{t('map.controlled')}</span><strong>{Math.round(victoryProgress.progress * 100)}<small>%</small></strong></div>
                <div className="progress-track"><span style={{ width: `${victoryProgress.progress * 100}%` }} /></div>
              </div>
              {travel && <div className="map-travel-chip"><div><span>{t('map.inTransit')}</span><strong>{(() => { const destination = cities.find((city) => city.id === travel.toCityId); return destination ? displayCityName(destination, language) : travel.toCityId; })()}</strong></div><strong>{Math.round(travel.progress * 100)}%</strong><div className="progress-track"><span style={{ width: `${travel.progress * 100}%` }} /></div></div>}
              {(selectedCity || selectedCountry) && !isPanelOpen ? <button className="map-selection-toggle" type="button" aria-controls="map-detail-panel" aria-expanded="false" onClick={() => setIsPanelOpen(true)}><span>{t('map.selection')}</span><strong>{selectedCity ? displayCityName(selectedCity, language) : t('map.theater', { id: selectedCountry?.id ?? '' })}</strong></button> : null}
            </div>
            <div className="map-legend"><span><i className="legend-city" /> {t('map.playable')}</span><span><i className="legend-city-locked" /> {t('map.unavailable')}</span><span><i className="legend-ship" /> {t('map.mothership')}</span><span><i className="legend-path" /> {t('map.travelVector')}</span></div>
            <div className="map-attribution"><a href="https://www.naturalearthdata.com/" target="_blank" rel="noreferrer">{t('map.attributionMap')}</a><span> · </span><a href="https://www.geonames.org/" target="_blank" rel="noreferrer">{t('map.attributionCity')}</a></div>
            {notice ? <div className="phase-one-notice" role="status">{notice}</div> : null}
          </div>
        </div>
        <aside id="map-detail-panel" className={`city-panel ${isPanelOpen ? 'is-open' : ''}`} data-detail-kind={selectedCity ? 'city' : selectedCountry ? 'country' : 'empty'}>
          <button className="city-panel-handle" type="button" disabled={!selectedCity && !selectedCountry} aria-controls="map-detail-panel" aria-expanded={isPanelOpen} onClick={() => setIsPanelOpen((open) => !open)}>
            <span>{selectedCity ? displayCityName(selectedCity, language) : selectedCountry ? t('map.theater', { id: selectedCountry.id }) : t('map.selectCountry')}</span><strong>{isPanelOpen ? t('map.close') : t('map.details')} <i aria-hidden="true">{isPanelOpen ? '↓' : '↑'}</i></strong>
          </button>
          <div className="city-panel-content">
            <div className="city-panel-head"><div className="panel-kicker">{t('map.strategicTheater')} / {String(cityTierLimit).padStart(2, '0')}</div><button className="city-panel-close" type="button" aria-label={t('map.closeDetails')} onClick={() => setIsPanelOpen(false)}>×</button></div>
            {selectedCity ? <CityDetails city={selectedCity} campaign={campaign} playable={isPlayableCity(selectedCity.id)} canEngage={campaign.currentCityId === selectedCity.id && !travel} onMove={onMove} onEngage={onEngage} /> : selectedCountry ? <CountryDetails country={selectedCountry} playableCityCount={selectedCountryPlayableCityCount} /> : null}
          </div>
        </aside>
      </section>
    </main>
  );
}

function CountryDetails({ country, playableCityCount }: { country: CountryDefinition; playableCityCount: number }) {
  const { language, t } = useI18n();
  return <div className="country-details">
    <span className="country-details-code">{t('map.theaterFocused', { id: country.id })}</span>
    <h2>{displayCountryName(country, language)}</h2>
    <p>{playableCityCount > 0 ? t('map.countryAvailable', { count: playableCityCount, node: playableCityCount === 1 ? t('map.node') : t('map.nodes') }) : t('map.countryUnavailable')}</p>
    <div className="country-details-readout"><span>{t('map.playableNodes')}</span><strong>{playableCityCount || t('common.none')}</strong></div>
    <div className="country-details-note"><span className="status-dot" /> {t('map.brightNodes')}</div>
  </div>;
}

function CityDetails({ city, campaign, playable, canEngage, onMove, onEngage }: { city: CityDefinition; campaign: CampaignState; playable: boolean; canEngage: boolean; onMove: () => void; onEngage: () => void }) {
  const { language, t } = useI18n();
  const state = campaign.cities[city.id];
  const conquest = state.conquest;
  const occupationAvailable = conquest.controlState === 'BREACHED' || conquest.controlState === 'OCCUPIED' || conquest.controlState === 'ASSIMILATED';
  const intactFacilities = Object.values(state.facilities).filter((facility) => !facility.destroyed).length;
  const cardArt = city.tacticalPresetId === 'desert-tech-hub' ? '/assets/runtime/cards/city-desert-card.webp' : city.tacticalPresetId === 'river-metropolis' ? '/assets/runtime/cards/city-river-card.webp' : '/assets/runtime/cards/city-coastal-card.webp';
  const country = COUNTRIES.find((candidate) => candidate.id === city.countryId);
  const actionLabel = !playable ? t('map.notAvailable') : canEngage ? t('map.enterAirspace') : t('map.moveToNode');
  const actionDisabled = !playable || (!canEngage && campaign.currentCityId === city.id) || Boolean(campaign.activeTransit);
  const handleAction = !playable ? undefined : canEngage ? onEngage : onMove;
  return <div className="city-details" data-control-state={conquest.controlState}>
    <img className="city-card-art" src={cardArt} alt="" aria-hidden="true" />
    <div className="city-title-row"><div className="city-title-block"><div><span className="city-accent" style={{ background: city.colorAccent }} /> <span className="city-country">{country ? displayCountryName(country, language) : city.country} / {city.admin1Name || city.admin1Code}</span></div><div className="city-heading-line"><h3>{displayCityName(city, language)}</h3><button className="city-inline-action" type="button" onClick={handleAction} disabled={actionDisabled}>{actionLabel}<span>{canEngage ? '↗' : '→'}</span></button></div></div><span className="city-code">{city.countryId}-{city.id.slice(0, 3).toUpperCase()}</span></div>
    <div className="city-stat-grid"><div><span>{t('map.residualPopulation')}</span><strong>{formatPopulation(state.remainingPopulation, language)}</strong></div><div><span>{t('map.defense')}</span><strong>{rating(city.defenseRating)}</strong></div><div><span>{t('mission.powerPotential')}</span><strong>{rating(city.resourceRating)}</strong></div><div><span>{t('mission.techIndex')}</span><strong>{rating(city.technologyRating)}</strong></div></div>
    <div className="city-control-readout"><span>{t('map.cityControl')}</span><strong className={`control-state control-${conquest.controlState.toLowerCase()}`}>{displayEnum(conquest.controlState, language)}</strong></div>
    <div className="city-meter"><div><span>{t('map.breachProgress')}</span><strong>{Math.round(conquest.breachProgress * 100)}%</strong></div><div className="progress-track"><span style={{ width: `${conquest.breachProgress * 100}%`, background: '#f4b85a' }} /></div></div>
    <div className="city-meter"><div><span>{t('map.earthResistance')}</span><strong>{Math.round(conquest.resistance)}%</strong></div><div className="progress-track"><span style={{ width: `${conquest.resistance}%`, background: '#e87580' }} /></div></div>
    <div className="city-meter"><div><span>{t('map.localAlert')}</span><strong>{Math.round(state.alert)}%</strong></div><div className="progress-track"><span style={{ width: `${state.alert}%`, background: '#f7b35b' }} /></div></div>
    <div className="city-meter"><div><span>{t('map.structuralDamage')}</span><strong>{Math.round(state.destruction)}%</strong></div><div className="progress-track"><span style={{ width: `${state.destruction}%`, background: '#e87580' }} /></div></div>
    <div className="facility-line"><span>{t('map.defenseNetwork')}</span><strong>{intactFacilities ? t('map.activeSignatures', { count: intactFacilities }) : t('map.noActiveSignatures')}</strong></div>
    <div className="facility-line"><span>{t('map.garrisonOccupation')}</span><strong>{conquest.garrisonCohortIds.length} / {occupationAvailable ? t('common.available') : t('map.locked')}</strong></div>
    {!playable ? <p className="arrival-note unavailable-note"><span className="status-dot" /> {t('map.contentUnavailable')}</p> : campaign.currentCityId === city.id && <p className="arrival-note"><span className="status-dot" /> {t('map.airspaceOpen')}</p>}
  </div>;
}

function project(location: { longitude: number; latitude: number }): { x: number; y: number } {
  const normalized = lonLatToNormalized(location.longitude, location.latitude);
  return { x: MAP_CONTENT_BOUNDS.x + normalized.x * MAP_CONTENT_BOUNDS.width, y: MAP_CONTENT_BOUNDS.y + normalized.z * MAP_CONTENT_BOUNDS.height };
}

function pathFor(from: CityDefinition, to: CityDefinition): string {
  const a = project(from); const b = project(to); const mx = (a.x + b.x) / 2; const my = Math.min(a.y, b.y) - 38;
  return `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`;
}

function tierLimitForZoom(zoom: number): 0 | 1 | 2 | 3 {
  return zoom < TIER_ONE_ZOOM ? 0 : 3;
}

function projectedPathArea(path: string): number {
  const tokens = path.match(/[MLZ]|-?\d+(?:\.\d+)?/g) ?? [];
  let command = '';
  let ringStart: [number, number] | null = null;
  let previous: [number, number] | null = null;
  let signedArea = 0;
  for (let index = 0; index < tokens.length;) {
    const token = tokens[index];
    if (token === 'M' || token === 'L') {
      command = token;
      index += 1;
      continue;
    }
    if (token === 'Z') {
      if (previous && ringStart) signedArea += previous[0] * ringStart[1] - ringStart[0] * previous[1];
      ringStart = null;
      previous = null;
      index += 1;
      continue;
    }
    const yToken = tokens[index + 1];
    if (yToken === undefined) break;
    const point: [number, number] = [Number(token), Number(yToken)];
    if (command === 'M' || !ringStart || !previous) {
      ringStart = point;
      previous = point;
      command = 'L';
    } else {
      signedArea += previous[0] * point[1] - point[0] * previous[1];
      previous = point;
    }
    index += 2;
  }
  return Math.abs(signedArea) / 2;
}

function countryLabelFontSize(area: number): number {
  if (area >= 4000) return 24;
  if (area >= 1200) return 21;
  if (area >= 450) return 18;
  if (area >= 120) return 16;
  return 14;
}

function visibleLabelIds(cities: CityDefinition[], zoom: number, selectedCityId: string | null, currentCityId: string | null): Set<string> {
  const occupied = new Set<string>();
  const visible = new Set<string>();
  const sorted = [...cities].sort((a, b) => Number(b.id === selectedCityId || b.id === currentCityId) - Number(a.id === selectedCityId || a.id === currentCityId) || a.mapTier - b.mapTier || b.population - a.population);
  for (const city of sorted) {
    const point = project(city);
    const cell = `${Math.floor(point.x * zoom / 68)}:${Math.floor(point.y * zoom / 20)}`;
    const forced = city.id === selectedCityId || city.id === currentCityId;
    if (!forced && occupied.has(cell)) continue;
    visible.add(city.id);
    occupied.add(cell);
  }
  return visible;
}

const CITY_CLUSTER_PRESET_VARIANTS: Record<string, readonly number[]> = {
  'coastal-megacity': [1, 7, 0, 5],
  'river-metropolis': [2, 6, 9, 0],
  'desert-tech-hub': [3, 4, 8, 5],
};

function cityClusterVariant(city: CityDefinition): number {
  const variants = CITY_CLUSTER_PRESET_VARIANTS[city.tacticalPresetId] ?? [0, 5, 6, 9];
  return variants[stableHash(city.id) % variants.length];
}

function cityLabelOffset(cityId: string): { x: number; y: number } {
  return isPlayableCity(cityId) ? PLAYABLE_CITY_LABEL_OFFSETS[cityId] : DEFAULT_CITY_LABEL_OFFSET;
}

function cityClusterWidth(city: CityDefinition, emphasized: boolean): number {
  const width = CITY_CLUSTER_WIDTH_BY_POPULATION_TIER[cityPopulationTier(city.population) - 1];
  return emphasized ? width + 6 : width;
}

function cityPopulationTier(population: number): number {
  if (population < 250_000) return 1;
  if (population < 500_000) return 2;
  if (population < 1_000_000) return 3;
  if (population < 2_000_000) return 4;
  if (population < 4_000_000) return 5;
  if (population < 8_000_000) return 6;
  if (population < 12_000_000) return 7;
  return 8;
}

function stableHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  return hash;
}

function clampOffset(value: { x: number; y: number }, zoom: number, bounds: Pick<DOMRect, 'width' | 'height'>): { x: number; y: number } {
  const limitX = bounds.width * (zoom - 1) / 2;
  const limitY = bounds.height * (zoom - 1) / 2;
  return { x: clamp(value.x, -limitX, limitX), y: clamp(value.y, -limitY, limitY) };
}

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function round(value: number, digits: number) { const scale = 10 ** digits; return Math.round(value * scale) / scale; }
function rating(value: number) { return '◆'.repeat(value) + '◇'.repeat(5 - value); }
function formatPopulation(value: number, language: ReturnType<typeof useI18n>['language']) { return language === 'ko' ? (value >= 1000000 ? `${(value / 1000000).toFixed(1)}백만` : `${Math.round(value / 1000)}천`) : value >= 1000000 ? `${(value / 1000000).toFixed(1)}M` : `${Math.round(value / 1000)}K`; }
function pointerDistance(pointers: Map<number, { x: number; y: number }>) {
  const values = [...pointers.values()];
  if (values.length < 2) return 0;
  return Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
}
function pointerMidpoint(pointers: Map<number, { x: number; y: number }>) {
  const values = [...pointers.values()];
  if (values.length < 2) return values[0] ?? { x: 0, y: 0 };
  return { x: (values[0].x + values[1].x) / 2, y: (values[0].y + values[1].y) / 2 };
}
