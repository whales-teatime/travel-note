'use client';

import { ArrowLeft, MapPin } from 'lucide-react';
import { PlanLibrary } from '@/components/plan-library';

export default function PlansPage() {
  return <main className="plans-shell">
    <header className="plans-topbar"><a className="plans-brand" href="/"><span className="plans-brand-mark"><MapPin /></span>여행을 떠나요<span>♪</span></a><a className="plans-back" href="/"><ArrowLeft /> 메인으로</a></header>
    <div className="plans-content"><PlanLibrary /></div>
  </main>;
}
