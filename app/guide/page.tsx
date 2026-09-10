'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, CircleDollarSign, Clock3, Compass, GripVertical, House, LockKeyhole, MapPin, MousePointer2, PanelLeftClose, Save, Search, Smartphone, Sparkles } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { tr, useLanguage } from '@/lib/i18n';

const pcGuides = [
  {
    number: '01',
    title: '장소 검색해서 일정에 넣기',
    titleEn: 'Search for a place and add it',
    description: '장소명을 입력하면 네이버 검색 후보가 열립니다. 정확한 지점을 고른 뒤 시간과 메모를 채우면 됩니다.',
    descriptionEn: 'Enter a place name to see Naver search suggestions. Pick the right spot, then add a time and note.',
    image: '/guide/pc-search.webp',
    alt: 'PC에서 장소를 검색해 여행 일정에 추가하는 과정',
    steps: ['이 날짜에 장소 추가', '장소명 입력', '검색 후보 선택', '시간·카테고리·메모 입력 후 추가'],
    stepsEn: ['Add a place to this day', 'Enter a place name', 'Choose a search result', 'Add the time, category, and note'],
  },
  {
    number: '02',
    title: '카드를 끌어서 순서 바꾸기',
    titleEn: 'Drag cards to reorder them',
    description: '카드 왼쪽 손잡이를 누른 채 원하는 위치로 옮기세요. 직접 바꾼 순서는 그대로 유지됩니다.',
    descriptionEn: 'Hold the handle on the left of a card and move it where you want. Your manual order is kept.',
    image: '/guide/pc-reorder.webp',
    alt: 'PC에서 여행 장소 카드를 마우스로 끌어 순서를 바꾸는 과정',
    steps: ['왼쪽 손잡이를 누르기', '들어갈 카드 위치까지 끌기', '초록 선이 보이면 놓기', '붉은 시간은 시간 순서가 어긋났다는 표시'],
    stepsEn: ['Grab the left handle', 'Drag to the new position', 'Drop when the green line appears', 'A red time means the order and time differ'],
  },
  {
    number: '03',
    title: '검색에 없는 장소는 임의 핀으로',
    titleEn: 'Use a custom pin for any place',
    description: '친구 집이나 임시 집결지처럼 검색되지 않는 곳도 지도에서 직접 위치를 정할 수 있습니다.',
    descriptionEn: 'Set a location directly on the map for places that do not appear in search, such as a friend’s home or meeting point.',
    image: '/guide/pc-custom-pin.webp',
    alt: 'PC 지도에 임의 핀을 찍어 여행 장소로 추가하는 과정',
    steps: ['지도에 임의 핀 추가', '지도 클릭 또는 초록 핀 드래그', '이 위치로 계속', '장소 이름과 시간을 입력해 일정에 추가'],
    stepsEn: ['Add a custom pin', 'Click the map or drag the green pin', 'Continue with this location', 'Add a name and time to your plan'],
  },
];

export default function GuidePage() {
  const { language } = useLanguage();
  const text = (korean: string, english: string) => tr(language, korean, english);
  return <main className="guide-page-shell">
    <header className="guide-page-topbar"><Link className="plans-brand" href="/"><span className="plans-brand-mark"><MapPin /></span>{text('여행을 떠나요', 'Let’s Travel')}<span>♬</span></Link><Link className="plans-back" href="/"><ArrowLeft /> {text('메인으로', 'Home')}</Link></header>
    <section className="guide-page-hero">
      <span className="guide-page-kicker"><Sparkles /> QUICK GUIDE</span>
      <h1>{text('여행 가기 전, 우리끼리 한 번 맞춰봐요', 'Get your trip sorted before you go')}</h1>
      <p>{text('날짜와 장소를 하나씩 채우면 동선과 경비가 자연스럽게 정리돼요.', 'Add dates and places one by one, and your route and budget fall into place.')}</p>
      <div className="guide-quick-flow" aria-label={text('기본 사용 순서', 'Basic steps')}><span><b>1</b>{text('여행 일정 설정', 'Set your dates')}</span><ArrowRight /><span><b>2</b>{text('장소 추가', 'Add places')}</span><ArrowRight /><span><b>3</b>{text('순서 정리', 'Arrange the order')}</span><ArrowRight /><span><b>4</b>{text('저장·공유', 'Save and share')}</span></div>
    </section>

    <Tabs defaultValue="pc" className="guide-page-tabs">
      <TabsList className="guide-page-tab-list"><TabsTrigger value="pc"><MousePointer2 /> {text('PC 사용법', 'Desktop')}</TabsTrigger><TabsTrigger value="mobile"><Smartphone /> {text('모바일 사용법', 'Mobile')}</TabsTrigger></TabsList>
      <TabsContent value="pc" className="guide-tab-panel">
        <div className="guide-section-heading"><span>PC</span><div><h2>{text('마우스로 빠르게 계획하기', 'Plan quickly with your mouse')}</h2><p>{text('사진 속 화면은 실제 서비스에서 직접 조작해 촬영했습니다.', 'These examples were recorded while using the live service.')}</p></div></div>
        <div className="guide-process-list">{pcGuides.map((guide, index) => <article className="guide-process-card" key={guide.title}><div className="guide-process-media"><Image src={guide.image} alt={language === 'en' ? guide.alt.replace('PC에서 장소를 검색해 여행 일정에 추가하는 과정', 'Adding a place to a travel plan on desktop').replace('PC에서 여행 장소 카드를 마우스로 끌어 순서를 바꾸는 과정', 'Reordering travel cards with a mouse on desktop').replace('PC 지도에 임의 핀을 찍어 여행 장소로 추가하는 과정', 'Adding a custom pin on the desktop map') : guide.alt} width={960} height={600} unoptimized priority={index === 0} /></div><div className="guide-process-copy"><span className="guide-process-number">STEP {guide.number}</span><h3>{language === 'en' ? guide.titleEn : guide.title}</h3><p>{language === 'en' ? guide.descriptionEn : guide.description}</p><ol>{(language === 'en' ? guide.stepsEn : guide.steps).map((step, stepIndex) => <li key={step}><b>{stepIndex + 1}</b>{step}</li>)}</ol></div></article>)}</div>
        <div className="guide-detail-grid">
          <article><CircleDollarSign /><div><h3>{text('예상 경비 입력', 'Add an estimated budget')}</h3><p>{text('개인별 비용이나 총 비용 중 하나만 입력하면 인원수에 맞춰 다른 값이 자동 계산됩니다. 직접 입력한 값과 계산된 값은 색으로 구분됩니다.', 'Enter either the per-person or total cost and the other value is calculated from the group size. Entered and calculated values use different colors.')}</p></div></article>
          <article><Save /><div><h3>{text('계획 저장과 공유', 'Save and share')}</h3><p>{text('오른쪽 위 계획 저장을 누르면 목록에 보관됩니다. 저장 후 주소창의 링크를 보내면 친구들도 같은 계획을 볼 수 있습니다.', 'Click Save plan in the top right to keep it in your list. Share the address from your browser so friends can open the same plan.')}</p></div></article>
          <article><House /><div><h3>{text('동선 한눈에 보기', 'See the whole route')}</h3><p>{text('지도 오른쪽 아래 집 모양 버튼을 누르면 현재 일정의 모든 핀이 한 화면에 들어오도록 지도가 맞춰집니다.', 'Click the home button in the bottom right of the map to fit every stop in one view.')}</p></div></article>
          <article><PanelLeftClose /><div><h3>{text('PC에서 일정 패널 접기', 'Collapse the desktop planner')}</h3><p>{text('지도 오른쪽 위 일정 접기를 누르면 지도가 넓어집니다. 다시 일정 펼치기를 누르면 카드 목록이 돌아옵니다.', 'Click Collapse planner in the top right of the map to give it more room. Expand planner brings the cards back.')}</p></div></article>
          <article><Clock3 /><div><h3>{text('시간 입력과 순서', 'Time and order')}</h3><p>{text('0839처럼 숫자만 입력해도 08:39로 바뀝니다. 카드 순서와 시간이 어긋나면 해당 시간이 붉게 표시됩니다.', 'Type 0839 and it becomes 08:39. A time turns red when the card order and times do not match.')}</p></div></article>
          <article><LockKeyhole /><div><h3>{text('비밀번호로 내 계획 지키기', 'Keep your plan private')}</h3><p>{text('열람 비밀번호는 일정·메모를 볼 사람을, 편집 비밀번호는 수정할 사람을 정합니다. 계획 목록에는 검색을 위해 여행 이름·여행지·날짜가 보일 수 있으니 민감한 내용은 메모에 남기지 마세요.', 'A viewing password protects the itinerary and notes, while an editing password controls who can make changes. The trip name, destination, and dates may appear in the searchable plan list, so keep sensitive details out of notes.')}</p></div></article>
        </div>
      </TabsContent>

      <TabsContent value="mobile" className="guide-tab-panel">
        <div className="guide-section-heading"><span>MOBILE</span><div><h2>{text('한 손으로 지도와 일정 오가기', 'Switch between map and plans with one hand')}</h2><p>{text('모바일에서는 화면을 넓게 쓰도록 지도와 일정 패널이 접혔다 펼쳐집니다.', 'On mobile, the map and planner collapse so you can use the full screen.')}</p></div></div>
        <div className="guide-mobile-grid">
          <article className="guide-mobile-card"><div className="guide-mobile-media"><Image src="/guide/mobile-search.webp" alt={text('모바일에서 장소 추가 창을 열고 검색 후보를 선택하는 과정', 'Opening the place picker and choosing a search result on mobile')} width={430} height={760} unoptimized /></div><div><span>01 · {text('장소 검색', 'SEARCH')}</span><h3>{text('장소 추가를 누르고 후보에서 선택', 'Tap Add place, then choose a result')}</h3><p><strong>{text('이 날짜에 장소 추가', 'Add a place to this day')}</strong>{text('를 누른 뒤 장소명을 입력하세요. 네이버 검색 후보에서 정확한 지점을 고르면 주소까지 자동으로 채워집니다.', ', then enter a place name. Choose the right Naver result and the address fills in automatically.')}</p></div></article>
          <article className="guide-mobile-card"><div className="guide-mobile-media"><Image src="/guide/mobile-map-focus.webp" alt={text('모바일에서 지도를 눌러 일정 패널을 접고 다시 펼치는 과정', 'Collapsing and expanding the planner by tapping the mobile map')} width={430} height={760} unoptimized /></div><div><span>02 · {text('지도 집중', 'MAP FOCUS')}</span><h3>{text('지도를 탭하면 넓게, 다시 탭하면 일정', 'Tap the map for space, tap again for plans')}</h3><p>{text('지도 빈 곳을 한 번 누르면 아래 일정 패널이 내려갑니다. 다시 탭하거나 일정 보기를 누르면 원래 화면으로 돌아옵니다.', 'Tap an empty part of the map to hide the planner. Tap again or choose View plans to bring it back.')}</p></div></article>
        </div>
        <div className="guide-mobile-overview"><Image src="/guide/mobile-planner.webp" alt={text('모바일 여행 일정 화면 전체 모습', 'Full mobile travel planner screen')} width={430} height={932} unoptimized /><div><span className="guide-process-number">MOBILE TIPS</span><h3>{text('작은 화면에서는 이렇게 쓰세요', 'A few tips for small screens')}</h3><ul><li><GripVertical />{text('카드 순서는 오른쪽의 위·아래 화살표로 바꾸는 편이 빠릅니다.', 'Use the up and down arrows to reorder cards quickly.')}</li><li><Search />{text('검색창을 닫고 지도를 누르면 키보드도 함께 닫힙니다.', 'Close the search field and tap the map to hide the keyboard too.')}</li><li><MapPin />{text('임의 핀은 지도 위치를 정한 뒤 이름과 시간을 입력하면 됩니다.', 'Set a custom pin, then add its name and time.')}</li><li><Save />{text('작성 중인 초안은 이 기기에 자동 저장되고, 완성한 계획은 계획 저장으로 서버에 보관합니다.', 'Drafts are saved on this device while you work. Use Save plan to keep the finished plan on the server.')}</li></ul></div></div>
      </TabsContent>
    </Tabs>

    <section className="guide-faq"><span className="guide-page-kicker"><Compass /> {text('알아두면 편해요', 'GOOD TO KNOW')}</span><div className="guide-faq-grid"><article><h3>{text('검색 결과가 애매해요', 'Search results look unclear')}</h3><p>{text('여행 일정에 입력한 도시가 우선 반영됩니다. 그래도 찾기 어렵다면 도시명 + 장소명으로 검색해 보세요.', 'Your trip city is used first. If a place is still hard to find, search with city name + place name.')}</p></article><article><h3>{text('계획 목록에는 무엇이 보이나요?', 'What appears in the plan list?')}</h3><p>{text('비밀번호를 걸어도 여행 이름·여행지·날짜는 목록과 검색 결과에 표시될 수 있어요. 일정 내용과 메모는 열람 비밀번호로 보호됩니다.', 'Even with a password, the trip name, destination, and dates can appear in the list and search results. The itinerary and notes are protected by the viewing password.')}</p></article><article><h3>{text('친구도 수정할 수 있나요?', 'Can friends edit too?')}</h3><p>{text('편집 권한을 모두에게 열거나 편집 비밀번호를 따로 공유하면 함께 수정할 수 있어요. 작성자만으로 두면 작성자 토큰이 필요합니다.', 'Everyone can edit when you allow it, or when they have the separate editing password. Author-only plans require the author token.')}</p></article><article><h3>{text('실수로 계획을 삭제했어요', 'I deleted a plan by mistake')}</h3><p>{text('메인의 휴지통에서 7일 안에 복원할 수 있습니다. 7일이 지나면 자동으로 완전히 삭제됩니다.', 'Restore it from the Trash within 7 days. After that, it is permanently deleted.')}</p></article></div></section>
    <div className="guide-page-cta"><div><span>{text('준비됐나요?', 'Ready?')}</span><strong>{text('여행 계획을 시작해 보세요.', 'Start planning your trip.')}</strong></div><Link href="/plan/new?mode=domestic">{text('새 계획 만들기', 'Create a plan')} <ArrowRight /></Link></div>
  </main>;
}
