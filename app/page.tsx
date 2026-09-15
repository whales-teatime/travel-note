'use client';

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { Activity, ArrowRight, Bird, BookOpen, ChevronDown, Compass, LockKeyhole, LogOut, MapPin, MessageSquareText, Plane, Settings2, Trash2 } from 'lucide-react';
import type { PlanSummary } from '@/components/plan-library';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { WhaleSupportButton } from '@/components/whale-support-button';
import { readJsonResponse } from '@/lib/client-json';
import { tr, useCurrency, useLanguage } from '@/lib/i18n';

type Season = {
  key: 'spring' | 'summer' | 'autumn' | 'winter';
  label: string;
  message: string;
  englishLabel: string;
  englishMessage: string;
};

type ThemeKey = Season['key'] | 'auto';
type ThemeStyle = 'scenic' | 'character';

const effectParticles = {
  spring: [
    [4, 13, 0, 34, 16], [12, 16, 5, -26, 12], [21, 12, 8, 40, 14], [29, 18, 2, -34, 11],
    [39, 14, 7, 28, 15], [48, 17, 11, -42, 12], [58, 13, 3, 32, 14], [67, 19, 9, -30, 11],
    [76, 15, 6, 38, 16], [84, 18, 1, -36, 12], [92, 14, 10, 24, 14], [97, 20, 4, -28, 11],
  ],
  autumn: [
    [3, 16, 1, 48, 18], [14, 20, 9, -42, 15], [27, 18, 4, 56, 17], [41, 22, 13, -50, 14],
    [55, 17, 7, 42, 18], [68, 21, 2, -58, 15], [81, 19, 11, 50, 17], [94, 23, 6, -44, 14],
  ],
  winter: [
    [2, 12, 1, 22, 10], [8, 17, 8, -18, 14], [15, 14, 4, 20, 9], [22, 19, 12, -24, 12],
    [30, 13, 6, 18, 11], [37, 18, 2, -20, 15], [44, 15, 10, 24, 9], [51, 20, 5, -22, 13],
    [58, 14, 11, 18, 10], [65, 17, 3, -24, 14], [72, 12, 9, 20, 9], [79, 19, 1, -18, 13],
    [86, 15, 7, 24, 11], [93, 18, 13, -22, 14], [98, 13, 4, 16, 9],
  ],
} as const;

function SeasonalEffect({ season }: { season: Season['key'] }) {
  if (season === 'summer') {
    return <div className="seasonal-effect seasonal-effect-summer" aria-hidden="true"><Bird className="summer-gull summer-gull-one" /><Bird className="summer-gull summer-gull-two" /></div>;
  }
  const glyphs = season === 'spring' ? ['❀', '✿', '❀'] : season === 'autumn' ? ['🍂', '🍁', '🍂'] : ['•', '❄', '•'];
  return <div className={`seasonal-effect seasonal-effect-${season}`} aria-hidden="true">{effectParticles[season].map(([left, duration, delay, drift, size], index) => <span key={`${season}-${index}`} style={{ left: `${left}%`, fontSize: `${size}px`, animationDuration: `${duration}s`, animationDelay: `-${delay}s`, '--season-drift': `${drift}px` } as CSSProperties}>{glyphs[index % glyphs.length]}</span>)}</div>;
}

function currentSeason(): Season {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 5) return { key: 'spring', label: '봄', message: '꽃이 피는 계절, 가볍게 떠나볼까요?', englishLabel: 'Spring', englishMessage: 'A season in bloom. Shall we take a little trip?' };
  if (month >= 6 && month <= 8) return { key: 'summer', label: '여름', message: '햇살 좋은 날엔 여행이 제일 잘 어울려요.', englishLabel: 'Summer', englishMessage: 'Sunny days were made for getting away.' };
  if (month >= 9 && month <= 11) return { key: 'autumn', label: '가을', message: '선선한 바람을 따라 새로운 곳으로.', englishLabel: 'Autumn', englishMessage: 'Follow the crisp breeze somewhere new.' };
  return { key: 'winter', label: '겨울', message: '따뜻한 기억을 만들러 떠나볼까요?', englishLabel: 'Winter', englishMessage: 'Let’s go make a few warm memories.' };
}

function seasonFor(key: Exclude<ThemeKey, 'auto'>): Season {
  const seasons: Record<Exclude<ThemeKey, 'auto'>, Season> = {
    spring: { key: 'spring', label: '봄', message: '꽃이 피는 계절, 가볍게 떠나볼까요?', englishLabel: 'Spring', englishMessage: 'A season in bloom. Shall we take a little trip?' },
    summer: { key: 'summer', label: '여름', message: '햇살 좋은 날엔 여행이 제일 잘 어울려요.', englishLabel: 'Summer', englishMessage: 'Sunny days were made for getting away.' },
    autumn: { key: 'autumn', label: '가을', message: '선선한 바람을 따라 새로운 곳으로.', englishLabel: 'Autumn', englishMessage: 'Follow the crisp breeze somewhere new.' },
    winter: { key: 'winter', label: '겨울', message: '따뜻한 기억을 만들러 떠나볼까요?', englishLabel: 'Winter', englishMessage: 'Let’s go make a few warm memories.' },
  };
  return seasons[key];
}

export default function HomePage() {
  const { language, setLanguage } = useLanguage();
  const { currency, setCurrency } = useCurrency(language);
  const autoSeason = currentSeason();
  const [theme, setTheme] = useState<ThemeKey>('auto');
  const [themeStyle, setThemeStyle] = useState<ThemeStyle>('scenic');
  const [themeOpen, setThemeOpen] = useState(false);
  const season = theme === 'auto' ? autoSeason : seasonFor(theme);
  const seasonLabel = language === 'en' ? season.englishLabel : season.label;
  const seasonMessage = language === 'en' ? season.englishMessage : season.message;
  const text = (korean: string, english: string) => tr(language, korean, english);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [planMenuOpen, setPlanMenuOpen] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [adminAuthenticated, setAdminAuthenticated] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminError, setAdminError] = useState('');
  const [adminChecking, setAdminChecking] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/plans', { cache: 'no-store' })
      .then(response => readJsonResponse<{ items?: PlanSummary[] }>(response))
      .then(body => { if (alive) setPlans(body.items || []); })
      .catch(() => { /* Keep the current list when a transient response is empty. */ });
    fetch('/api/admin/session', { cache: 'no-store' }).then(response=>readJsonResponse<{adminAuthenticated?:boolean}>(response)).then(body=>{if(alive)setAdminAuthenticated(Boolean(body.adminAuthenticated))}).catch(()=>{});

    const saved = window.localStorage.getItem('route-note-stops');
    const settings = window.localStorage.getItem('route-note-trip-settings');
    const savedTheme = window.localStorage.getItem('route-note-theme') as ThemeKey | null;
    const savedThemeStyle = window.localStorage.getItem('route-note-theme-style') as ThemeStyle | null;
    if (savedTheme && (savedTheme === 'auto' || ['spring', 'summer', 'autumn', 'winter'].includes(savedTheme))) setTheme(savedTheme);
    if (savedThemeStyle === 'scenic' || savedThemeStyle === 'character') setThemeStyle(savedThemeStyle);
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

  const chooseThemeStyle = (next: ThemeStyle) => {
    setThemeStyle(next);
    window.localStorage.setItem('route-note-theme-style', next);
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
      const body = await readJsonResponse<{adminAuthenticated?:boolean;message?:string}>(response);
      if (!response.ok || !body.adminAuthenticated) throw new Error(body.message || '관리자 비밀번호가 올바르지 않습니다.');
      setAdminAuthenticated(true); setAdminPassword(''); setAdminOpen(false);
    } catch (reason) { setAdminError(reason instanceof Error ? reason.message : '관리자 로그인을 확인하지 못했어요.'); }
    finally { setAdminChecking(false); }
  };
  const logoutAdmin = async () => { await fetch('/api/admin/session',{method:'DELETE'}).catch(()=>{});setAdminAuthenticated(false); };

  return <main className={`home-landing season-${season.key} ${themeStyle}-theme`}>
    <div className="home-season-wash" aria-hidden="true" />
    <SeasonalEffect season={season.key} />
    <header className="landing-topbar">
      <Link className="landing-brand" href="/"><span className="landing-brand-mark"><MapPin /></span><span>{text('여행을 떠나요', 'Let’s Travel')}<span className="brand-note">♬</span></span></Link>
      <nav className="landing-nav" aria-label={text('주요 메뉴', 'Main menu')}>
        <div className="plan-menu-wrap" onMouseEnter={() => setPlanMenuOpen(true)} onMouseLeave={() => setPlanMenuOpen(false)}>
          <Link className="landing-nav-link plan-menu-trigger" href="/plans" aria-haspopup="true" aria-expanded={planMenuOpen}><span>{text('계획 목록', 'Plans')}</span><ChevronDown /></Link>
          {planMenuOpen && <div className="plan-hover-menu">
            <div className="plan-hover-heading"><span>{text('최근 여행', 'Recent trips')}</span><Link href="/plans">{text('전체 보기', 'View all')}<ArrowRight /></Link></div>
            {plans.slice(0, 4).map(plan => <Link className="plan-hover-item" href={`/plan/${encodeURIComponent(plan.id)}`} key={plan.id}><span><strong>{plan.title}</strong><small>{plan.destination} · {plan.people}{text('명', ' people')}</small></span><ArrowRight /></Link>)}
            {!plans.length && <p className="plan-hover-empty">{text('아직 저장된 계획이 없어요.', 'No saved plans yet.')}</p>}
          </div>}
        </div>
        <Link className="landing-nav-link guide-nav-link" href="/guide"><BookOpen /><span>{text('사용 안내', 'Guide')}</span></Link>
        <Link className="landing-nav-link trash-nav-link" href="/trash"><Trash2 /><span>{text('휴지통', 'Trash')}</span></Link>
        <Link className="landing-nav-link feedback-nav-link" href="/feedback"><MessageSquareText /><span>{text('피드백', 'Feedback')}</span></Link>
        <div className="theme-menu-wrap">
          <button type="button" className="theme-button" onClick={() => setThemeOpen(value => !value)} aria-label={text('테마 및 언어 설정', 'Theme and language settings')} aria-haspopup="true" aria-expanded={themeOpen}><Settings2 /><span>{text('설정', 'Settings')}</span></button>
          {themeOpen && <div className="theme-menu" role="menu">
            <strong>{text('배경 테마', 'Background')}</strong>
            <button type="button" className={theme === 'auto' ? 'is-selected' : ''} onClick={() => chooseTheme('auto')}><span className="theme-swatch auto-swatch" />{text('오늘의 계절', 'Today’s season')}<small>{text('자동', 'Auto')}</small></button>
            {(['spring', 'summer', 'autumn', 'winter'] as const).map(key => <button type="button" className={theme === key ? 'is-selected' : ''} key={key} onClick={() => chooseTheme(key)}><span className={`theme-swatch ${key}-swatch`} />{language === 'en' ? seasonFor(key).englishLabel : seasonFor(key).label}</button>)}
            <div className="theme-menu-divider" />
            <strong>{text('테마 스타일', 'Theme style')}</strong>
            <div className="theme-style-choice" aria-label={text('테마 스타일 선택', 'Choose theme style')}>
              <button type="button" className={themeStyle === 'scenic' ? 'is-selected' : ''} onClick={() => chooseThemeStyle('scenic')}>{text('풍경 테마', 'Scenery')}</button>
              <button type="button" className={themeStyle === 'character' ? 'is-selected' : ''} onClick={() => chooseThemeStyle('character')}>{text('캐릭터 테마', 'Character')}</button>
            </div>
            <div className="theme-menu-divider" />
            <strong>{text('언어', 'Language')}</strong>
            <div className="language-choice" aria-label={text('언어 선택', 'Choose language')}><button type="button" className={language === 'ko' ? 'is-selected' : ''} onClick={() => setLanguage('ko')}>한국어</button><button type="button" className={language === 'en' ? 'is-selected' : ''} onClick={() => setLanguage('en')}>English</button></div>
            <div className="theme-menu-divider" />
            <strong>{text('통화', 'Currency')}</strong>
            <div className="language-choice currency-choice" aria-label={text('통화 선택', 'Choose currency')}><button type="button" className={currency === 'KRW' ? 'is-selected' : ''} onClick={() => setCurrency('KRW')}>{text('원 (₩)', 'Won (₩)')}</button><button type="button" className={currency === 'USD' ? 'is-selected' : ''} onClick={() => setCurrency('USD')}>{text('달러 ($)', 'Dollar ($)')}</button></div>
          </div>}
        </div>
      </nav>
    </header>

    <section className="landing-hero">
      <div className="landing-kicker"><span className="kicker-dot" />{language === 'en' ? `${seasonLabel} travel notes` : `${seasonLabel}의 여행 노트`}</div>
      <h1>{text('여행을 떠나요', 'Let’s Travel')}<span className="hero-note">♬</span></h1>
      <p className="landing-lede">{seasonMessage}<br /><span>{text('오늘의 마음이 가는 곳으로.', 'Go where your heart feels like going today.')}</span></p>
      <div className="departure-question"><span>{text('어디로 떠나시나요?', 'Where are you headed?')}</span><small>{text('여행의 첫 장면을 골라보세요', 'Choose the first scene of your trip.')}</small></div>
      <div className="departure-choices">
        <Link className="departure-card domestic-card" href="/plan/new?mode=domestic"><span className="departure-icon"><Compass /></span><span className="departure-copy"><strong>{text('국내로!', 'Around Korea!')}</strong><small>{text('가까운 곳부터 오늘을 채워요', 'Map out your next Korean adventure.')}</small></span><ArrowRight className="departure-arrow" /><span className="sparkle-burst" aria-hidden="true">✦　✿　✧　❀　✦　❋</span></Link>
        <Link className="departure-card overseas-card" href="/plan/new?mode=overseas"><span className="departure-icon"><Plane /></span><span className="departure-copy"><strong>{text('해외로!', 'Explore the world!')}</strong><small>{text('여권 챙기고 세계지도로 출발', 'Plan your next adventure anywhere.')}</small></span><ArrowRight className="departure-arrow" /><span className="plane-trail" aria-hidden="true">·　·　·　✈</span></Link>
      </div>
      {hasDraft && <div className="draft-pill"><span><small>{text('이 기기에 남은 초안', 'Draft on this device')}</small><strong>{draftTitle || text('이 기기의 여행 초안', 'Untitled trip draft')}</strong></span><div className="draft-pill-actions"><Link className="draft-pill-action" href="/plan/new?draft=1">{text('계속 쓰기', 'Continue')}<ArrowRight /></Link><button type="button" onClick={clearDraft}>{text('초안 삭제', 'Delete draft')}</button></div></div>}
    </section>
    <WhaleSupportButton />
    {adminAuthenticated && <Link className="landing-admin-log-link" href="/admin"><Activity /><span>{text('접속 기록', 'Access logs')}</span></Link>}
    <button type="button" className={`landing-admin-button ${adminAuthenticated?'is-active':''}`} onClick={()=>adminAuthenticated?void logoutAdmin():setAdminOpen(true)} title={adminAuthenticated?text('관리자 모드 종료', 'Exit admin mode'):text('관리자 로그인', 'Admin login')} aria-label={adminAuthenticated?text('관리자 모드 종료', 'Exit admin mode'):text('관리자 로그인', 'Admin login')}>{adminAuthenticated?<LogOut/>:<LockKeyhole/>}</button>
    <Dialog open={adminOpen} onOpenChange={open=>{setAdminOpen(open);if(!open){setAdminPassword('');setAdminError('')}}}><DialogContent className="password-dialog sm:max-w-[420px]"><DialogHeader><DialogTitle>{text('관리자 로그인', 'Admin login')}</DialogTitle></DialogHeader><label>{text('관리자 비밀번호', 'Admin password')}<Input type="password" value={adminPassword} onChange={event=>setAdminPassword(event.target.value)} onKeyDown={event=>{if(event.key==='Enter')void loginAdmin()}} placeholder={text('관리자 비밀번호', 'Admin password')}/></label>{adminError&&<div className="inline-notice">{adminError}</div>}<DialogFooter><Button variant="outline" onClick={()=>setAdminOpen(false)}>{text('취소', 'Cancel')}</Button><Button onClick={()=>void loginAdmin()} disabled={!adminPassword||adminChecking}>{adminChecking?text('확인 중…', 'Checking…'):text('로그인', 'Log in')}</Button></DialogFooter></DialogContent></Dialog>
    <footer className="landing-footer"><span className="landing-meta"><small>ver. 1.0</small><a href="https://github.com/whales-teatime/travel-note/releases" target="_blank" rel="noreferrer">GitHub Releases</a></span><span>{text('TRAVEL NOTE', 'TRAVEL NOTE')}</span></footer>
  </main>;
}
