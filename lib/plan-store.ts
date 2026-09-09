import { env } from 'cloudflare:workers';
import type { D1Database } from '@cloudflare/workers-types';

export type PlanStop = {
  id: string;
  day: string;
  time: string;
  name: string;
  category: string;
  memo: string;
  address: string;
  lat: number;
  lng: number;
  customLocation?: boolean;
  naverLink?: string;
  mapProvider?: 'naver' | 'google';
  placeId?: string;
  costPerPerson?: number;
  costTotal?: number;
  costBasis?: 'person' | 'total';
};

export type PlanInput = {
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  people: number;
  editPolicy: 'owner' | 'all' | 'password';
  mapProvider: 'naver' | 'google';
  stops: PlanStop[];
};

const MAX_PLAN_BODY_BYTES = 900_000;
const ADMIN_SESSION_COOKIE = 'travel_admin_session';
const ADMIN_SESSION_SECONDS = 8 * 60 * 60;
const rateWindows = new Map<string, { count: number; resetAt: number }>();

function textValue(value: unknown, fallback = '') {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : fallback;
}

type RateLimiter = { limit(input: { key: string }): Promise<{ success: boolean }> };
type RuntimeEnv = {
  DB?: D1Database;
  ADMIN_MASTER_PASSWORD?: unknown;
  PLAN_READ_RATE_LIMITER?: RateLimiter;
  PLAN_WRITE_RATE_LIMITER?: RateLimiter;
  PLAN_CREATE_RATE_LIMITER?: RateLimiter;
  SEARCH_RATE_LIMITER?: RateLimiter;
  FEEDBACK_RATE_LIMITER?: RateLimiter;
  ADMIN_RATE_LIMITER?: RateLimiter;
};

function runtimeEnv() { return env as unknown as RuntimeEnv; }

export function getDb() {
  return runtimeEnv().DB;
}

function adminSecret() {
  const value = runtimeEnv().ADMIN_MASTER_PASSWORD;
  return typeof value === 'string' && value.length > 0 ? value : '';
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left[index] ^ right[index];
  return mismatch === 0;
}

async function digest(value: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

export async function isAdminPassword(value: unknown) {
  const master = adminSecret();
  if (!master || typeof value !== 'string') return false;
  return constantTimeEqual(await digest(value), await digest(master));
}

async function adminSessionSignature(expires: string) {
  const secret = adminSecret();
  if (!secret) return '';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`travel-admin:${expires}`));
  return Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function createAdminSessionCookie() {
  const expires = String(Math.floor(Date.now() / 1000) + ADMIN_SESSION_SECONDS);
  const signature = await adminSessionSignature(expires);
  return `${ADMIN_SESSION_COOKIE}=${expires}.${signature}; Path=/; Max-Age=${ADMIN_SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearAdminSessionCookie() {
  return `${ADMIN_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

export async function isAdminRequest(request: Request) {
  const raw = request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${ADMIN_SESSION_COOKIE}=`))?.slice(ADMIN_SESSION_COOKIE.length + 1);
  if (!raw) return false;
  const [expires, signature, extra] = raw.split('.');
  if (extra || !/^\d{10}$/.test(expires) || !/^[a-f0-9]{64}$/i.test(signature) || Number(expires) <= Math.floor(Date.now() / 1000)) return false;
  const expected = await adminSessionSignature(expires);
  return Boolean(expected) && constantTimeEqual(new TextEncoder().encode(signature.toLowerCase()), new TextEncoder().encode(expected));
}

export function bodyTooLarge(request: Request) {
  const length = Number(request.headers.get('content-length') || 0);
  return Number.isFinite(length) && length > MAX_PLAN_BODY_BYTES;
}

function clientKey(request: Request) {
  const forwarded = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Real-IP') || '';
  const value = forwarded.split(',')[0].trim();
  return /^[0-9a-f:.]{2,64}$/i.test(value) ? value : 'unknown';
}

function rateLimiterFor(scope: string) {
  const runtime = runtimeEnv();
  if (scope === 'place-search') return runtime.SEARCH_RATE_LIMITER;
  if (scope === 'feedback') return runtime.FEEDBACK_RATE_LIMITER;
  if (scope === 'plans-create') return runtime.PLAN_CREATE_RATE_LIMITER;
  if (scope === 'admin-auth') return runtime.ADMIN_RATE_LIMITER;
  if (scope === 'plans-read' || scope === 'plan-read') return runtime.PLAN_READ_RATE_LIMITER;
  return runtime.PLAN_WRITE_RATE_LIMITER;
}

/** Cloudflare-backed in production, with a bounded per-isolate fallback for local development. */
export async function checkRateLimit(request: Request, scope: string, limit: number, windowMs = 60_000) {
  const now = Date.now();
  const key = `${scope}:${await sha256(clientKey(request))}`;
  const remote = rateLimiterFor(scope);
  if (remote) {
    try {
      const result = await remote.limit({ key });
      return { allowed: result.success, retryAfter: result.success ? 0 : Math.max(1, Math.ceil(windowMs / 1000)) };
    } catch { /* Fall through to the local limiter if the binding is temporarily unavailable. */ }
  }
  if (rateWindows.size >= 20_000) {
    for (const [entryKey, entry] of rateWindows) if (entry.resetAt <= now) rateWindows.delete(entryKey);
    while (rateWindows.size >= 20_000) rateWindows.delete(rateWindows.keys().next().value as string);
  }
  const current = rateWindows.get(key);
  if (!current || current.resetAt <= now) {
    rateWindows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }
  current.count += 1;
  return { allowed: current.count <= limit, retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
}

export function rateLimitResponse(retryAfter: number) {
  return Response.json({ message: '요청이 너무 많아요. 잠시 후 다시 시도해주세요.' }, { status: 429, headers: { 'Retry-After': String(retryAfter), 'Cache-Control': 'no-store' } });
}

export async function readJsonObject(request: Request) {
  if (bodyTooLarge(request)) return { body: null, status: 413 as const, message: '계획 데이터가 너무 큽니다.' };
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_PLAN_BODY_BYTES) return { body: null, status: 413 as const, message: '계획 데이터가 너무 큽니다.' };
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { body: null, status: 400 as const, message: '잘못된 요청입니다.' };
    return { body: parsed as Record<string, unknown>, status: 200 as const, message: '' };
  } catch {
    return { body: null, status: 400 as const, message: '잘못된 요청입니다.' };
  }
}

export const TRASH_RETENTION_DAYS = 7;
const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/** Remove soft-deleted plans after their seven-day retention window. */
export async function purgeExpiredPlans(db: D1Database) {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_MS).toISOString();
  await db.prepare('DELETE FROM plans WHERE deleted_at IS NOT NULL AND deleted_at <= ?').bind(cutoff).run();
}

export function randomHex(byteLength = 18) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function passwordHash(password: string, salt: string, algorithm: 'sha256' | 'pbkdf2' = 'pbkdf2') {
  if (algorithm === 'sha256') return sha256(`${salt}:${password}`);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 100_000, hash: 'SHA-256' }, key, 256);
  return Array.from(new Uint8Array(bits), byte => byte.toString(16).padStart(2, '0')).join('');
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function dateNumber(value: string) { return Date.parse(`${value}T00:00:00.000Z`); }

export function sanitizeStops(value: unknown, startDate = '', endDate = ''): PlanStop[] | null {
  if (!Array.isArray(value) || value.length > 500) return null;
  const items = value, stops: PlanStop[] = [];
  for (const [index, item] of items.entries()) {
    if (!item || typeof item !== 'object') return null;
    const source = item as Record<string, unknown>;
    const lat = Number(source.lat), lng = Number(source.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    const day = textValue(source.day).slice(0, 20);
    const time = textValue(source.time).slice(0, 10);
    const costPerPerson = Number(source.costPerPerson), costTotal = Number(source.costTotal);
    if (!day || (startDate && (!validDate(day) || day < startDate || day > endDate)) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
    if (Number.isFinite(costPerPerson) && (costPerPerson < 0 || costPerPerson > 1_000_000_000)) return null;
    if (Number.isFinite(costTotal) && (costTotal < 0 || costTotal > 1_000_000_000)) return null;
    const stop: PlanStop = {
      id: textValue(source.id, `stop-${index}`).slice(0, 100),
      day,
      time,
      name: textValue(source.name).trim().slice(0, 200),
      category: textValue(source.category, '기타').slice(0, 30),
      memo: textValue(source.memo).slice(0, 1000),
      address: textValue(source.address).slice(0, 400),
      lat,
      lng,
    };
    if (source.customLocation) stop.customLocation = true;
    if (typeof source.naverLink === 'string') stop.naverLink = source.naverLink.slice(0, 500);
    if (source.mapProvider === 'google' || source.mapProvider === 'naver') stop.mapProvider = source.mapProvider;
    if (typeof source.placeId === 'string' && source.placeId.trim()) stop.placeId = source.placeId.trim().slice(0, 300);
    if (Number.isFinite(costPerPerson)) stop.costPerPerson = costPerPerson;
    if (Number.isFinite(costTotal)) stop.costTotal = costTotal;
    if (source.costBasis === 'person' || source.costBasis === 'total') stop.costBasis = source.costBasis;
    if (!stop.name || !stop.day) return null;
    stops.push(stop);
  }
  return stops;
}

export function sanitizePlan(value: unknown): PlanInput | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const title = textValue(source.title).trim().slice(0, 160);
  const destination = textValue(source.destination).trim().slice(0, 160);
  const startDate = textValue(source.startDate).slice(0, 20);
  const endDate = textValue(source.endDate).slice(0, 20);
  const people = Math.min(99, Math.max(1, Math.round(Number(source.people) || 1)));
  const editPolicy = source.editPolicy === 'all' ? 'all' : source.editPolicy === 'password' ? 'password' : 'owner';
  const mapProvider = source.mapProvider === 'google' ? 'google' : 'naver';
  if (!title || !destination || !validDate(startDate) || !validDate(endDate) || startDate > endDate || dateNumber(endDate) - dateNumber(startDate) > 366 * 24 * 60 * 60 * 1000) return null;
  const stops = sanitizeStops(source.stops, startDate, endDate);
  if (!stops) return null;
  return { title, destination, startDate, endDate, people, editPolicy, mapProvider, stops };
}

export function publicPlan(row: Record<string, unknown>) {
  const plan = {
    id: textValue(row.id),
    title: textValue(row.title),
    destination: textValue(row.destination),
    startDate: textValue(row.start_date),
    endDate: textValue(row.end_date),
    people: Number(row.people) || 1,
    mapProvider: row.map_provider === 'google' ? 'google' : 'naver',
    editPolicy: row.edit_policy === 'all' ? 'all' : row.edit_policy === 'password' ? 'password' : 'owner',
    passwordProtected: Boolean(Number(row.password_protected ?? (row.password_hash ? 1 : 0))),
    editPasswordProtected: Boolean(Number(row.edit_password_protected ?? (row.edit_password_hash ? 1 : 0))),
    version: Math.max(1, Number(row.version) || 1),
    createdAt: textValue(row.created_at),
    updatedAt: textValue(row.updated_at),
    ...(row.deleted_at ? { deletedAt: textValue(row.deleted_at) } : {}),
  };
  return plan;
}

export function fullPlan(row: Record<string, unknown>) {
  return {
    ...publicPlan(row),
    stops: JSON.parse(textValue(row.stops_json, '[]')) as PlanStop[],
  };
}
