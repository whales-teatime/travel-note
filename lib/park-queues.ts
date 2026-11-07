export const GYEONGGI_CROWD_MAP = 'https://gg.whitescan.com/?regionId=95&menu=realtimePopulation';

const PARKS = {
  everland: { id: 125, aliases: ['에버랜드', 'everland', 'ebeoraendeu'], lat: 37.2933272, lng: 127.2013221 },
  'caribbean-bay': { id: 329, aliases: ['캐리비안베이', 'caribbeanbay', 'kaeribianbei'], lat: 37.2981411, lng: 127.2005786 },
} as const;

export type QueuePark = keyof typeof PARKS;
export type ParkQueues = {
  observedAt: string | null;
  rides: { id: number; name: string; waitMinutes: number }[];
};

export function queueParkId(park: string) {
  return Object.hasOwn(PARKS, park) ? PARKS[park as QueuePark].id : null;
}

export function matchQueuePark(place: { name: string; lat: number; lng: number } | null) {
  if (!place || !Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return null;
  const name = place.name.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  return (Object.keys(PARKS) as QueuePark[]).find(key => {
    const park = PARKS[key];
    return park.aliases.some(alias => alias === name) && Math.abs(place.lat - park.lat) < 0.015 && Math.abs(place.lng - park.lng) < 0.015;
  }) ?? null;
}

function record(value: unknown) {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

export function readParkQueues(payload: unknown, now = Date.now()): ParkQueues {
  const data = record(payload);
  const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
  const byId = new Map<number, ParkQueues['rides'][number] & { timestamp: number }>();
  let observed = 0;
  for (const raw of [...list(data.rides), ...list(data.lands).flatMap(land => list(record(land).rides))]) {
    const { id, name, is_open, wait_time, last_updated } = record(raw);
    const timestamp = typeof last_updated === 'string' ? Date.parse(last_updated) : NaN;
    if (!Number.isFinite(timestamp) || timestamp > now + 2 * 60_000 || now - timestamp > 20 * 60_000) continue;
    if (typeof is_open !== 'boolean') continue;
    observed = Math.max(observed, timestamp);
    if (!is_open || typeof id !== 'number' || typeof name !== 'string' || !name.trim() || typeof wait_time !== 'number' || !Number.isInteger(wait_time) || wait_time < 0 || wait_time > 720) continue;
    if ((byId.get(id)?.timestamp ?? 0) > timestamp) continue;
    byId.set(id, { id, name: name.trim(), waitMinutes: wait_time, timestamp });
  }
  const rides = [...byId.values()].sort((a, b) => b.waitMinutes - a.waitMinutes || a.name.localeCompare(b.name)).slice(0, 5)
    .map(({ id, name, waitMinutes }) => ({ id, name, waitMinutes }));
  return { observedAt: observed ? new Date(observed).toISOString() : null, rides };
}
