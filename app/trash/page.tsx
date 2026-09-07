'use client';

import { ArrowLeft, MapPin, MessageSquareText } from 'lucide-react';
import Link from 'next/link';
import { PlanLibrary } from '@/components/plan-library';

export default function TrashPage() {
  return <main className="plans-shell">
    <header className="plans-topbar"><Link className="plans-brand" href="/"><span className="plans-brand-mark"><MapPin /></span>여행을 떠나요<span>♬</span></Link><div className="plans-top-actions"><Link className="plans-feedback-link" href="/feedback"><MessageSquareText /> 피드백</Link><Link className="plans-back" href="/plans"><ArrowLeft /> 계획 목록</Link></div></header>
    <div className="plans-content"><PlanLibrary trash /></div>
  </main>;
}
