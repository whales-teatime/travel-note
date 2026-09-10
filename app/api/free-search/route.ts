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
};

type SearchPayload = { items: FreeSearchItem[]; source: 'geoapify' | 'nominatim' | 'cache' };
type ReversePayload = { address: string; source: 'geoapify' | 'nominatim' | 'cache' };
type CacheRow = { payload_json: string; expires_at: string };

const resultCache = new Map<string, { expires: number; payload: SearchPayload | ReversePayload }>();
const MAX_CACHE_ENTRIES = 300;
const MEMORY_CACHE_MS = 5 * 60 * 1000;
const SEARCH_CACHE_MS = 30 * 24 * 60 * 60 * 1000;
const REVERSE_CACHE_MS = 90 * 24 * 60 * 60 * 1000;
const EXTERNAL_SEARCH_TIMEOUT_MS = 5_000;
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
  provider: 'geoapify' | 'nominatim',
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
  };
}

function geoapifyKey() {
  return cleanText(process.env.GEOAPIFY_API_KEY);
}

async function geoapifySearch(query: string, near: string, language: 'ko' | 'en') {
  const apiKey = geoapifyKey();
  if (!apiKey) return null;
  const searchText = near && !normalized(query).includes(normalized(near)) ? `${query}, ${near}` : query;
  const endpoint = new URL('https://api.geoapify.com/v1/geocode/autocomplete');
  endpoint.searchParams.set('text', searchText);
  endpoint.searchParams.set('format', 'json');
  endpoint.searchParams.set('limit', '8');
  endpoint.searchParams.set('lang', language);
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

async function nominatimSearch(query: string, near: string, language: 'ko' | 'en') {
  if (!await nominatimRequestAllowed()) return null;
  const searchQuery = near && !normalized(query).includes(normalized(near)) ? `${query}, ${near}` : query;
  const endpoint = new URL('https://nominatim.openstreetmap.org/search');
  endpoint.searchParams.set('q', searchQuery);
  endpoint.searchParams.set('format', 'jsonv2');
  endpoint.searchParams.set('limit', '8');
  endpoint.searchParams.set('addressdetails', '1');
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
    const data = await response.json() as NominatimItem[];
    return data.filter(item => Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon))).map(item => {
      const address = nominatimAddress(item);
      return {
        title: nominatimTitle(item, query),
        category: nominatimType(item),
        address,
        roadAddress: address,
        mapx: String(Math.round(Number(item.lon) * 1e7)),
        mapy: String(Math.round(Number(item.lat) * 1e7)),
        provider: 'osm' as const,
        placeId: item.place_id ? `osm:${item.osm_type || 'n'}:${item.osm_id || item.place_id}` : undefined,
      };
    });
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
  const key = await lookupCacheKey('search', language, cacheValue);
  const memory = memoryCached<SearchPayload>(key);
  if (memory) return Response.json({ ...memory, source: 'cache' }, { headers: { 'Cache-Control': 'private, max-age=300' } });
  const persistent = await readPersistentCache<SearchPayload>(key);
  if (persistent) {
    remember(key, persistent);
    return Response.json({ ...persistent, source: 'cache' }, { headers: { 'Cache-Control': 'private, max-age=300' } });
  }

  const geoItems = await geoapifySearch(query, near, language);
  const provider = geoItems ? 'geoapify' as const : 'nominatim' as const;
  const items = geoItems || await nominatimSearch(query, near, language);
  if (!items) return Response.json({ message: '지도 검색이 잠시 바빠요. 잠시 뒤 다시 시도해주세요.' }, { status: 503 });
  const payload: SearchPayload = { items, source: provider };
  remember(key, payload);
  await writePersistentCache(key, 'search', provider, language, payload, SEARCH_CACHE_MS);
  return Response.json(payload, { headers: { 'Cache-Control': 'private, max-age=300' } });
}
