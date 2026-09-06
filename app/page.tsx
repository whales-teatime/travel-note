'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown, ArrowUp, CalendarDays, ChevronRight, CircleAlert, Clock3,
  ExternalLink, GripVertical, Map, MapPin, Navigation, Plus, Search,
  Pencil, Sparkles, Trash2, Users,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';

type DayKey = '9/19' | '9/20';
type PlaceType = '교통' | '식사' | '카페' | '관광' | '야시장' | '기타';
type Stop = { id: string; day: DayKey; time: string; name: string; category: PlaceType; memo: string; address: string; lat: number; lng: number };
type SearchPlace = { title: string; category: string; address: string; roadAddress: string; mapx: string; mapy: string };
type TripSettings = { title: string; startDate: string; endDate: string; people: number };

declare global {
  interface Window { naver?: any; __naverMapsLoading?: Promise<void>; navermap_authFailure?: () => void }
}

const DAY_COLOR: Record<DayKey, string> = { '9/19': '#ff5b35', '9/20': '#2279f2' };
const DEFAULT_TRIP: TripSettings = { title:'전주 맛집 여행', startDate:'2026-09-19', endDate:'2026-09-20', people:5 };

const seedStops: Stop[] = [
  { id:'station-arrive', day:'9/19', time:'08:39', name:'전주역', category:'교통', memo:'전주 도착', address:'전북 전주시 덕진구 동부대로 680', lat:35.8500537, lng:127.1623649 },
  { id:'veteran', day:'9/19', time:'10:00', name:'베테랑칼국수 본점', category:'식사', memo:'칼국수 또는 근처 길거리야 바게트버거', address:'전북 전주시 완산구 경기전길 135', lat:35.8134534, lng:127.1513383 },
  { id:'hanok', day:'9/19', time:'12:30', name:'전주한옥마을', category:'관광', memo:'골목 산책과 주요 관광지', address:'전북 전주시 완산구 기린대로 99 일대', lat:35.8151786, lng:127.1538888 },
  { id:'jojeomrye', day:'9/19', time:'13:00', name:'조점례남문피순대', category:'식사', memo:'순대국밥 · 피순대', address:'전북 전주시 완산구 풍남문2길 39', lat:35.81195, lng:127.1472 },
  { id:'grandma', day:'9/19', time:'14:30', name:'외할머니솜씨', category:'카페', memo:'옛날팥빙수', address:'전북 전주시 완산구 오목대길 81-8', lat:35.812675632, lng:127.152030609 },
  { id:'namno', day:'9/19', time:'18:30', name:'남노갈비 본점', category:'식사', memo:'전주식 물갈비', address:'전북 전주시 완산구 한지길 24', lat:35.8192024, lng:127.1531673 },
  { id:'nightmarket', day:'9/19', time:'21:00', name:'전주남부시장 야시장', category:'야시장', memo:'먹거리 여러 개 나눠 먹기', address:'전북 전주시 완산구 풍남문1길 19-3', lat:35.8122382, lng:127.1474635 },
  { id:'hyundaiok', day:'9/20', time:'09:00', name:'현대옥 전주역점', category:'식사', memo:'콩나물국밥', address:'전북 전주시 덕진구 백제대로 813', lat:35.84755, lng:127.16115 },
  { id:'firstwelcome', day:'9/20', time:'10:00', name:'전주역 첫마중길', category:'관광', memo:'전주역 앞 가벼운 산책', address:'전북 전주시 덕진구 우아동3가 746 일대', lat:35.8488, lng:127.1617 },
  { id:'station-leave', day:'9/20', time:'14:47', name:'전주역', category:'교통', memo:'기차 탑승', address:'전북 전주시 덕진구 동부대로 680', lat:35.8500537, lng:127.1623649 },
];

function cleanTitle(value: string) { return value.replace(/<[^>]*>/g, '') }
function formatTripDate(value:string,weekday=false){
  const date=new Date(`${value}T00:00:00`);
  if(Number.isNaN(date.getTime()))return value;
  return new Intl.DateTimeFormat('ko-KR',{month:'numeric',day:'numeric',...(weekday?{weekday:'short'}:{})}).format(date).replace(/\.\s/g,'. ');
}
function distanceKm(a: Stop, b: Stop) {
  const r = 6371, rad = (v: number) => v * Math.PI / 180;
  const dLat = rad(b.lat-a.lat), dLng = rad(b.lng-a.lng), lat1=rad(a.lat), lat2=rad(b.lat);
  const h = Math.sin(dLat/2)**2 + Math.sin(dLng/2)**2*Math.cos(lat1)*Math.cos(lat2);
  return r*2*Math.atan2(Math.sqrt(h), Math.sqrt(1-h));
}
function naverPlaceUrl(stop: Pick<Stop,'name'|'address'>) { return `https://map.naver.com/p/search/${encodeURIComponent(`${stop.name} ${stop.address}`)}` }

function loadNaverMaps(clientId: string) {
  if (window.naver?.maps) return Promise.resolve();
  if (window.__naverMapsLoading) return window.__naverMapsLoading;
  window.__naverMapsLoading = new Promise<void>((resolve,reject) => {
    window.navermap_authFailure=()=>{
      window.dispatchEvent(new Event('naver-map-auth-failure'));
      window.__naverMapsLoading=undefined;
      reject(new Error('네이버 지도 인증에 실패했습니다.'));
    };
    const callbackName=`initNaverMap_${Date.now()}`;
    (window as any)[callbackName]=()=>{ delete (window as any)[callbackName]; resolve() };
    const script=document.createElement('script');
    script.src=`https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(clientId)}&submodules=panorama,geocoder&callback=${callbackName}`;
    script.async=true;
    script.onerror=()=>{ window.__naverMapsLoading=undefined; reject(new Error('네이버 지도 SDK를 불러오지 못했습니다.')) };
    document.head.appendChild(script);
  });
  return window.__naverMapsLoading;
}

function NaverMap({stops,clientId,onSelect}:{stops:Stop[];clientId:string;onSelect:(stop:Stop)=>void}) {
  const containerRef=useRef<HTMLDivElement>(null), mapRef=useRef<any>(null), overlaysRef=useRef<any[]>([]);
  const [status,setStatus]=useState<'idle'|'loading'|'ready'|'error'>(clientId?'loading':'idle');
  useEffect(()=>{
    if(!clientId||!containerRef.current)return;
    let cancelled=false; setStatus('loading');
    const handleAuthFailure=()=>{if(!cancelled)setStatus('error')};
    window.addEventListener('naver-map-auth-failure',handleAuthFailure);
    loadNaverMaps(clientId).then(()=>{
      if(cancelled||!containerRef.current)return;
      const naver=window.naver;
      mapRef.current=new naver.maps.Map(containerRef.current,{center:new naver.maps.LatLng(35.8242,127.1534),zoom:13,minZoom:8,zoomControl:true,zoomControlOptions:{position:naver.maps.Position.RIGHT_CENTER},mapTypeControl:false,scaleControl:false,logoControlOptions:{position:naver.maps.Position.BOTTOM_LEFT}});
      setStatus('ready');
    }).catch(()=>setStatus('error'));
    return()=>{cancelled=true;window.removeEventListener('naver-map-auth-failure',handleAuthFailure)};
  },[clientId]);
  useEffect(()=>{
    const map=mapRef.current, naver=window.naver;
    if(!map||!naver?.maps||status!=='ready')return;
    overlaysRef.current.forEach(o=>o.setMap(null)); overlaysRef.current=[];
    const bounds=new naver.maps.LatLngBounds();
    stops.forEach((stop,index)=>{
      const position=new naver.maps.LatLng(stop.lat,stop.lng), color=DAY_COLOR[stop.day];
      const marker=new naver.maps.Marker({map,position,title:stop.name,zIndex:100+index,icon:{content:`<button class="naver-marker" style="--pin:${color}" aria-label="${stop.name}"><span>${index+1}</span></button>`,anchor:new naver.maps.Point(20,45)}});
      naver.maps.Event.addListener(marker,'click',()=>onSelect(stop)); overlaysRef.current.push(marker); bounds.extend(position);
    });
    if(stops.length>1){const line=new naver.maps.Polyline({map,path:stops.map(s=>new naver.maps.LatLng(s.lat,s.lng)),strokeColor:DAY_COLOR[stops[0].day],strokeWeight:5,strokeOpacity:.7,strokeStyle:'shortdash',zIndex:20});overlaysRef.current.push(line)}
    if(stops.length===1)map.setCenter(bounds.getCenter());
    if(stops.length>1)map.fitBounds(bounds,{top:80,right:80,bottom:80,left:80});
  },[stops,status,onSelect]);
  return <div className="map-stage">
    <div ref={containerRef} className="map-canvas" aria-label="네이버 지도" />
    {status!=='ready'&&<div className="map-gate"><div className="map-gate-card">
      {status==='loading'?<><div className="loading-orbit"/><strong>네이버 지도를 연결하는 중</strong><span>잠시만 기다려주세요.</span></>:status==='error'?<><CircleAlert/><strong>네이버 지도 인증에 실패했습니다</strong><span>Maps 앱의 10자 Client ID와 등록된 웹 서비스 URL을 확인해주세요.</span></>:<><Map className="text-[#03c75a]"/><strong>네이버 지도 연결이 필요합니다</strong><span>설정에서 Maps Client ID를 입력하면 실제 지도가 열립니다.</span></>}
    </div></div>}
    <div className="map-legend"><span><i style={{background:DAY_COLOR['9/19']}}/>9월 19일</span><span><i style={{background:DAY_COLOR['9/20']}}/>9월 20일</span></div>
  </div>
}

function PanoramaView({stop,clientId}:{stop:Stop;clientId:string}) {
  const ref=useRef<HTMLDivElement>(null); const [available,setAvailable]=useState(true);
  useEffect(()=>{
    if(!clientId||!ref.current||!window.naver?.maps?.Panorama)return;
    const pano=new window.naver.maps.Panorama(ref.current,{position:new window.naver.maps.LatLng(stop.lat,stop.lng),pov:{pan:0,tilt:0,fov:100}});
    const listener=window.naver.maps.Event.addListener(pano,'pano_status',(s:any)=>setAvailable(s===window.naver.maps.PanoramaStatus.OK));
    return()=>window.naver?.maps?.Event.removeListener(listener);
  },[clientId,stop]);
  return <div className="panorama-wrap"><div ref={ref} className="h-full w-full"/>{!clientId&&<span>지도 Client ID 연결 후 거리뷰를 볼 수 있습니다.</span>}{clientId&&!available&&<span>이 위치 주변에는 거리뷰가 없습니다.</span>}</div>
}

export default function Home(){
  const [activeDay,setActiveDay]=useState<DayKey>('9/19'), [stops,setStops]=useState<Stop[]>(seedStops), [selected,setSelected]=useState<Stop|null>(null);
  const [tripSettings,setTripSettings]=useState<TripSettings>(DEFAULT_TRIP), [settingsDraft,setSettingsDraft]=useState<TripSettings>(DEFAULT_TRIP);
  const [addOpen,setAddOpen]=useState(false), [settingsOpen,setSettingsOpen]=useState(false), [clientId,setClientId]=useState('');
  const [editing,setEditing]=useState<Stop|null>(null), [editDraft,setEditDraft]=useState<Stop|null>(null);
  const [query,setQuery]=useState(''), [searching,setSearching]=useState(false), [searchError,setSearchError]=useState(''), [results,setResults]=useState<SearchPlace[]>([]), [picked,setPicked]=useState<SearchPlace|null>(null);
  const [newTime,setNewTime]=useState('12:00'), [newCategory,setNewCategory]=useState<PlaceType>('식사'), [newMemo,setNewMemo]=useState(''), [draggedId,setDraggedId]=useState<string|null>(null);
  useEffect(()=>{
    const ss=localStorage.getItem('route-note-stops'),ts=localStorage.getItem('route-note-trip-settings');
    if(ss){try{setStops(JSON.parse(ss))}catch{localStorage.removeItem('route-note-stops')}}
    if(ts){try{const saved={...DEFAULT_TRIP,...JSON.parse(ts)};setTripSettings(saved);setSettingsDraft(saved)}catch{localStorage.removeItem('route-note-trip-settings')}}
    const embedded=document.querySelector<HTMLMetaElement>('meta[name="naver-map-client-id"]')?.content;
    if(embedded){setClientId(embedded);return}
    void fetch('/api/config').then(response=>response.json()).then(data=>{
      if(data.mapClientId)setClientId(data.mapClientId)
    }).catch(()=>{});
  },[]);
  useEffect(()=>{localStorage.setItem('route-note-stops',JSON.stringify(stops))},[stops]);
  useEffect(()=>{
    const context=(document as any).modelContext;
    if(!context?.registerTool)return;
    const lifecycle=new AbortController();
    const categories:PlaceType[]=['식사','카페','관광','교통','야시장','기타'];
    void Promise.resolve(context.registerTool({
      name:'add_itinerary_stop',title:'여행 일정에 장소 추가',
      description:'날짜, 시간, 장소와 좌표를 받아 현재 여행 일정과 지도에 새 방문지를 추가합니다.',
      inputSchema:{type:'object',properties:{day:{type:'string',enum:['9/19','9/20']},time:{type:'string',pattern:'^[0-2][0-9]:[0-5][0-9]$'},name:{type:'string',minLength:1},category:{type:'string',enum:categories},memo:{type:'string'},address:{type:'string',minLength:1},lat:{type:'number'},lng:{type:'number'}},required:['day','time','name','category','address','lat','lng'],additionalProperties:false},
      annotations:{readOnlyHint:false,untrustedContentHint:false},
      execute(input:unknown){
        const value=input as Partial<Stop>;
        if(!value.day||!['9/19','9/20'].includes(value.day)||!value.time||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time)||!value.name||!value.address||typeof value.lat!=='number'||typeof value.lng!=='number'||!value.category||!categories.includes(value.category))throw new Error('일정 정보가 올바르지 않습니다.');
        const stop:Stop={id:`tool-${Date.now()}`,day:value.day,time:value.time,name:value.name,category:value.category,memo:value.memo||'',address:value.address,lat:value.lat,lng:value.lng};
        setStops(current=>[...current,stop]); setActiveDay(stop.day);
        return {added:true,id:stop.id,day:stop.day,name:stop.name};
      }
    },{signal:lifecycle.signal})).catch(()=>{});
    return()=>lifecycle.abort();
  },[]);
  const dayStops=useMemo(()=>stops.filter(s=>s.day===activeDay),[stops,activeDay]);
  const selectStop=useCallback((stop:Stop)=>setSelected(stop),[]);
  const saveTripSettings=()=>{const next={...settingsDraft,title:settingsDraft.title.trim()||'나의 여행',people:Math.max(1,Math.round(Number(settingsDraft.people)||1))};setTripSettings(next);setSettingsDraft(next);localStorage.setItem('route-note-trip-settings',JSON.stringify(next));setSettingsOpen(false)};
  const searchPlaces=async()=>{if(!query.trim())return;setSearching(true);setSearchError('');setResults([]);setPicked(null);try{const response=await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`),body=await response.json();if(!response.ok)throw new Error(body.message||'검색에 실패했습니다.');setResults(body.items||[]);if(!body.items?.length)setSearchError('검색 결과가 없습니다.')}catch(error){setSearchError(error instanceof Error?error.message:'검색에 실패했습니다.')}finally{setSearching(false)}};
  const addStop=()=>{if(!picked)return;const stop:Stop={id:`${Date.now()}`,day:activeDay,time:newTime,name:cleanTitle(picked.title),category:newCategory,memo:newMemo.trim(),address:picked.roadAddress||picked.address,lat:Number(picked.mapy)/1e7,lng:Number(picked.mapx)/1e7};setStops(c=>[...c,stop]);setAddOpen(false);setQuery('');setResults([]);setPicked(null);setNewMemo('')};
  const openEdit=(stop:Stop)=>{setEditing(stop);setEditDraft({...stop})};
  const saveEdit=()=>{if(!editing||!editDraft)return;const updated={...editDraft,name:editDraft.name.trim()||editing.name,memo:editDraft.memo.trim()};setStops(current=>current.map(stop=>stop.id===editing.id?updated:stop));if(selected?.id===editing.id)setSelected(updated);setEditing(null);setEditDraft(null)};
  const moveStop=(id:string,direction:-1|1)=>setStops(current=>{const items=current.filter(s=>s.day===activeDay),i=items.findIndex(s=>s.id===id),t=i+direction;if(i<0||t<0||t>=items.length)return current;const next=[...items];[next[i],next[t]]=[next[t],next[i]];let cursor=0;return current.map(s=>s.day===activeDay?next[cursor++]:s)});
  const reorderByDrop=(targetId:string)=>{if(!draggedId||draggedId===targetId)return;setStops(current=>{const items=current.filter(s=>s.day===activeDay),from=items.findIndex(s=>s.id===draggedId),to=items.findIndex(s=>s.id===targetId);if(from<0||to<0)return current;const next=[...items],[moved]=next.splice(from,1);next.splice(to,0,moved);let cursor=0;return current.map(s=>s.day===activeDay?next[cursor++]:s)});setDraggedId(null)};
  const removeSelected=()=>{if(!selected)return;setStops(c=>c.filter(s=>s.id!==selected.id));setSelected(null)};

  const dayDates:Record<DayKey,string>={'9/19':tripSettings.startDate,'9/20':tripSettings.endDate};

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark"><Navigation/></span><span>여행을 떠나요</span><em>prototype</em></div>
      <div className="trip-title"><strong>{tripSettings.title}</strong><span>{formatTripDate(tripSettings.startDate)} — {formatTripDate(tripSettings.endDate)} · {tripSettings.people}명</span></div>
      <div className="top-actions">
        <Button variant="outline" className="settings-button" onClick={()=>{setSettingsDraft(tripSettings);setSettingsOpen(true)}}><CalendarDays/><span>여행 기본 설정</span></Button>
      </div>
    </header>

    <Dialog open={addOpen} onOpenChange={open=>{setAddOpen(open);if(!open){setQuery('');setResults([]);setPicked(null);setSearchError('')}}}>
      <DialogContent className="add-dialog sm:max-w-[540px]">
        <DialogHeader><DialogTitle>새 장소 추가</DialogTitle><DialogDescription>네이버 지역검색 결과에서 정확한 장소를 골라 일정에 추가합니다.</DialogDescription></DialogHeader>
        <div className="form-grid">
          <label>날짜<select value={activeDay} onChange={e=>setActiveDay(e.target.value as DayKey)}><option value="9/19">{formatTripDate(tripSettings.startDate,true)}</option><option value="9/20">{formatTripDate(tripSettings.endDate,true)}</option></select></label>
          <label>시간<Input type="time" value={newTime} onChange={e=>setNewTime(e.target.value)}/></label>
          <label>종류<select value={newCategory} onChange={e=>setNewCategory(e.target.value as PlaceType)}>{['식사','카페','관광','교통','야시장','기타'].map(t=><option key={t}>{t}</option>)}</select></label>
        </div>
        <div className="search-box"><label htmlFor="place-query">장소</label><div className="search-row"><Input id="place-query" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==='Enter'&&searchPlaces()} placeholder="예: 전주 현대옥 전주역점"/><Button onClick={searchPlaces} disabled={searching||!query.trim()}><Search/>{searching?'검색 중':'검색'}</Button></div></div>
        {searchError&&<div className="inline-notice"><CircleAlert/>{searchError}</div>}
        {results.length>0&&<div className="search-results" role="listbox" aria-label="장소 검색 결과">{results.map((place,index)=><button type="button" key={`${place.mapx}-${place.mapy}-${index}`} className={picked===place?'picked':''} onClick={()=>setPicked(place)}><MapPin/><span><strong>{cleanTitle(place.title)}</strong><small>{place.category}</small><em>{place.roadAddress||place.address}</em></span><ChevronRight/></button>)}</div>}
        <label className="memo-field">메모 <Textarea value={newMemo} onChange={e=>setNewMemo(e.target.value)} placeholder="먹을 메뉴, 예약 정보처럼 기억할 내용을 적어보세요."/></label>
        <DialogFooter><Button variant="outline" onClick={()=>setAddOpen(false)}>취소</Button><Button onClick={addStop} disabled={!picked}>일정에 추가</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    <section className="workspace">
      <aside className="planner-panel">
        <div className="day-switch" role="tablist" aria-label="여행 날짜">{(['9/19','9/20'] as DayKey[]).map((day,index)=><button key={day} role="tab" aria-selected={activeDay===day} onClick={()=>setActiveDay(day)}><span>DAY {index+1}</span><strong>{formatTripDate(dayDates[day],true)}</strong></button>)}</div>
        <div className="panel-heading"><div><span><CalendarDays/>방문 순서</span><strong>{dayStops.length}개 장소</strong></div><p>카드를 끌어 순서를 바꾸면 지도도 바로 바뀝니다.</p></div>
        <div className="stop-list">{dayStops.map((stop,index)=>{const previous=dayStops[index-1],gap=previous?distanceKm(previous,stop):null;return <div key={stop.id}>{gap!==null&&<div className="distance-chip"><span/>직선 {gap<1?`${Math.round(gap*1000)}m`:`${gap.toFixed(1)}km`}</div>}<article className="stop-card" draggable onDragStart={()=>setDraggedId(stop.id)} onDragOver={e=>e.preventDefault()} onDrop={()=>reorderByDrop(stop.id)} onClick={()=>setSelected(stop)}><div className="drag-handle" aria-hidden="true"><GripVertical/></div><div className="order-pin" style={{background:DAY_COLOR[activeDay]}}>{index+1}</div><div className="stop-main"><div className="stop-time"><Clock3/>{stop.time}<span>{stop.category}</span></div><strong>{stop.name}</strong><p>{stop.memo||'메모 없음'}</p></div><div className="card-actions"><button className="edit-card-button" aria-label={`${stop.name} 수정`} onClick={e=>{e.stopPropagation();openEdit(stop)}}><Pencil/><span>수정</span></button><div className="move-buttons"><button aria-label={`${stop.name} 위로 이동`} disabled={index===0} onClick={e=>{e.stopPropagation();moveStop(stop.id,-1)}}><ArrowUp/></button><button aria-label={`${stop.name} 아래로 이동`} disabled={index===dayStops.length-1} onClick={e=>{e.stopPropagation();moveStop(stop.id,1)}}><ArrowDown/></button></div></div></article></div>})}</div>
        <Button variant="outline" className="wide-add" onClick={()=>setAddOpen(true)}><Plus/>이 날짜에 장소 추가</Button>
      </aside>
      <section className="map-panel"><div className="map-toolbar"><div><Sparkles/><span><strong>{activeDay==='9/19'?'첫째 날':'둘째 날'} 동선</strong> · 번호 순서대로 연결</span></div><span className="naver-badge"><b>N</b>NAVER 지도</span></div><NaverMap stops={dayStops} clientId={clientId} onSelect={selectStop}/></section>
    </section>

    <Sheet open={Boolean(selected)} onOpenChange={open=>!open&&setSelected(null)}><SheetContent className="place-sheet sm:max-w-[430px]">{selected&&<><SheetHeader><div className="sheet-eyebrow"><span style={{background:DAY_COLOR[selected.day]}}>{dayStops.findIndex(s=>s.id===selected.id)+1}</span>{formatTripDate(dayDates[selected.day])} · {selected.time} · {selected.category}</div><SheetTitle>{selected.name}</SheetTitle><SheetDescription>{selected.address}</SheetDescription></SheetHeader><div className="sheet-body"><div className="section-title"><span>거리뷰</span><small>네이버 파노라마</small></div><PanoramaView stop={selected} clientId={clientId}/><div className="place-note"><span>메모</span><p>{selected.memo||'등록된 메모가 없습니다.'}</p></div><a className="naver-link" href={naverPlaceUrl(selected)} target="_blank" rel="noreferrer"><span><b>N</b>네이버지도에서 상세·후기 보기</span><ExternalLink/></a><Button variant="destructive" className="delete-button" onClick={removeSelected}><Trash2/>이 장소 삭제</Button></div></>}</SheetContent></Sheet>

    <Dialog open={Boolean(editing)} onOpenChange={open=>{if(!open){setEditing(null);setEditDraft(null)}}}><DialogContent className="edit-dialog sm:max-w-[500px]">{editDraft&&<><DialogHeader><DialogTitle>장소 수정</DialogTitle><DialogDescription>시간, 종류와 메모를 현재 일정에 맞게 바꿀 수 있습니다.</DialogDescription></DialogHeader><div className="edit-grid"><label>장소명<Input value={editDraft.name} onChange={e=>setEditDraft({...editDraft,name:e.target.value})}/></label><div className="form-grid two"><label>시간<Input type="time" value={editDraft.time} onChange={e=>setEditDraft({...editDraft,time:e.target.value})}/></label><label>종류<select value={editDraft.category} onChange={e=>setEditDraft({...editDraft,category:e.target.value as PlaceType})}>{['식사','카페','관광','교통','야시장','기타'].map(t=><option key={t}>{t}</option>)}</select></label></div><label>메모<Textarea value={editDraft.memo} onChange={e=>setEditDraft({...editDraft,memo:e.target.value})} placeholder="먹을 메뉴, 예약 정보처럼 기억할 내용을 적어보세요."/></label><label>주소<Input value={editDraft.address} readOnly/></label></div><DialogFooter><Button variant="outline" onClick={()=>{setEditing(null);setEditDraft(null)}}>취소</Button><Button onClick={saveEdit}>수정 저장</Button></DialogFooter></>}</DialogContent></Dialog>

    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}><DialogContent className="settings-dialog sm:max-w-[500px]"><DialogHeader><DialogTitle>여행 기본 설정</DialogTitle><DialogDescription>여행 이름과 날짜, 함께 가는 인원을 설정합니다.</DialogDescription></DialogHeader><div className="trip-settings-grid"><label>여행 이름<Input value={settingsDraft.title} onChange={e=>setSettingsDraft({...settingsDraft,title:e.target.value})} placeholder="예: 전주 맛집 여행"/></label><div className="date-fields"><label>출발일<Input type="date" value={settingsDraft.startDate} onChange={e=>setSettingsDraft({...settingsDraft,startDate:e.target.value})}/></label><label>돌아오는 날<Input type="date" min={settingsDraft.startDate} value={settingsDraft.endDate} onChange={e=>setSettingsDraft({...settingsDraft,endDate:e.target.value})}/></label></div><label>인원<div className="people-input"><Users/><Input type="number" min="1" max="99" value={settingsDraft.people} onChange={e=>setSettingsDraft({...settingsDraft,people:Number(e.target.value)})}/><span>명</span></div></label></div>{settingsDraft.startDate>settingsDraft.endDate&&<div className="inline-notice"><CircleAlert/>돌아오는 날은 출발일보다 빠를 수 없습니다.</div>}<DialogFooter><Button variant="outline" onClick={()=>setSettingsOpen(false)}>취소</Button><Button onClick={saveTripSettings} disabled={!settingsDraft.startDate||!settingsDraft.endDate||settingsDraft.startDate>settingsDraft.endDate}>설정 저장</Button></DialogFooter></DialogContent></Dialog>
  </main>
}
