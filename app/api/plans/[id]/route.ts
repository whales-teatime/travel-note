import {
  bodyTooLarge, checkRateLimit, fullPlan, getDb, passwordHash, publicPlan,
  purgeExpiredPlans, randomHex, rateLimitResponse, sanitizePlan, sha256,
} from '@/lib/plan-store';

type Context = { params: { id: string } | Promise<{ id: string }> };

const PLAN_COLUMNS = 'id,title,destination,start_date,end_date,people,edit_policy,stops_json,password_hash,password_salt,password_algo,edit_password_hash,edit_password_salt,edit_password_algo,edit_token_hash,created_at,updated_at,deleted_at,version,(password_hash IS NOT NULL) AS password_protected,(edit_password_hash IS NOT NULL) AS edit_password_protected';
const PLAN_INSERT = 'INSERT INTO plans (id,title,destination,start_date,end_date,people,edit_policy,stops_json,password_hash,password_salt,password_algo,edit_password_hash,edit_password_salt,edit_password_algo,edit_token_hash,created_at,updated_at,deleted_at,version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)';

async function rowFor(id: string) {
  const db = getDb();
  if (!db) return { db: null, row: null };
  await purgeExpiredPlans(db);
  const result = await db.prepare(`SELECT ${PLAN_COLUMNS} FROM plans WHERE id = ? LIMIT 1`).bind(id).first();
  return { db, row: result as Record<string, unknown> | null };
}

async function verifyPassword(value: string | undefined, row: Record<string, unknown>, hashKey: 'password_hash' | 'edit_password_hash', saltKey: 'password_salt' | 'edit_password_salt', algoKey: 'password_algo' | 'edit_password_algo') {
  const hash = String(row[hashKey] || ''), salt = String(row[saltKey] || ''), algorithm = row[algoKey] === 'pbkdf2' ? 'pbkdf2' : 'sha256';
  return Boolean(value && hash && salt && await passwordHash(value, salt, algorithm) === hash);
}

async function hasAccess(request: Request, row: Record<string, unknown>, password?: string, requireEditToken = false, editPassword?: string) {
  const policy = row.edit_policy === 'all' ? 'all' : row.edit_policy === 'password' ? 'password' : 'owner';
  const token = request.headers.get('x-plan-edit-token') || '';
  if (token && row.edit_token_hash && await sha256(token) === String(row.edit_token_hash) && (!requireEditToken || policy !== 'password')) return true;
  if (!requireEditToken) return !row.password_hash || await verifyPassword(password, row, 'password_hash', 'password_salt', 'password_algo');
  if (policy === 'owner') return false;
  if (policy === 'all') return !row.password_hash || await verifyPassword(password, row, 'password_hash', 'password_salt', 'password_algo');
  return verifyPassword(editPassword, row, 'edit_password_hash', 'edit_password_salt', 'edit_password_algo');
}

function accessResponse(row: Record<string, unknown>) {
  return Response.json({ requiresPassword: true, plan: publicPlan(row) }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
}

function clientIp(request: Request) {
  const forwarded = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Real-IP') || '';
  const value = forwarded.split(',')[0].trim();
  return /^[0-9a-f:.]{2,64}$/i.test(value) ? value : '기기';
}

async function getId(context: Context) { return (await context.params).id; }

async function parseBody(request: Request) {
  if (bodyTooLarge(request)) return { error: Response.json({ message: '계획 데이터가 너무 큽니다.' }, { status: 413 }) };
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { error: Response.json({ message: '잘못된 요청입니다.' }, { status: 400 }) };
    return { body: parsed as Record<string, unknown> };
  } catch {
    return { error: Response.json({ message: '잘못된 요청입니다.' }, { status: 400 }) };
  }
}

function authFields(body: Record<string, unknown>) {
  return {
    password: typeof body.passwordAuth === 'string' ? body.passwordAuth.trim().slice(0, 100) : typeof body.password === 'string' ? body.password.trim().slice(0, 100) : undefined,
    newPassword: typeof body.password === 'string' ? body.password.trim().slice(0, 100) : undefined,
    editPassword: typeof body.editPasswordAuth === 'string' ? body.editPasswordAuth.trim().slice(0, 100) : typeof body.editPassword === 'string' ? body.editPassword.trim().slice(0, 100) : undefined,
    newEditPassword: typeof body.editPassword === 'string' ? body.editPassword.trim().slice(0, 100) : undefined,
  };
}

async function insertCopy(db: NonNullable<ReturnType<typeof getDb>>, row: Record<string, unknown>, values: { id: string; title: string; destination: string; startDate: string; endDate: string; people: number; editPolicy: string; stops: string; passwordHash: string | null; passwordSalt: string | null; passwordAlgo: string; editHash: string | null; editSalt: string | null; editAlgo: string; tokenHash: string; now: string }) {
  await db.prepare(PLAN_INSERT).bind(values.id, values.title, values.destination, values.startDate, values.endDate, values.people, values.editPolicy, values.stops, values.passwordHash, values.passwordSalt, values.passwordAlgo, values.editHash, values.editSalt, values.editAlgo, values.tokenHash, values.now, values.now, null, 1).run();
  return { ...row, id: values.id, title: values.title, destination: values.destination, start_date: values.startDate, end_date: values.endDate, people: values.people, edit_policy: values.editPolicy, stops_json: values.stops, password_hash: values.passwordHash, password_salt: values.passwordSalt, password_algo: values.passwordAlgo, edit_password_hash: values.editHash, edit_password_salt: values.editSalt, edit_password_algo: values.editAlgo, edit_token_hash: values.tokenHash, created_at: values.now, updated_at: values.now, deleted_at: null, version: 1, password_protected: Number(Boolean(values.passwordHash)), edit_password_protected: Number(Boolean(values.editHash)) };
}

export async function GET(request: Request, context: Context) {
  const quota = checkRateLimit(request, 'plan-read', 120);
  if (!quota.allowed) return rateLimitResponse(quota.retryAfter);
  const { db, row } = await rowFor(await getId(context));
  if (!db) return Response.json({ message: '계획 저장소가 아직 연결되지 않았습니다.' }, { status: 503 });
  if (!row) return Response.json({ message: '계획을 찾을 수 없습니다.' }, { status: 404 });
  if (row.deleted_at) return Response.json({ message: '휴지통에 있는 계획입니다.' }, { status: 410 });
  if (!(await hasAccess(request, row))) return accessResponse(row);
  return Response.json({ plan: fullPlan(row), canEdit: await hasAccess(request, row, undefined, true) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request, context: Context) {
  const quota = checkRateLimit(request, 'plan-action', 30);
  if (!quota.allowed) return rateLimitResponse(quota.retryAfter);
  const { db, row } = await rowFor(await getId(context));
  if (!db) return Response.json({ message: '계획 저장소가 아직 연결되지 않았습니다.' }, { status: 503 });
  if (!row) return Response.json({ message: '계획을 찾을 수 없습니다.' }, { status: 404 });
  const parsed = await parseBody(request);
  if (parsed.error) return parsed.error;
  const body = parsed.body!;
  const { password, editPassword } = authFields(body);
  if (!(await hasAccess(request, row, password))) return accessResponse(row);
  if (body.action === 'restore') {
    if (!row.deleted_at) return Response.json({ message: '휴지통에 없는 계획입니다.' }, { status: 400 });
    if (!(await hasAccess(request, row, password, true, editPassword))) return Response.json({ message: '복원 권한이 없습니다. 편집 비밀번호 또는 작성자 토큰을 확인해주세요.' }, { status: 403 });
    const now = new Date().toISOString(), nextVersion = Math.max(1, Number(row.version) || 1) + 1;
    await db.prepare('UPDATE plans SET deleted_at=NULL,updated_at=?,version=? WHERE id=?').bind(now, nextVersion, String(row.id)).run();
    return Response.json({ plan: fullPlan({ ...row, deleted_at: null, updated_at: now, version: nextVersion }), message: '계획을 복원했습니다.' });
  }
  if (row.deleted_at) return Response.json({ message: '휴지통에 있는 계획입니다.' }, { status: 410 });
  if (body.action === 'edit-auth') {
    if (!(await hasAccess(request, row, password, true, editPassword))) return Response.json({ message: '편집 비밀번호가 올바르지 않습니다.' }, { status: 403 });
    return Response.json({ plan: fullPlan(row), canEdit: true });
  }
  if (body.action === 'duplicate') {
    const id = `plan_${Date.now().toString(36)}_${randomHex(5)}`, editToken = randomHex(28), now = new Date().toISOString();
    const copied = await insertCopy(db, row, { id, title: `${String(row.title)} 복제본`.slice(0, 160), destination: String(row.destination), startDate: String(row.start_date), endDate: String(row.end_date), people: Number(row.people) || 1, editPolicy: row.edit_policy === 'all' ? 'all' : row.edit_policy === 'password' ? 'password' : 'owner', stops: String(row.stops_json || '[]'), passwordHash: row.password_hash ? String(row.password_hash) : null, passwordSalt: row.password_salt ? String(row.password_salt) : null, passwordAlgo: row.password_algo === 'pbkdf2' ? 'pbkdf2' : 'sha256', editHash: row.edit_password_hash ? String(row.edit_password_hash) : null, editSalt: row.edit_password_salt ? String(row.edit_password_salt) : null, editAlgo: row.edit_password_algo === 'pbkdf2' ? 'pbkdf2' : 'sha256', tokenHash: await sha256(editToken), now });
    return Response.json({ id, editToken, plan: fullPlan(copied) }, { status: 201 });
  }
  return Response.json({ plan: fullPlan(row), canEdit: await hasAccess(request, row, password, true, editPassword) });
}

export async function PUT(request: Request, context: Context) {
  const quota = checkRateLimit(request, 'plan-write', 30);
  if (!quota.allowed) return rateLimitResponse(quota.retryAfter);
  const { db, row } = await rowFor(await getId(context));
  if (!db) return Response.json({ message: '계획 저장소가 아직 연결되지 않았습니다.' }, { status: 503 });
  if (!row) return Response.json({ message: '계획을 찾을 수 없습니다.' }, { status: 404 });
  if (row.deleted_at) return Response.json({ message: '휴지통에 있는 계획입니다.' }, { status: 410 });
  const parsed = await parseBody(request);
  if (parsed.error) return parsed.error;
  const body = parsed.body!;
  const { password, newPassword, editPassword, newEditPassword } = authFields(body);
  if (!(await hasAccess(request, row, password, true, editPassword))) return Response.json({ message: '편집 권한이 없습니다. 편집 비밀번호 또는 작성자 토큰을 확인해주세요.' }, { status: 403 });
  const plan = sanitizePlan(body);
  if (!plan) return Response.json({ message: '여행 이름, 여행지, 날짜, 장소 정보를 확인해주세요.' }, { status: 400 });
  const baseVersion = Number(body.baseVersion);
  if (!Number.isInteger(baseVersion) || baseVersion < 1) return Response.json({ message: '최신 계획을 다시 불러온 뒤 저장해주세요.' }, { status: 409 });
  const passwordChanged = Object.prototype.hasOwnProperty.call(body, 'password');
  const editPasswordChanged = Object.prototype.hasOwnProperty.call(body, 'editPassword') || plan.editPolicy !== 'password';
  if (plan.editPolicy === 'password' && Object.prototype.hasOwnProperty.call(body, 'editPassword') && !newEditPassword) return Response.json({ message: '편집 비밀번호는 빈칸으로 저장할 수 없습니다.' }, { status: 400 });
  if (plan.editPolicy === 'password' && !String(row.edit_password_hash || '') && !newEditPassword) return Response.json({ message: '편집 비밀번호를 입력해주세요.' }, { status: 400 });
  const salt = passwordChanged && newPassword ? randomHex(16) : null;
  const hash = passwordChanged && newPassword && salt ? await passwordHash(newPassword, salt, 'pbkdf2') : null;
  const editSalt = editPasswordChanged && plan.editPolicy === 'password' && newEditPassword ? randomHex(16) : null;
  const editHash = editPasswordChanged && plan.editPolicy === 'password' && newEditPassword && editSalt ? await passwordHash(newEditPassword, editSalt, 'pbkdf2') : null;
  const now = new Date().toISOString(), nextVersion = Math.max(1, Number(row.version) || 1) + 1;
  const passwordSql = passwordChanged ? ',password_hash=?,password_salt=?,password_algo=?' : '';
  const editPasswordSql = editPasswordChanged ? ',edit_password_hash=?,edit_password_salt=?,edit_password_algo=?' : '';
  const values = [plan.title, plan.destination, plan.startDate, plan.endDate, plan.people, plan.editPolicy, JSON.stringify(plan.stops), ...(passwordChanged ? [hash, salt, newPassword ? 'pbkdf2' : 'sha256'] : []), ...(editPasswordChanged ? [editHash, editSalt, editHash ? 'pbkdf2' : 'sha256'] : []), now, nextVersion, String(row.id), baseVersion];
  const guarded = await db.prepare(`UPDATE plans SET title=?,destination=?,start_date=?,end_date=?,people=?,edit_policy=?,stops_json=?${passwordSql}${editPasswordSql},updated_at=?,version=? WHERE id=? AND version=?`).bind(...values).run();
  if (Number(guarded?.meta?.changes || 0) === 0) {
    const latestResult = await db.prepare(`SELECT ${PLAN_COLUMNS} FROM plans WHERE id = ? LIMIT 1`).bind(String(row.id)).first();
    const latest = latestResult as Record<string, unknown> || row;
    const id = `plan_${Date.now().toString(36)}_${randomHex(5)}`, editToken = randomHex(28);
    const copiedPasswordHash = passwordChanged ? hash : latest.password_hash ? String(latest.password_hash) : null;
    const copiedPasswordSalt = passwordChanged ? salt : latest.password_salt ? String(latest.password_salt) : null;
    const copiedEditHash = editPasswordChanged ? editHash : latest.edit_password_hash ? String(latest.edit_password_hash) : null;
    const copiedEditSalt = editPasswordChanged ? editSalt : latest.edit_password_salt ? String(latest.edit_password_salt) : null;
    const copied = await insertCopy(db, latest, { id, title: `${plan.title} - (${clientIp(request)})`.slice(0, 160), destination: plan.destination, startDate: plan.startDate, endDate: plan.endDate, people: plan.people, editPolicy: plan.editPolicy, stops: JSON.stringify(plan.stops), passwordHash: copiedPasswordHash, passwordSalt: copiedPasswordSalt, passwordAlgo: passwordChanged ? (newPassword ? 'pbkdf2' : 'sha256') : latest.password_algo === 'pbkdf2' ? 'pbkdf2' : 'sha256', editHash: copiedEditHash, editSalt: copiedEditSalt, editAlgo: editPasswordChanged ? (copiedEditHash ? 'pbkdf2' : 'sha256') : latest.edit_password_algo === 'pbkdf2' ? 'pbkdf2' : 'sha256', tokenHash: await sha256(editToken), now });
    return Response.json({ id, editToken, conflict: true, message: '동시에 편집한 내용이라 별도 계획으로 저장했어요.', plan: fullPlan(copied) }, { status: 201 });
  }
  const updated = { ...row, title: plan.title, destination: plan.destination, start_date: plan.startDate, end_date: plan.endDate, people: plan.people, edit_policy: plan.editPolicy, stops_json: JSON.stringify(plan.stops), updated_at: now, version: nextVersion, ...(passwordChanged ? { password_hash: hash, password_salt: salt, password_algo: newPassword ? 'pbkdf2' : 'sha256', password_protected: Number(Boolean(hash)) } : {}), ...(editPasswordChanged ? { edit_password_hash: editHash, edit_password_salt: editSalt, edit_password_algo: editHash ? 'pbkdf2' : 'sha256', edit_password_protected: Number(Boolean(editHash)) } : {}) };
  return Response.json({ plan: fullPlan(updated) });
}

export async function DELETE(request: Request, context: Context) {
  const quota = checkRateLimit(request, 'plan-delete', 20);
  if (!quota.allowed) return rateLimitResponse(quota.retryAfter);
  const { db, row } = await rowFor(await getId(context));
  if (!db) return Response.json({ message: '계획 저장소가 아직 연결되지 않았습니다.' }, { status: 503 });
  if (!row) return Response.json({ message: '계획을 찾을 수 없습니다.' }, { status: 404 });
  if (row.deleted_at) return Response.json({ message: '이미 휴지통에 있는 계획입니다.' }, { status: 410 });
  const parsed = await parseBody(request);
  if (parsed.error) return parsed.error;
  const { password, editPassword } = authFields(parsed.body!);
  if (!(await hasAccess(request, row, password, true, editPassword))) return Response.json({ message: '편집 권한이 없습니다. 편집 비밀번호 또는 작성자 토큰을 확인해주세요.' }, { status: 403 });
  const deletedAt = new Date().toISOString(), nextVersion = Math.max(1, Number(row.version) || 1) + 1;
  await db.prepare('UPDATE plans SET deleted_at=?,updated_at=?,version=? WHERE id=? AND version=?').bind(deletedAt, deletedAt, nextVersion, String(row.id), Number(row.version) || 1).run();
  return Response.json({ deletedAt, message: '계획을 휴지통으로 옮겼습니다.' });
}
