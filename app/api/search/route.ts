import { checkRateLimit, rateLimitResponse } from '@/lib/plan-store';

type SearchItem = { title?: string; category?: string; address?: string; roadAddress?: string; mapx?: string; mapy?: string; link?: string; description?: string };

const resultCache = new Map<string, { expires: number; items: SearchItem[] }>();
const MAX_CACHE_ENTRIES = 500;

function searchQueries(query: string, near: string) {
  const wordCount = query.split(/\s+/).filter(Boolean).length;
  // Keep multi-word queries intact: they often contain an explicit city or district.
  // Use the trip destination only for short, generic searches such as "카페" or "야시장".
  const scoped = near && wordCount <= 1 && !query.includes(near) ? `${near} ${query}` : query;
  const variants = [scoped];
  const compact = scoped.replace(/\s+/g, '');
  if (query.includes('야시장')) {
    const area = near || query.replace(/야시장/g, '').trim();
    variants.push(`${area} 남부시장 야시장`.trim(), `${area} 남부시장 맛집`.trim(), `${area} 남부시장 닭집`.trim());
  } else if (compact !== scoped) {
    variants.push(compact);
  }
  return [...new Set(variants)].slice(0, 4);
}

export async function GET(request: Request) {
  const quota = checkRateLimit(request, 'place-search', 60);
  if (!quota.allowed) return rateLimitResponse(quota.retryAfter);
  const url = new URL(request.url);
  const query = url.searchParams.get('q')?.trim();
  const near = url.searchParams.get('near')?.trim().slice(0, 80) ?? '';
  if (!query) return Response.json({ message: '검색어를 입력해주세요.' }, { status: 400 });
  if (query.length > 120) return Response.json({ message: '검색어가 너무 깁니다.' }, { status: 400 });

  const cacheKey = `${near}|${query}`.toLocaleLowerCase('ko-KR');
  const now = Date.now();
  for (const [key, entry] of resultCache) if (entry.expires <= now) resultCache.delete(key);
  const cached = resultCache.get(cacheKey);
  if (cached) return Response.json({ items: cached.items }, { headers: { 'Cache-Control': 'private, max-age=60' } });

  const clientId = process.env.NAVER_API_HUB_CLIENT_ID;
  const clientSecret = process.env.NAVER_API_HUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return Response.json({ message: '장소 검색 API가 아직 연결되지 않았습니다. 서버용 검색 API 키를 설정해주세요.' }, { status: 503 });
  }

  const responses = await Promise.all(searchQueries(query, near).map(async searchQuery => {
    const response = await fetch(`https://naverapihub.apigw.ntruss.com/search/v1/local?query=${encodeURIComponent(searchQuery)}&display=5&start=1&sort=random&format=json`, {
      headers: {
        'X-NCP-APIGW-API-KEY-ID': clientId,
        'X-NCP-APIGW-API-KEY': clientSecret,
      },
      cache: 'no-store',
    });
    if (!response.ok) return { ok: false, items: [] as SearchItem[] };
    const data = (await response.json()) as { items?: SearchItem[] };
    return { ok: true, items: data.items ?? [] };
  }));
  if (!responses.some(response => response.ok)) return Response.json({ message: '네이버 장소 검색 중 오류가 발생했습니다.' }, { status: 502 });
  const seen = new Set<string>();
  const nearToken = near.replace(/\s+/g, '').replace(/(특별자치)?도$/,'').toLocaleLowerCase('ko-KR');
  const items = responses.flatMap(response => response.items).filter(item => {
    const title = (item.title ?? '').replace(/<[^>]*>/g, '').trim();
    const key = `${title}|${item.roadAddress || item.address}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a,b)=>{
    if(!nearToken)return 0;
    const score=(item:SearchItem)=>`${item.address??''}${item.roadAddress??''}`.replace(/\s+/g,'').toLocaleLowerCase('ko-KR').includes(nearToken)?1:0;
    return score(b)-score(a);
  }).slice(0, 10);
  resultCache.set(cacheKey, { expires: Date.now() + 5 * 60 * 1000, items });
  while (resultCache.size > MAX_CACHE_ENTRIES) resultCache.delete(resultCache.keys().next().value as string);
  return Response.json({ items }, { headers: { 'Cache-Control': 'private, max-age=60' } });
}
