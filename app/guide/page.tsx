'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowLeft, ArrowRight, CircleDollarSign, Clock3, Compass, Copy, Globe2, GripVertical, House,
  Languages, LockKeyhole, Map, MapPin, MessageSquareText, MousePointer2, Palette, PanelLeftClose,
  Pencil, Route, Save, Search, Smartphone, Sparkles, Star,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { tr, useLanguage } from '@/lib/i18n';

type GuideItem = {
  number: string;
  title: string;
  titleEn: string;
  description: string;
  descriptionEn: string;
  image: string;
  alt: string;
  altEn: string;
  steps: string[];
  stepsEn: string[];
};

const basicGuides: GuideItem[] = [
  {
    number: '01',
    title: '장소를 찾아 일정에 넣기',
    titleEn: 'Search for a place and add it',
    description: '장소명을 입력하고 지도에 표시되는 후보 중 정확한 지점을 고르세요. 시간과 카테고리, 메모까지 한 번에 넣을 수 있어요.',
    descriptionEn: 'Enter a place name and choose the right result from the map suggestions. Add its time, category, and note in the same window.',
    image: '/guide/pc-search.webp',
    alt: 'PC에서 장소를 검색해 여행 일정에 추가하는 과정',
    altEn: 'Adding a place to a travel plan on desktop',
    steps: ['이 날짜에 장소 추가', '장소명 입력', '목록이나 초록 핀으로 정확한 지점 선택', '시간·카테고리·메모 입력 후 추가'],
    stepsEn: ['Choose Add a place to this day', 'Enter a place name', 'Choose the exact result in the list or on the map', 'Add the time, category, and note'],
  },
  {
    number: '02',
    title: '카드를 끌어서 순서 바꾸기',
    titleEn: 'Drag cards to reorder them',
    description: '카드 왼쪽 손잡이를 원하는 위치로 끌면 순서가 바뀝니다. 화면 위아래 가장자리로 끌면 일정도 함께 스크롤돼요.',
    descriptionEn: 'Drag the handle on the left to change the order. Hold it near the top or bottom edge to scroll the planner while dragging.',
    image: '/guide/pc-reorder.webp',
    alt: 'PC에서 여행 장소 카드를 마우스로 끌어 순서를 바꾸는 과정',
    altEn: 'Reordering travel cards with a mouse on desktop',
    steps: ['왼쪽 손잡이를 누르기', '원하는 카드 사이로 끌기', '초록 선이 보이면 놓기', '붉은 시간은 시간 순서가 어긋났다는 표시'],
    stepsEn: ['Grab the left handle', 'Drag between the cards', 'Drop when the green line appears', 'A red time means the order and time differ'],
  },
  {
    number: '03',
    title: '검색에 없는 곳은 임의 핀으로',
    titleEn: 'Use a custom pin for any place',
    description: '친구 집이나 집결지처럼 검색되지 않는 곳도 지도에서 직접 위치를 정할 수 있습니다. 주소를 입력해 먼저 찾는 방법도 있어요.',
    descriptionEn: 'Set a location directly for a friend’s home or meeting point that does not appear in search. You can also find it by address first.',
    image: '/guide/pc-custom-pin.webp',
    alt: 'PC 지도에 임의 핀을 찍어 여행 장소로 추가하는 과정',
    altEn: 'Adding a custom pin on the desktop map',
    steps: ['지도에 임의 핀 추가', '주소로 찾거나 지도에서 위치 찍기', '초록 핀을 끌어 세부 위치 조정', '이름과 시간을 입력해 일정에 추가'],
    stepsEn: ['Choose Add a custom map pin', 'Find an address or pick a point on the map', 'Drag the green pin to fine-tune it', 'Add a name and time'],
  },
];

const versionGuides: GuideItem[] = [
  {
    number: 'NEW 01',
    title: '장소·핀을 한 화면에서 수정하기',
    titleEn: 'Edit a place and its pin together',
    description: '카드의 연필 버튼이나 핀 정보의 장소 수정 버튼을 누르세요. 장소 재검색, 시간·메모 수정, 위치 이동과 핀 색상 변경을 한곳에서 할 수 있어요.',
    descriptionEn: 'Use the pencil on a card or Edit place from pin details. Search again, update the time and note, move the location, or choose a pin color in one place.',
    image: '/guide/pc-edit-place.webp',
    alt: '장소 수정 창에서 핀 색상을 바꾸고 저장하는 과정',
    altEn: 'Changing a custom pin color in the place editor',
    steps: ['카드의 연필 버튼 누르기', '장소를 다시 검색하거나 기존 정보 수정', '색상표 또는 #e85d75 같은 코드로 핀 색상 선택', '저장'],
    stepsEn: ['Click the pencil on a card', 'Search again or edit the existing details', 'Choose a color or enter a hex value such as #e85d75', 'Save'],
  },
  {
    number: 'NEW 02',
    title: '한 계획에 여러 여행지 엮기',
    titleEn: 'Link several destinations in one trip',
    description: '전주 3일, 홍천 3일처럼 날짜 구간별 여행지를 나눌 수 있어요. 날짜를 바꾸면 지도 중심과 장소 검색 기준도 그날의 여행지를 따라갑니다.',
    descriptionEn: 'Split one trip into date ranges such as three days in Jeonju and three in Hongcheon. The map and search area follow the destination for each day.',
    image: '/guide/pc-linked-destination.webp',
    alt: '여행 일정에서 두 번째 여행지를 연결하는 과정',
    altEn: 'Linking a second destination in trip settings',
    steps: ['여행 일정 열기', '여행지 엮기', '다음 도시를 검색해 선택', '각 여행지의 시작일·종료일 확인'],
    stepsEn: ['Open Trip settings', 'Choose Link a destination', 'Search for and choose the next city', 'Check each destination’s dates'],
  },
  {
    number: 'NEW 03',
    title: '거점별 직선거리 비교하기',
    titleEn: 'Compare straight-line distances from bases',
    description: '여러 출발지에서 후보 장소까지의 거리를 비교할 때 쓰세요. 거점은 원하는 만큼 고를 수 있고, 후보 핀을 누르면 관련 점선만 남습니다.',
    descriptionEn: 'Use this when comparing candidate places from several starting points. Add as many bases as needed, then select a candidate pin to isolate its dotted lines.',
    image: '/guide/pc-distance-compare.webp',
    alt: '거리 비교 보기에서 거점을 선택하고 후보 거리를 확인하는 과정',
    altEn: 'Choosing bases and checking candidate distances in comparison mode',
    steps: ['여행 일정의 보기 방식을 거리 비교로 변경', '기준 거점 선택 열기', '거점 추가', '저장 후 표·점선·거리 라벨 확인'],
    stepsEn: ['Change View mode to Distance comparison', 'Open Choose base places', 'Add base places', 'Save and check the table, dotted lines, and labels'],
  },
  {
    number: 'NEW 04',
    title: '해외 여행도 같은 방식으로',
    titleEn: 'Plan overseas trips the same way',
    description: '메인의 해외로!에서 도시나 국가를 고르면 세계 지도로 계획이 열립니다. 장소는 영어 또는 현지어로 검색하고, 상세 정보는 Google 지도에서 이어서 볼 수 있어요.',
    descriptionEn: 'Choose Explore the world and select a city or country to start with the world map. Search in English or the local language, then continue in Google Maps for more details.',
    image: '/guide/pc-overseas.webp',
    alt: '도쿄 여행에서 해외 장소를 검색하는 과정',
    altEn: 'Searching for an overseas place in a Tokyo trip',
    steps: ['해외로! 선택', '도시·국가 후보에서 여행지 선택', '영문 또는 현지어로 장소 검색', '후보 선택 후 일정에 추가'],
    stepsEn: ['Choose Explore the world', 'Select a city or country suggestion', 'Search in English or the local language', 'Choose a result and add it to the plan'],
  },
];

function ProcessCard({ guide, language, priority = false }: { guide: GuideItem; language: 'ko' | 'en'; priority?: boolean }) {
  return <article className="guide-process-card">
    <div className="guide-process-media"><Image src={guide.image} alt={language === 'en' ? guide.altEn : guide.alt} width={960} height={600} unoptimized priority={priority} /></div>
    <div className="guide-process-copy">
      <span className="guide-process-number">STEP {guide.number}</span>
      <h3>{language === 'en' ? guide.titleEn : guide.title}</h3>
      <p>{language === 'en' ? guide.descriptionEn : guide.description}</p>
      <ol>{(language === 'en' ? guide.stepsEn : guide.steps).map((step, index) => <li key={step}><b>{index + 1}</b>{step}</li>)}</ol>
    </div>
  </article>;
}

export default function GuidePage() {
  const { language } = useLanguage();
  const text = (korean: string, english: string) => tr(language, korean, english);

  return <main className="guide-page-shell">
    <header className="guide-page-topbar"><Link className="plans-brand" href="/"><span className="plans-brand-mark"><MapPin /></span>{text('여행을 떠나요', 'Let’s Travel')}<span>♬</span></Link><Link className="plans-back" href="/"><ArrowLeft /> {text('메인으로', 'Home')}</Link></header>

    <section className="guide-page-hero">
      <span className="guide-page-kicker"><Sparkles /> GUIDE · VERSION 2.0</span>
      <h1>{text('계획 짜는 법, 여기서 한 번에', 'Everything you need to plan a trip')}</h1>
      <p>{text('처음 만드는 일정부터 여러 도시와 거리 비교까지, 실제 화면을 보며 따라오세요.', 'Follow the real screens from your first itinerary to multi-city trips and distance comparison.')}</p>
      <div className="guide-quick-flow" aria-label={text('기본 사용 순서', 'Basic steps')}><span><b>1</b>{text('여행 일정 설정', 'Set the trip')}</span><ArrowRight /><span><b>2</b>{text('장소 추가', 'Add places')}</span><ArrowRight /><span><b>3</b>{text('동선·거리 확인', 'Check route')}</span><ArrowRight /><span><b>4</b>{text('저장·공유', 'Save and share')}</span></div>
    </section>

    <Tabs defaultValue="pc" className="guide-page-tabs">
      <TabsList className="guide-page-tab-list"><TabsTrigger value="pc"><MousePointer2 /> {text('PC 사용법', 'Desktop')}</TabsTrigger><TabsTrigger value="mobile"><Smartphone /> {text('모바일 사용법', 'Mobile')}</TabsTrigger></TabsList>

      <TabsContent value="pc" className="guide-tab-panel">
        <div className="guide-section-heading"><span>START</span><div><h2>{text('기본 흐름부터 익히기', 'Learn the basic flow')}</h2><p>{text('사진 속 화면은 실제 서비스에서 직접 조작해 촬영했습니다.', 'Every animation was recorded directly from the live service.')}</p></div></div>
        <div className="guide-process-list">{basicGuides.map((guide, index) => <ProcessCard key={guide.number} guide={guide} language={language} priority={index === 0} />)}</div>

        <section className="guide-v2-section">
          <div className="guide-v2-heading"><span>VERSION 2.0</span><div><h2>{text('계획이 복잡해질 때 쓰는 기능', 'Tools for more complex trips')}</h2><p>{text('여러 여행지, 해외 지도, 거리 비교와 장소별 핀 설정이 새로 들어왔어요.', 'Version 2.0 adds multi-destination trips, world maps, distance comparison, and per-place pin controls.')}</p></div></div>
          <div className="guide-process-list guide-v2-list">{versionGuides.map(guide => <ProcessCard key={guide.number} guide={guide} language={language} />)}</div>
        </section>

        <div className="guide-section-heading guide-index-heading"><span>INDEX</span><div><h2>{text('기능별로 빠르게 찾기', 'Find a feature quickly')}</h2><p>{text('기억이 안 날 때 필요한 항목만 골라 보세요.', 'Jump straight to the feature you need.')}</p></div></div>
        <div className="guide-detail-grid guide-feature-grid">
          <article><Pencil /><div><h3>{text('장소 수정과 지도 후보', 'Edit places with map results')}</h3><p>{text('장소 수정에서 새 검색어를 입력하면 목록과 지도에 후보가 함께 뜹니다. 후보 핀을 눌러 선택하고, 위치 임의 수정으로 좌표만 따로 옮길 수도 있어요.', 'New search results appear both in the list and on the map. Choose a candidate pin, or move only the coordinates with Edit location.')}</p></div></article>
          <article><Palette /><div><h3>{text('카테고리별 핀 색상', 'Category pin colors')}</h3><p>{text('식사·간식·관광·숙소·교통·기타는 날짜색 계열 안에서 구분됩니다. 장소 수정에서 색상표나 6자리 색상 코드를 넣으면 사용자 색상이 가장 먼저 적용돼요.', 'Categories use distinct shades within each day. A custom color or six-digit hex value always takes priority.')}</p></div></article>
          <article><Route /><div><h3>{text('카드·핀으로 지도 찾기', 'Jump between cards and pins')}</h3><p>{text('카드를 더블클릭하면 해당 핀으로 이동해 한 번만 반짝입니다. 핀을 누르면 상세 정보가 열리고, 장소 수정으로 바로 이어갈 수 있어요.', 'Double-click a card to move to its pin and flash it once. Select a pin for details and continue directly to Edit place.')}</p></div></article>
          <article><Map /><div><h3>{text('장소 검색 범위', 'Place search area')}</h3><p>{text('여행지는 검색 우선순위일 뿐 검색 범위를 막지 않습니다. 전주 여행에서 오송역처럼 다른 지역을 찾거나, 국가 단위 여행에서 도시명을 함께 검색할 수 있어요.', 'The destination affects ranking without blocking other areas. Search for another city or include a city name when the trip covers a whole country.')}</p></div></article>
          <article><CircleDollarSign /><div><h3>{text('경비와 유류비', 'Budget and fuel cost')}</h3><p>{text('개인별·총 비용 중 하나를 입력하면 다른 값이 인원수에 맞춰 계산됩니다. 국내 일정의 예상 유류비는 직선거리 × 1.4 ÷ 연비 × 유류비로 계산하며 총경비와 따로 표시돼요.', 'Enter either per-person or total cost to calculate the other. Domestic fuel cost uses distance × 1.4 ÷ efficiency × fuel price and stays separate from the trip budget.')}</p></div></article>
          <article><Clock3 /><div><h3>{text('시간과 날짜', 'Times and dates')}</h3><p>{text('0839처럼 입력하면 08:39로 바뀌고 새 장소는 시간순으로 들어갑니다. 직접 순서를 바꾼 뒤 시간이 역순이면 시간과 시계가 붉게 표시돼요. 7일 이상은 날짜 목록을 접어둘 수 있어요.', 'Type 0839 to get 08:39. New places are sorted by time; manual order is kept and conflicting times turn red. Long date lists can be collapsed.')}</p></div></article>
          <article><LockKeyhole /><div><h3>{text('열람·편집 권한', 'Viewing and editing access')}</h3><p>{text('열람 비밀번호와 편집 비밀번호는 따로 설정할 수 있습니다. 작성자만, 모두가, 편집 비밀번호 중 상황에 맞는 편집 방식을 고르세요.', 'Viewing and editing passwords are separate. Choose Author only, Everyone, or Editing password to match how the plan will be shared.')}</p></div></article>
          <article><Save /><div><h3>{text('자동저장과 계획 저장', 'Drafts and saved plans')}</h3><p>{text('작성 중인 초안은 이 기기에 자동으로 남고, 서버 계획은 5분마다 변경분을 보관합니다. 계획 저장을 누르면 저장 결과가 화면에 표시돼요.', 'Local drafts stay on this device, while changes to server plans are backed up every five minutes. Save plan shows a clear result message.')}</p></div></article>
          <article><Copy /><div><h3>{text('복제·삭제·복원', 'Duplicate, delete, and restore')}</h3><p>{text('계획 복제는 편집 비밀번호 없는 새 복사본을 만듭니다. 삭제한 계획은 휴지통으로 이동하며 7일 안에는 복원할 수 있어요.', 'Duplicate creates a fresh copy without an editing password. Deleted plans move to Trash and can be restored for seven days.')}</p></div></article>
          <article><MessageSquareText /><div><h3>{text('피드백과 답변', 'Feedback and replies')}</h3><p>{text('피드백에는 사진을 첨부할 수 있고, 공감한 글은 좋아요를 다시 눌러 취소할 수 있습니다. 관리자 답변도 같은 목록에서 확인해요.', 'Attach a photo to feedback, toggle likes on or off, and read admin replies in the same community list.')}</p></div></article>
          <article><Star /><div><h3>{text('최근 계획과 즐겨찾기', 'Recent plans and favorites')}</h3><p>{text('계획 목록에서 이 기기로 최근 연 계획과 즐겨찾기를 따로 볼 수 있습니다. 이 기록은 기기별로 저장돼요.', 'The plan library shows recently opened trips and favorites for the current device.')}</p></div></article>
          <article><Languages /><div><h3>{text('언어·통화·테마', 'Language, currency, and themes')}</h3><p>{text('설정에서 한국어·영어와 원·달러를 바꿀 수 있습니다. 계절 테마와 캐릭터 테마도 직접 고를 수 있어요.', 'Switch between Korean and English, won and dollars, and choose a seasonal or character theme in Settings.')}</p></div></article>
          <article><House /><div><h3>{text('지도를 한눈에', 'Fit the whole map')}</h3><p>{text('지도 오른쪽 아래 집 버튼은 현재 동선의 모든 핀을 화면에 맞춥니다. 일정이 비어 있으면 선택한 여행지 전체가 보이도록 돌아가요.', 'The home button fits every stop into view. With no stops, it returns to an overview of the selected destination.')}</p></div></article>
          <article><PanelLeftClose /><div><h3>{text('일정 패널 접기', 'Collapse the planner')}</h3><p>{text('PC에서는 일정 접기로 지도를 넓게 쓰고, 모바일에서는 지도 빈 곳을 탭해 일정 패널을 내릴 수 있습니다.', 'Collapse the planner on desktop, or tap an empty area of the map on mobile to hide the planner.')}</p></div></article>
        </div>
      </TabsContent>

      <TabsContent value="mobile" className="guide-tab-panel">
        <div className="guide-section-heading"><span>MOBILE</span><div><h2>{text('작은 화면에서도 지도와 일정 함께 쓰기', 'Use the map and planner on a small screen')}</h2><p>{text('모바일에서는 화면을 넓게 쓰도록 지도와 일정 패널이 접혔다 펼쳐집니다.', 'The map and planner collapse to make better use of a small screen.')}</p></div></div>
        <div className="guide-mobile-grid">
          <article className="guide-mobile-card"><div className="guide-mobile-media"><Image src="/guide/mobile-search.webp" alt={text('모바일에서 장소 추가 창을 열고 검색 후보를 선택하는 과정', 'Opening place search and choosing a result on mobile')} width={430} height={760} unoptimized /></div><div><span>01 · {text('장소 검색', 'SEARCH')}</span><h3>{text('검색하고 정확한 후보 고르기', 'Search and choose the exact result')}</h3><p>{text('이 날짜에 장소 추가를 누른 뒤 장소명을 입력하세요. 검색 목록과 지도 후보를 확인하고 정확한 지점을 고르면 됩니다.', 'Tap Add a place to this day, enter a name, then choose the correct result from the list or map.')}</p></div></article>
          <article className="guide-mobile-card"><div className="guide-mobile-media"><Image src="/guide/mobile-map-focus.webp" alt={text('모바일에서 지도를 눌러 일정 패널을 접고 다시 펼치는 과정', 'Collapsing and expanding the planner by tapping the mobile map')} width={430} height={760} unoptimized /></div><div><span>02 · {text('지도 집중', 'MAP FOCUS')}</span><h3>{text('지도를 탭하면 넓게, 다시 탭하면 일정', 'Tap the map for space, tap again for plans')}</h3><p>{text('지도 빈 곳을 한 번 누르면 일정 패널이 내려갑니다. 다시 탭하거나 일정 보기를 누르면 원래 화면으로 돌아와요.', 'Tap an empty part of the map to hide the planner. Tap again or choose View plans to bring it back.')}</p></div></article>
          <article className="guide-mobile-card"><div className="guide-mobile-media"><Image src="/guide/mobile-edit.webp" alt={text('모바일 장소 수정 창을 아래까지 스크롤하는 과정', 'Scrolling through the mobile place editor')} width={430} height={780} unoptimized /></div><div><span>03 · {text('장소 수정', 'EDIT')}</span><h3>{text('수정창은 안에서 끝까지 스크롤', 'Scroll through the place editor')}</h3><p>{text('카드의 연필 버튼을 누르면 장소 수정창이 열립니다. 창 안을 스크롤해 핀 색상과 위치 임의 수정, 저장 버튼까지 사용할 수 있어요.', 'Tap the pencil on a card. Scroll inside the editor to reach pin color, Edit location, and Save.')}</p></div></article>
        </div>
        <div className="guide-mobile-overview"><Image src="/guide/mobile-planner.webp" alt={text('모바일 여행 일정 화면 전체 모습', 'Full mobile travel planner screen')} width={430} height={932} unoptimized /><div><span className="guide-process-number">MOBILE TIPS</span><h3>{text('휴대폰에서는 이렇게 쓰세요', 'A few mobile tips')}</h3><ul>
          <li><GripVertical />{text('카드 순서는 오른쪽 위·아래 화살표로 바꾸는 편이 빠릅니다.', 'Use the up and down arrows to reorder cards quickly.')}</li>
          <li><Search />{text('검색창의 ×를 누르고 지도를 탭하면 키보드 포커스도 풀립니다.', 'Clear the search with ×, then tap the map to release keyboard focus.')}</li>
          <li><CircleDollarSign />{text('전체 예상 경비는 날짜와 방문 순서 위쪽에 따로 표시됩니다.', 'The total estimated budget appears above the date and stop list.')}</li>
          <li><MapPin />{text('핀 상세에서 장소 수정이나 위치 임의 수정으로 바로 이어갈 수 있습니다.', 'Continue from pin details to Edit place or Edit location.')}</li>
          <li><Globe2 />{text('해외 여행도 장소 검색, 카드 수정, 저장 방식은 국내 여행과 같습니다.', 'Overseas plans use the same search, card editing, and saving flow.')}</li>
        </ul></div></div>
      </TabsContent>
    </Tabs>

    <section className="guide-faq"><span className="guide-page-kicker"><Compass /> {text('알아두면 편해요', 'GOOD TO KNOW')}</span><div className="guide-faq-grid">
      <article><h3>{text('검색 결과가 엉뚱해요', 'Search results look unrelated')}</h3><p>{text('국내는 도시명 + 장소명, 해외는 영문 도시명 + 장소명으로 검색해 보세요. 여행지는 가까운 결과를 먼저 보여주기 위한 기준이며 다른 지역 검색도 가능합니다.', 'Try city + place name. The destination ranks nearby results first but does not block results from other areas.')}</p></article>
      <article><h3>{text('해외 지명이 현지어로 보여요', 'A foreign label uses the local language')}</h3><p>{text('검색 결과는 가능한 경우 영어명을 함께 보여주지만 지도 바탕의 일부 지명은 현지어만 제공될 수 있습니다. 장소 상세보기는 Google 지도로 연결됩니다.', 'Search results include English where available, but some base-map labels may only exist in the local language. Place details open in Google Maps.')}</p></article>
      <article><h3>{text('거리 비교에서 핀을 눌렀어요', 'I selected a pin in distance mode')}</h3><p>{text('처음 누르면 그 후보와 거점을 잇는 선만 남습니다. 같은 핀을 다시 누르면 상세 정보가 열리고, 지도 빈 곳을 누르면 모든 점선이 돌아와요.', 'The first click isolates its lines to the bases. Click it again for details, or tap an empty map area to restore every dotted line.')}</p></article>
      <article><h3>{text('계획 목록에는 무엇이 보이나요?', 'What appears in the plan list?')}</h3><p>{text('비밀번호를 걸어도 여행 이름·여행지·날짜는 검색을 위해 목록에 표시될 수 있어요. 일정 내용과 메모는 열람 비밀번호로 보호됩니다.', 'The trip name, destination, and dates may remain searchable even with a password. The itinerary and notes stay behind the viewing password.')}</p></article>
      <article><h3>{text('친구와 같이 수정하려면?', 'How can friends edit with me?')}</h3><p>{text('편집 권한을 모두가로 열거나 편집 비밀번호를 따로 공유하세요. 작성자만은 처음 계획을 만든 기기의 편집 토큰이 필요합니다.', 'Allow Everyone or share a separate editing password. Author only requires the edit token from the device that created the plan.')}</p></article>
      <article><h3>{text('실수로 계획을 삭제했어요', 'I deleted a plan by mistake')}</h3><p>{text('메인의 휴지통에서 7일 안에 복원할 수 있습니다. 7일이 지나면 자동으로 완전히 삭제됩니다.', 'Restore it from Trash within seven days. It is permanently deleted after that.')}</p></article>
    </div></section>

    <div className="guide-page-cta"><div><span>VERSION 2.0</span><strong>{text('이제 직접 여행을 채워볼까요?', 'Ready to build your own trip?')}</strong></div><Link href="/plan/new?mode=domestic">{text('새 계획 만들기', 'Create a plan')} <ArrowRight /></Link></div>
  </main>;
}
