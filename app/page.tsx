'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronDown, Compass, LockKeyhole, LogOut, MapPin, MessageSquareText, Plane, Settings2, Trash2 } from 'lucide-react';
import type { PlanSummary } from '@/components/plan-library';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

type Season = {
  key: 'spring' | 'summer' | 'autumn' | 'winter';
  label: string;
  message: string;
};

type ThemeKey = Season['key'] | 'auto';

function currentSeason(): Season {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 5) return { key: 'spring', label: '봄', message: '꽃이 피는 계절, 가볍게 떠나볼까요?' };
  if (month >= 6 && month <= 8) return { key: 'summer', label: '여름', message: '햇살 좋은 날엔 여행이 제일 잘 어울려요.' };
  if (month >= 9 && month <= 11) return { key: 'autumn', label: '가을', message: '선선한 바람을 따라 새로운 곳으로.' };
  return { key: 'winter', label: '겨울', message: '따뜻한 기억을 만들러 떠나볼까요?' };
}

function seasonFor(key: Exclude<ThemeKey, 'auto'>): Season {
  const seasons: Record<Exclude<ThemeKey, 'auto'>, Season> = {
    spring: { key: 'spring', label: '봄', message: '꽃이 피는 계절, 가볍게 떠나볼까요?' },
    summer: { key: 'summer', label: '여름', message: '햇살 좋은 날엔 여행이 제일 잘 어울려요.' },
    autumn: { key: 'autumn', label: '가을', message: '선선한 바람을 따라 새로운 곳으로.' },
    winter: { key: 'winter', label: '겨울', message: '따뜻한 기억을 만들러 떠나볼까요?' },
  };
  return seasons[key];
}

export default function HomePage() {
  const autoSeason = currentSeason();
  const [theme, setTheme] = useState<ThemeKey>('auto');
  const [themeOpen, setThemeOpen] = useState(false);
  const season = theme === 'auto' ? autoSeason : seasonFor(theme);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [planMenuOpen, setPlanMenuOpen] = useState(false);
  const [overseasMessage, setOverseasMessage] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [draftTitle, setDraftTitle] = useState('이 기기의 여행 초안');
  const [adminAuthenticated, setAdminAuthenticated] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminError, setAdminError] = useState('');
  const [adminChecking, setAdminChecking] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/plans', { cache: 'no-store' })
      .then(response => response.json() as Promise<{ items?: PlanSummary[] }>)
      .then(body => { if (alive) setPlans(body.items || []); })
      .catch(() => { if (alive) setPlans([]); });
    fetch('/api/admin/session', { cache: 'no-store' }).then(response=>response.json() as Promise<{adminAuthenticated?:boolean}>).then(body=>{if(alive)setAdminAuthenticated(Boolean(body.adminAuthenticated))}).catch(()=>{});

    const saved = window.localStorage.getItem('route-note-stops');
    const settings = window.localStorage.getItem('route-note-trip-settings');
    const savedTheme = window.localStorage.getItem('route-note-theme') as ThemeKey | null;
    if (savedTheme && (savedTheme === 'auto' || ['spring', 'summer', 'autumn', 'winter'].includes(savedTheme))) setTheme(savedTheme);
    if (saved) {
      setHasDraft(true);
      try {
        const parsed = JSON.parse(settings || '{}') as { title?: string };
        if (parsed.title) setDraftTitle(parsed.title);
      } catch {}
    }
    return () => { alive = false; };
  }, []);

  const chooseTheme = (next: ThemeKey) => {
    setTheme(next);
    setThemeOpen(false);
    window.localStorage.setItem('route-note-theme', next);
  };

  const clearDraft = () => {
    window.localStorage.removeItem('route-note-stops');
    window.localStorage.removeItem('route-note-trip-settings');
    setHasDraft(false);
  };
  const loginAdmin = async () => {
    if (!adminPassword) return;
    setAdminChecking(true); setAdminError('');
    try {
      const response = await fetch('/api/admin/session', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({password:adminPassword}) });
      const body = await response.json() as {adminAuthenticated?:boolean;message?:string};
      if (!response.ok || !body.adminAuthenticated) throw new Error(body.message || '관리자 비밀번호가 올바르지 않습니다.');
      setAdminAuthenticated(true); setAdminPassword(''); setAdminOpen(false);
    } catch (reason) { setAdminError(reason instanceof Error ? reason.message : '관리자 로그인을 확인하지 못했어요.'); }
    finally { setAdminChecking(false); }
  };
  const logoutAdmin = async () => { await fetch('/api/admin/session',{method:'DELETE'}).catch(()=>{});setAdminAuthenticated(false); };

  return <main className={`home-landing season-${season.key}`}>
    <div className="home-season-wash" aria-hidden="true" />
    <header className="landing-topbar">
      <Link className="landing-brand" href="/"><span className="landing-brand-mark"><MapPin /></span><span>여행을 떠나요<span className="brand-note">♬</span></span></Link>
      <nav className="landing-nav" aria-label="주요 메뉴">
        <div className="plan-menu-wrap" onMouseEnter={() => setPlanMenuOpen(true)} onMouseLeave={() => setPlanMenuOpen(false)}>
          <Link className="landing-nav-link plan-menu-trigger" href="/plans" aria-haspopup="true" aria-expanded={planMenuOpen}><span>계획 목록</span><ChevronDown /></Link>
          {planMenuOpen && <div className="plan-hover-menu">
            <div className="plan-hover-heading"><span>최근 여행</span><Link href="/plans">전체 보기<ArrowRight /></Link></div>
            {plans.slice(0, 4).map(plan => <Link className="plan-hover-item" href={`/plan/${encodeURIComponent(plan.id)}`} key={plan.id}><span><strong>{plan.title}</strong><small>{plan.destination} · {plan.people}명</small></span><ArrowRight /></Link>)}
            {!plans.length && <p className="plan-hover-empty">아직 저장된 계획이 없어요.</p>}
          </div>}
        </div>
        <Link className="landing-nav-link trash-nav-link" href="/trash"><Trash2 /><span>휴지통</span></Link>
        <Link className="landing-nav-link feedback-nav-link" href="/feedback"><MessageSquareText /><span>피드백</span></Link>
        <div className="theme-menu-wrap">
          <button type="button" className="theme-button" onClick={() => setThemeOpen(value => !value)} aria-label="테마 설정" aria-haspopup="true" aria-expanded={themeOpen}><Settings2 /><span>테마</span></button>
          {themeOpen && <div className="theme-menu" role="menu"><strong>배경 테마</strong><button type="button" className={theme === 'auto' ? 'is-selected' : ''} onClick={() => chooseTheme('auto')}><span className="theme-swatch auto-swatch" />오늘의 계절<small>자동</small></button>{(['spring', 'summer', 'autumn', 'winter'] as const).map(key => <button type="button" className={theme === key ? 'is-selected' : ''} key={key} onClick={() => chooseTheme(key)}><span className={`theme-swatch ${key}-swatch`} />{seasonFor(key).label}</button>)}</div>}
        </div>
      </nav>
    </header>

    <section className="landing-hero">
      <div className="landing-kicker"><span className="kicker-dot" />{season.label}의 여행 노트</div>
      <h1>여행을 떠나요<span className="hero-note">♬</span></h1>
      <p className="landing-lede">{season.message}<br /><span>오늘의 마음이 가는 곳으로.</span></p>
      <div className="departure-question"><span>어디로 떠나시나요?</span><small>여행의 첫 장면을 골라보세요</small></div>
      <div className="departure-choices">
        <Link className="departure-card domestic-card" href="/plan/new?mode=domestic"><span className="departure-icon"><Compass /></span><span className="departure-copy"><strong>국내로!</strong><small>가까운 곳부터 오늘을 채워요</small></span><ArrowRight className="departure-arrow" /><span className="sparkle-burst" aria-hidden="true">✦　✿　✧　❀　✦　❋</span></Link>
        <button type="button" className="departure-card overseas-card" onClick={() => setOverseasMessage(true)}><span className="departure-icon"><Plane /></span><span className="departure-copy"><strong>해외로!</strong><small>여권 챙기면 다시 만나요</small></span><ArrowRight className="departure-arrow" /><span className="plane-trail" aria-hidden="true">·　·　·　✈</span></button>
      </div>
      {overseasMessage && <button className="overseas-toast" type="button" onClick={() => setOverseasMessage(false)}><Plane /> 해외 여행 플래너는 준비 중이에요 ㅠㅠ <span>닫기</span></button>}
      {hasDraft && <div className="draft-pill"><span><small>이 기기에 남은 초안</small><strong>{draftTitle}</strong></span><div className="draft-pill-actions"><Link className="draft-pill-action" href="/plan/new?draft=1">계속 쓰기<ArrowRight /></Link><button type="button" onClick={clearDraft}>초안 삭제</button></div></div>}
    </section>
    <button type="button" className={`landing-admin-button ${adminAuthenticated?'is-active':''}`} onClick={()=>adminAuthenticated?void logoutAdmin():setAdminOpen(true)} title={adminAuthenticated?'관리자 모드 종료':'관리자 로그인'} aria-label={adminAuthenticated?'관리자 모드 종료':'관리자 로그인'}>{adminAuthenticated?<LogOut/>:<LockKeyhole/>}</button>
    <Dialog open={adminOpen} onOpenChange={open=>{setAdminOpen(open);if(!open){setAdminPassword('');setAdminError('')}}}><DialogContent className="password-dialog sm:max-w-[420px]"><DialogHeader><DialogTitle>관리자 로그인</DialogTitle></DialogHeader><label>관리자 비밀번호<Input type="password" value={adminPassword} onChange={event=>setAdminPassword(event.target.value)} onKeyDown={event=>{if(event.key==='Enter')void loginAdmin()}} placeholder="관리자 비밀번호"/></label>{adminError&&<div className="inline-notice">{adminError}</div>}<DialogFooter><Button variant="outline" onClick={()=>setAdminOpen(false)}>취소</Button><Button onClick={()=>void loginAdmin()} disabled={!adminPassword||adminChecking}>{adminChecking?'확인 중…':'로그인'}</Button></DialogFooter></DialogContent></Dialog>
    <footer className="landing-footer"><span className="landing-meta"><small>ver. 1.0</small><a href="https://github.com/whales-teatime/travel-note/releases" target="_blank" rel="noreferrer">GitHub Releases</a></span><span>TRAVEL NOTE</span></footer>
  </main>;
}
