'use client';

import { type ChangeEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, CalendarDays, Heart, ImagePlus, MapPin, MessageCircle, Send, ShieldCheck, Trash2, X } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { readJsonResponse } from '@/lib/client-json';
import { tr, useLanguage } from '@/lib/i18n';

type FeedbackComment = { id: string; message: string; createdAt: string };
type Feedback = { id: string; category: string; message: string; likes: number; createdAt: string; hasPhoto?: boolean; photoData?: string | null; comments?: FeedbackComment[] };
const LIKED_KEY = 'travel-note-feedback-liked-v1';
const MAX_PHOTO_DATA_LENGTH = 320_000;

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

function compressPhoto(file: File) {
  return new Promise<string>((resolve, reject) => {
    if (!file.type.startsWith('image/')) { reject(new Error('이미지 파일만 첨부할 수 있어요.')); return; }
    if (file.size > 8_000_000) { reject(new Error('사진은 8MB 이하로 올려주세요.')); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('사진을 읽지 못했어요.'));
    reader.onload = () => {
      const image = new window.Image();
      image.onerror = () => reject(new Error('사진을 불러오지 못했어요.'));
      image.onload = () => {
        const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
        const scale = longestSide > 1280 ? 1280 / longestSide : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext('2d');
        if (!context) { reject(new Error('사진을 처리하지 못했어요.')); return; }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        let result = canvas.toDataURL('image/webp', 0.78);
        if (!result.startsWith('data:image/webp')) result = canvas.toDataURL('image/jpeg', 0.78);
        if (result.length > MAX_PHOTO_DATA_LENGTH) result = canvas.toDataURL('image/jpeg', 0.62);
        if (result.length > MAX_PHOTO_DATA_LENGTH) { reject(new Error('사진 용량이 커요. 더 작은 사진을 선택해주세요.')); return; }
        resolve(result);
      };
      if (typeof reader.result !== 'string') { reject(new Error('사진을 읽지 못했어요.')); return; }
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function FeedbackPage() {
  const { language } = useLanguage();
  const text = useCallback((korean: string, english: string) => tr(language, korean, english), [language]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [category, setCategory] = useState('개선');
  const [message, setMessage] = useState('');
  const [photoData, setPhotoData] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
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
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [commentingId, setCommentingId] = useState<string | null>(null);

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

  const choosePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setPhotoBusy(true); setError('');
    try {
      setPhotoData(await compressPhoto(file));
      setPhotoName(file.name);
    } catch (reason) {
      const messageByError: Record<string, [string, string]> = {
        '이미지 파일만 첨부할 수 있어요.': ['이미지 파일만 첨부할 수 있어요.', 'Please choose an image file.'],
        '사진은 8MB 이하로 올려주세요.': ['사진은 8MB 이하로 올려주세요.', 'Please choose a photo under 8 MB.'],
        '사진을 읽지 못했어요.': ['사진을 읽지 못했어요.', 'Could not read that photo.'],
        '사진을 불러오지 못했어요.': ['사진을 불러오지 못했어요.', 'Could not load that photo.'],
        '사진을 처리하지 못했어요.': ['사진을 처리하지 못했어요.', 'Could not process that photo.'],
        '사진 용량이 커요. 더 작은 사진을 선택해주세요.': ['사진 용량이 커요. 더 작은 사진을 선택해주세요.', 'That photo is too large. Please choose a smaller one.'],
      };
      const raw = reason instanceof Error ? reason.message : '';
      const pair = messageByError[raw];
      setError(pair ? text(pair[0], pair[1]) : text('사진을 첨부하지 못했어요.', 'Could not attach that photo.'));
    } finally { setPhotoBusy(false); }
  };

  const postComment = async (item: Feedback) => {
    const draft = (commentDrafts[item.id] || '').trim();
    if (!draft || commentingId) return;
    setCommentingId(item.id); setError('');
    try {
      const response = await fetch(`/api/feedback/${encodeURIComponent(item.id)}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: draft }) });
      const body = await readJsonResponse<{ comment?: FeedbackComment; message?: string }>(response);
      if (!response.ok || !body.comment) throw new Error(body.message || text('댓글을 남기지 못했어요.', 'Could not post the reply.'));
      setFeedback(current => current.map(entry => entry.id === item.id ? { ...entry, comments: [...(entry.comments || []), body.comment as FeedbackComment] } : entry));
      setCommentDrafts(current => ({ ...current, [item.id]: '' }));
      setNotice(text('관리자 댓글을 남겼어요.', 'Admin reply posted.'));
    } catch (reason) { setError(reason instanceof Error ? reason.message : text('댓글을 남기지 못했어요.', 'Could not post the reply.')); }
    finally { setCommentingId(null); }
  };

  const sendFeedback = async () => {
    if (!message.trim() || sending) return;
    setSending(true); setNotice(''); setError('');
    try {
      const response = await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category, message: message.trim(), photoData }) });
      const body = await readJsonResponse<{ item?: Feedback; message?: string }>(response);
      if (!response.ok || !body.item) throw new Error(body.message || text('피드백을 보내지 못했어요.', 'Could not send feedback.'));
      setFeedback(current => [body.item as Feedback, ...current]);
      setMessage(''); setPhotoData(null); setPhotoName(''); setNotice(text('피드백을 남겼어요. 고마워요!', 'Feedback sent. Thank you!'));
    } catch (reason) { setError(reason instanceof Error ? reason.message : text('피드백을 보내지 못했어요.', 'Could not send feedback.')); }
    finally { setSending(false); }
  };

  const likeFeedback = async (item: Feedback) => {
    if (busyLike) return;
    const currentlyLiked = liked.has(item.id);
    setBusyLike(item.id); setError('');
    try {
      const response = await fetch(`/api/feedback/${encodeURIComponent(item.id)}/like`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: currentlyLiked ? 'remove' : 'add' }) });
      const body = await readJsonResponse<{ likes?: number; liked?: boolean; message?: string }>(response);
      if (!response.ok || typeof body.likes !== 'number') throw new Error(body.message || text('좋아요를 반영하지 못했어요.', 'Could not update the like.'));
      const next = new Set(liked); if (currentlyLiked) next.delete(item.id); else next.add(item.id); setLiked(next);
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
        <div className="feedback-photo-field"><label className="feedback-photo-picker"><ImagePlus /><span>{photoBusy ? text('사진 준비 중…', 'Preparing photo…') : text('사진 첨부', 'Attach a photo')}</span><input type="file" accept="image/*" onChange={event => void choosePhoto(event)} disabled={photoBusy || sending} /></label><small className="feedback-photo-hint">{text('사진은 커뮤니티에 공개돼요. 최대 8MB, 자동으로 용량을 줄여 저장합니다.', 'Photos are visible to the community. Up to 8 MB; we compress them before saving.')}</small>{photoData && <div className="feedback-photo-preview"><Image src={photoData} alt={text('첨부한 사진 미리보기', 'Attached photo preview')} width={116} height={88} unoptimized /><span title={photoName}>{photoName}</span><button type="button" onClick={() => { setPhotoData(null); setPhotoName(''); }} aria-label={text('첨부 사진 삭제', 'Remove attached photo')}><X /></button></div>}</div>
        <div className="feedback-form-bottom"><small>{message.length}/1,000</small><Button onClick={()=>void sendFeedback()} disabled={!message.trim()||sending||photoBusy}><Send />{sending ? text('보내는 중…', 'Sending…') : text('보내기', 'Send')}</Button></div>
        {notice && <output className="feedback-notice is-success" aria-live="polite">{notice}</output>}
        {error && <div className="feedback-notice" role="alert">{error}</div>}
      </section>
      <section className="feedback-list" aria-labelledby="feedback-list-title">
        <div className="feedback-list-heading"><div><span className="library-kicker"><CalendarDays /> COMMUNITY</span><h2 id="feedback-list-title">{text('모두의 피드백', 'Community feedback')}</h2><p>{text('공감되는 의견에 좋아요를 눌러주세요.', 'Like the ideas you agree with.')}</p></div><span>{feedback.length}{text('개', ' ')}</span></div>
        {adminMode && <div className="feedback-admin-notice"><ShieldCheck /> {text('관리자 모드 · 댓글을 달고 피드백을 삭제할 수 있어요.', 'Admin mode · you can reply to and delete feedback.')}</div>}
        {!feedback.length && !error && <div className="feedback-empty">{text('아직 남겨진 피드백이 없어요.', 'No feedback yet.')}</div>}
        <div className="feedback-items">{feedback.map(item => <article className={`feedback-item ${adminMode ? 'is-admin' : ''}`} key={item.id}><div className="feedback-item-meta"><span className="feedback-category">{categoryLabel(item.category, language)}</span><time dateTime={item.createdAt}>{formatCreatedAt(item.createdAt, language)}</time></div><p>{item.message}</p>{(item.photoData || item.hasPhoto) && <a className="feedback-photo-link" href={item.photoData || `/api/feedback/${encodeURIComponent(item.id)}/photo`} target="_blank" rel="noreferrer"><Image src={item.photoData || `/api/feedback/${encodeURIComponent(item.id)}/photo`} alt={text('피드백 첨부 사진', 'Feedback attachment')} width={720} height={480} unoptimized /></a>}{(item.comments?.length || 0) > 0 && <div className="feedback-comments">{item.comments?.map(comment => <div className="feedback-comment" key={comment.id}><div><MessageCircle /><strong>{text('관리자 답변', 'Admin reply')}</strong><time dateTime={comment.createdAt}>{formatCreatedAt(comment.createdAt, language)}</time></div><p>{comment.message}</p></div>)}</div>}{adminMode && <div className="feedback-admin-reply"><Textarea value={commentDrafts[item.id] || ''} maxLength={500} onChange={event => setCommentDrafts(current => ({ ...current, [item.id]: event.target.value }))} placeholder={text('이 피드백에 답변을 남겨보세요.', 'Write a reply to this feedback.')} /><div><small>{(commentDrafts[item.id] || '').length}/500</small><Button size="sm" onClick={() => void postComment(item)} disabled={!commentDrafts[item.id]?.trim() || commentingId !== null}><MessageCircle />{commentingId === item.id ? text('등록 중…', 'Posting…') : text('댓글 달기', 'Reply')}</Button></div></div>}{adminMode && <button type="button" className="feedback-delete" onClick={() => setPendingDelete(item)} aria-label={text('이 피드백 삭제', 'Delete this feedback')} title={text('피드백 삭제', 'Delete feedback')}><Trash2 /></button>}<button type="button" className={`feedback-like ${liked.has(item.id) ? 'is-liked' : ''}`} onClick={()=>void likeFeedback(item)} disabled={busyLike===item.id} aria-label={liked.has(item.id) ? text('좋아요 취소', 'Unlike this feedback') : text('이 피드백에 공감', 'Like this feedback')} title={liked.has(item.id) ? text('좋아요 취소', 'Unlike') : text('좋아요', 'Like')}><Heart /> {item.likes}</button></article>)}</div>
        {nextOffset !== null && <Button variant="outline" className="feedback-more" onClick={()=>void loadFeedback(true,nextOffset)} disabled={loadingMore}>{loadingMore ? text('불러오는 중…', 'Loading…') : text('피드백 더 보기', 'Load more')}</Button>}
      </section>
    </div>
    <AlertDialog open={Boolean(pendingDelete)} onOpenChange={open => { if (!open && !deletingId) setPendingDelete(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{text('이 피드백을 삭제할까요?', 'Delete this feedback?')}</AlertDialogTitle><AlertDialogDescription>{text('삭제하면 다시 복구할 수 없습니다.', 'This cannot be undone.')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={Boolean(deletingId)}>{text('취소', 'Cancel')}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void deleteFeedback()} disabled={Boolean(deletingId)}>{deletingId ? text('삭제 중…', 'Deleting…') : text('삭제', 'Delete')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </main>;
}
