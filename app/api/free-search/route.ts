import { checkRateLimit, getDb, rateLimitResponse, sha256 } from '@/lib/plan-store';

type NominatimItem = {
  place_id?: number;
  osm_type?: string;
  osm_id?: number;
  lat?: string;
  lon?: string;
  display_name?: string;
  name?: string;
  type?: string;
  category?: string;
  address?: Record<string, string>;
};

type GeoapifyItem = {
  place_id?: string;
  lat?: number;
  lon?: number;
  name?: string;
  formatted?: string;
  address_line1?: string;
  address_line2?: string;
  category?: string;
  result_type?: string;
  city?: string;
  county?: string;
  state?: string;
  country?: string;
  country_code?: string;
};

type PhotonFeature = {
  geometry?: { coordinates?: unknown[] };
  properties?: {
    name?: string;
    type?: string;
    city?: string;
    district?: string;
    county?: string;
    state?: string;
    country?: string;
    countrycode?: string;
    osm_type?: string;
    osm_id?: number | string;
  };
};

type FreeSearchItem = {
  title: string;
  category: string;
  address: string;
  roadAddress: string;
  mapx: string;
  mapy: string;
  provider: 'osm';
  placeId?: string;
  osmType?: string;
  region?: string;
  country?: string;
};

type SearchPayload = { items: FreeSearchItem[]; source: 'geoapify' | 'photon' | 'nominatim' | 'cache' };
type ReversePayload = { address: string; source: 'geoapify' | 'nominatim' | 'cache' };
type CacheRow = { payload_json: string; expires_at: string };

const resultCache = new Map<string, { expires: number; payload: SearchPayload | ReversePayload }>();
const MAX_CACHE_ENTRIES = 300;
const MEMORY_CACHE_MS = 5 * 60 * 1000;
const SEARCH_CACHE_MS = 30 * 24 * 60 * 60 * 1000;
const REVERSE_CACHE_MS = 90 * 24 * 60 * 60 * 1000;
const EXTERNAL_SEARCH_TIMEOUT_MS = 5_000;
// Keep destination autocomplete intentionally narrow: the trip destination is
// a city/town/county, not a neighborhood, apartment complex, or landmark.
// Bump this when the filtering policy changes so old D1 results cannot leak
// back into the suggestions.
const CITY_SEARCH_CACHE_VERSION = 'city-v6';
let lastNominatimRequestAt = 0;

/**
 * Reserve one shared Nominatim request slot for the whole deployment.
 * Nominatim's limit is per application, not per Worker isolate. D1 is
 * single-threaded, so a conditional UPDATE gives concurrent isolates one
 * atomic gate without keeping a request open while waiting. The in-memory
 * branch is only for local development before a D1 binding is available.
 */
async function nominatimRequestAllowed() {
  const now = Date.now();
  const db = getDb();
  if (db) {
    try {
      const result = await db.prepare(`
        UPDATE service_throttle
        SET next_allowed_ms = ?
        WHERE id = 'nominatim' AND next_allowed_ms <= ?
      `).bind(now + 1000, now).run();
      return Number(result?.meta?.changes || 0) > 0;
    } catch {
      // A local preview may run before the migration is applied.
    }
  }
  if (now - lastNominatimRequestAt < 1000) return false;
  lastNominatimRequestAt = now;
  return true;
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function normalized(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('en-US');
}

async function lookupCacheKey(kind: 'search' | 'reverse', language: string, value: string) {
  return sha256(`${kind}|${language}|${normalized(value)}`);
}

function remember(key: string, payload: SearchPayload | ReversePayload) {
  resultCache.set(key, { expires: Date.now() + MEMORY_CACHE_MS, payload });
  while (resultCache.size > MAX_CACHE_ENTRIES) resultCache.delete(resultCache.keys().next().value as string);
}

async function readPersistentCache<T extends SearchPayload | ReversePayload>(key: string) {
  const db = getDb();
  if (!db) return null;
  try {
    const row = await db.prepare('SELECT payload_json, expires_at FROM place_lookup_cache WHERE cache_key = ? LIMIT 1').bind(key).first<CacheRow>();
    if (!row) return null;
    if (Date.parse(row.expires_at) <= Date.now()) {
      await db.prepare('DELETE FROM place_lookup_cache WHERE cache_key = ?').bind(key).run();
      return null;
    }
    const payload = JSON.parse(row.payload_json) as T;
    void db.prepare('UPDATE place_lookup_cache SET hit_count = hit_count + 1, updated_at = ? WHERE cache_key = ?')
      .bind(new Date().toISOString(), key).run().catch(() => {});
    return payload;
  } catch {
    return null;
  }
}

async function writePersistentCache(
  key: string,
  kind: 'search' | 'reverse',
  provider: 'geoapify' | 'photon' | 'nominatim',
  language: string,
  payload: SearchPayload | ReversePayload,
  ttlMs: number,
) {
  const db = getDb();
  if (!db) return;
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  try {
    await db.prepare(`INSERT INTO place_lookup_cache
      (cache_key, kind, provider, language, payload_json, hit_count, created_at, updated_at, expires_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET
        provider = excluded.provider,
        payload_json = excluded.payload_json,
        updated_at = excluded.updated_at,
        expires_at = excluded.expires_at`)
      .bind(key, kind, provider, language, JSON.stringify(payload), now, now, expiresAt).run();
    await db.prepare(`DELETE FROM place_lookup_cache WHERE cache_key IN (
      SELECT cache_key FROM place_lookup_cache WHERE expires_at <= ? ORDER BY expires_at ASC LIMIT 100
    )`).bind(now).run();
  } catch {
    // Search remains available even if D1 is temporarily unavailable.
  }
}

function memoryCached<T extends SearchPayload | ReversePayload>(key: string) {
  const cached = resultCache.get(key);
  if (!cached) return null;
  if (cached.expires <= Date.now()) {
    resultCache.delete(key);
    return null;
  }
  return cached.payload as T;
}

function nominatimTitle(item: NominatimItem, fallback: string) {
  const name = cleanText(item.name);
  if (name) return name;
  return cleanText(item.display_name).split(',')[0]?.trim() || fallback;
}

function nominatimAddress(item: NominatimItem) {
  const display = cleanText(item.display_name);
  if (display) return display;
  const address = item.address || {};
  return [address.road, address.house_number, address.city || address.town || address.village, address.country]
    .filter(Boolean).join(' ');
}

function nominatimType(item: NominatimItem) {
  return cleanText(item.type || item.category).replace(/_/g, ' ') || 'place';
}

function geoapifyAddress(item: GeoapifyItem) {
  return cleanText(item.formatted) || [cleanText(item.address_line1), cleanText(item.address_line2)].filter(Boolean).join(', ');
}

function geoapifyTitle(item: GeoapifyItem, fallback: string) {
  return cleanText(item.name) || cleanText(item.address_line1) || geoapifyAddress(item).split(',')[0]?.trim() || fallback;
}

function asSearchItem(item: GeoapifyItem, fallback: string): FreeSearchItem | null {
  const lat = Number(item.lat), lon = Number(item.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const address = geoapifyAddress(item);
  return {
    title: geoapifyTitle(item, fallback),
    category: cleanText(item.category || item.result_type).replace(/_/g, ' ') || 'place',
    address,
    roadAddress: address,
    mapx: String(Math.round(lon * 1e7)),
    mapy: String(Math.round(lat * 1e7)),
    provider: 'osm',
    placeId: item.place_id ? `geoapify:${item.place_id}` : undefined,
    region: cleanText(item.state || item.county),
    country: cleanText(item.country),
  };
}

const SETTLEMENT_TYPES = new Set(['city', 'town', 'municipality', 'county']);

function isCityLevelItem(item: FreeSearchItem) {
  const category = normalized(item.category);
  if (!SETTLEMENT_TYPES.has(category)) return false;
  // A county is useful for Korean destinations (군), but an English county is
  // an administrative area rather than the city a traveller is choosing.
  if (category === 'county' && !cleanText(item.title).endsWith('군')) return false;
  // Photon occasionally labels Korean village administrative units (리) as
  // cities. They are too granular for the trip destination field.
  const title = normalized(item.title);
  if (cleanText(item.title).endsWith('리')) return false;
  if (['township', 'village', 'borough', 'district', 'parish', 'hamlet'].some(suffix => title.endsWith(` ${suffix}`) || title === suffix)) return false;
  return true;
}

function cityBaseName(value: string) {
  return normalized(value)
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .replace(/(특별자치시|특별시|광역시|자치시|자치도|도|시|군|구)$/u, '')
    .replace(/(metropolitancity|specialcity|municipality|city|town|county)$/u, '');
}

function cityIdentity(item: FreeSearchItem) {
  const lat = Number(item.mapy) / 1e7;
  const lon = Number(item.mapx) / 1e7;
  const region = normalized(item.region || '');
  const country = normalized(item.country || '');
  const fallbackArea = Number.isFinite(lat) && Number.isFinite(lon) ? `${lat.toFixed(1)}|${lon.toFixed(1)}` : normalized(item.address);
  return `${cityBaseName(item.title)}|${region || fallbackArea}|${country}`;
}

function normalizeCityResults(items: FreeSearchItem[], query: string) {
  const queryBase = cityBaseName(query);
  const candidates = items.filter(isCityLevelItem);
  // Photon can tag a small named place as `city` when it is represented by a
  // node. If a top-level relation with the same name exists, prefer it over
  // those regional duplicates (for example Beijing vs. Beijing in Guangxi).
  const hasTopLevelRelation = candidates.some(item => cityBaseName(item.title) === queryBase && item.osmType === 'R' && !item.region);
  const ranked = candidates
    .filter(item => !(hasTopLevelRelation && cityBaseName(item.title) === queryBase && item.osmType === 'N' && item.region))
    .map((item, index) => {
      const name = cityBaseName(item.title);
      const score = name === queryBase ? 0 : name.startsWith(queryBase) || queryBase.startsWith(name) ? 1 : 2;
      return { item, index, score };
    })
    .sort((a, b) => a.score - b.score || a.index - b.index);
  const seen = new Set<string>();
  return ranked.flatMap(({ item }) => {
    const key = cityIdentity(item);
    if (seen.has(key)) return [];
    seen.add(key);
    return [item];
  }).slice(0, 5);
}

async function photonCitySearch(query: string, language: 'ko' | 'en') {
  const endpoint = new URL('https://photon.komoot.io/api/');
  endpoint.searchParams.set('q', query);
  endpoint.searchParams.set('limit', '30');
  if (language === 'en') endpoint.searchParams.set('lang', 'en');
  try {
    const response = await fetch(endpoint, {
      headers: { Accept: 'application/json', 'User-Agent': 'travel-note/2.0 (https://travel.whales-teatime.workers.dev)' },
      signal: AbortSignal.timeout(EXTERNAL_SEARCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body = await response.json() as { features?: PhotonFeature[] };
    const items = (body.features || []).flatMap(feature => {
      const properties = feature.properties || {};
      const coordinates = feature.geometry?.coordinates || [];
      const lon = Number(coordinates[0]), lat = Number(coordinates[1]);
      const title = cleanText(properties.name);
      const category = normalized(cleanText(properties.type));
      if (!title || !SETTLEMENT_TYPES.has(category) || !Number.isFinite(lat) || !Number.isFinite(lon)) return [];
      const region = cleanText(properties.state || properties.county || properties.district);
      const country = cleanText(properties.country);
      const address = [title, region, country].filter((part, index, values) => part && values.indexOf(part) === index).join(', ');
      return [{
        title,
        category,
        address,
        roadAddress: address,
        mapx: String(Math.round(lon * 1e7)),
        mapy: String(Math.round(lat * 1e7)),
        provider: 'osm' as const,
        placeId: properties.osm_id ? `photon:${properties.osm_type || 'n'}:${properties.osm_id}` : undefined,
        osmType: cleanText(properties.osm_type).toUpperCase() || undefined,
        region,
        country,
      }];
    });
    const normalizedItems = normalizeCityResults(items, query);
    return normalizedItems.length ? normalizedItems : null;
  } catch {
    return null;
  }
}

function geoapifyKey() {
  return cleanText(process.env.GEOAPIFY_API_KEY);
}

async function geoapifySearch(query: string, near: string, language: 'ko' | 'en', cityOnly = false) {
  const apiKey = geoapifyKey();
  if (!apiKey) return null;
  const searchText = near && !normalized(query).includes(normalized(near)) ? `${query}, ${near}` : query;
  const endpoint = new URL('https://api.geoapify.com/v1/geocode/autocomplete');
  endpoint.searchParams.set('text', searchText);
  endpoint.searchParams.set('format', 'json');
  endpoint.searchParams.set('limit', '8');
  endpoint.searchParams.set('lang', language);
  if (cityOnly) endpoint.searchParams.set('type', 'city');
  endpoint.searchParams.set('apiKey', apiKey);
  try {
    const response = await fetch(endpoint, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(EXTERNAL_SEARCH_TIMEOUT_MS) });
    if (!response.ok) return null;
    const body = await response.json() as { results?: GeoapifyItem[] } | GeoapifyItem[];
    const results = Array.isArray(body) ? body : body.results || [];
    const items = results.map(item => asSearchItem(item, query)).filter((item): item is FreeSearchItem => Boolean(item));
    return items.length ? items : null;
  } catch {
    return null;
  }
}

async function geoapifyReverse(lat: number, lon: number, language: 'ko' | 'en') {
  const apiKey = geoapifyKey();
  if (!apiKey) return null;
  const endpoint = new URL('https://api.geoapify.com/v1/geocode/reverse');
  endpoint.searchParams.set('lat', String(lat));
  endpoint.searchParams.set('lon', String(lon));
  endpoint.searchParams.set('format', 'json');
  endpoint.searchParams.set('lang', language);
  endpoint.searchParams.set('apiKey', apiKey);
  try {
    const response = await fetch(endpoint, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(EXTERNAL_SEARCH_TIMEOUT_MS) });
    if (!response.ok) return null;
    const body = await response.json() as { results?: GeoapifyItem[] } | GeoapifyItem[];
    const result = (Array.isArray(body) ? body : body.results || [])[0];
    return result ? geoapifyAddress(result) : null;
  } catch {
    return null;
  }
}

async function nominatimSearch(query: string, near: string, language: 'ko' | 'en', cityOnly = false) {
  if (!await nominatimRequestAllowed()) return null;
  const searchQuery = near && !normalized(query).includes(normalized(near)) ? `${query}, ${near}` : query;
  const endpoint = new URL('https://nominatim.openstreetmap.org/search');
  endpoint.searchParams.set('q', searchQuery);
  endpoint.searchParams.set('format', 'jsonv2');
  endpoint.searchParams.set('limit', cityOnly ? '20' : '8');
  endpoint.searchParams.set('addressdetails', '1');
  endpoint.searchParams.set('accept-language', language);
  if (cityOnly) {
    endpoint.searchParams.set('featureType', 'city');
    endpoint.searchParams.set('layer', 'address');
  }
  try {
    const response = await fetch(endpoint, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'travel-note/2.0 (https://travel.whales-teatime.workers.dev)',
        Referer: 'https://travel.whales-teatime.workers.dev/',
      },
      signal: AbortSignal.timeout(EXTERNAL_SEARCH_TIMEOUT_MS),
      cf: { cacheTtl: 300, cacheEverything: true },
    } as RequestInit & { cf: Record<string, number | boolean> });
    if (!response.ok) return null;
    const data = await response.json() as NominatimItem[];
    const items = data.filter(item => Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon))).map(item => {
      const address = nominatimAddress(item);
      const details = item.address || {};
      return {
        title: nominatimTitle(item, query),
        category: nominatimType(item),
        address,
        roadAddress: address,
        mapx: String(Math.round(Number(item.lon) * 1e7)),
        mapy: String(Math.round(Number(item.lat) * 1e7)),
        provider: 'osm' as const,
        placeId: item.place_id ? `osm:${item.osm_type || 'n'}:${item.osm_id || item.place_id}` : undefined,
        osmType: cleanText(item.osm_type).toUpperCase() || undefined,
        region: cleanText(details.state || details.province || details.county),
        country: cleanText(details.country),
      };
    });
    return cityOnly ? normalizeCityResults(items, query) : items;
  } catch {
    return null;
  }
}

async function nominatimReverse(lat: number, lon: number, language: 'ko' | 'en') {
  if (!await nominatimRequestAllowed()) return null;
  const endpoint = new URL('https://nominatim.openstreetmap.org/reverse');
  endpoint.searchParams.set('lat', String(lat));
  endpoint.searchParams.set('lon', String(lon));
  endpoint.searchParams.set('format', 'jsonv2');
  endpoint.searchParams.set('zoom', '18');
  endpoint.searchParams.set('accept-language', language);
  try {
    const response = await fetch(endpoint, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'travel-note/2.0 (https://travel.whales-teatime.workers.dev)',
        Referer: 'https://travel.whales-teatime.workers.dev/',
      },
      signal: AbortSignal.timeout(EXTERNAL_SEARCH_TIMEOUT_MS),
      cf: { cacheTtl: 300, cacheEverything: true },
    } as RequestInit & { cf: Record<string, number | boolean> });
    if (!response.ok) return null;
    return nominatimAddress(await response.json() as NominatimItem);
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const quota = await checkRateLimit(request, 'place-search', 60);
  if (!quota.allowed) return rateLimitResponse(quota.retryAfter);

  const url = new URL(request.url);
  const language = url.searchParams.get('lang') === 'en' ? 'en' : 'ko';
  const cityOnly = url.searchParams.get('mode') === 'city';
  if (url.searchParams.get('mode') === 'reverse') {
    const lat = Number(url.searchParams.get('lat'));
    const lon = Number(url.searchParams.get('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return Response.json({ message: '위치를 확인할 수 없습니다.' }, { status: 400 });
    }
    const cacheValue = `${lat.toFixed(5)},${lon.toFixed(5)}`;
    const key = await lookupCacheKey('reverse', language, cacheValue);
    const memory = memoryCached<ReversePayload>(key);
    if (memory) return Response.json({ ...memory, source: 'cache' }, { headers: { 'Cache-Control': 'private, max-age=300' } });
    const persistent = await readPersistentCache<ReversePayload>(key);
    if (persistent) {
      remember(key, persistent);
      return Response.json({ ...persistent, source: 'cache' }, { headers: { 'Cache-Control': 'private, max-age=300' } });
    }
    const geoAddress = await geoapifyReverse(lat, lon, language);
    const provider = geoAddress ? 'geoapify' as const : 'nominatim' as const;
    const address = geoAddress || await nominatimReverse(lat, lon, language);
    if (!address) return Response.json({ message: '주소 변환 중 오류가 발생했습니다.' }, { status: 502 });
    const payload: ReversePayload = { address, source: provider };
    remember(key, payload);
    await writePersistentCache(key, 'reverse', provider, language, payload, REVERSE_CACHE_MS);
    return Response.json(payload, { headers: { 'Cache-Control': 'private, max-age=300' } });
  }

  const query = url.searchParams.get('q')?.trim() || '';
  const near = url.searchParams.get('near')?.trim().slice(0, 80) || '';
  if (query.length < 2) return Response.json({ items: [] });
  if (query.length > 120) return Response.json({ message: '검색어가 너무 깁니다.' }, { status: 400 });

  const cacheValue = `${near}|${query}`;
  const key = await lookupCacheKey('search', language, `${cityOnly ? `${CITY_SEARCH_CACHE_VERSION}|` : ''}${cacheValue}`);
  const memory = memoryCached<SearchPayload>(key);
  if (memory) return Response.json({ ...memory, source: 'cache' }, { headers: { 'Cache-Control': 'private, max-age=300' } });
  const persistent = await readPersistentCache<SearchPayload>(key);
  if (persistent) {
    remember(key, persistent);
    return Response.json({ ...persistent, source: 'cache' }, { headers: { 'Cache-Control': 'private, max-age=300' } });
  }

  const photonItems = cityOnly ? await photonCitySearch(query, language) : null;
  const geoItems = photonItems ? null : await geoapifySearch(query, near, language, cityOnly);
  const provider = photonItems ? 'photon' as const : geoItems ? 'geoapify' as const : 'nominatim' as const;
  const rawItems = photonItems || geoItems || await nominatimSearch(query, near, language, cityOnly);
  const items = rawItems && cityOnly ? normalizeCityResults(rawItems, query) : rawItems;
  if (!items) return Response.json({ message: '지도 검색이 잠시 바빠요. 잠시 뒤 다시 시도해주세요.' }, { status: 503 });
  const payload: SearchPayload = { items, source: provider };
  remember(key, payload);
  await writePersistentCache(key, 'search', provider, language, payload, SEARCH_CACHE_MS);
  return Response.json(payload, { headers: { 'Cache-Control': 'private, max-age=300' } });
}
