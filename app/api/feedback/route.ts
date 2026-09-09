import { checkRateLimit, getDb, randomHex, rateLimitResponse, readJsonObject } from '@/lib/plan-store';

const CATEGORIES = new Set(['버그', '개선', '제안', '기타']);
const PHOTO_DATA_PATTERN = /^data:image\/(?:webp|jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/;
const MAX_PHOTO_DATA_LENGTH = 320_000;

type FeedbackCommentRow = { id: unknown; feedback_id: unknown; message: unknown; created_at: unknown };

function feedbackId(value: unknown) {
  return typeof value === 'string' && /^feedback_[a-z0-9_]+$/i.test(value) && value.length <= 100 ? value : '';
}

function photoDataValue(value: unknown) {
  if (typeof value !== 'string' || !value) return null;
  return value.length <= MAX_PHOTO_DATA_LENGTH && PHOTO_DATA_PATTERN.test(value) ? value : null;
}

export async function GET(request: Request) {
  const quota = await checkRateLimit(request, 'plans-read', 120);
  if (!quota.allowed) return rateLimitResponse(quota.retryAfter);
  const db = getDb();
  if (!db) return Response.json({ message: '피드백 저장소가 아직 연결되지 않았습니다.' }, { status: 503 });
  const params = new URL(request.url).searchParams;
  const limit = Math.min(50, Math.max(1, Number.parseInt(params.get('limit') || '30', 10) || 30));
  const offset = Math.min(10_000, Math.max(0, Number.parseInt(params.get('offset') || '0', 10) || 0));
  const result = await db.prepare('SELECT id,category,message,likes,created_at,photo_data FROM feedback ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?').bind(limit + 1, offset).all();
  const rows = result.results || [];
  const visibleRows = rows.slice(0, limit);
  const ids = visibleRows.map(row => feedbackId(row.id)).filter(Boolean);
  const commentsByFeedback = new Map<string, Array<{ id: string; message: string; createdAt: string }>>();
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(',');
    const commentsResult = await db.prepare(`SELECT id,feedback_id,message,created_at FROM feedback_comments WHERE feedback_id IN (${placeholders}) ORDER BY created_at ASC,id ASC`).bind(...ids).all<FeedbackCommentRow>();
    for (const row of commentsResult.results || []) {
      const id = feedbackId(row.feedback_id);
      if (!id) continue;
      const comments = commentsByFeedback.get(id) || [];
      comments.push({ id: String(row.id), message: String(row.message), createdAt: String(row.created_at) });
      commentsByFeedback.set(id, comments);
    }
  }
  return Response.json({
    items: visibleRows.map(row => ({
      id: String(row.id), category: String(row.category), message: String(row.message), likes: Number(row.likes) || 0, createdAt: String(row.created_at), photoData: typeof row.photo_data === 'string' ? row.photo_data : null, comments: commentsByFeedback.get(feedbackId(row.id)) || [],
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
  const rawPhotoData = typeof parsed.body.photoData === 'string' ? parsed.body.photoData.trim() : '';
  if (!CATEGORIES.has(category) || !message) return Response.json({ message: '내용을 입력해주세요.' }, { status: 400 });
  if (message.length > 1000 || new TextEncoder().encode(message).byteLength > 3_000) return Response.json({ message: '피드백은 1,000자 이하로 입력해주세요.' }, { status: 400 });
  if (rawPhotoData && (!photoDataValue(rawPhotoData) || new TextEncoder().encode(rawPhotoData).byteLength > MAX_PHOTO_DATA_LENGTH)) return Response.json({ message: '첨부 사진을 조금 더 작은 파일로 올려주세요.' }, { status: 400 });
  const id = `feedback_${Date.now().toString(36)}_${randomHex(5)}`;
  const createdAt = new Date().toISOString();
  await db.prepare('INSERT INTO feedback (id,category,message,likes,created_at,photo_data) VALUES (?,?,?,?,?,?)').bind(id, category, message, 0, createdAt, rawPhotoData || null).run();
  return Response.json({ item: { id, category, message, likes: 0, createdAt, photoData: rawPhotoData || null, comments: [] } }, { status: 201 });
}
