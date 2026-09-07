'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, CircleDollarSign, Clock3, Compass, GripVertical, House, LockKeyhole, MapPin, MousePointer2, PanelLeftClose, Save, Search, Smartphone, Sparkles } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const pcGuides = [
  {
    number: '01',
    title: '장소 검색해서 일정에 넣기',
    description: '장소명을 입력하면 네이버 검색 후보가 열립니다. 정확한 지점을 고른 뒤 시간과 메모를 채우면 됩니다.',
    image: '/guide/pc-search.webp',
    alt: 'PC에서 장소를 검색해 여행 일정에 추가하는 과정',
    steps: ['이 날짜에 장소 추가', '장소명 입력', '검색 후보 선택', '시간·카테고리·메모 입력 후 추가'],
  },
  {
    number: '02',
    title: '카드를 끌어서 순서 바꾸기',
    description: '카드 왼쪽 손잡이를 누른 채 원하는 위치로 옮기세요. 직접 바꾼 순서는 그대로 유지됩니다.',
    image: '/guide/pc-reorder.webp',
    alt: 'PC에서 여행 장소 카드를 마우스로 끌어 순서를 바꾸는 과정',
    steps: ['왼쪽 손잡이를 누르기', '들어갈 카드 위치까지 끌기', '초록 선이 보이면 놓기', '붉은 시간은 시간 순서가 어긋났다는 표시'],
  },
  {
    number: '03',
    title: '검색에 없는 장소는 임의 핀으로',
    description: '친구 집이나 임시 집결지처럼 검색되지 않는 곳도 지도에서 직접 위치를 정할 수 있습니다.',
    image: '/guide/pc-custom-pin.webp',
    alt: 'PC 지도에 임의 핀을 찍어 여행 장소로 추가하는 과정',
    steps: ['지도에 임의 핀 추가', '지도 클릭 또는 초록 핀 드래그', '이 위치로 계속', '장소 이름과 시간을 입력해 일정에 추가'],
  },
];

export default function GuidePage() {
  return <main className="guide-page-shell">
    <header className="guide-page-topbar"><Link className="plans-brand" href="/"><span className="plans-brand-mark"><MapPin /></span>여행을 떠나요<span>♬</span></Link><Link className="plans-back" href="/"><ArrowLeft /> 메인으로</Link></header>
    <section className="guide-page-hero">
      <span className="guide-page-kicker"><Sparkles /> QUICK GUIDE</span>
      <h1>여행 가기 전, 우리끼리 한 번 맞춰봐요</h1>
      <p>날짜와 장소를 하나씩 채우면 동선과 경비가 자연스럽게 정리돼요.</p>
      <div className="guide-quick-flow" aria-label="기본 사용 순서"><span><b>1</b>여행 일정 설정</span><ArrowRight /><span><b>2</b>장소 추가</span><ArrowRight /><span><b>3</b>순서 정리</span><ArrowRight /><span><b>4</b>저장·공유</span></div>
    </section>

    <Tabs defaultValue="pc" className="guide-page-tabs">
      <TabsList className="guide-page-tab-list"><TabsTrigger value="pc"><MousePointer2 /> PC 사용법</TabsTrigger><TabsTrigger value="mobile"><Smartphone /> 모바일 사용법</TabsTrigger></TabsList>
      <TabsContent value="pc" className="guide-tab-panel">
        <div className="guide-section-heading"><span>PC</span><div><h2>마우스로 빠르게 계획하기</h2><p>사진 속 화면은 실제 서비스에서 직접 조작해 촬영했습니다.</p></div></div>
        <div className="guide-process-list">{pcGuides.map((guide, index) => <article className="guide-process-card" key={guide.title}><div className="guide-process-media"><Image src={guide.image} alt={guide.alt} width={960} height={600} unoptimized priority={index === 0} /></div><div className="guide-process-copy"><span className="guide-process-number">STEP {guide.number}</span><h3>{guide.title}</h3><p>{guide.description}</p><ol>{guide.steps.map((step, stepIndex) => <li key={step}><b>{stepIndex + 1}</b>{step}</li>)}</ol></div></article>)}</div>
        <div className="guide-detail-grid">
          <article><CircleDollarSign /><div><h3>예상 경비 입력</h3><p>개인별 비용이나 총 비용 중 하나만 입력하면 인원수에 맞춰 다른 값이 자동 계산됩니다. 직접 입력한 값과 계산된 값은 색으로 구분됩니다.</p></div></article>
          <article><Save /><div><h3>계획 저장과 공유</h3><p>오른쪽 위 <strong>계획 저장</strong>을 누르면 목록에 보관됩니다. 저장 후 주소창의 링크를 보내면 친구들도 같은 계획을 볼 수 있습니다.</p></div></article>
          <article><House /><div><h3>동선 한눈에 보기</h3><p>지도 오른쪽 아래 집 모양 버튼을 누르면 현재 일정의 모든 핀이 한 화면에 들어오도록 지도가 맞춰집니다.</p></div></article>
          <article><PanelLeftClose /><div><h3>PC에서 일정 패널 접기</h3><p>지도 오른쪽 위 <strong>일정 접기</strong>를 누르면 지도가 넓어집니다. 다시 <strong>일정 펼치기</strong>를 누르면 카드 목록이 돌아옵니다.</p></div></article>
          <article><Clock3 /><div><h3>시간 입력과 순서</h3><p><strong>0839</strong>처럼 숫자만 입력해도 <strong>08:39</strong>로 바뀝니다. 카드 순서와 시간이 어긋나면 해당 시간이 붉게 표시됩니다.</p></div></article>
          <article><LockKeyhole /><div><h3>비밀번호로 내 계획 지키기</h3><p>열람 비밀번호는 계획을 볼 수 있는 사람을 정하고, 편집 비밀번호는 수정할 수 있는 사람을 정합니다. 두 비밀번호를 따로 설정해 우리끼리만 여행 내용을 공유할 수 있어요.</p></div></article>
        </div>
      </TabsContent>

      <TabsContent value="mobile" className="guide-tab-panel">
        <div className="guide-section-heading"><span>MOBILE</span><div><h2>한 손으로 지도와 일정 오가기</h2><p>모바일에서는 화면을 넓게 쓰도록 지도와 일정 패널이 접혔다 펼쳐집니다.</p></div></div>
        <div className="guide-mobile-grid">
          <article className="guide-mobile-card"><div className="guide-mobile-media"><Image src="/guide/mobile-search.webp" alt="모바일에서 장소 추가 창을 열고 검색 후보를 선택하는 과정" width={430} height={760} unoptimized /></div><div><span>01 · 장소 검색</span><h3>장소 추가를 누르고 후보에서 선택</h3><p><strong>이 날짜에 장소 추가</strong>를 누른 뒤 장소명을 입력하세요. 네이버 검색 후보에서 정확한 지점을 고르면 주소까지 자동으로 채워집니다.</p></div></article>
          <article className="guide-mobile-card"><div className="guide-mobile-media"><Image src="/guide/mobile-map-focus.webp" alt="모바일에서 지도를 눌러 일정 패널을 접고 다시 펼치는 과정" width={430} height={760} unoptimized /></div><div><span>02 · 지도 집중</span><h3>지도를 탭하면 넓게, 다시 탭하면 일정</h3><p>지도 빈 곳을 한 번 누르면 아래 일정 패널이 내려갑니다. 다시 탭하거나 <strong>일정 보기</strong>를 누르면 원래 화면으로 돌아옵니다.</p></div></article>
        </div>
        <div className="guide-mobile-overview"><Image src="/guide/mobile-planner.webp" alt="모바일 여행 일정 화면 전체 모습" width={430} height={932} unoptimized /><div><span className="guide-process-number">MOBILE TIPS</span><h3>작은 화면에서는 이렇게 쓰세요</h3><ul><li><GripVertical />카드 순서는 오른쪽의 위·아래 화살표로 바꾸는 편이 빠릅니다.</li><li><Search />검색창을 닫고 지도를 누르면 키보드도 함께 닫힙니다.</li><li><MapPin />임의 핀은 지도 위치를 정한 뒤 이름과 시간을 입력하면 됩니다.</li><li><Save />작성 중인 초안은 이 기기에 자동 저장되고, 완성한 계획은 <strong>계획 저장</strong>으로 서버에 보관합니다.</li></ul></div></div>
      </TabsContent>
    </Tabs>

    <section className="guide-faq"><span className="guide-page-kicker"><Compass /> 알아두면 편해요</span><div className="guide-faq-grid"><article><h3>검색 결과가 애매해요</h3><p>여행 일정에 입력한 도시가 우선 반영됩니다. 그래도 찾기 어렵다면 <strong>도시명 + 장소명</strong>으로 검색해 보세요.</p></article><article><h3>친구도 수정할 수 있나요?</h3><p>열람 비밀번호는 계획을 볼 수 있는 사람을, 편집 비밀번호는 수정할 수 있는 사람을 정합니다. 둘을 따로 설정해 함께 쓰면 됩니다.</p></article><article><h3>실수로 계획을 삭제했어요</h3><p>메인의 <strong>휴지통</strong>에서 7일 안에 복원할 수 있습니다. 7일이 지나면 자동으로 완전히 삭제됩니다.</p></article></div></section>
    <div className="guide-page-cta"><div><span>준비됐나요?</span><strong>여행 계획을 시작해 보세요.</strong></div><Link href="/plan/new?mode=domestic">새 계획 만들기 <ArrowRight /></Link></div>
  </main>;
}
