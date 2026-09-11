'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, ArrowLeft, Clock3, Globe2, MapPin, RefreshCw, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { readJsonResponse } from '@/lib/client-json';
import { tr, useLanguage } from '@/lib/i18n';

type AccessLog = { id: string; createdAt: string; path: string; status: number; country: string; city: string; region: string; visitor: string };
type AccessData = { summary?: { last24h?: number; last7d?: number; unique24h?: number }; items?: AccessLog[]; popular?: { path: string; total: number }[]; message?: string };

function formatAccessTime(value: string, language: 'ko' | 'en') {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(date);
}

export default function AdminPage() {
  const { language } = useLanguage();
  const text = useCallback((korean: string, english: string) => tr(language, korean, english), [language]);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [data, setData] = useState<AccessData>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const sessionResponse = await fetch('/api/admin/session', { cache: 'no-store' });
      const session = await readJsonResponse<{ adminAuthenticated?: boolean }>(sessionResponse);
      if (!session.adminAuthenticated) { setAuthorized(false); setLoading(false); return; }
      setAuthorized(true);
      const response = await fetch('/api/admin/access-logs', { cache: 'no-store' });
      const body = await readJsonResponse<AccessData>(response);
      if (!response.ok) throw new Error(body.message || text('접속 기록을 불러오지 못했어요.', 'Could not load access logs.'));
      setData(body);
    } catch (reason) {
      setAuthorized(current => current ?? false);
      setError(reason instanceof Error ? reason.message : text('접속 기록을 불러오지 못했어요.', 'Could not load access logs.'));
    } finally { setLoading(false); }
  }, [text]);

  useEffect(() => { void load(); }, [load]);

  if (authorized === false && !loading) return <main className="admin-dashboard-shell"><header className="plans-topbar"><Link className="plans-brand" href="/"><span className="plans-brand-mark"><MapPin /></span>{text('여행을 떠나요', 'Let’s Travel')}<span>♬</span></Link><Link className="plans-back" href="/"><ArrowLeft /> {text('메인으로', 'Home')}</Link></header><section className="admin-dashboard-empty"><Activity /><h1>{text('관리자 로그인이 필요해요.', 'Admin login required.')}</h1><p>{text('메인 화면 오른쪽 아래 자물쇠에서 관리자 로그인을 먼저 해주세요.', 'Log in with the small lock on the home screen first.')}</p><Link href="/">{text('메인으로 돌아가기', 'Back home')}<ArrowLeft /></Link></section></main>;

  const summary = data.summary || {};
  return <main className="admin-dashboard-shell"><header className="plans-topbar"><Link className="plans-brand" href="/"><span className="plans-brand-mark"><MapPin /></span>{text('여행을 떠나요', 'Let’s Travel')}<span>♬</span></Link><div className="admin-dashboard-actions"><Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw />{loading ? text('새로 고치는 중…', 'Refreshing…') : text('새로고침', 'Refresh')}</Button><Link className="plans-back" href="/"><ArrowLeft /> {text('메인으로', 'Home')}</Link></div></header><div className="admin-dashboard-content"><div className="admin-dashboard-heading"><div><span className="library-kicker"><Activity /> ADMIN</span><h1>{text('접속 기록', 'Access logs')}</h1><p>{text('최근 30일의 페이지 방문만 간단히 기록해요. 원본 IP는 저장하지 않고 가능한 경우 대략적인 도시만 표시합니다.', 'A lightweight view of page visits from the last 30 days. Raw IP addresses are never stored; a coarse city is shown when available.')}</p></div></div><div className="admin-stat-grid"><article><Clock3 /><span>{text('최근 24시간', 'Last 24 hours')}</span><strong>{summary.last24h || 0}</strong><small>{text('페이지 방문', 'page visits')}</small></article><article><Activity /><span>{text('최근 7일', 'Last 7 days')}</span><strong>{summary.last7d || 0}</strong><small>{text('페이지 방문', 'page visits')}</small></article><article><Users /><span>{text('최근 24시간 방문자', 'Visitors · 24 hours')}</span><strong>{summary.unique24h || 0}</strong><small>{text('익명 식별자 기준', 'anonymous identifiers')}</small></article></div>{error && <div className="admin-dashboard-error">{error}</div>}<div className="admin-dashboard-grid"><section className="admin-dashboard-panel"><div className="admin-panel-heading"><div><span className="library-kicker"><Globe2 /> POPULAR PAGES</span><h2>{text('많이 열린 페이지', 'Popular pages')}</h2></div><small>{text('최근 7일', 'Last 7 days')}</small></div>{data.popular?.length ? <div className="admin-popular-list">{data.popular.map(item => <div key={item.path}><code>{item.path}</code><strong>{item.total}</strong></div>)}</div> : <p className="admin-dashboard-muted">{text('아직 기록이 없어요.', 'No visits yet.')}</p>}</section><section className="admin-dashboard-panel"><div className="admin-panel-heading"><div><span className="library-kicker"><Clock3 /> RECENT</span><h2>{text('최근 접속', 'Recent visits')}</h2></div><small>{data.items?.length || 0}{text('건', ' records')}</small></div>{data.items?.length ? <div className="admin-access-list">{data.items.map(item => { const location = [item.city, item.region, item.country].filter(Boolean).join(', '); return <div key={item.id}><time>{formatAccessTime(item.createdAt, language)}</time><code>{item.path}</code><span title={location || undefined}>{location || '—'}{item.visitor ? ` · ${item.visitor}` : ''}</span><b className={item.status >= 400 ? 'is-error' : ''}>{item.status}</b></div>; })}</div> : <p className="admin-dashboard-muted">{text('아직 기록이 없어요.', 'No visits yet.')}</p>}</section></div></div></main>;
}
