import { checkRateLimit, getDb, isAdminRequest, rateLimitResponse } from '@/lib/plan-store';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const quota = await checkRateLimit(request, 'feedback', 10);
  if (!quota.allowed) return rateLimitResponse(quota.retryAfter);
  if (!(await isAdminRequest(request))) return Response.json({ message: '관리자 권한이 필요합니다.' }, { status: 403 });

  const db = getDb();
  if (!db) return Response.json({ message: '피드백 저장소가 아직 연결되지 않았습니다.' }, { status: 503 });

  const { id } = await params;
  if (!/^feedback_[a-z0-9_]+$/i.test(id) || id.length > 100) return Response.json({ message: '피드백을 찾을 수 없습니다.' }, { status: 404 });

  await db.prepare('DELETE FROM feedback_comments WHERE feedback_id = ?').bind(id).run();
  const result = await db.prepare('DELETE FROM feedback WHERE id = ?').bind(id).run();
  if (!result.meta?.changes) return Response.json({ message: '피드백을 찾을 수 없습니다.' }, { status: 404 });
  return Response.json({ deleted: true }, { headers: { 'Cache-Control': 'no-store' } });
}
