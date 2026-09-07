import { checkRateLimit, getDb, rateLimitResponse } from '@/lib/plan-store';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const quota = await checkRateLimit(request, 'feedback', 10);
  if (!quota.allowed) return rateLimitResponse(quota.retryAfter);
  const db = getDb();
  if (!db) return Response.json({ message: '피드백 저장소가 아직 연결되지 않았습니다.' }, { status: 503 });
  const { id } = await params;
  if (!/^feedback_[a-z0-9_]+$/i.test(id) || id.length > 100) return Response.json({ message: '피드백을 찾을 수 없습니다.' }, { status: 404 });
  const result = await db.prepare('UPDATE feedback SET likes = likes + 1 WHERE id = ?').bind(id).run();
  if (!result.meta?.changes) return Response.json({ message: '피드백을 찾을 수 없습니다.' }, { status: 404 });
  const row = await db.prepare('SELECT likes FROM feedback WHERE id = ?').bind(id).first<{ likes: number }>();
  return Response.json({ likes: Number(row?.likes) || 0 }, { headers: { 'Cache-Control': 'no-store' } });
}
