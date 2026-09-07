import { checkRateLimit, getDb, randomHex, rateLimitResponse, readJsonObject } from '@/lib/plan-store';

const CATEGORIES = new Set(['버그', '개선', '제안', '기타']);

export async function GET(request: Request) {
  const quota = await checkRateLimit(request, 'plans-read', 120);
  if (!quota.allowed) return rateLimitResponse(quota.retryAfter);
  const db = getDb();
  if (!db) return Response.json({ message: '피드백 저장소가 아직 연결되지 않았습니다.' }, { status: 503 });
  const params = new URL(request.url).searchParams;
  const limit = Math.min(50, Math.max(1, Number.parseInt(params.get('limit') || '30', 10) || 30));
  const offset = Math.min(10_000, Math.max(0, Number.parseInt(params.get('offset') || '0', 10) || 0));
  const result = await db.prepare('SELECT id,category,message,likes,created_at FROM feedback ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?').bind(limit + 1, offset).all();
  const rows = result.results || [];
  return Response.json({
    items: rows.slice(0, limit).map(row => ({
      id: String(row.id), category: String(row.category), message: String(row.message), likes: Number(row.likes) || 0, createdAt: String(row.created_at),
    })),
    nextOffset: rows.length > limit ? offset + limit : null,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const quota = await checkRateLimit(request, 'feedback', 6);
  if (!quota.allowed) return rateLimitResponse(quota.retryAfter);
  const db = getDb();
  if (!db) return Response.json({ message: '피드백 저장소가 아직 연결되지 않았습니다.' }, { status: 503 });
  const parsed = await readJsonObject(request);
  if (!parsed.body) return Response.json({ message: parsed.message }, { status: parsed.status });
  const category = typeof parsed.body.category === 'string' ? parsed.body.category.trim() : '';
  const message = typeof parsed.body.message === 'string' ? parsed.body.message.trim() : '';
  if (!CATEGORIES.has(category) || !message) return Response.json({ message: '내용을 입력해주세요.' }, { status: 400 });
  if (message.length > 1000 || new TextEncoder().encode(message).byteLength > 3_000) return Response.json({ message: '피드백은 1,000자 이하로 입력해주세요.' }, { status: 400 });
  const id = `feedback_${Date.now().toString(36)}_${randomHex(5)}`;
  const createdAt = new Date().toISOString();
  await db.prepare('INSERT INTO feedback (id,category,message,likes,created_at) VALUES (?,?,?,?,?)').bind(id, category, message, 0, createdAt).run();
  return Response.json({ item: { id, category, message, likes: 0, createdAt } }, { status: 201 });
}
