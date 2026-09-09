import { checkRateLimit, getDb, isAdminRequest, randomHex, rateLimitResponse, readJsonObject } from '@/lib/plan-store';

function validFeedbackId(value: string) {
  return /^feedback_[a-z0-9_]+$/i.test(value) && value.length <= 100;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const quota = await checkRateLimit(request, 'admin-action', 20);
  if (!quota.allowed) return rateLimitResponse(quota.retryAfter);
  if (!(await isAdminRequest(request))) return Response.json({ message: '관리자 권한이 필요합니다.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });

  const db = getDb();
  if (!db) return Response.json({ message: '피드백 저장소가 아직 연결되지 않았습니다.' }, { status: 503 });

  const { id } = await params;
  if (!validFeedbackId(id)) return Response.json({ message: '피드백을 찾을 수 없습니다.' }, { status: 404 });

  const parsed = await readJsonObject(request);
  if (!parsed.body) return Response.json({ message: parsed.message }, { status: parsed.status });
  const message = typeof parsed.body.message === 'string' ? parsed.body.message.trim() : '';
  if (!message) return Response.json({ message: '댓글 내용을 입력해주세요.' }, { status: 400 });
  if (message.length > 500 || new TextEncoder().encode(message).byteLength > 1_500) return Response.json({ message: '댓글은 500자 이하로 입력해주세요.' }, { status: 400 });

  const feedback = await db.prepare('SELECT id FROM feedback WHERE id = ?').bind(id).first<{ id: string }>();
  if (!feedback) return Response.json({ message: '피드백을 찾을 수 없습니다.' }, { status: 404 });

  const commentId = `comment_${Date.now().toString(36)}_${randomHex(5)}`;
  const createdAt = new Date().toISOString();
  await db.prepare('INSERT INTO feedback_comments (id,feedback_id,message,created_at) VALUES (?,?,?,?)').bind(commentId, id, message, createdAt).run();
  return Response.json({ comment: { id: commentId, message, createdAt } }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}
