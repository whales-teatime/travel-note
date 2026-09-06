'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, CalendarDays, LockKeyhole, MapPin, Search, Trash2 } from 'lucide-react';

export type PlanSummary = {
  id: string;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  people: number;
  passwordProtected: boolean;
  editPolicy?: 'owner' | 'all' | 'password';
  editPasswordProtected?: boolean;
  updatedAt: string;
  deletedAt?: string;
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

function formatTrashExpiry(value?: string) {
  if (!value) return '삭제 예정일을 확인할 수 없어요.';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '7일 후 자동 삭제';
  date.setDate(date.getDate() + 7);
  return `7일 후 자동 삭제 · ${new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' }).format(date)}`;
}

export function PlanLibrary({ compact = false, trash = false }: { compact?: boolean; trash?: boolean }) {
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const loadPlans = useCallback(async (value: string) => {
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/plans?search=${encodeURIComponent(value.trim())}${trash ? '&trash=1' : ''}`, { cache: 'no-store' });
      const body = await response.json() as { items?: PlanSummary[]; message?: string };
      if (!response.ok) throw new Error(body.message || '계획 목록을 불러오지 못했어요.');
      setPlans(body.items || []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '계획 목록을 불러오지 못했어요.');
    } finally { setLoading(false); }
  }, [trash]);

  const restorePlan = async (plan: PlanSummary) => {
    if (!window.confirm(`“${plan.title}” 계획을 복원할까요?`)) return;
    let password: string | undefined;
    let editPassword: string | undefined;
    const token = localStorage.getItem(`route-note-edit-token-${plan.id}`);
    if (!token && plan.passwordProtected) {
      const entered = window.prompt('열람 비밀번호를 입력하세요.');
      if (entered === null) return;
      password = entered;
    }
    if (plan.editPolicy === 'password') {
      const entered = window.prompt('편집 비밀번호를 입력하세요.');
      if (entered === null) return;
      editPassword = entered;
    }
    setRestoringId(plan.id); setError('');
    try {
      const response = await fetch(`/api/plans/${encodeURIComponent(plan.id)}`, {
        method: 'POST', headers: {'Content-Type': 'application/json', ...(token ? {'x-plan-edit-token': token} : {})},
        body: JSON.stringify({action: 'restore', ...(password ? {password, passwordAuth: password} : {}), ...(editPassword ? {editPassword, editPasswordAuth: editPassword} : {})}),
      });
      const body = await response.json() as {message?: string};
      if (!response.ok) throw new Error(body.message || '계획을 복원하지 못했어요.');
      setNotice('계획을 복원했어요.');
      await loadPlans(search);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '계획을 복원하지 못했어요.');
    } finally { setRestoringId(null); }
  };

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
    <div className="library-heading"><div><span className="library-kicker"><CalendarDays /> {trash ? 'TRASH' : 'TRIP PLANS'}</span><h1 id="plan-list-title">{trash ? '휴지통' : '여행 계획 목록'}</h1><p>{trash ? '7일 동안 보관된 계획이에요.' : '함께 만든 여행을 다시 열어보세요.'}</p></div><span className="library-count">{loading ? '불러오는 중' : `${plans.length}개`}</span></div>
    <label className="library-search"><Search /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="여행 이름이나 도시로 검색" aria-label="여행 계획 검색" /></label>
    {notice && <div className="library-notice is-success" role="status">{notice}</div>}
    {error && <div className="library-notice">{error}</div>}
    <div className="library-grid">
      {!loading && !plans.length && !error && <div className="library-empty"><CalendarDays /><strong>{search ? '검색 결과가 없어요.' : trash ? '휴지통이 비어 있어요.' : '아직 저장된 계획이 없어요.'}</strong><span>{search ? '다른 이름이나 도시로 찾아보세요.' : trash ? '삭제한 계획은 7일 동안 이곳에 보관돼요.' : '첫 여행 계획을 만들어 목록에 저장해보세요.'}</span>{!trash && <a href="/plan/new?mode=domestic">새 계획 세우기<ArrowRight /></a>}</div>}
      {plans.map(plan => trash ? <article className="library-card trash-card" key={plan.id}><div className="library-card-top"><span className="library-destination"><MapPin />{plan.destination}</span><span className="library-lock"><Trash2 />휴지통</span></div><h2>{plan.title}</h2><p><CalendarDays />{formatDate(plan.startDate)} — {formatDate(plan.endDate)}<span>·</span>{plan.people}명</p><div className="library-card-bottom"><small>{formatTrashExpiry(plan.deletedAt)}</small><button type="button" className="trash-restore-button" onClick={()=>void restorePlan(plan)} disabled={restoringId===plan.id}>{restoringId===plan.id?'복원 중…':'복원'}</button></div></article> : <a className="library-card" href={`/plan/${encodeURIComponent(plan.id)}`} key={plan.id}><div className="library-card-top"><span className="library-destination"><MapPin />{plan.destination}</span>{plan.passwordProtected && <span className="library-lock"><LockKeyhole />비밀번호</span>}</div><h2>{plan.title}</h2><p><CalendarDays />{formatDate(plan.startDate)} — {formatDate(plan.endDate)}<span>·</span>{plan.people}명</p><div className="library-card-bottom"><small>최근 수정 {formatUpdated(plan.updatedAt)}</small><ArrowRight /></div></a>)}
    </div>
  </section>;
}
