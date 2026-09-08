'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarDays, Heart, MapPin, Send, ShieldCheck, Trash2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { readJsonResponse } from '@/lib/client-json';
import { tr, useLanguage } from '@/lib/i18n';

type Feedback = { id: string; category: string; message: string; likes: number; createdAt: string };
const LIKED_KEY = 'travel-note-feedback-liked-v1';

function formatCreatedAt(value: string, language: 'ko' | 'en') {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

function categoryLabel(value: string, language: 'ko' | 'en') {
  const labels: Record<string, [string, string]> = { 개선: ['개선', 'Improvement'], 버그: ['버그', 'Bug'], 제안: ['제안', 'Suggestion'], 기타: ['기타', 'Other'] };
  const pair = labels[value];
  return language === 'en' ? pair?.[1] || value : pair?.[0] || value;
}

function readLiked() {
  try {
    const value = JSON.parse(window.localStorage.getItem(LIKED_KEY) || '[]') as unknown;
    return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);
  } catch { return new Set<string>(); }
}

export default function FeedbackPage() {
  const { language } = useLanguage();
  const text = useCallback((korean: string, english: string) => tr(language, korean, english), [language]);
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

  const loadFeedback = useCallback(async (append = false, offset = 0) => {
    if (append) setLoadingMore(true); else setError('');
    try {
      const response = await fetch(`/api/feedback?limit=30&offset=${offset}`, { cache: 'no-store' });
      const body = await readJsonResponse<{ items?: Feedback[]; nextOffset?: number | null; message?: string }>(response);
      if (!response.ok) throw new Error(body.message || text('피드백을 불러오지 못했어요.', 'Could not load feedback.'));
      setFeedback(current => append ? [...current, ...(body.items || [])] : body.items || []);
      setNextOffset(body.nextOffset ?? null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : text('피드백을 불러오지 못했어요.', 'Could not load feedback.')); }
    finally { setLoadingMore(false); }
  }, [text]);

  useEffect(() => {
    setLiked(readLiked());
    void loadFeedback();
    void fetch('/api/admin/session', { cache: 'no-store' })
      .then(response => readJsonResponse<{ adminAuthenticated?: boolean }>(response))
      .then(body => setAdminMode(Boolean(body.adminAuthenticated)))
      .catch(() => setAdminMode(false));
  }, [loadFeedback]);

  const sendFeedback = async () => {
    if (!message.trim() || sending) return;
    setSending(true); setNotice(''); setError('');
    try {
      const response = await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category, message: message.trim() }) });
      const body = await readJsonResponse<{ item?: Feedback; message?: string }>(response);
      if (!response.ok || !body.item) throw new Error(body.message || text('피드백을 보내지 못했어요.', 'Could not send feedback.'));
      setFeedback(current => [body.item as Feedback, ...current]);
      setMessage(''); setNotice(text('피드백을 남겼어요. 고마워요!', 'Feedback sent. Thank you!'));
    } catch (reason) { setError(reason instanceof Error ? reason.message : text('피드백을 보내지 못했어요.', 'Could not send feedback.')); }
    finally { setSending(false); }
  };

  const likeFeedback = async (item: Feedback) => {
    if (liked.has(item.id) || busyLike) return;
    setBusyLike(item.id); setError('');
    try {
      const response = await fetch(`/api/feedback/${encodeURIComponent(item.id)}/like`, { method: 'POST' });
      const body = await readJsonResponse<{ likes?: number; message?: string }>(response);
      if (!response.ok || typeof body.likes !== 'number') throw new Error(body.message || text('좋아요를 반영하지 못했어요.', 'Could not update the like.'));
      const next = new Set(liked); next.add(item.id); setLiked(next);
      try { window.localStorage.setItem(LIKED_KEY, JSON.stringify([...next])); } catch { /* Keep the like active for this view. */ }
      setFeedback(current => current.map(entry => entry.id === item.id ? { ...entry, likes: body.likes as number } : entry));
    } catch (reason) { setError(reason instanceof Error ? reason.message : text('좋아요를 반영하지 못했어요.', 'Could not update the like.')); }
    finally { setBusyLike(null); }
  };

  const deleteFeedback = async () => {
    if (!pendingDelete || deletingId) return;
    setDeletingId(pendingDelete.id); setError('');
    try {
      const response = await fetch(`/api/feedback/${encodeURIComponent(pendingDelete.id)}`, { method: 'DELETE' });
      const body = await readJsonResponse<{ deleted?: boolean; message?: string }>(response);
      if (!response.ok || !body.deleted) throw new Error(body.message || text('피드백을 삭제하지 못했어요.', 'Could not delete feedback.'));
      setFeedback(current => current.filter(item => item.id !== pendingDelete.id));
      setPendingDelete(null); setNotice(text('피드백을 삭제했어요.', 'Feedback deleted.'));
    } catch (reason) { setError(reason instanceof Error ? reason.message : text('피드백을 삭제하지 못했어요.', 'Could not delete feedback.')); }
    finally { setDeletingId(null); }
  };

  return <main className="feedback-shell">
    <header className="plans-topbar feedback-topbar"><Link className="plans-brand" href="/"><span className="plans-brand-mark"><MapPin /></span>{text('여행을 떠나요', 'Let’s Travel')}<span>♬</span></Link><Link className="plans-back" href="/plans"><ArrowLeft /> {text('계획 목록', 'Plans')}</Link></header>
    <div className="feedback-content">
      <section className="feedback-compose" aria-labelledby="feedback-title">
        <span className="library-kicker"><Send /> FEEDBACK</span>
        <h1 id="feedback-title">{text('관리자에게 피드백 보내기', 'Send feedback')}</h1>
        <p>{text('불편한 점이나 다음에 있으면 좋을 기능을 알려주세요.', 'Tell us what felt awkward or what you would like to see next.')}</p>
        <div className="feedback-form-row"><label>{text('종류', 'Type')}<select value={category} onChange={event => setCategory(event.target.value)}><option value="개선">{text('개선', 'Improvement')}</option><option value="버그">{text('버그', 'Bug')}</option><option value="제안">{text('제안', 'Suggestion')}</option><option value="기타">{text('기타', 'Other')}</option></select></label><label className="feedback-message-field">{text('내용', 'Message')}<Textarea value={message} maxLength={1000} onChange={event => setMessage(event.target.value)} placeholder={text('사용하면서 느낀 점을 적어주세요.', 'Tell us what you think.')} /></label></div>
        <div className="feedback-form-bottom"><small>{message.length}/1,000</small><Button onClick={()=>void sendFeedback()} disabled={!message.trim()||sending}><Send />{sending ? text('보내는 중…', 'Sending…') : text('보내기', 'Send')}</Button></div>
        {notice && <output className="feedback-notice is-success" aria-live="polite">{notice}</output>}
        {error && <div className="feedback-notice" role="alert">{error}</div>}
      </section>
      <section className="feedback-list" aria-labelledby="feedback-list-title">
        <div className="feedback-list-heading"><div><span className="library-kicker"><CalendarDays /> COMMUNITY</span><h2 id="feedback-list-title">{text('모두의 피드백', 'Community feedback')}</h2><p>{text('공감되는 의견에 좋아요를 눌러주세요.', 'Like the ideas you agree with.')}</p></div><span>{feedback.length}{text('개', ' ')}</span></div>
        {adminMode && <div className="feedback-admin-notice"><ShieldCheck /> {text('관리자 모드 · 피드백을 삭제할 수 있어요.', 'Admin mode · feedback can be deleted.')}</div>}
        {!feedback.length && !error && <div className="feedback-empty">{text('아직 남겨진 피드백이 없어요.', 'No feedback yet.')}</div>}
        <div className="feedback-items">{feedback.map(item => <article className={`feedback-item ${adminMode ? 'is-admin' : ''}`} key={item.id}><div className="feedback-item-meta"><span className="feedback-category">{categoryLabel(item.category, language)}</span><time dateTime={item.createdAt}>{formatCreatedAt(item.createdAt, language)}</time></div><p>{item.message}</p>{adminMode && <button type="button" className="feedback-delete" onClick={() => setPendingDelete(item)} aria-label={text('이 피드백 삭제', 'Delete this feedback')} title={text('피드백 삭제', 'Delete feedback')}><Trash2 /></button>}<button type="button" className={`feedback-like ${liked.has(item.id) ? 'is-liked' : ''}`} onClick={()=>void likeFeedback(item)} disabled={liked.has(item.id)||busyLike===item.id} aria-label={liked.has(item.id) ? text('좋아요 취소 불가', 'Like already added') : text('이 피드백에 공감', 'Like this feedback')}><Heart /> {item.likes}</button></article>)}</div>
        {nextOffset !== null && <Button variant="outline" className="feedback-more" onClick={()=>void loadFeedback(true,nextOffset)} disabled={loadingMore}>{loadingMore ? text('불러오는 중…', 'Loading…') : text('피드백 더 보기', 'Load more')}</Button>}
      </section>
    </div>
    <AlertDialog open={Boolean(pendingDelete)} onOpenChange={open => { if (!open && !deletingId) setPendingDelete(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{text('이 피드백을 삭제할까요?', 'Delete this feedback?')}</AlertDialogTitle><AlertDialogDescription>{text('삭제하면 다시 복구할 수 없습니다.', 'This cannot be undone.')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={Boolean(deletingId)}>{text('취소', 'Cancel')}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void deleteFeedback()} disabled={Boolean(deletingId)}>{deletingId ? text('삭제 중…', 'Deleting…') : text('삭제', 'Delete')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </main>;
}
