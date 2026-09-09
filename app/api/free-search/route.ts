import { checkRateLimit, rateLimitResponse } from '@/lib/plan-store';

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

type FreeSearchItem = { title: string; category: string; address: string; roadAddress: string; mapx: string; mapy: string; provider: 'osm'; placeId?: string };
const resultCache = new Map<string, { expires: number; items: FreeSearchItem[] }>();
const MAX_CACHE_ENTRIES = 300;

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function resultTitle(item: NominatimItem, fallback: string) {
  const name = cleanText(item.name);
  if (name) return name;
  const display = cleanText(item.display_name);
  return display.split(',')[0]?.trim() || fallback;
}

function resultAddress(item: NominatimItem) {
  const display = cleanText(item.display_name);
  if (display) return display;
  const address = item.address || {};
  return [address.road, address.house_number, address.city || address.town || address.village, address.country]
    .filter(Boolean).join(' ');
}

function searchType(item: NominatimItem) {
  const type = cleanText(item.type || item.category).replace(/_/g, ' ');
  return type || 'place';
}

function cacheKey(query: string, near: string, language: string) {
  return `${language}|${near}|${query}`.toLocaleLowerCase('en-US');
}

export async function GET(request: Request) {
  const quota = await checkRateLimit(request, 'place-search', 20);
  if (!quota.allowed) return rateLimitResponse(quota.retryAfter);

  const url = new URL(request.url);
  const language = url.searchParams.get('lang') === 'en' ? 'en' : 'ko';
  if (url.searchParams.get('mode') === 'reverse') {
    const lat = Number(url.searchParams.get('lat'));
    const lon = Number(url.searchParams.get('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return Response.json({ message: '위치를 확인할 수 없습니다.' }, { status: 400 });
    }
    const endpoint = new URL('https://nominatim.openstreetmap.org/reverse');
    endpoint.searchParams.set('lat', String(lat));
    endpoint.searchParams.set('lon', String(lon));
    endpoint.searchParams.set('format', 'jsonv2');
    endpoint.searchParams.set('zoom', '18');
    endpoint.searchParams.set('accept-language', language);
    const response = await fetch(endpoint, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'travel-note/2.0 (https://travel.whales-teatime.workers.dev)',
        Referer: 'https://travel.whales-teatime.workers.dev/',
      },
      cf: { cacheTtl: 300, cacheEverything: true },
    } as RequestInit & { cf: Record<string, number | boolean> });
    if (!response.ok) return Response.json({ message: '주소 변환 중 오류가 발생했습니다.' }, { status: 502 });
    const item = await response.json() as NominatimItem;
    return Response.json({ address: resultAddress(item) }, { headers: { 'Cache-Control': 'private, max-age=300' } });
  }
  const query = url.searchParams.get('q')?.trim() || '';
  const near = url.searchParams.get('near')?.trim().slice(0, 80) || '';
  if (query.length < 2) return Response.json({ items: [] });
  if (query.length > 120) return Response.json({ message: '검색어가 너무 깁니다.' }, { status: 400 });

  const key = cacheKey(query, near, language);
  const now = Date.now();
  for (const [entryKey, entry] of resultCache) if (entry.expires <= now) resultCache.delete(entryKey);
  const cached = resultCache.get(key);
  if (cached) return Response.json({ items: cached.items }, { headers: { 'Cache-Control': 'private, max-age=300' } });

  const searchQuery = near && !query.toLocaleLowerCase().includes(near.toLocaleLowerCase()) ? `${query}, ${near}` : query;
  const endpoint = new URL('https://nominatim.openstreetmap.org/search');
  endpoint.searchParams.set('q', searchQuery);
  endpoint.searchParams.set('format', 'jsonv2');
  endpoint.searchParams.set('limit', '8');
  endpoint.searchParams.set('addressdetails', '1');
  endpoint.searchParams.set('accept-language', language);

  const response = await fetch(endpoint, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'travel-note/2.0 (https://travel.whales-teatime.workers.dev)',
      Referer: 'https://travel.whales-teatime.workers.dev/',
    },
    cf: { cacheTtl: 300, cacheEverything: true },
  } as RequestInit & { cf: Record<string, number | boolean> });
  if (!response.ok) return Response.json({ message: '무료 지도 검색 중 오류가 발생했습니다.' }, { status: 502 });

  const data = await response.json() as NominatimItem[];
  const items = data.filter(item => Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon))).map(item => ({
    title: resultTitle(item, query),
    category: searchType(item),
    address: resultAddress(item),
    roadAddress: resultAddress(item),
    mapx: String(Math.round(Number(item.lon) * 1e7)),
    mapy: String(Math.round(Number(item.lat) * 1e7)),
    provider: 'osm' as const,
    placeId: item.place_id ? `osm:${item.osm_type || 'n'}:${item.osm_id || item.place_id}` : undefined,
  }));
  resultCache.set(key, { expires: Date.now() + 5 * 60 * 1000, items });
  while (resultCache.size > MAX_CACHE_ENTRIES) resultCache.delete(resultCache.keys().next().value as string);
  return Response.json({ items }, { headers: { 'Cache-Control': 'private, max-age=300' } });
}
