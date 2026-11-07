import { queueParkId, readParkQueues } from '@/lib/park-queues';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const park = new URL(request.url).searchParams.get('park') ?? '';
  const id = queueParkId(park);
  if (id === null) return Response.json({ message: 'Unknown park' }, { status: 400 });

  try {
    const options = {
      signal: AbortSignal.timeout(5_000),
      headers: { Accept: 'application/json' },
      cf: { cacheEverything: true, cacheTtlByStatus: { '200': 60, '400-599': 0 } },
    };
    const upstream = await fetch(`https://queue-times.com/parks/${id}/queue_times.json`, options);
    if (!upstream.ok) throw new Error('Queue provider unavailable');
    return Response.json(readParkQueues(await upstream.json()), {
      headers: { 'Cache-Control': 'public, max-age=30, s-maxage=60' },
    });
  } catch {
    return Response.json({ message: 'Queue provider unavailable' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
