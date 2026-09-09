import { checkRateLimit, rateLimitResponse } from '@/lib/plan-store';

type SearchItem = { title?: string; category?: string; address?: string; roadAddress?: string; mapx?: string; mapy?: string; link?: string; description?: string };
type SearchLanguage = 'ko' | 'en';

const resultCache = new Map<string, { expires: number; items: SearchItem[] }>();
const MAX_CACHE_ENTRIES = 500;

const SEARCH_TERM_ALIASES: Array<[string, string]> = [
  ['intercity bus terminal', '시외버스터미널'], ['bus terminal', '버스터미널'], ['night market', '야시장'], ['city hall', '시청'],
  ['terminal', '터미널'], ['station', '역'], ['airport', '공항'], ['market', '시장'], ['cafe', '카페'], ['coffee', '카페'],
  ['restaurant', '맛집'], ['hotel', '호텔'], ['park', '공원'], ['museum', '박물관'], ['cathedral', '성당'], ['palace', '궁'],
  ['beach', '해수욕장'], ['zoo', '동물원'], ['arboretum', '수목원'], ['department store', '백화점'], ['convenience store', '편의점'],
  ['seoul', '서울'], ['busan', '부산'], ['daegu', '대구'], ['incheon', '인천'], ['daejeon', '대전'], ['gwangju', '광주'],
  ['ulsan', '울산'], ['sejong', '세종'], ['suwon', '수원'], ['jeonju', '전주'], ['cheongju', '청주'], ['jeju', '제주'],
  ['gangneung', '강릉'], ['gyeongju', '경주'], ['yeosu', '여수'], ['mokpo', '목포'], ['chuncheon', '춘천'], ['changwon', '창원'],
];

function localizeSearchText(value: string) {
  let output = value;
  for (const [source, target] of [...SEARCH_TERM_ALIASES].sort((left, right) => right[0].length - left[0].length)) {
    output = output.replace(new RegExp(source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), target);
  }
  return output.replace(/\s+/g, ' ').trim();
}

const TITLE_TRANSLATIONS: Array<[RegExp, string]> = [
  [/시외버스터미널/g, ' Intercity Bus Terminal '], [/고속버스터미널/g, ' Express Bus Terminal '], [/버스터미널/g, ' Bus Terminal '], [/터미널/g, ' Terminal '],
  [/한옥마을/g, ' Hanok Village '], [/남부시장/g, ' Nambu Market '], [/야시장/g, ' Night Market '], [/시청/g, ' City Hall '],
  [/공항/g, ' Airport '], [/기차역/g, ' Train Station '], [/시장/g, ' Market '], [/카페/g, ' Cafe '], [/맛집/g, ' Restaurant '],
  [/식당/g, ' Restaurant '], [/공원/g, ' Park '], [/박물관/g, ' Museum '], [/미술관/g, ' Art Museum '], [/동물원/g, ' Zoo '],
  [/수목원/g, ' Arboretum '], [/성당/g, ' Cathedral '], [/궁/g, ' Palace '], [/해수욕장/g, ' Beach '], [/해변/g, ' Beach '],
  [/백화점/g, ' Department Store '], [/편의점/g, ' Convenience Store '], [/마트/g, ' Mart '], [/대학교/g, ' University '], [/대학/g, ' University '], [/점(?=\s|$)/g, ' Branch '],
  [/병원/g, ' Hospital '], [/도서관/g, ' Library '], [/문화회관/g, ' Cultural Center '], [/본점/g, ' Main Branch '], [/역(?=\s|$)/g, ' Station '],
];

const CATEGORY_TRANSLATIONS: Array<[string, string]> = [
  ['음식점', 'Restaurant'], ['한식', 'Korean'], ['중식', 'Chinese'], ['일식', 'Japanese'], ['양식', 'Western'], ['카페', 'Cafe'],
  ['주점', 'Bar'], ['시청', 'City Hall'], ['공공,사회기관', 'Public institution'], ['관광', 'Attraction'], ['숙박', 'Accommodation'],
  ['디저트', 'Dessert'], ['베이커리', 'Bakery'], ['일식당', 'Japanese Restaurant'], ['한식당', 'Korean Restaurant'], ['중식당', 'Chinese Restaurant'],
  ['피자', 'Pizza'], ['햄버거', 'Burger'], ['분식', 'Snack Bar'], ['커피전문점', 'Coffee Shop'], ['테마카페', 'Themed Cafe'],
];

const CHOSEONG = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
const JUNGSEONG = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
const JONGSEONG = ['', 'k', 'kk', 'ks', 'n', 'nj', 'nh', 't', 'l', 'lk', 'lm', 'lb', 'ls', 'lt', 'lp', 'lh', 'm', 'p', 'ps', 's', 'ss', 'ng', 'j', 'ch', 'k', 't', 'p', 'h'];

function titleCaseEnglish(value: string) {
  return value.replace(/\b[a-z][a-z'-]*/g, word => word.charAt(0).toUpperCase() + word.slice(1));
}

function romanizeHangul(value: string) {
  return value.split('').map(character => {
    const code = character.codePointAt(0) || 0;
    if (code < 0xac00 || code > 0xd7a3) return character;
    const syllable = code - 0xac00;
    return `${CHOSEONG[Math.floor(syllable / 588)]}${JUNGSEONG[Math.floor((syllable % 588) / 28)]}${JONGSEONG[syllable % 28]}`;
  }).join('');
}

function englishTitle(value: string) {
  let output = value.replace(/<[^>]*>/g, '').trim();
  for (const [pattern, replacement] of TITLE_TRANSLATIONS) output = output.replace(pattern, replacement);
  return titleCaseEnglish(romanizeHangul(output).replace(/\s+/g, ' ').trim());
}

function englishCategory(value: string) {
  return value.split('>').map(part => {
    const trimmed = part.trim();
    const exact = CATEGORY_TRANSLATIONS.find(([source]) => source === trimmed);
    if (exact) return exact[1];
    return trimmed.split(',').map(segment => CATEGORY_TRANSLATIONS.find(([source]) => source === segment.trim())?.[1] || englishTitle(segment)).join(', ');
  }).join(' > ');
}

function englishAddress(value: string) {
  return titleCaseEnglish(romanizeHangul(value).replace(/\s+/g, ' ').trim());
}

function displayItems(items: SearchItem[], language: SearchLanguage) {
  if (language === 'ko') return items;
  return items.map(item => ({
    ...item,
    titleEnglish: englishTitle(item.title || ''),
    categoryEnglish: englishCategory(item.category || ''),
    addressEnglish: englishAddress(item.address || ''),
    roadAddressEnglish: englishAddress(item.roadAddress || ''),
  }));
}

function searchQueries(query: string, near: string) {
  const localizedQuery = localizeSearchText(query);
  const localizedNear = localizeSearchText(near);
  const wordCount = localizedQuery.split(/\s+/).filter(Boolean).length;
  // Keep multi-word queries intact: they often contain an explicit city or district.
  // Use the trip destination only for short, generic searches such as "카페" or "야시장".
  const scoped = localizedNear && wordCount <= 1 && !localizedQuery.includes(localizedNear) ? `${localizedNear} ${localizedQuery}` : localizedQuery;
  const variants = [scoped];
  const compact = scoped.replace(/\s+/g, '');
  if (localizedQuery.includes('야시장')) {
    const area = localizedNear || localizedQuery.replace(/야시장/g, '').trim();
    variants.push(`${area} 남부시장 야시장`.trim(), `${area} 남부시장 맛집`.trim(), `${area} 남부시장 닭집`.trim());
  } else if (compact !== scoped) {
    variants.push(compact);
  }
  return [...new Set(variants)].slice(0, 4);
}

export async function GET(request: Request) {
  const quota = await checkRateLimit(request, 'place-search', 60);
  if (!quota.allowed) return rateLimitResponse(quota.retryAfter);
  const url = new URL(request.url);
  const query = url.searchParams.get('q')?.trim();
  const near = url.searchParams.get('near')?.trim().slice(0, 80) ?? '';
  const language: SearchLanguage = url.searchParams.get('lang') === 'en' ? 'en' : 'ko';
  if (!query) return Response.json({ message: '검색어를 입력해주세요.' }, { status: 400 });
  if (query.length > 120) return Response.json({ message: '검색어가 너무 깁니다.' }, { status: 400 });

  const cacheKey = `${near}|${query}`.toLocaleLowerCase('ko-KR');
  const now = Date.now();
  for (const [key, entry] of resultCache) if (entry.expires <= now) resultCache.delete(key);
  const cached = resultCache.get(cacheKey);
  if (cached) return Response.json({ items: displayItems(cached.items, language) }, { headers: { 'Cache-Control': 'private, max-age=60' } });

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
  const nearToken = localizeSearchText(near).replace(/\s+/g, '').replace(/(특별자치)?도$/,'').toLocaleLowerCase('ko-KR');
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
  return Response.json({ items: displayItems(items, language) }, { headers: { 'Cache-Control': 'private, max-age=60' } });
}
