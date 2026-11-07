'use client';

import { useEffect, useState } from 'react';
import { Clock3, ExternalLink } from 'lucide-react';
import { GYEONGGI_CROWD_MAP, queueParkId, type ParkQueues, type QueuePark } from '@/lib/park-queues';

type Props = { park: QueuePark; language: 'ko' | 'en' };
type QueueState = { data: ParkQueues } | 'loading' | 'error';

export function ParkLiveInfo({ park, language }: Props) {
  const en = language === 'en';
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<QueueState>('loading');
  const parkPage = `https://queue-times.com/parks/${queueParkId(park)}/queue_times`;

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const response = await fetch(`/api/park-queues?park=${encodeURIComponent(park)}`, { signal: controller.signal });
        if (!response.ok) throw new Error('Queue lookup failed');
        const data: ParkQueues = await response.json();
        if (!controller.signal.aborted) setResult({ data });
      } catch {
        if (!controller.signal.aborted) setResult('error');
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(load, 60_000);
      }
    }
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [open, park]);

  const data = typeof result === 'object' ? result.data : null;
  const observedAt = data?.observedAt;
  const observed = observedAt ? new Intl.DateTimeFormat(en ? 'en-GB' : 'ko-KR', {
    timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(observedAt)) : null;

  return <section className="park-live-info my-2 w-full rounded-xl border border-border bg-background p-3 text-sm">
    <details onToggle={event => {
      const next = event.currentTarget.open;
      if (!next) setResult('loading');
      setOpen(next);
    }}>
      <summary className="cursor-pointer font-semibold">
        <Clock3 className="mr-1.5 inline size-4" aria-hidden="true" />
        {en ? 'Live ride waits' : '놀이기구 대기시간'}
      </summary>
      {open && <div className="mt-2 space-y-2" aria-live="polite">
        {result === 'loading' ? <p>{en ? 'Checking wait times…' : '대기시간을 확인 중이에요…'}</p> :
          result === 'error' ? <p>{en ? 'Wait times are temporarily unavailable.' : '지금은 대기시간을 불러올 수 없어요.'}</p> :
          !data || !observed ? <p>{en ? 'No recent wait-time update.' : '최근에 갱신된 대기시간이 없어요.'}</p> : <>
            <p className="text-xs text-muted-foreground">{en ? `Latest update: ${observed} KST` : `최근 기준: ${observed}`}</p>
            {data.rides.length === 0 ? <p>{en ? 'No open rides with a reported wait.' : '대기시간이 표시된 운영 중인 놀이기구가 없어요.'}</p> : <>
              <p className="text-xs text-muted-foreground">{en ? 'Longest reported waits' : '대기시간이 긴 순서'}</p>
              <ul className="space-y-1" aria-label={en ? 'Ride wait times' : '놀이기구별 대기시간'}>
                {data.rides.map(ride => <li key={ride.id} className="flex justify-between gap-2"><span>{ride.name}</span><strong className="shrink-0 tabular-nums">{en ? `${ride.waitMinutes} min` : `${ride.waitMinutes}분`}</strong></li>)}
              </ul>
            </>}
          </>}
        <a className="inline-flex items-center gap-1 text-xs underline" href="https://queue-times.com/" target="_blank" rel="noreferrer">Powered by Queue-Times.com</a>
        {' · '}
        <a className="inline-flex items-center gap-1 text-xs underline" href={parkPage} target="_blank" rel="noreferrer">{en ? 'See all rides' : '전체 보기'}<ExternalLink className="size-3" aria-hidden="true" /></a>
      </div>}
    </details>
    <a className="mt-2 inline-flex items-center gap-1 text-xs underline" href={GYEONGGI_CROWD_MAP} target="_blank" rel="noreferrer">{en ? 'Area crowd levels · Gyeonggi Data Dream' : '일대 인구 밀집도 · 경기데이터드림'}<ExternalLink className="size-3" aria-hidden="true" /></a>
  </section>;
}
