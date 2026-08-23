import rawWorldData from './generated/world-data.json';
import rawGeometry from './generated/world-geometry-50m.json';
import type { CityDefinition, CountryDefinition, RegionDefinition } from '../../domain/types';

interface RawCity {
  id: string;
  geonameId: number;
  countryId: string;
  admin1Code: string;
  admin1Name: string;
  name: { local: string; en: string };
  latitude: number;
  longitude: number;
  population: number;
  basePopulation: number;
  role: CityDefinition['role'];
  mapTier: CityDefinition['mapTier'];
  tacticalPresetId: string;
  defenseRating: number;
  resourceRating: number;
  technologyRating: number;
  colorAccent: string;
  source: CityDefinition['source'];
}

interface RawCountry {
  id: string;
  isoAlpha3: string;
  m49Code: string;
  name: { ko: string; en: string };
  colorAccent: string;
  labelCoordinate: { latitude: number; longitude: number };
  geometryId: string;
  cities: RawCity[];
}

interface RawRegion {
  id: string;
  name: { ko: string; en: string };
  m49RegionCode: string;
  colorAccent: string;
  countries: RawCountry[];
}

interface RawWorldData {
  dataVersion: string;
  projection: 'equirectangular-wgs84';
  regions: RawRegion[];
}

interface RawGeometry {
  dataVersion: string;
  contentBounds: { x: number; y: number; width: number; height: number };
  countries: { id: string; path: string; minZoom: number }[];
}

const sourceWorld = rawWorldData as RawWorldData;
const sourceGeometry = rawGeometry as RawGeometry;

export const WORLD_DATA_VERSION = sourceWorld.dataVersion;
export const WORLD_PROJECTION = sourceWorld.projection;
export const MAP_CONTENT_BOUNDS = sourceGeometry.contentBounds;

export const WORLD_REGIONS: RegionDefinition[] = sourceWorld.regions.map((region) => ({
  id: region.id,
  name: region.name,
  m49RegionCode: region.m49RegionCode,
  colorAccent: region.colorAccent,
  countryIds: region.countries.map((country) => country.id),
}));

export const COUNTRIES: CountryDefinition[] = sourceWorld.regions.flatMap((region) => region.countries.map((country) => ({
  id: country.id,
  isoAlpha3: country.isoAlpha3,
  m49Code: country.m49Code,
  regionId: region.id,
  name: country.name,
  colorAccent: country.colorAccent,
  labelCoordinate: country.labelCoordinate,
  geometryId: country.geometryId,
  cityIds: country.cities.map((city) => city.id),
})));

const countryNameById = new Map(COUNTRIES.map((country) => [country.id, country.name.en]));
export const CITIES: CityDefinition[] = sourceWorld.regions.flatMap((region) => region.countries.flatMap((country) => country.cities.map((city) => ({
  id: city.id,
  name: city.name.en,
  localName: city.name.local,
  countryId: city.countryId,
  country: countryNameById.get(city.countryId) ?? city.countryId,
  admin1Code: city.admin1Code,
  admin1Name: city.admin1Name,
  latitude: city.latitude,
  longitude: city.longitude,
  geonameId: city.geonameId,
  population: city.population,
  role: city.role,
  mapTier: city.mapTier,
  tacticalPresetId: city.tacticalPresetId,
  basePopulation: city.basePopulation,
  defenseRating: city.defenseRating,
  resourceRating: city.resourceRating,
  technologyRating: city.technologyRating,
  colorAccent: city.colorAccent,
  source: city.source,
}))));

export const COUNTRY_BY_ID = Object.fromEntries(COUNTRIES.map((country) => [country.id, country])) as Record<string, CountryDefinition>;
export const CITY_BY_ID = Object.fromEntries(CITIES.map((city) => [city.id, city])) as Record<string, CityDefinition>;
export const CITIES_BY_COUNTRY_ID = Object.fromEntries(COUNTRIES.map((country) => [country.id, country.cityIds.map((cityId) => CITY_BY_ID[cityId])])) as Record<string, CityDefinition[]>;
export const COUNTRY_GEOMETRY_BY_ID = Object.fromEntries(sourceGeometry.countries.map((country) => [country.id, country])) as Record<string, { id: string; path: string; minZoom: number }>;
