import { getDb, passwordHash, publicPlan, randomHex, sanitizePlan, sha256 } from '@/lib/plan-store';

export async function GET(request: Request) {
  const db = getDb();
  if (!db) return Response.json({ message: '계획 저장소가 아직 연결되지 않았습니다.' }, { status: 503 });
  const search = new URL(request.url).searchParams.get('search')?.trim() || '';
  const pattern = `%${search.replace(/[%_]/g, char => `\\${char}`)}%`;
  const result = search
    ? await db.prepare("SELECT id,title,destination,start_date,end_date,people,(password_hash IS NOT NULL) AS password_protected,created_at,updated_at FROM plans WHERE (title LIKE ? ESCAPE '\\' OR destination LIKE ? ESCAPE '\\') ORDER BY updated_at DESC LIMIT 100").bind(pattern, pattern).all()
    : await db.prepare('SELECT id,title,destination,start_date,end_date,people,(password_hash IS NOT NULL) AS password_protected,created_at,updated_at FROM plans ORDER BY updated_at DESC LIMIT 100').all();
  return Response.json({ items: (result.results || []).map(row => publicPlan(row as Record<string, unknown>)) });
}

export async function POST(request: Request) {
  const db = getDb();
  if (!db) return Response.json({ message: '계획 저장소가 아직 연결되지 않았습니다.' }, { status: 503 });
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return Response.json({ message: '잘못된 요청입니다.' }, { status: 400 }); }
  const plan = sanitizePlan(body);
  if (!plan) return Response.json({ message: '여행 이름, 여행지, 날짜를 입력해주세요.' }, { status: 400 });
  const password = typeof body.password === 'string' ? body.password.trim().slice(0, 100) : '';
  const id = `plan_${Date.now().toString(36)}_${randomHex(5)}`;
  const editToken = randomHex(28);
  const editTokenHash = await sha256(editToken);
  const salt = password ? randomHex(16) : null;
  const hash = password && salt ? await passwordHash(password, salt) : null;
  const now = new Date().toISOString();
  await db.prepare('INSERT INTO plans (id,title,destination,start_date,end_date,people,stops_json,password_hash,password_salt,edit_token_hash,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind(id, plan.title, plan.destination, plan.startDate, plan.endDate, plan.people, JSON.stringify(plan.stops), hash, salt, editTokenHash, now, now).run();
  return Response.json({ id, editToken, plan: { ...plan, passwordProtected: Boolean(password), createdAt: now, updatedAt: now } }, { status: 201 });
}
