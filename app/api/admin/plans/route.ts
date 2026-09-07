import { checkRateLimit, getDb, isAdminRequest, purgeExpiredPlans, rateLimitResponse, readJsonObject } from '@/lib/plan-store';

function validIds(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) return null;
  const ids = [...new Set(value.filter(item => typeof item === 'string').map(item => item.trim()).filter(item => /^plan_[a-z0-9_]{4,100}$/i.test(item)))];
  return ids.length === value.length ? ids : null;
}

export async function DELETE(request: Request) {
  const quota = await checkRateLimit(request, 'admin-action', 20);
  if (!quota.allowed) return rateLimitResponse(quota.retryAfter);
  if (!(await isAdminRequest(request))) return Response.json({ message: '관리자 권한이 필요합니다.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  const db = getDb();
  if (!db) return Response.json({ message: '계획 저장소가 아직 연결되지 않았습니다.' }, { status: 503 });
  await purgeExpiredPlans(db);
  const parsed = await readJsonObject(request);
  if (!parsed.body) return Response.json({ message: parsed.message }, { status: parsed.status });
  const action = parsed.body.action;
  if (action === 'empty-trash') {
    const result = await db.prepare('DELETE FROM plans WHERE deleted_at IS NOT NULL').run();
    return Response.json({ changed: Number(result?.meta?.changes || 0), message: '휴지통을 비웠습니다.' }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const ids = validIds(parsed.body.ids);
  if (!ids) return Response.json({ message: '삭제할 계획을 1개 이상 선택해주세요.' }, { status: 400 });
  const placeholders = ids.map(() => '?').join(',');
  if (action === 'trash') {
    const now = new Date().toISOString();
    const result = await db.prepare(`UPDATE plans SET deleted_at=?,updated_at=?,version=version+1 WHERE deleted_at IS NULL AND id IN (${placeholders})`).bind(now, now, ...ids).run();
    return Response.json({ changed: Number(result?.meta?.changes || 0), message: '선택한 계획을 휴지통으로 옮겼습니다.' }, { headers: { 'Cache-Control': 'no-store' } });
  }
  if (action === 'purge') {
    const result = await db.prepare(`DELETE FROM plans WHERE deleted_at IS NOT NULL AND id IN (${placeholders})`).bind(...ids).run();
    return Response.json({ changed: Number(result?.meta?.changes || 0), message: '선택한 계획을 영구 삭제했습니다.' }, { headers: { 'Cache-Control': 'no-store' } });
  }
  return Response.json({ message: '지원하지 않는 관리자 작업입니다.' }, { status: 400 });
}
