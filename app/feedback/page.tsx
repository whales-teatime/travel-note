'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarDays, Heart, MapPin, Send, ShieldCheck, Trash2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

type Feedback = { id: string; category: string; message: string; likes: number; createdAt: string };
const LIKED_KEY = 'travel-note-feedback-liked-v1';

function formatCreatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

function readLiked() {
  try {
    const value = JSON.parse(window.localStorage.getItem(LIKED_KEY) || '[]') as unknown;
    return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);
  } catch { return new Set<string>(); }
}

export default function FeedbackPage() {
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [category, setCategory] = useState('개선');
  const [message, setMessage] = useState('');
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [busyLike, setBusyLike] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [adminMode, setAdminMode] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Feedback | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadFeedback = async (append = false, offset = 0) => {
    if (append) setLoadingMore(true); else setError('');
    try {
      const response = await fetch(`/api/feedback?limit=30&offset=${offset}`, { cache: 'no-store' });
      const body = await response.json() as { items?: Feedback[]; nextOffset?: number | null; message?: string };
      if (!response.ok) throw new Error(body.message || '피드백을 불러오지 못했어요.');
      setFeedback(current => append ? [...current, ...(body.items || [])] : body.items || []);
      setNextOffset(body.nextOffset ?? null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '피드백을 불러오지 못했어요.'); }
    finally { setLoadingMore(false); }
  };

  useEffect(() => {
    setLiked(readLiked());
    void loadFeedback();
    void fetch('/api/admin/session', { cache: 'no-store' })
      .then(response => response.json() as Promise<{ adminAuthenticated?: boolean }>)
      .then(body => setAdminMode(Boolean(body.adminAuthenticated)))
      .catch(() => setAdminMode(false));
  }, []);

  const sendFeedback = async () => {
    if (!message.trim() || sending) return;
    setSending(true); setNotice(''); setError('');
    try {
      const response = await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category, message: message.trim() }) });
      const body = await response.json() as { item?: Feedback; message?: string };
      if (!response.ok || !body.item) throw new Error(body.message || '피드백을 보내지 못했어요.');
      setFeedback(current => [body.item as Feedback, ...current]);
      setMessage(''); setNotice('피드백을 남겼어요. 고마워요!');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '피드백을 보내지 못했어요.'); }
    finally { setSending(false); }
  };

  const likeFeedback = async (item: Feedback) => {
    if (liked.has(item.id) || busyLike) return;
    setBusyLike(item.id); setError('');
    try {
      const response = await fetch(`/api/feedback/${encodeURIComponent(item.id)}/like`, { method: 'POST' });
      const body = await response.json() as { likes?: number; message?: string };
      if (!response.ok || typeof body.likes !== 'number') throw new Error(body.message || '좋아요를 반영하지 못했어요.');
      const next = new Set(liked); next.add(item.id); setLiked(next);
      try { window.localStorage.setItem(LIKED_KEY, JSON.stringify([...next])); } catch { /* Keep the like active for this view. */ }
      setFeedback(current => current.map(entry => entry.id === item.id ? { ...entry, likes: body.likes as number } : entry));
    } catch (reason) { setError(reason instanceof Error ? reason.message : '좋아요를 반영하지 못했어요.'); }
    finally { setBusyLike(null); }
  };

  const deleteFeedback = async () => {
    if (!pendingDelete || deletingId) return;
    setDeletingId(pendingDelete.id); setError('');
    try {
      const response = await fetch(`/api/feedback/${encodeURIComponent(pendingDelete.id)}`, { method: 'DELETE' });
      const body = await response.json() as { deleted?: boolean; message?: string };
      if (!response.ok || !body.deleted) throw new Error(body.message || '피드백을 삭제하지 못했어요.');
      setFeedback(current => current.filter(item => item.id !== pendingDelete.id));
      setPendingDelete(null); setNotice('피드백을 삭제했어요.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '피드백을 삭제하지 못했어요.'); }
    finally { setDeletingId(null); }
  };

  return <main className="feedback-shell">
    <header className="plans-topbar feedback-topbar"><Link className="plans-brand" href="/"><span className="plans-brand-mark"><MapPin /></span>여행을 떠나요<span>♬</span></Link><Link className="plans-back" href="/plans"><ArrowLeft /> 계획 목록</Link></header>
    <div className="feedback-content">
      <section className="feedback-compose" aria-labelledby="feedback-title">
        <span className="library-kicker"><Send /> FEEDBACK</span>
        <h1 id="feedback-title">관리자에게 피드백 보내기</h1>
        <p>불편한 점이나 다음에 있으면 좋을 기능을 알려주세요.</p>
        <div className="feedback-form-row"><label>종류<select value={category} onChange={event => setCategory(event.target.value)}><option>개선</option><option>버그</option><option>제안</option><option>기타</option></select></label><label className="feedback-message-field">내용<Textarea value={message} maxLength={1000} onChange={event => setMessage(event.target.value)} placeholder="사용하면서 느낀 점을 적어주세요." /></label></div>
        <div className="feedback-form-bottom"><small>{message.length}/1,000</small><Button onClick={()=>void sendFeedback()} disabled={!message.trim()||sending}><Send />{sending ? '보내는 중…' : '보내기'}</Button></div>
        {notice && <output className="feedback-notice is-success" aria-live="polite">{notice}</output>}
        {error && <div className="feedback-notice" role="alert">{error}</div>}
      </section>
      <section className="feedback-list" aria-labelledby="feedback-list-title">
        <div className="feedback-list-heading"><div><span className="library-kicker"><CalendarDays /> COMMUNITY</span><h2 id="feedback-list-title">모두의 피드백</h2><p>공감되는 의견에 좋아요를 눌러주세요.</p></div><span>{feedback.length}개</span></div>
        {adminMode && <div className="feedback-admin-notice"><ShieldCheck /> 관리자 모드 · 피드백을 삭제할 수 있어요.</div>}
        {!feedback.length && !error && <div className="feedback-empty">아직 남겨진 피드백이 없어요.</div>}
        <div className="feedback-items">{feedback.map(item => <article className={`feedback-item ${adminMode ? 'is-admin' : ''}`} key={item.id}><div className="feedback-item-meta"><span className="feedback-category">{item.category}</span><time dateTime={item.createdAt}>{formatCreatedAt(item.createdAt)}</time></div><p>{item.message}</p>{adminMode && <button type="button" className="feedback-delete" onClick={() => setPendingDelete(item)} aria-label="이 피드백 삭제" title="피드백 삭제"><Trash2 /></button>}<button type="button" className={`feedback-like ${liked.has(item.id) ? 'is-liked' : ''}`} onClick={()=>void likeFeedback(item)} disabled={liked.has(item.id)||busyLike===item.id} aria-label={liked.has(item.id) ? '좋아요 취소 불가' : '이 피드백에 공감'}><Heart /> {item.likes}</button></article>)}</div>
        {nextOffset !== null && <Button variant="outline" className="feedback-more" onClick={()=>void loadFeedback(true,nextOffset)} disabled={loadingMore}>{loadingMore ? '불러오는 중…' : '피드백 더 보기'}</Button>}
      </section>
    </div>
    <AlertDialog open={Boolean(pendingDelete)} onOpenChange={open => { if (!open && !deletingId) setPendingDelete(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>이 피드백을 삭제할까요?</AlertDialogTitle><AlertDialogDescription>삭제하면 다시 복구할 수 없습니다.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={Boolean(deletingId)}>취소</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void deleteFeedback()} disabled={Boolean(deletingId)}>{deletingId ? '삭제 중…' : '삭제'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </main>;
}
