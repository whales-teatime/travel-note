import { checkRateLimit, getDb, passwordHash, publicPlan, purgeExpiredPlans, randomHex, rateLimitResponse, readJsonObject, sanitizePlan, sha256 } from '@/lib/plan-store';

export async function GET(request: Request) {
  const quota = await checkRateLimit(request, 'plans-read', 120);
  if (!quota.allowed) return rateLimitResponse(quota.retryAfter);
  const db = getDb();
  if (!db) return Response.json({ message: '계획 저장소가 아직 연결되지 않았습니다.' }, { status: 503 });
  await purgeExpiredPlans(db);
  const params = new URL(request.url).searchParams;
  const search = params.get('search')?.trim() || '';
  const trash = params.get('trash') === '1';
  const limit = Math.min(50, Math.max(1, Number.parseInt(params.get('limit') || '30', 10) || 30));
  const offset = Math.min(10_000, Math.max(0, Number.parseInt(params.get('offset') || '0', 10) || 0));
  if (new TextEncoder().encode(search).byteLength > 40) return Response.json({ message: '검색어는 40바이트 이하로 입력해주세요.' }, { status: 400 });
  const pattern = `%${search.replace(/[%_]/g, char => `\\${char}`)}%`;
  const deletedClause = trash ? 'deleted_at IS NOT NULL' : 'deleted_at IS NULL';
  const result = search
    ? await db.prepare(`SELECT id,title,destination,start_date,end_date,people,edit_policy,(password_hash IS NOT NULL) AS password_protected,(edit_password_hash IS NOT NULL) AS edit_password_protected,created_at,updated_at,deleted_at,version FROM plans WHERE ${deletedClause} AND (title LIKE ? ESCAPE '\\' OR destination LIKE ? ESCAPE '\\') ORDER BY updated_at DESC,id DESC LIMIT ? OFFSET ?`).bind(pattern, pattern, limit + 1, offset).all()
    : await db.prepare(`SELECT id,title,destination,start_date,end_date,people,edit_policy,(password_hash IS NOT NULL) AS password_protected,(edit_password_hash IS NOT NULL) AS edit_password_protected,created_at,updated_at,deleted_at,version FROM plans WHERE ${deletedClause} ORDER BY updated_at DESC,id DESC LIMIT ? OFFSET ?`).bind(limit + 1, offset).all();
  const rows = result.results || [], hasMore = rows.length > limit;
  return Response.json({ items: rows.slice(0, limit).map(row => publicPlan(row as Record<string, unknown>)), nextOffset: hasMore ? offset + limit : null });
}

export async function POST(request: Request) {
  const quota = await checkRateLimit(request, 'plans-create', 20);
  if (!quota.allowed) return rateLimitResponse(quota.retryAfter);
  const db = getDb();
  if (!db) return Response.json({ message: '계획 저장소가 아직 연결되지 않았습니다.' }, { status: 503 });
  const parsed = await readJsonObject(request);
  if (!parsed.body) return Response.json({ message: parsed.message }, { status: parsed.status });
  const body = parsed.body;
  const plan = sanitizePlan(body);
  if (!plan) return Response.json({ message: '여행 이름, 여행지, 날짜를 입력해주세요.' }, { status: 400 });
  const password = typeof body.password === 'string' ? body.password.trim().slice(0, 100) : '';
  const editPassword = typeof body.editPassword === 'string' ? body.editPassword.trim().slice(0, 100) : '';
  if (plan.editPolicy === 'password' && !editPassword) return Response.json({ message: '편집 비밀번호를 입력해주세요.' }, { status: 400 });
  const id = `plan_${Date.now().toString(36)}_${randomHex(5)}`;
  const editToken = randomHex(28);
  const editTokenHash = await sha256(editToken);
  const salt = password ? randomHex(16) : null;
  const hash = password && salt ? await passwordHash(password, salt, 'pbkdf2') : null;
  const editSalt = plan.editPolicy === 'password' && editPassword ? randomHex(16) : null;
  const editHash = plan.editPolicy === 'password' && editPassword && editSalt ? await passwordHash(editPassword, editSalt, 'pbkdf2') : null;
  const now = new Date().toISOString();
  await db.prepare('INSERT INTO plans (id,title,destination,start_date,end_date,people,edit_policy,stops_json,password_hash,password_salt,edit_password_hash,edit_password_salt,edit_token_hash,created_at,updated_at,deleted_at,version,password_algo,edit_password_algo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id, plan.title, plan.destination, plan.startDate, plan.endDate, plan.people, plan.editPolicy, JSON.stringify(plan.stops), hash, salt, editHash, editSalt, editTokenHash, now, now, null, 1, password ? 'pbkdf2' : 'sha256', editPassword ? 'pbkdf2' : 'sha256').run();
  return Response.json({ id, editToken, plan: { ...plan, version: 1, passwordProtected: Boolean(password), editPasswordProtected: Boolean(editPassword), createdAt: now, updatedAt: now } }, { status: 201 });
}
