import {
  checkRateLimit,
  clearAdminSessionCookie,
  createAdminSessionCookie,
  isAdminPassword,
  isAdminRequest,
  rateLimitResponse,
  readJsonObject,
} from '@/lib/plan-store';

function sessionResponse(adminAuthenticated: boolean, cookie?: string) {
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  if (cookie) headers.append('Set-Cookie', cookie);
  return Response.json({ adminAuthenticated }, { headers });
}

export async function GET(request: Request) {
  return sessionResponse(await isAdminRequest(request));
}

export async function POST(request: Request) {
  const quota = await checkRateLimit(request, 'admin-auth', 5);
  if (!quota.allowed) return rateLimitResponse(quota.retryAfter);
  const parsed = await readJsonObject(request);
  if (!parsed.body) return Response.json({ message: parsed.message }, { status: parsed.status });
  const password = typeof parsed.body.password === 'string' ? parsed.body.password.trim().slice(0, 100) : '';
  if (!(await isAdminPassword(password))) return Response.json({ message: '관리자 비밀번호가 올바르지 않습니다.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  return sessionResponse(true, await createAdminSessionCookie());
}

export async function DELETE() {
  return sessionResponse(false, clearAdminSessionCookie());
}
