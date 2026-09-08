'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarDays, ExternalLink, LockKeyhole, MapPin, Search, Star, Trash2 } from 'lucide-react';
import { readFavoritePlans, readRecentPlans, rememberPlanVisit, togglePlanFavorite, type LocalPlanSummary } from '@/lib/client-plan-history';
import { readJsonResponse } from '@/lib/client-json';
import { tr, useLanguage, type Language } from '@/lib/i18n';

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

function formatDate(value: string, language: Language) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'ko-KR', { month: 'numeric', day: 'numeric' }).format(date).replace(/\.\s/g, '. ');
}

function formatUpdated(value: string, language: Language) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

function formatTrashExpiry(value: string | undefined, language: Language) {
  if (!value) return tr(language, '삭제 예정일을 확인할 수 없어요.', 'The deletion date is unavailable.');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return tr(language, '7일 후 자동 삭제', 'Automatically deleted after 7 days');
  date.setDate(date.getDate() + 7);
  const formatted = new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'ko-KR', { month: 'numeric', day: 'numeric' }).format(date);
  return language === 'en' ? `Automatically deleted after 7 days · ${formatted}` : `7일 후 자동 삭제 · ${formatted}`;
}

export function PlanLibrary({ compact = false, trash = false }: { compact?: boolean; trash?: boolean }) {
  const { language } = useLanguage();
  const text = useCallback((korean: string, english: string) => tr(language, korean, english), [language]);
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
  const [recentPlans, setRecentPlans] = useState<LocalPlanSummary[]>([]);
  const [favoritePlans, setFavoritePlans] = useState<LocalPlanSummary[]>([]);

  const loadPlans = useCallback(async (value: string, append = false, offset = 0) => {
    if (append) setLoadingMore(true); else setLoading(true); setError('');
    try {
      const limit = compact ? 4 : 24;
      const response = await fetch(`/api/plans?search=${encodeURIComponent(value.trim())}${trash ? '&trash=1' : ''}&limit=${limit}&offset=${offset}`, { cache: 'no-store' });
      const body = await readJsonResponse<{ items?: PlanSummary[]; nextOffset?: number | null; message?: string }>(response);
      if (!response.ok) throw new Error(body.message || text('계획 목록을 불러오지 못했어요.', 'Could not load the plans.'));
      setPlans(current => append ? [...current, ...(body.items || [])] : body.items || []);
      if (!append) setSelectedIds(new Set());
      setNextOffset(body.nextOffset ?? null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : text('계획 목록을 불러오지 못했어요.', 'Could not load the plans.'));
    } finally { setLoading(false); setLoadingMore(false); }
  }, [trash, compact, text]);

  const restorePlan = async (plan: PlanSummary) => {
    if (!window.confirm(text(`“${plan.title}” 계획을 복원할까요?`, `Restore “${plan.title}”?`))) return;
    let password: string | undefined;
    let editPassword: string | undefined;
    const token = localStorage.getItem(`route-note-edit-token-${plan.id}`);
    let admin = adminAuthenticated;
    if (!token && !admin && plan.editPolicy === 'owner') {
      const entered = window.prompt(text('작성자 토큰이 없는 계획입니다. 관리자 비밀번호를 입력하세요.', 'This plan has no author token. Enter the admin password.'));
      if (entered === null) return;
      const response = await fetch('/api/admin/session', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({password: entered}) });
      const body = await readJsonResponse<{adminAuthenticated?: boolean; message?: string}>(response);
      if (!response.ok || !body.adminAuthenticated) { setError(body.message || text('관리자 비밀번호가 올바르지 않습니다.', 'The admin password is incorrect.')); return; }
      admin = true; setAdminAuthenticated(true);
    }
    if (!token && !admin && plan.passwordProtected) {
      const entered = window.prompt(text('열람 비밀번호를 입력하세요.', 'Enter the viewing password.'));
      if (entered === null) return;
      password = entered;
    }
    if (!admin && plan.editPolicy === 'password') {
      const entered = window.prompt(text('편집 비밀번호를 입력하세요.', 'Enter the editing password.'));
      if (entered === null) return;
      editPassword = entered;
    }
    setRestoringId(plan.id); setError('');
    try {
      const response = await fetch(`/api/plans/${encodeURIComponent(plan.id)}`, {
        method: 'POST', headers: {'Content-Type': 'application/json', ...(token ? {'x-plan-edit-token': token} : {})},
        body: JSON.stringify({action: 'restore', ...(password ? {password, passwordAuth: password} : {}), ...(editPassword ? {editPassword, editPasswordAuth: editPassword} : {})}),
      });
      const body = await readJsonResponse<{message?: string}>(response);
      if (!response.ok) throw new Error(body.message || text('계획을 복원하지 못했어요.', 'Could not restore the plan.'));
      setNotice(text('계획을 복원했어요.', 'Plan restored.'));
      await loadPlans(search);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : text('계획을 복원하지 못했어요.', 'Could not restore the plan.'));
    } finally { setRestoringId(null); }
  };

  const runAdminDelete = async (action: 'trash' | 'purge' | 'empty-trash', ids: string[] = []) => {
    const label = action === 'trash' ? text('선택한 계획을 휴지통으로 옮길까요?', 'Move the selected plans to the trash?') : action === 'purge' ? text('선택한 계획을 영구 삭제할까요? 이 작업은 되돌릴 수 없어요.', 'Permanently delete the selected plans? This cannot be undone.') : text('휴지통의 모든 계획을 영구 삭제할까요? 이 작업은 되돌릴 수 없어요.', 'Permanently delete everything in the trash? This cannot be undone.');
    if (!window.confirm(label)) return;
    setAdminBusy(true); setError('');
    try {
      const response = await fetch('/api/admin/plans', { method:'DELETE', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action, ...(action!=='empty-trash'?{ids}:{})}) });
      const body = await readJsonResponse<{message?:string}>(response);
      if (!response.ok) throw new Error(body.message || text('삭제 작업을 완료하지 못했어요.', 'The delete action could not be completed.'));
      setNotice(body.message || text('삭제 작업을 완료했어요.', 'Delete action completed.')); setSelectedIds(new Set()); await loadPlans(search);
    } catch (reason) { setError(reason instanceof Error ? reason.message : text('삭제 작업을 완료하지 못했어요.', 'The delete action could not be completed.')); }
    finally { setAdminBusy(false); }
  };

  const toggleSelection = (id: string) => setSelectedIds(current => { const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);return next; });
  const rememberVisit = (plan: LocalPlanSummary) => rememberPlanVisit(plan);
  const toggleFavorite = (plan: LocalPlanSummary) => { togglePlanFavorite(plan); setFavoritePlans(readFavoritePlans()); };

  useEffect(() => { void loadPlans(''); }, [loadPlans]);
  useEffect(() => { setRecentPlans(readRecentPlans()); setFavoritePlans(readFavoritePlans()); }, [text]);
  useEffect(() => { void fetch('/api/admin/session', {cache:'no-store'}).then(response=>readJsonResponse<{adminAuthenticated?:boolean}>(response)).then(body=>setAdminAuthenticated(Boolean(body.adminAuthenticated))).catch(()=>{}); }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const deleteNotice = sessionStorage.getItem('route-note-delete-notice');
    if (params.get('deleted') === '1' || deleteNotice) {
      setNotice(deleteNotice || text('계획을 휴지통으로 옮겼어요. 7일 후 자동 삭제됩니다.', 'Plan moved to the trash. It will be deleted after 7 days.'));
      sessionStorage.removeItem('route-note-delete-notice');
      if (params.get('deleted') === '1') window.history.replaceState({}, '', '/plans');
    }
  }, [text]);
  useEffect(() => {
    if (compact) return;
    const timer = window.setTimeout(() => void loadPlans(search), 220);
    return () => window.clearTimeout(timer);
  }, [search, loadPlans, compact]);

  if (compact) return <div className="compact-plan-list">
    {plans.slice(0, 4).map(plan => <Link className="compact-plan-item" href={`/plan/${encodeURIComponent(plan.id)}`} onClick={()=>rememberVisit(plan)} key={plan.id}><span><strong>{plan.title}</strong><small>{plan.destination} · {formatDate(plan.startDate, language)}</small></span><ArrowRight /></Link>)}
    {!loading && !plans.length && <p className="compact-plan-empty">{text('저장된 계획이 없어요.', 'No saved plans yet.')}</p>}
  </div>;

  return <section className="library-panel" aria-labelledby="plan-list-title">
    <div className="library-heading"><div><span className="library-kicker"><CalendarDays /> {trash ? 'TRASH' : 'TRIP PLANS'}</span><h1 id="plan-list-title">{trash ? text('휴지통', 'Trash') : text('여행 계획 목록', 'Travel plans')}</h1><p>{trash ? text('7일 동안 보관된 계획이에요.', 'Plans stay here for 7 days.') : text('함께 만든 여행을 다시 열어보세요.', 'Open a trip you made together.')}</p></div><span className="library-count">{loading ? text('불러오는 중', 'Loading') : `${plans.length}${text('개', ' ')}`}</span></div>
    <label className="library-search"><Search /><input value={search} onChange={event => setSearch(event.target.value)} placeholder={text('여행 이름이나 도시로 검색', 'Search by trip name or city')} aria-label={text('여행 계획 검색', 'Search travel plans')} /></label>
    {adminAuthenticated&&<div className="library-admin-bar"><span><LockKeyhole/>{text('관리자 모드', 'Admin mode')}</span><label><input type="checkbox" checked={plans.length>0&&plans.every(plan=>selectedIds.has(plan.id))} onChange={event=>setSelectedIds(event.target.checked?new Set(plans.map(plan=>plan.id)):new Set())}/>{text('현재 목록 전체 선택', 'Select all on this page')}</label><button type="button" disabled={!selectedIds.size||adminBusy} onClick={()=>void runAdminDelete(trash?'purge':'trash',[...selectedIds])}>{trash?text('선택 영구 삭제', 'Delete selected permanently'):text('선택 삭제', 'Delete selected')}</button>{trash&&<button type="button" className="is-danger" disabled={!plans.length||adminBusy} onClick={()=>void runAdminDelete('empty-trash')}>{text('휴지통 비우기', 'Empty trash')}</button>}</div>}
    {notice && <output className="library-notice is-success" aria-live="polite">{notice}</output>}
    {error && <div className="library-notice">{error}</div>}
    {!trash && !search.trim() && (recentPlans.length > 0 || favoritePlans.length > 0) && <div className="library-device-lists">
      {recentPlans.length > 0 && <section className="library-device-list" aria-labelledby="recent-plans-title"><div className="library-device-list-heading"><h2 id="recent-plans-title">{text('최근 접속한 계획', 'Recently opened')}</h2><span>{text('이 기기에만 표시', 'This device only')}</span></div><div className="library-device-items">{recentPlans.slice(0, 6).map(plan => <Link key={plan.id} href={`/plan/${encodeURIComponent(plan.id)}`} onClick={()=>rememberVisit(plan)}><span><strong>{plan.title}</strong><small>{plan.destination} · {formatDate(plan.startDate, language)}</small></span><ArrowRight /></Link>)}</div></section>}
      {favoritePlans.length > 0 && <section className="library-device-list" aria-labelledby="favorite-plans-title"><div className="library-device-list-heading"><h2 id="favorite-plans-title">{text('즐겨찾기', 'Favorites')}</h2><span>{text('이 기기에만 저장', 'Saved on this device')}</span></div><div className="library-device-items">{favoritePlans.slice(0, 6).map(plan => <Link key={plan.id} href={`/plan/${encodeURIComponent(plan.id)}`} onClick={()=>rememberVisit(plan)}><span><strong>{plan.title}</strong><small>{plan.destination} · {formatDate(plan.startDate, language)}</small></span><ArrowRight /></Link>)}</div></section>}
    </div>}
    <div className="library-grid">
      {!loading && !plans.length && !error && <div className="library-empty"><CalendarDays /><strong>{search ? text('검색 결과가 없어요.', 'No matching plans.') : trash ? text('휴지통이 비어 있어요.', 'The trash is empty.') : text('아직 저장된 계획이 없어요.', 'No saved plans yet.')}</strong><span>{search ? text('다른 이름이나 도시로 찾아보세요.', 'Try another name or city.') : trash ? text('삭제한 계획은 7일 동안 이곳에 보관돼요.', 'Deleted plans stay here for 7 days.') : text('첫 여행 계획을 만들어 목록에 저장해보세요.', 'Create your first travel plan to see it here.')}</span>{!trash && <Link href="/plan/new?mode=domestic">{text('새 계획 세우기', 'Create a plan')}<ArrowRight /></Link>}</div>}
      {plans.map(plan => {
        const favorite = favoritePlans.some(item => item.id === plan.id);
        const planHref = `/plan/${encodeURIComponent(plan.id)}`;
        if (trash) return <article className="library-card trash-card" key={plan.id}>{adminAuthenticated&&<input className="library-card-check" type="checkbox" checked={selectedIds.has(plan.id)} onChange={()=>toggleSelection(plan.id)} aria-label={`${plan.title} ${text('선택', 'select')}`}/>}<div className="library-card-top"><span className="library-destination"><MapPin />{plan.destination}</span><span className="library-lock"><Trash2 />{text('휴지통', 'Trash')}</span></div><h2>{plan.title}</h2><p><CalendarDays />{formatDate(plan.startDate, language)} — {formatDate(plan.endDate, language)}<span>·</span>{plan.people}{text('명', ' people')}</p><div className="library-card-bottom"><small>{formatTrashExpiry(plan.deletedAt, language)}</small><div className="trash-card-actions"><button type="button" className="trash-restore-button" onClick={()=>void restorePlan(plan)} disabled={restoringId===plan.id||adminBusy}>{restoringId===plan.id?text('복원 중…', 'Restoring…'):text('복원', 'Restore')}</button>{adminAuthenticated&&<button type="button" className="trash-restore-button is-danger" onClick={()=>void runAdminDelete('purge',[plan.id])} disabled={adminBusy}>{text('영구 삭제', 'Delete permanently')}</button>}</div></div></article>;
        if (adminAuthenticated) return <article className="library-card admin-library-card" key={plan.id}><input className="library-card-check" type="checkbox" checked={selectedIds.has(plan.id)} onChange={()=>toggleSelection(plan.id)} aria-label={`${plan.title} ${text('선택', 'select')}`}/><Link className="admin-card-link" href={planHref} onClick={()=>rememberVisit(plan)}><div className="library-card-top"><span className="library-destination"><MapPin />{plan.destination}</span>{plan.passwordProtected&&<span className="library-lock"><LockKeyhole/>{text('비밀번호', 'Password')}</span>}</div><h2>{plan.title}</h2><p><CalendarDays />{formatDate(plan.startDate, language)} — {formatDate(plan.endDate, language)}<span>·</span>{plan.people}{text('명', ' people')}</p></Link><div className="library-card-bottom"><small>{text('최근 수정', 'Updated')} {formatUpdated(plan.updatedAt, language)}</small><div className="admin-card-actions"><button type="button" className={`library-favorite-button ${favorite?'is-favorite':''}`} onClick={()=>toggleFavorite(plan)} aria-label={favorite?text('즐겨찾기에서 제거', 'Remove from favorites'):text('즐겨찾기에 추가', 'Add to favorites')}><Star /></button><Link href={planHref} onClick={()=>rememberVisit(plan)}><ExternalLink/>{text('열기·수정', 'Open · edit')}</Link><button type="button" onClick={()=>void runAdminDelete('trash',[plan.id])} disabled={adminBusy}><Trash2/>{text('삭제', 'Delete')}</button></div></div></article>;
        return <article className="library-card" key={plan.id}><Link className="library-card-link" href={planHref} onClick={()=>rememberVisit(plan)}><div className="library-card-top"><span className="library-destination"><MapPin />{plan.destination}</span>{plan.passwordProtected && <span className="library-lock"><LockKeyhole />{text('비밀번호', 'Password')}</span>}</div><h2>{plan.title}</h2><p><CalendarDays />{formatDate(plan.startDate, language)} — {formatDate(plan.endDate, language)}<span>·</span>{plan.people}{text('명', ' people')}</p><div className="library-card-bottom"><small>{text('최근 수정', 'Updated')} {formatUpdated(plan.updatedAt, language)}</small><ArrowRight /></div></Link><button type="button" className={`library-favorite-button ${favorite?'is-favorite':''}`} onClick={()=>toggleFavorite(plan)} aria-label={favorite?text('즐겨찾기에서 제거', 'Remove from favorites'):text('즐겨찾기에 추가', 'Add to favorites')}><Star /></button></article>;
      })}
    </div>
    {nextOffset!==null&&<button type="button" className="trash-restore-button library-more-button" onClick={()=>void loadPlans(search,true,nextOffset)} disabled={loadingMore}>{loadingMore?text('불러오는 중…', 'Loading…'):text('계획 더 보기', 'Load more plans')}</button>}
  </section>;
}
