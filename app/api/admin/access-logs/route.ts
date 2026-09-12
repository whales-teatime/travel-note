import { checkRateLimit, getDb, isAdminRequest, rateLimitResponse } from '@/lib/plan-store';

type AccessLogRow = { id: unknown; created_at: unknown; path: unknown; status: unknown; country: unknown; city: unknown; region: unknown; visitor_hash: unknown };

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function textValue(value: unknown, fallback = '') {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : fallback;
}

export async function GET(request: Request) {
  const quota = await checkRateLimit(request, 'admin-action', 20);
  if (!quota.allowed) return rateLimitResponse(quota.retryAfter);
  if (!(await isAdminRequest(request))) return Response.json({ message: '관리자 권한이 필요합니다.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  const db = getDb();
  if (!db) return Response.json({ message: '접속 기록 저장소가 아직 연결되지 않았습니다.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });

  const now = Date.now();
  const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const since30d = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  try {
    const [visitors24h, visitors7d, visitors30d, recent, popular] = await Promise.all([
      db.prepare('SELECT COUNT(DISTINCT visitor_hash) AS total FROM access_logs WHERE created_at >= ? AND visitor_hash IS NOT NULL').bind(since24h).first<{ total: unknown }>(),
      db.prepare('SELECT COUNT(DISTINCT visitor_hash) AS total FROM access_logs WHERE created_at >= ? AND visitor_hash IS NOT NULL').bind(since7d).first<{ total: unknown }>(),
      db.prepare('SELECT COUNT(DISTINCT visitor_hash) AS total FROM access_logs WHERE created_at >= ? AND visitor_hash IS NOT NULL').bind(since30d).first<{ total: unknown }>(),
      db.prepare('SELECT id,created_at,path,status,country,city,region,visitor_hash FROM access_logs ORDER BY created_at DESC,id DESC LIMIT 500').all<AccessLogRow>(),
      db.prepare('SELECT path,COUNT(DISTINCT visitor_hash) AS total FROM access_logs WHERE created_at >= ? AND visitor_hash IS NOT NULL GROUP BY path ORDER BY total DESC,path ASC LIMIT 8').bind(since7d).all<{ path: unknown; total: unknown }>(),
    ]);
    const seenVisitors = new Set<string>();
    const items = [];
    for (const row of recent.results || []) {
      const visitorHash = textValue(row.visitor_hash);
      if (visitorHash && seenVisitors.has(visitorHash)) continue;
      if (visitorHash) seenVisitors.add(visitorHash);
      items.push({ id: textValue(row.id), createdAt: textValue(row.created_at), path: textValue(row.path, '/'), status: numberValue(row.status), country: textValue(row.country), city: textValue(row.city), region: textValue(row.region), visitor: visitorHash.slice(0, 8) });
      if (items.length >= 100) break;
    }
    return Response.json({
      summary: { visitors24h: numberValue(visitors24h?.total), visitors7d: numberValue(visitors7d?.total), visitors30d: numberValue(visitors30d?.total) },
      items,
      popular: (popular.results || []).map(row => ({ path: textValue(row.path, '/'), total: numberValue(row.total) })),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ message: '접속 기록을 불러오지 못했어요.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
