'use client';

import { ArrowLeft, MapPin, Trash2 } from 'lucide-react';
import { PlanLibrary } from '@/components/plan-library';

export default function PlansPage() {
  return <main className="plans-shell">
    <header className="plans-topbar"><a className="plans-brand" href="/"><span className="plans-brand-mark"><MapPin /></span>여행을 떠나요<span>♬</span></a><div className="plans-top-actions"><a className="plans-trash-link" href="/trash"><Trash2 /> 휴지통</a><a className="plans-back" href="/"><ArrowLeft /> 메인으로</a></div></header>
    <div className="plans-content"><PlanLibrary /></div>
  </main>;
}
