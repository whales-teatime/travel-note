import { fullPlan, getDb, passwordHash, publicPlan, purgeExpiredPlans, randomHex, sanitizePlan, sha256 } from '@/lib/plan-store';

type Context = { params: { id: string } | Promise<{ id: string }> };

async function rowFor(id: string) {
  const db = getDb();
  if (!db) return { db: null, row: null };
  await purgeExpiredPlans(db);
  const result = await db.prepare('SELECT id,title,destination,start_date,end_date,people,stops_json,password_hash,password_salt,edit_token_hash,created_at,updated_at,deleted_at,(password_hash IS NOT NULL) AS password_protected FROM plans WHERE id = ? LIMIT 1').bind(id).first();
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
  if (row.deleted_at) return Response.json({ message: '휴지통에 있는 계획입니다.' }, { status: 410 });
  if (!(await hasAccess(request, row))) return accessResponse(row);
  return Response.json({ plan: fullPlan(row) });
}

export async function POST(request: Request, context: Context) {
  const { db, row } = await rowFor(await getId(context));
  if (!db) return Response.json({ message: '계획 저장소가 아직 연결되지 않았습니다.' }, { status: 503 });
  if (!row) return Response.json({ message: '계획을 찾을 수 없습니다.' }, { status: 404 });
  let body: Record<string, unknown> = {};
  try { body = await request.json() as Record<string, unknown>; } catch {}
  if (row.deleted_at) return Response.json({ message: '휴지통에 있는 계획입니다.' }, { status: 410 });
  const password = typeof body.password === 'string' ? body.password : undefined;
  if (!(await hasAccess(request, row, password))) return accessResponse(row);
  if (body.action === 'duplicate') {
    const id = `plan_${Date.now().toString(36)}_${randomHex(5)}`;
    const editToken = randomHex(28);
    const editTokenHash = await sha256(editToken);
    const now = new Date().toISOString();
    const title = `${String(row.title)} 복제본`.slice(0, 160);
    await db.prepare('INSERT INTO plans (id,title,destination,start_date,end_date,people,stops_json,password_hash,password_salt,edit_token_hash,created_at,updated_at,deleted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id, title, row.destination, row.start_date, row.end_date, row.people, row.stops_json, row.password_hash || null, row.password_salt || null, editTokenHash, now, now, null).run();
    const copied = { ...row, id, title, edit_token_hash: editTokenHash, created_at: now, updated_at: now, deleted_at: null };
    return Response.json({ id, editToken, plan: fullPlan(copied) }, { status: 201 });
  }
  return Response.json({ plan: fullPlan(row) });
}

export async function PUT(request: Request, context: Context) {
  const { db, row } = await rowFor(await getId(context));
  if (!db) return Response.json({ message: '계획 저장소가 아직 연결되지 않았습니다.' }, { status: 503 });
  if (!row) return Response.json({ message: '계획을 찾을 수 없습니다.' }, { status: 404 });
  if (row.deleted_at) return Response.json({ message: '휴지통에 있는 계획입니다.' }, { status: 410 });
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return Response.json({ message: '잘못된 요청입니다.' }, { status: 400 }); }
  const password = typeof body.password === 'string' ? body.password.trim().slice(0, 100) : undefined;
  if (!(await hasAccess(request, row, password, true))) return Response.json({ message: '계획을 만든 사람만 수정할 수 있습니다.' }, { status: 403 });
  const plan = sanitizePlan(body);
  if (!plan) return Response.json({ message: '여행 이름, 여행지, 날짜를 입력해주세요.' }, { status: 400 });
  const passwordChanged = Object.prototype.hasOwnProperty.call(body, 'password');
  const salt = passwordChanged && password ? randomHex(16) : null;
  const hash = passwordChanged && password && salt ? await passwordHash(password, salt) : null;
  const now = new Date().toISOString();
  const passwordSql = passwordChanged ? ',password_hash=?,password_salt=?' : '';
  const values = passwordChanged
    ? [plan.title, plan.destination, plan.startDate, plan.endDate, plan.people, JSON.stringify(plan.stops), hash, salt, now, String(row.id)]
    : [plan.title, plan.destination, plan.startDate, plan.endDate, plan.people, JSON.stringify(plan.stops), now, String(row.id)];
  await db.prepare(`UPDATE plans SET title=?,destination=?,start_date=?,end_date=?,people=?,stops_json=?${passwordSql},updated_at=? WHERE id=?`).bind(...values).run();
  const updated = { ...row, title: plan.title, destination: plan.destination, start_date: plan.startDate, end_date: plan.endDate, people: plan.people, stops_json: JSON.stringify(plan.stops), updated_at: now, ...(passwordChanged ? { password_hash: hash, password_salt: salt } : {}) };
  return Response.json({ plan: fullPlan(updated) });
}

export async function DELETE(request: Request, context: Context) {
  const { db, row } = await rowFor(await getId(context));
  if (!db) return Response.json({ message: '계획 저장소가 아직 연결되지 않았습니다.' }, { status: 503 });
  if (!row) return Response.json({ message: '계획을 찾을 수 없습니다.' }, { status: 404 });
  if (row.deleted_at) return Response.json({ message: '이미 휴지통에 있는 계획입니다.' }, { status: 410 });
  let body: Record<string, unknown> = {};
  try { body = await request.json() as Record<string, unknown>; } catch {}
  const password = typeof body.password === 'string' ? body.password.trim().slice(0, 100) : undefined;
  if (!(await hasAccess(request, row, password, true))) return Response.json({ message: '계획을 만든 사람만 삭제할 수 있습니다.' }, { status: 403 });
  const deletedAt = new Date().toISOString();
  await db.prepare('UPDATE plans SET deleted_at=?,updated_at=? WHERE id=?').bind(deletedAt, deletedAt, String(row.id)).run();
  return Response.json({ deletedAt, message: '계획을 휴지통으로 옮겼습니다.' });
}
