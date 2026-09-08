'use client';

import { ArrowLeft, MapPin, MessageSquareText } from 'lucide-react';
import Link from 'next/link';
import { PlanLibrary } from '@/components/plan-library';
import { tr, useLanguage } from '@/lib/i18n';

export default function TrashPage() {
  const { language } = useLanguage();
  const text = (korean: string, english: string) => tr(language, korean, english);
  return <main className="plans-shell">
    <header className="plans-topbar"><Link className="plans-brand" href="/"><span className="plans-brand-mark"><MapPin /></span>{text('여행을 떠나요', 'Let’s Travel')}<span>♬</span></Link><div className="plans-top-actions"><Link className="plans-feedback-link" href="/feedback"><MessageSquareText /> {text('피드백', 'Feedback')}</Link><Link className="plans-back" href="/plans"><ArrowLeft /> {text('계획 목록', 'Plans')}</Link></div></header>
    <div className="plans-content"><PlanLibrary trash /></div>
  </main>;
}
