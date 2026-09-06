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
  stops: PlanStop[];
};

const MAX_PLAN_BODY_BYTES = 900_000;
const rateWindows = new Map<string, { count: number; resetAt: number }>();

export function getDb() {
  return (env as unknown as { DB?: D1Database }).DB;
}

export function isAdminPassword(value: unknown) {
  const master = (env as unknown as { ADMIN_MASTER_PASSWORD?: unknown }).ADMIN_MASTER_PASSWORD;
  return typeof master === 'string' && master.length > 0 && typeof value === 'string' && value === master;
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

/** Best-effort per-isolate burst protection. Cloudflare edge limits should complement this. */
export function checkRateLimit(request: Request, scope: string, limit: number, windowMs = 60_000) {
  const now = Date.now();
  const key = `${scope}:${clientKey(request)}`;
  const current = rateWindows.get(key);
  if (!current || current.resetAt <= now) {
    rateWindows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }
  current.count += 1;
  if (rateWindows.size > 20_000) {
    for (const [entryKey, entry] of rateWindows) if (entry.resetAt <= now) rateWindows.delete(entryKey);
  }
  return { allowed: current.count <= limit, retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
}

export function rateLimitResponse(retryAfter: number) {
  return Response.json({ message: '요청이 너무 많아요. 잠시 후 다시 시도해주세요.' }, { status: 429, headers: { 'Retry-After': String(retryAfter), 'Cache-Control': 'no-store' } });
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
  if (!Array.isArray(value)) return [];
  const items = value.slice(0, 500), stops: PlanStop[] = [];
  for (const [index, item] of items.entries()) {
    if (!item || typeof item !== 'object') return null;
    const source = item as Record<string, unknown>;
    const lat = Number(source.lat), lng = Number(source.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    const day = String(source.day || '').slice(0, 20);
    const time = String(source.time || '').slice(0, 10);
    const costPerPerson = Number(source.costPerPerson), costTotal = Number(source.costTotal);
    if (!day || (startDate && (!validDate(day) || day < startDate || day > endDate)) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
    if (Number.isFinite(costPerPerson) && (costPerPerson < 0 || costPerPerson > 1_000_000_000)) return null;
    if (Number.isFinite(costTotal) && (costTotal < 0 || costTotal > 1_000_000_000)) return null;
    const stop: PlanStop = {
      id: String(source.id || `stop-${index}`).slice(0, 100),
      day,
      time,
      name: String(source.name || '').trim().slice(0, 200),
      category: String(source.category || '기타').slice(0, 30),
      memo: String(source.memo || '').slice(0, 1000),
      address: String(source.address || '').slice(0, 400),
      lat,
      lng,
    };
    if (source.customLocation) stop.customLocation = true;
    if (typeof source.naverLink === 'string') stop.naverLink = source.naverLink.slice(0, 500);
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
  const title = String(source.title || '').trim().slice(0, 160);
  const destination = String(source.destination || '').trim().slice(0, 160);
  const startDate = String(source.startDate || '').slice(0, 20);
  const endDate = String(source.endDate || '').slice(0, 20);
  const people = Math.min(99, Math.max(1, Math.round(Number(source.people) || 1)));
  const editPolicy = source.editPolicy === 'all' ? 'all' : source.editPolicy === 'password' ? 'password' : 'owner';
  if (!title || !destination || !validDate(startDate) || !validDate(endDate) || startDate > endDate || dateNumber(endDate) - dateNumber(startDate) > 366 * 24 * 60 * 60 * 1000) return null;
  const stops = sanitizeStops(source.stops, startDate, endDate);
  if (!stops) return null;
  return { title, destination, startDate, endDate, people, editPolicy, stops };
}

export function publicPlan(row: Record<string, unknown>) {
  const plan = {
    id: String(row.id),
    title: String(row.title),
    destination: String(row.destination),
    startDate: String(row.start_date),
    endDate: String(row.end_date),
    people: Number(row.people) || 1,
    editPolicy: row.edit_policy === 'all' ? 'all' : row.edit_policy === 'password' ? 'password' : 'owner',
    passwordProtected: Boolean(Number(row.password_protected ?? (row.password_hash ? 1 : 0))),
    editPasswordProtected: Boolean(Number(row.edit_password_protected ?? (row.edit_password_hash ? 1 : 0))),
    version: Math.max(1, Number(row.version) || 1),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    ...(row.deleted_at ? { deletedAt: String(row.deleted_at) } : {}),
  };
  return plan;
}

export function fullPlan(row: Record<string, unknown>) {
  return {
    ...publicPlan(row),
    stops: JSON.parse(String(row.stops_json || '[]')) as PlanStop[],
  };
}
