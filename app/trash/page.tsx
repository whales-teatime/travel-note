'use client';

import { ArrowLeft, MapPin } from 'lucide-react';
import { PlanLibrary } from '@/components/plan-library';

export default function TrashPage() {
  return <main className="plans-shell">
    <header className="plans-topbar"><a className="plans-brand" href="/"><span className="plans-brand-mark"><MapPin /></span>여행을 떠나요<span>♬</span></a><a className="plans-back" href="/plans"><ArrowLeft /> 계획 목록</a></header>
    <div className="plans-content"><PlanLibrary trash /></div>
  </main>;
}
