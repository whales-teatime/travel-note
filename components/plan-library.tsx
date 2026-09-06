'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, CalendarDays, LockKeyhole, MapPin, Search } from 'lucide-react';

export type PlanSummary = {
  id: string;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  people: number;
  passwordProtected: boolean;
  updatedAt: string;
};

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' }).format(date).replace(/\.\s/g, '. ');
}

function formatUpdated(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

export function PlanLibrary({ compact = false }: { compact?: boolean }) {
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadPlans = useCallback(async (value: string) => {
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/plans?search=${encodeURIComponent(value.trim())}`, { cache: 'no-store' });
      const body = await response.json() as { items?: PlanSummary[]; message?: string };
      if (!response.ok) throw new Error(body.message || '계획 목록을 불러오지 못했어요.');
      setPlans(body.items || []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '계획 목록을 불러오지 못했어요.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadPlans(''); }, [loadPlans]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('deleted') === '1') setNotice('계획을 휴지통으로 옮겼어요. 7일 후 자동 삭제됩니다.');
  }, []);
  useEffect(() => {
    if (compact) return;
    const timer = window.setTimeout(() => void loadPlans(search), 220);
    return () => window.clearTimeout(timer);
  }, [search, loadPlans, compact]);

  if (compact) return <div className="compact-plan-list">
    {plans.slice(0, 4).map(plan => <a className="compact-plan-item" href={`/plan/${encodeURIComponent(plan.id)}`} key={plan.id}><span><strong>{plan.title}</strong><small>{plan.destination} · {formatDate(plan.startDate)}</small></span><ArrowRight /></a>)}
    {!loading && !plans.length && <p className="compact-plan-empty">저장된 계획이 없어요.</p>}
  </div>;

  return <section className="library-panel" aria-labelledby="plan-list-title">
    <div className="library-heading"><div><span className="library-kicker"><CalendarDays /> TRIP PLANS</span><h1 id="plan-list-title">여행 계획 목록</h1><p>함께 만든 여행을 다시 열어보세요.</p></div><span className="library-count">{loading ? '불러오는 중' : `${plans.length}개`}</span></div>
    <label className="library-search"><Search /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="여행 이름이나 도시로 검색" aria-label="여행 계획 검색" /></label>
    {notice && <div className="library-notice is-success" role="status">{notice}</div>}
    {error && <div className="library-notice">{error}</div>}
    <div className="library-grid">
      {!loading && !plans.length && !error && <div className="library-empty"><CalendarDays /><strong>{search ? '검색 결과가 없어요.' : '아직 저장된 계획이 없어요.'}</strong><span>{search ? '다른 이름이나 도시로 찾아보세요.' : '첫 여행 계획을 만들어 목록에 저장해보세요.'}</span><a href="/plan/new?mode=domestic">새 계획 세우기<ArrowRight /></a></div>}
      {plans.map(plan => <a className="library-card" href={`/plan/${encodeURIComponent(plan.id)}`} key={plan.id}><div className="library-card-top"><span className="library-destination"><MapPin />{plan.destination}</span>{plan.passwordProtected && <span className="library-lock"><LockKeyhole />비밀번호</span>}</div><h2>{plan.title}</h2><p><CalendarDays />{formatDate(plan.startDate)} — {formatDate(plan.endDate)}<span>·</span>{plan.people}명</p><div className="library-card-bottom"><small>최근 수정 {formatUpdated(plan.updatedAt)}</small><ArrowRight /></div></a>)}
    </div>
  </section>;
}
