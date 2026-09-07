'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarDays, ExternalLink, LockKeyhole, MapPin, Search, Trash2 } from 'lucide-react';

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
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [adminAuthenticated, setAdminAuthenticated] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [adminBusy, setAdminBusy] = useState(false);

  const loadPlans = useCallback(async (value: string, append = false, offset = 0) => {
    if (append) setLoadingMore(true); else setLoading(true); setError('');
    try {
      const limit = compact ? 4 : 24;
      const response = await fetch(`/api/plans?search=${encodeURIComponent(value.trim())}${trash ? '&trash=1' : ''}&limit=${limit}&offset=${offset}`, { cache: 'no-store' });
      const body = await response.json() as { items?: PlanSummary[]; nextOffset?: number | null; message?: string };
      if (!response.ok) throw new Error(body.message || '계획 목록을 불러오지 못했어요.');
      setPlans(current => append ? [...current, ...(body.items || [])] : body.items || []);
      if (!append) setSelectedIds(new Set());
      setNextOffset(body.nextOffset ?? null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '계획 목록을 불러오지 못했어요.');
    } finally { setLoading(false); setLoadingMore(false); }
  }, [trash, compact]);

  const restorePlan = async (plan: PlanSummary) => {
    if (!window.confirm(`“${plan.title}” 계획을 복원할까요?`)) return;
    let password: string | undefined;
    let editPassword: string | undefined;
    const token = localStorage.getItem(`route-note-edit-token-${plan.id}`);
    let admin = adminAuthenticated;
    if (!token && !admin && plan.editPolicy === 'owner') {
      const entered = window.prompt('작성자 토큰이 없는 계획입니다. 관리자 비밀번호를 입력하세요.');
      if (entered === null) return;
      const response = await fetch('/api/admin/session', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({password: entered}) });
      const body = await response.json() as {adminAuthenticated?: boolean; message?: string};
      if (!response.ok || !body.adminAuthenticated) { setError(body.message || '관리자 비밀번호가 올바르지 않습니다.'); return; }
      admin = true; setAdminAuthenticated(true);
    }
    if (!token && !admin && plan.passwordProtected) {
      const entered = window.prompt('열람 비밀번호를 입력하세요.');
      if (entered === null) return;
      password = entered;
    }
    if (!admin && plan.editPolicy === 'password') {
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

  const runAdminDelete = async (action: 'trash' | 'purge' | 'empty-trash', ids: string[] = []) => {
    const label = action === 'trash' ? '선택한 계획을 휴지통으로 옮길까요?' : action === 'purge' ? '선택한 계획을 영구 삭제할까요? 이 작업은 되돌릴 수 없어요.' : '휴지통의 모든 계획을 영구 삭제할까요? 이 작업은 되돌릴 수 없어요.';
    if (!window.confirm(label)) return;
    setAdminBusy(true); setError('');
    try {
      const response = await fetch('/api/admin/plans', { method:'DELETE', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action, ...(action!=='empty-trash'?{ids}:{})}) });
      const body = await response.json() as {message?:string};
      if (!response.ok) throw new Error(body.message || '삭제 작업을 완료하지 못했어요.');
      setNotice(body.message || '삭제 작업을 완료했어요.'); setSelectedIds(new Set()); await loadPlans(search);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '삭제 작업을 완료하지 못했어요.'); }
    finally { setAdminBusy(false); }
  };

  const toggleSelection = (id: string) => setSelectedIds(current => { const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);return next; });

  useEffect(() => { void loadPlans(''); }, [loadPlans]);
  useEffect(() => { void fetch('/api/admin/session', {cache:'no-store'}).then(response=>response.json() as Promise<{adminAuthenticated?:boolean}>).then(body=>setAdminAuthenticated(Boolean(body.adminAuthenticated))).catch(()=>{}); }, []);
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
    {plans.slice(0, 4).map(plan => <Link className="compact-plan-item" href={`/plan/${encodeURIComponent(plan.id)}`} key={plan.id}><span><strong>{plan.title}</strong><small>{plan.destination} · {formatDate(plan.startDate)}</small></span><ArrowRight /></Link>)}
    {!loading && !plans.length && <p className="compact-plan-empty">저장된 계획이 없어요.</p>}
  </div>;

  return <section className="library-panel" aria-labelledby="plan-list-title">
    <div className="library-heading"><div><span className="library-kicker"><CalendarDays /> {trash ? 'TRASH' : 'TRIP PLANS'}</span><h1 id="plan-list-title">{trash ? '휴지통' : '여행 계획 목록'}</h1><p>{trash ? '7일 동안 보관된 계획이에요.' : '함께 만든 여행을 다시 열어보세요.'}</p></div><span className="library-count">{loading ? '불러오는 중' : `${plans.length}개`}</span></div>
    <label className="library-search"><Search /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="여행 이름이나 도시로 검색" aria-label="여행 계획 검색" /></label>
    {adminAuthenticated&&<div className="library-admin-bar"><span><LockKeyhole/>관리자 모드</span><label><input type="checkbox" checked={plans.length>0&&plans.every(plan=>selectedIds.has(plan.id))} onChange={event=>setSelectedIds(event.target.checked?new Set(plans.map(plan=>plan.id)):new Set())}/>현재 목록 전체 선택</label><button type="button" disabled={!selectedIds.size||adminBusy} onClick={()=>void runAdminDelete(trash?'purge':'trash',[...selectedIds])}>{trash?'선택 영구 삭제':'선택 삭제'}</button>{trash&&<button type="button" className="is-danger" disabled={!plans.length||adminBusy} onClick={()=>void runAdminDelete('empty-trash')}>휴지통 비우기</button>}</div>}
    {notice && <output className="library-notice is-success">{notice}</output>}
    {error && <div className="library-notice">{error}</div>}
    <div className="library-grid">
      {!loading && !plans.length && !error && <div className="library-empty"><CalendarDays /><strong>{search ? '검색 결과가 없어요.' : trash ? '휴지통이 비어 있어요.' : '아직 저장된 계획이 없어요.'}</strong><span>{search ? '다른 이름이나 도시로 찾아보세요.' : trash ? '삭제한 계획은 7일 동안 이곳에 보관돼요.' : '첫 여행 계획을 만들어 목록에 저장해보세요.'}</span>{!trash && <Link href="/plan/new?mode=domestic">새 계획 세우기<ArrowRight /></Link>}</div>}
      {plans.map(plan => trash ? <article className="library-card trash-card" key={plan.id}>{adminAuthenticated&&<input className="library-card-check" type="checkbox" checked={selectedIds.has(plan.id)} onChange={()=>toggleSelection(plan.id)} aria-label={`${plan.title} 선택`}/>}<div className="library-card-top"><span className="library-destination"><MapPin />{plan.destination}</span><span className="library-lock"><Trash2 />휴지통</span></div><h2>{plan.title}</h2><p><CalendarDays />{formatDate(plan.startDate)} — {formatDate(plan.endDate)}<span>·</span>{plan.people}명</p><div className="library-card-bottom"><small>{formatTrashExpiry(plan.deletedAt)}</small><div className="trash-card-actions"><button type="button" className="trash-restore-button" onClick={()=>void restorePlan(plan)} disabled={restoringId===plan.id||adminBusy}>{restoringId===plan.id?'복원 중…':'복원'}</button>{adminAuthenticated&&<button type="button" className="trash-restore-button is-danger" onClick={()=>void runAdminDelete('purge',[plan.id])} disabled={adminBusy}>영구 삭제</button>}</div></div></article> : adminAuthenticated ? <article className="library-card admin-library-card" key={plan.id}><input className="library-card-check" type="checkbox" checked={selectedIds.has(plan.id)} onChange={()=>toggleSelection(plan.id)} aria-label={`${plan.title} 선택`}/><Link className="admin-card-link" href={`/plan/${encodeURIComponent(plan.id)}`}><div className="library-card-top"><span className="library-destination"><MapPin />{plan.destination}</span>{plan.passwordProtected&&<span className="library-lock"><LockKeyhole/>비밀번호</span>}</div><h2>{plan.title}</h2><p><CalendarDays />{formatDate(plan.startDate)} — {formatDate(plan.endDate)}<span>·</span>{plan.people}명</p></Link><div className="library-card-bottom"><small>최근 수정 {formatUpdated(plan.updatedAt)}</small><div className="admin-card-actions"><Link href={`/plan/${encodeURIComponent(plan.id)}`}><ExternalLink/>열기·수정</Link><button type="button" onClick={()=>void runAdminDelete('trash',[plan.id])} disabled={adminBusy}><Trash2/>삭제</button></div></div></article> : <Link className="library-card" href={`/plan/${encodeURIComponent(plan.id)}`} key={plan.id}><div className="library-card-top"><span className="library-destination"><MapPin />{plan.destination}</span>{plan.passwordProtected && <span className="library-lock"><LockKeyhole />비밀번호</span>}</div><h2>{plan.title}</h2><p><CalendarDays />{formatDate(plan.startDate)} — {formatDate(plan.endDate)}<span>·</span>{plan.people}명</p><div className="library-card-bottom"><small>최근 수정 {formatUpdated(plan.updatedAt)}</small><ArrowRight /></div></Link>)}
    </div>
    {nextOffset!==null&&<button type="button" className="trash-restore-button library-more-button" onClick={()=>void loadPlans(search,true,nextOffset)} disabled={loadingMore}>{loadingMore?'불러오는 중…':'계획 더 보기'}</button>}
  </section>;
}
