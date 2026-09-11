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
  try {
    const [last24h, last7d, unique24h, recent, popular] = await Promise.all([
      db.prepare('SELECT COUNT(*) AS total FROM access_logs WHERE created_at >= ?').bind(since24h).first<{ total: unknown }>(),
      db.prepare('SELECT COUNT(*) AS total FROM access_logs WHERE created_at >= ?').bind(since7d).first<{ total: unknown }>(),
      db.prepare('SELECT COUNT(DISTINCT visitor_hash) AS total FROM access_logs WHERE created_at >= ? AND visitor_hash IS NOT NULL').bind(since24h).first<{ total: unknown }>(),
      db.prepare('SELECT id,created_at,path,status,country,city,region,visitor_hash FROM access_logs ORDER BY created_at DESC,id DESC LIMIT 100').all<AccessLogRow>(),
      db.prepare('SELECT path,COUNT(*) AS total FROM access_logs WHERE created_at >= ? GROUP BY path ORDER BY total DESC,path ASC LIMIT 8').bind(since7d).all<{ path: unknown; total: unknown }>(),
    ]);
    return Response.json({
      summary: { last24h: numberValue(last24h?.total), last7d: numberValue(last7d?.total), unique24h: numberValue(unique24h?.total) },
      items: (recent.results || []).map(row => ({ id: textValue(row.id), createdAt: textValue(row.created_at), path: textValue(row.path, '/'), status: numberValue(row.status), country: textValue(row.country), city: textValue(row.city), region: textValue(row.region), visitor: textValue(row.visitor_hash).slice(0, 8) })),
      popular: (popular.results || []).map(row => ({ path: textValue(row.path, '/'), total: numberValue(row.total) })),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ message: '접속 기록을 불러오지 못했어요.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
