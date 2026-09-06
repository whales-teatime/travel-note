import { fullPlan, getDb, passwordHash, publicPlan, sanitizePlan, sha256 } from '@/lib/plan-store';

type Context = { params: { id: string } | Promise<{ id: string }> };

async function rowFor(id: string) {
  const db = getDb();
  if (!db) return { db: null, row: null };
  const result = await db.prepare('SELECT id,title,destination,start_date,end_date,people,stops_json,password_hash,password_salt,edit_token_hash,created_at,updated_at,(password_hash IS NOT NULL) AS password_protected FROM plans WHERE id = ? LIMIT 1').bind(id).first();
  return { db, row: result as Record<string, unknown> | null };
}

async function hasAccess(request: Request, row: Record<string, unknown>, password?: string, requireEditToken = false) {
  const token = request.headers.get('x-plan-edit-token') || '';
  if (token && row.edit_token_hash && await sha256(token) === String(row.edit_token_hash)) return true;
  const storedHash = String(row.password_hash || '');
  const salt = String(row.password_salt || '');
  if (!requireEditToken && !storedHash) return true;
  return Boolean(password && storedHash && salt && await passwordHash(password, salt) === storedHash);
}

function accessResponse(row: Record<string, unknown>) {
  return Response.json({ requiresPassword: true, plan: publicPlan(row) }, { status: 401 });
}

async function getId(context: Context) { return (await context.params).id; }

export async function GET(request: Request, context: Context) {
  const { db, row } = await rowFor(await getId(context));
  if (!db) return Response.json({ message: '계획 저장소가 아직 연결되지 않았습니다.' }, { status: 503 });
  if (!row) return Response.json({ message: '계획을 찾을 수 없습니다.' }, { status: 404 });
  if (!(await hasAccess(request, row))) return accessResponse(row);
  return Response.json({ plan: fullPlan(row) });
}

export async function POST(request: Request, context: Context) {
  const { db, row } = await rowFor(await getId(context));
  if (!db) return Response.json({ message: '계획 저장소가 아직 연결되지 않았습니다.' }, { status: 503 });
  if (!row) return Response.json({ message: '계획을 찾을 수 없습니다.' }, { status: 404 });
  let body: Record<string, unknown> = {};
  try { body = await request.json() as Record<string, unknown>; } catch {}
  if (!(await hasAccess(request, row, typeof body.password === 'string' ? body.password : undefined))) return accessResponse(row);
  return Response.json({ plan: fullPlan(row) });
}

export async function PUT(request: Request, context: Context) {
  const { db, row } = await rowFor(await getId(context));
  if (!db) return Response.json({ message: '계획 저장소가 아직 연결되지 않았습니다.' }, { status: 503 });
  if (!row) return Response.json({ message: '계획을 찾을 수 없습니다.' }, { status: 404 });
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return Response.json({ message: '잘못된 요청입니다.' }, { status: 400 }); }
  const password = typeof body.password === 'string' ? body.password : undefined;
  if (!(await hasAccess(request, row, password, true))) return Response.json({ message: '계획을 만든 사람만 수정할 수 있습니다.' }, { status: 403 });
  const plan = sanitizePlan(body);
  if (!plan) return Response.json({ message: '여행 이름, 여행지, 날짜를 입력해주세요.' }, { status: 400 });
  const now = new Date().toISOString();
  await db.prepare('UPDATE plans SET title=?,destination=?,start_date=?,end_date=?,people=?,stops_json=?,updated_at=? WHERE id=?').bind(plan.title, plan.destination, plan.startDate, plan.endDate, plan.people, JSON.stringify(plan.stops), now, String(row.id)).run();
  const updated = { ...row, title: plan.title, destination: plan.destination, start_date: plan.startDate, end_date: plan.endDate, people: plan.people, stops_json: JSON.stringify(plan.stops), updated_at: now };
  return Response.json({ plan: fullPlan(updated) });
}
