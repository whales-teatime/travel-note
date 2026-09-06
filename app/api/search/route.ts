export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q')?.trim();
  if (!query) return Response.json({ message: '검색어를 입력해주세요.' }, { status: 400 });

  const clientId = process.env.NAVER_SEARCH_CLIENT_ID;
  const clientSecret = process.env.NAVER_SEARCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return Response.json({ message: '장소 검색 API가 아직 연결되지 않았습니다. 서버용 검색 API 키를 설정해주세요.' }, { status: 503 });
  }

  const response = await fetch(`https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=5&sort=random`, {
    headers: { 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': clientSecret },
  });
  if (!response.ok) return Response.json({ message: '네이버 장소 검색 중 오류가 발생했습니다.' }, { status: response.status });
  const data = (await response.json()) as { items?: unknown[] };
  return Response.json({ items: data.items ?? [] });
}
