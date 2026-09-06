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
  stops: PlanStop[];
};

export function getDb() {
  return (env as unknown as { DB?: D1Database }).DB;
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

export async function passwordHash(password: string, salt: string) {
  return sha256(`${salt}:${password}`);
}

export function sanitizeStops(value: unknown): PlanStop[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 500).flatMap((item, index) => {
    if (!item || typeof item !== 'object') return [];
    const source = item as Record<string, unknown>;
    const lat = Number(source.lat), lng = Number(source.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
    const stop: PlanStop = {
      id: String(source.id || `stop-${index}`).slice(0, 100),
      day: String(source.day || '').slice(0, 20),
      time: String(source.time || '').slice(0, 10),
      name: String(source.name || '').trim().slice(0, 200),
      category: String(source.category || '기타').slice(0, 30),
      memo: String(source.memo || '').slice(0, 1000),
      address: String(source.address || '').slice(0, 400),
      lat,
      lng,
    };
    if (source.customLocation) stop.customLocation = true;
    if (typeof source.naverLink === 'string') stop.naverLink = source.naverLink.slice(0, 500);
    if (Number.isFinite(Number(source.costPerPerson))) stop.costPerPerson = Number(source.costPerPerson);
    if (Number.isFinite(Number(source.costTotal))) stop.costTotal = Number(source.costTotal);
    if (source.costBasis === 'person' || source.costBasis === 'total') stop.costBasis = source.costBasis;
    return stop.name && stop.day ? [stop] : [];
  });
}

export function sanitizePlan(value: unknown): PlanInput | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const title = String(source.title || '').trim().slice(0, 160);
  const destination = String(source.destination || '').trim().slice(0, 160);
  const startDate = String(source.startDate || '').slice(0, 20);
  const endDate = String(source.endDate || '').slice(0, 20);
  const people = Math.min(99, Math.max(1, Math.round(Number(source.people) || 1)));
  if (!title || !destination || !startDate || !endDate) return null;
  return { title, destination, startDate, endDate, people, stops: sanitizeStops(source.stops) };
}

export function publicPlan(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    title: String(row.title),
    destination: String(row.destination),
    startDate: String(row.start_date),
    endDate: String(row.end_date),
    people: Number(row.people) || 1,
    passwordProtected: Boolean(Number(row.password_protected ?? (row.password_hash ? 1 : 0))),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function fullPlan(row: Record<string, unknown>) {
  return {
    ...publicPlan(row),
    stops: JSON.parse(String(row.stops_json || '[]')) as PlanStop[],
  };
}
