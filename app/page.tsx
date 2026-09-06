'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, CalendarDays, LockKeyhole, MapPin, Plus, Search } from 'lucide-react';

type PlanSummary = {
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

export default function HomePage() {
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasDraft, setHasDraft] = useState(false);
  const [draftTitle, setDraftTitle] = useState('이 기기의 여행 초안');

  const loadPlans = useCallback(async (value: string) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/plans?search=${encodeURIComponent(value.trim())}`, { cache: 'no-store' });
      const body = await response.json() as { items?: PlanSummary[]; message?: string };
      if (!response.ok) throw new Error(body.message || '계획 목록을 불러오지 못했어요.');
      setPlans(body.items || []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '계획 목록을 불러오지 못했어요.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPlans('');
    const saved = window.localStorage.getItem('route-note-stops');
    const settings = window.localStorage.getItem('route-note-trip-settings');
    if (saved) {
      setHasDraft(true);
      try {
        const parsed = JSON.parse(settings || '{}') as { title?: string };
        if (parsed.title) setDraftTitle(parsed.title);
      } catch {}
    }
  }, [loadPlans]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadPlans(search), 220);
    return () => window.clearTimeout(timer);
  }, [search, loadPlans]);

  return <main className="home-shell">
    <header className="home-topbar">
      <a className="home-brand" href="/"><span className="brand-mark"><MapPin/></span><span>여행을 떠나요</span></a>
      <a className="home-new-button" href="/plan/new"><Plus/><span>새 계획 세우기</span></a>
    </header>

    <section className="home-content">
      <div className="home-intro">
        <div><span className="home-eyebrow">TRIP PLANS</span><h1>여행 계획을 한곳에</h1><p>새 계획을 만들거나, 공유된 여행을 이어서 확인하세요.</p></div>
        <a className="home-intro-action" href="/plan/new"><span>새 계획 시작</span><ArrowRight/></a>
      </div>

      <section className="plan-list-section" aria-labelledby="plan-list-title">
        <div className="section-heading"><div><span className="section-kicker"><CalendarDays/>여행 계획</span><h2 id="plan-list-title">계획 목록</h2></div><span className="plan-count">{loading ? '불러오는 중' : `${plans.length}개`}</span></div>
        <label className="plan-search"><Search/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="여행 이름이나 도시로 검색" aria-label="여행 계획 검색"/></label>
        {error&&<div className="home-notice">{error}</div>}
        {hasDraft&&<div className="draft-card"><div><span className="draft-label">이 기기에 남아 있는 초안</span><strong>{draftTitle}</strong><small>아직 공유 저장하지 않은 계획이에요.</small></div><a href="/plan/new?draft=1">계속 작성<ArrowRight/></a></div>}
        <div className="plan-grid">
          {!loading&&!plans.length&&!error&&<div className="plans-empty"><CalendarDays/><strong>{search ? '검색 결과가 없어요.' : '아직 저장된 계획이 없어요.'}</strong><span>{search ? '다른 이름이나 도시로 찾아보세요.' : '첫 여행 계획을 만들어 목록에 저장해보세요.'}</span><a href="/plan/new">새 계획 세우기<ArrowRight/></a></div>}
          {plans.map(plan=><a className="plan-card" href={`/plan/${encodeURIComponent(plan.id)}`} key={plan.id}><div className="plan-card-top"><span className="plan-destination"><MapPin/>{plan.destination}</span>{plan.passwordProtected&&<span className="plan-lock"><LockKeyhole/>비밀번호</span>}</div><h3>{plan.title}</h3><p><CalendarDays/>{formatDate(plan.startDate)} — {formatDate(plan.endDate)}<span>·</span>{plan.people}명</p><div className="plan-card-bottom"><small>최근 수정 {formatUpdated(plan.updatedAt)}</small><ArrowRight/></div></a>)}
        </div>
      </section>
    </section>
  </main>;
}
