'use client';

import { ArrowLeft, MapPin, MessageSquareText, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { PlanLibrary } from '@/components/plan-library';

export default function PlansPage() {
  return <main className="plans-shell">
    <header className="plans-topbar"><Link className="plans-brand" href="/"><span className="plans-brand-mark"><MapPin /></span>여행을 떠나요<span>♬</span></Link><div className="plans-top-actions"><Link className="plans-trash-link" href="/trash"><Trash2 /> 휴지통</Link><Link className="plans-feedback-link" href="/feedback"><MessageSquareText /> 피드백</Link><Link className="plans-back" href="/"><ArrowLeft /> 메인으로</Link></div></header>
    <div className="plans-content"><PlanLibrary /></div>
  </main>;
}
