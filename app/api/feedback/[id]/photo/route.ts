import { checkRateLimit, getDb, rateLimitResponse } from '@/lib/plan-store';

function decodePhoto(value: string) {
  const match = value.match(/^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) return null;
  try {
    const binary = atob(match[2]);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    return { contentType: match[1], bytes };
  } catch {
    return null;
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const quota = await checkRateLimit(request, 'plans-read', 120);
  if (!quota.allowed) return rateLimitResponse(quota.retryAfter);
  const db = getDb();
  if (!db) return Response.json({ message: '피드백 저장소가 아직 연결되지 않았습니다.' }, { status: 503 });
  const { id } = await params;
  if (!/^feedback_[a-z0-9_]+$/i.test(id) || id.length > 100) return Response.json({ message: '피드백을 찾을 수 없습니다.' }, { status: 404 });
  const row = await db.prepare('SELECT photo_data FROM feedback WHERE id = ? LIMIT 1').bind(id).first<{ photo_data?: unknown }>();
  const photo = typeof row?.photo_data === 'string' ? decodePhoto(row.photo_data) : null;
  if (!photo) return new Response(null, { status: 404 });
  return new Response(photo.bytes, {
    headers: {
      'Content-Type': photo.contentType,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
