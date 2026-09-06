'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown, ArrowUp, CalendarDays, CircleAlert, Clock3,
  ExternalLink, GripVertical, House, Map, MapPin, Navigation, Plus,
  Pencil, Sparkles, Trash2, Users, X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';

type DayKey = '9/19' | '9/20';
type PlaceType = '식사' | '간식' | '관광' | '숙소' | '기타';
type Stop = { id: string; day: DayKey; time: string; name: string; category: PlaceType; memo: string; address: string; lat: number; lng: number; customLocation?: boolean; naverLink?: string; costPerPerson?: number; costTotal?: number; costBasis?: 'person'|'total' };
type SearchPlace = { title: string; category: string; address: string; roadAddress: string; mapx: string; mapy: string; link?: string; description?: string };
type TripSettings = { title: string; destination: string; startDate: string; endDate: string; people: number };

declare global {
  interface Window { naver?: any; __naverMapsLoading?: Promise<void>; navermap_authFailure?: () => void }
}

const DAY_COLOR: Record<DayKey, string> = { '9/19': '#ff5b35', '9/20': '#2279f2' };
const DEFAULT_MAP_CENTER = { lat:35.8242, lng:127.1534 };
const DEFAULT_TRIP: TripSettings = { title:'전주 맛집 여행', destination:'전주', startDate:'2026-09-19', endDate:'2026-09-20', people:5 };
const PLACE_CATEGORIES: PlaceType[] = ['식사','간식','관광','숙소','기타'];
const suggestionCache = new globalThis.Map<string, SearchPlace[]>();

const seedStops: Stop[] = [
  { id:'station-arrive', day:'9/19', time:'08:39', name:'전주역', category:'기타', memo:'전주 도착', address:'전북 전주시 덕진구 동부대로 680', lat:35.8500537, lng:127.1623649 },
  { id:'veteran', day:'9/19', time:'10:00', name:'베테랑칼국수 본점', category:'식사', memo:'칼국수 또는 근처 길거리야 바게트버거', address:'전북 전주시 완산구 경기전길 135', lat:35.8134534, lng:127.1513383 },
  { id:'hanok', day:'9/19', time:'12:30', name:'전주한옥마을', category:'관광', memo:'골목 산책과 주요 관광지', address:'전북 전주시 완산구 기린대로 99 일대', lat:35.8151786, lng:127.1538888 },
  { id:'jojeomrye', day:'9/19', time:'13:00', name:'조점례남문피순대', category:'식사', memo:'순대국밥 · 피순대', address:'전북 전주시 완산구 풍남문2길 39', lat:35.81195, lng:127.1472 },
  { id:'grandma', day:'9/19', time:'14:30', name:'외할머니솜씨', category:'간식', memo:'옛날팥빙수', address:'전북 전주시 완산구 오목대길 81-8', lat:35.812675632, lng:127.152030609 },
  { id:'namno', day:'9/19', time:'18:30', name:'남노갈비 본점', category:'식사', memo:'전주식 물갈비', address:'전북 전주시 완산구 한지길 24', lat:35.8192024, lng:127.1531673 },
  { id:'nightmarket', day:'9/19', time:'21:00', name:'전주남부시장 야시장', category:'간식', memo:'먹거리 여러 개 나눠 먹기', address:'전북 전주시 완산구 풍남문1길 19-3', lat:35.8122382, lng:127.1474635 },
  { id:'hyundaiok', day:'9/20', time:'09:00', name:'현대옥 전주역점', category:'식사', memo:'콩나물국밥', address:'전북 전주시 덕진구 백제대로 813', lat:35.84755, lng:127.16115 },
  { id:'firstwelcome', day:'9/20', time:'10:00', name:'전주역 첫마중길', category:'관광', memo:'전주역 앞 가벼운 산책', address:'전북 전주시 덕진구 우아동3가 746 일대', lat:35.8488, lng:127.1617 },
  { id:'station-leave', day:'9/20', time:'14:47', name:'전주역', category:'기타', memo:'기차 탑승', address:'전북 전주시 덕진구 동부대로 680', lat:35.8500537, lng:127.1623649 },
];

function cleanTitle(value: string) { return value.replace(/<[^>]*>/g, '') }
function normalizeCategory(value: string): PlaceType {
  if(value==='카페'||value==='야시장')return '간식';
  if(value==='교통')return '기타';
  return PLACE_CATEGORIES.includes(value as PlaceType)?value as PlaceType:'기타';
}
function escapeHtml(value:string){return value.replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':'&quot;'}[char]||char))}
function formatTripDate(value:string,weekday=false){
  const date=new Date(`${value}T00:00:00`);
  if(Number.isNaN(date.getTime()))return value;
  return new Intl.DateTimeFormat('ko-KR',{month:'numeric',day:'numeric',...(weekday?{weekday:'short'}:{})}).format(date).replace(/\.\s/g,'. ');
}
function usePlaceSuggestions(query:string,enabled:boolean,context=''){
  const [results,setResults]=useState<SearchPlace[]>([]),[searching,setSearching]=useState(false),[error,setError]=useState('');
  useEffect(()=>{
    const value=query.trim();
    if(!enabled||value.length<2){setResults([]);setSearching(false);setError('');return}
    const cacheKey=`${context}|${value}`.toLocaleLowerCase('ko-KR'),cached=suggestionCache.get(cacheKey);
    if(cached){setResults(cached);setSearching(false);setError(cached.length?'':'검색 결과가 없습니다.');return}
    const controller=new AbortController();
    const timer=window.setTimeout(async()=>{
      setSearching(true);setError('');
      try{
        const response=await fetch(`/api/search?q=${encodeURIComponent(value)}&near=${encodeURIComponent(context)}`,{signal:controller.signal}),body=await response.json();
        if(!response.ok)throw new Error(body.message||'검색에 실패했습니다.');
        const items=body.items||[];suggestionCache.set(cacheKey,items);setResults(items);if(!items.length)setError('검색 결과가 없습니다.');
      }catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'검색에 실패했습니다.')}
      finally{if(!controller.signal.aborted)setSearching(false)}
    },160);
    return()=>{window.clearTimeout(timer);controller.abort()};
  },[query,enabled,context]);
  return {results,searching,error};
}
function PlacePicker({query,onQueryChange,results,value,onPick,searching,placeholder,selected,onEnter}:{query:string;onQueryChange:(value:string,userInput:boolean)=>void;results:SearchPlace[];value:SearchPlace|null;onPick:(place:SearchPlace|null)=>void;searching:boolean;placeholder:string;selected:boolean;onEnter?:()=>void}){
  const [open,setOpen]=useState(false);
  const suppressClearRef=useRef(false);
  useEffect(()=>{setOpen(query.trim().length>=2&&!selected)},[query,selected]);
  return <Combobox<SearchPlace> items={results} filteredItems={results} filter={null} value={value} inputValue={query} open={open} onOpenChange={setOpen} onInputValueChange={(next,details)=>{if(details.reason==='input-change'||(details.reason==='input-clear'&&!suppressClearRef.current))onQueryChange(next,true)}} onValueChange={place=>{onPick(place);if(place)setOpen(false)}} itemToStringLabel={place=>cleanTitle(place.title)}>
    <ComboboxInput className="place-combobox-input" placeholder={placeholder} showTrigger={false} onKeyDownCapture={event=>{if(event.key==='Enter'){event.preventDefault();event.stopPropagation();suppressClearRef.current=true;onQueryChange(query,false);onEnter?.();setOpen(false);window.setTimeout(()=>{suppressClearRef.current=false},250)}}}/>
    <ComboboxContent className="place-combobox-content">
      <ComboboxEmpty>{searching?'네이버 지도에서 검색 중…':'검색 결과가 없습니다.'}</ComboboxEmpty>
      <ComboboxList>{results.map((place,index)=><ComboboxItem className="place-combobox-item" key={`${place.mapx}-${place.mapy}-${index}`} value={place}><MapPin/><span><strong>{cleanTitle(place.title)}</strong><small>{place.category}</small><em>{place.roadAddress||place.address}</em></span></ComboboxItem>)}</ComboboxList>
    </ComboboxContent>
  </Combobox>
}

function isValidTime(value:string){return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)}
function costInputValue(value:number|undefined){return typeof value==='number'&&Number.isFinite(value)?String(Math.round(value)):''}
function parseCostInput(value:string){const digits=value.replace(/[^0-9]/g,'');return digits?Math.min(Number(digits),999999999):null}
function costValues(stop:Pick<Stop,'costPerPerson'|'costTotal'>,people:number){
  const count=Math.max(1,people||1),personal=typeof stop.costPerPerson==='number'&&Number.isFinite(stop.costPerPerson)?stop.costPerPerson:typeof stop.costTotal==='number'&&Number.isFinite(stop.costTotal)?Math.round(stop.costTotal/count):0;
  const total=typeof stop.costTotal==='number'&&Number.isFinite(stop.costTotal)?stop.costTotal:personal*count;
  return {personal,total};
}
function formatWon(value:number){return `${Math.round(value).toLocaleString('ko-KR')}원`}
function normalizeTimeInput(raw:string){
  const value=raw.replace(/[^0-9:]/g,'');
  const colon=value.indexOf(':');
  let hours='',minutes='';
  if(colon>=0){hours=value.slice(0,colon).replace(/:/g,'').slice(0,2);minutes=value.slice(colon+1).replace(/:/g,'').slice(0,2)}
  else {const digits=value.replace(/:/g,'').slice(0,4);hours=digits.slice(0,2);minutes=digits.slice(2)}
  if(hours.length===2){hours=String(Math.min(23,Number(hours))).padStart(2,'0')}
  if(minutes.length===2){minutes=String(Math.min(59,Number(minutes))).padStart(2,'0')}
  return hours.length>2?hours.slice(0,2):minutes.length?`${hours.padStart(2,'0')}:${minutes}`:hours;
}
function Time24Input({value,onChange}:{value:string;onChange:(value:string)=>void}){
  const invalid=value.length>0&&!isValidTime(value);
  return <Input type="text" inputMode="numeric" autoComplete="off" maxLength={5} placeholder="00:00" value={value} onChange={event=>onChange(normalizeTimeInput(event.target.value))} aria-label="시간(24시간)" aria-invalid={invalid}/>;
}
function distanceKm(a: Stop, b: Stop) {
  const r = 6371, rad = (v: number) => v * Math.PI / 180;
  const dLat = rad(b.lat-a.lat), dLng = rad(b.lng-a.lng), lat1=rad(a.lat), lat2=rad(b.lat);
  const h = Math.sin(dLat/2)**2 + Math.sin(dLng/2)**2*Math.cos(lat1)*Math.cos(lat2);
  return r*2*Math.atan2(Math.sqrt(h), Math.sqrt(1-h));
}
function timeMinutes(value:string){const [hours,minutes]=value.split(':').map(Number);return Number.isFinite(hours)&&Number.isFinite(minutes)?hours*60+minutes:Infinity}
function insertStopByTime(current:Stop[],stop:Stop){
  const dayItems=current.filter(item=>item.day===stop.day),insertBefore=dayItems.find(item=>timeMinutes(item.time)>timeMinutes(stop.time));
  if(!insertBefore)return [...current,stop];
  const index=current.findIndex(item=>item.id===insertBefore.id);
  return index<0?[...current,stop]:[...current.slice(0,index),stop,...current.slice(index)];
}
function naverPlaceUrl(stop: Pick<Stop,'name'|'address'>) { return `https://map.naver.com/p/search/${encodeURIComponent(`${stop.name} ${stop.address}`)}` }
function geocodeAddress(query:string):Promise<{lat:number;lng:number;address:string}> {
  return new Promise((resolve,reject)=>{
    const service=window.naver?.maps?.Service;
    if(!service?.geocode){reject(new Error('주소 검색을 사용할 수 없습니다.'));return}
    service.geocode({query},(status:any,response:any)=>{
      const ok=status===window.naver.maps.Service.Status.OK||status==='OK';
      const item=response?.v2?.addresses?.[0]||response?.result?.items?.[0];
      if(!ok||!item){reject(new Error('주소를 찾지 못했습니다.'));return}
      const lat=Number(item.y),lng=Number(item.x);
      if(!Number.isFinite(lat)||!Number.isFinite(lng)){reject(new Error('주소 좌표를 확인하지 못했습니다.'));return}
      resolve({lat,lng,address:item.roadAddress||item.jibunAddress||item.address||query});
    });
  });
}
function reverseGeocodePoint(lat:number,lng:number):Promise<string> {
  return new Promise((resolve,reject)=>{
    const naver=window.naver, service=naver?.maps?.Service;
    if(!service?.reverseGeocode||!naver?.maps?.LatLng){reject(new Error('주소 변환을 사용할 수 없습니다.'));return}
    const orders=[service.OrderType?.ROAD_ADDR,service.OrderType?.ADDR].filter(Boolean).join(',');
    const options:any={coords:new naver.maps.LatLng(lat,lng)};
    if(orders)options.orders=orders;
    service.reverseGeocode(options,(status:any,response:any)=>{
      const ok=status===service.Status.OK||status==='OK';
      const address=response?.v2?.address, item=response?.result?.items?.[0];
      const value=address?.roadAddress||address?.jibunAddress||address?.addressLine||item?.roadAddress||item?.jibunAddress||item?.address;
      if(!ok||!value){reject(new Error('주소를 찾지 못했습니다.'));return}
      resolve(value);
    });
  });
}

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

function NaverMap({stops,clientId,destination,onSelect,placeResults,onPlaceSelect,dateLabels,activeDay,onDayChange,editableStopId,onStopPositionChange,onCancelStopPositionEdit,customPin,customPinMode,onCustomLocationChange,onCustomAddressChange,onCustomPinContinue}:{stops:Stop[];clientId:string;destination:string;onSelect:(stop:Stop)=>void;placeResults:SearchPlace[];onPlaceSelect:(place:SearchPlace)=>void;dateLabels:Record<DayKey,string>;activeDay:DayKey;onDayChange:(day:DayKey)=>void;editableStopId:string|null;onStopPositionChange:(id:string,lat:number,lng:number)=>void;onCancelStopPositionEdit:()=>void;customPin:{lat:number;lng:number}|null;customPinMode:boolean;onCustomLocationChange:(point:{lat:number;lng:number})=>void;onCustomAddressChange:(address:string)=>void;onCustomPinContinue:()=>void}) {
  const containerRef=useRef<HTMLDivElement>(null), mapRef=useRef<any>(null), overlaysRef=useRef<any[]>([]), placeOverlaysRef=useRef<any[]>([]), customOverlayRef=useRef<any>(null);
  const [status,setStatus]=useState<'idle'|'loading'|'ready'|'error'>(clientId?'loading':'idle');
  const [cityCenter,setCityCenter]=useState(DEFAULT_MAP_CENTER);
  useEffect(()=>{
    if(!clientId||!containerRef.current)return;
    let cancelled=false; setStatus('loading');
    const handleAuthFailure=()=>{if(!cancelled)setStatus('error')};
    window.addEventListener('naver-map-auth-failure',handleAuthFailure);
    loadNaverMaps(clientId).then(()=>{
      if(cancelled||!containerRef.current)return;
      const naver=window.naver;
      mapRef.current=new naver.maps.Map(containerRef.current,{center:new naver.maps.LatLng(DEFAULT_MAP_CENTER.lat,DEFAULT_MAP_CENTER.lng),zoom:12,minZoom:8,zoomControl:true,zoomControlOptions:{position:naver.maps.Position.RIGHT_CENTER},mapTypeControl:false,scaleControl:false,logoControlOptions:{position:naver.maps.Position.BOTTOM_LEFT}});
      setStatus('ready');
    }).catch(()=>setStatus('error'));
    return()=>{cancelled=true;window.removeEventListener('naver-map-auth-failure',handleAuthFailure)};
  },[clientId]);
  useEffect(()=>{
    const map=mapRef.current,naver=window.naver;
    if(!map||!naver?.maps||status!=='ready')return;
    let cancelled=false;
    const applyCenter=(point:{lat:number;lng:number})=>{
      if(cancelled)return;
      setCityCenter(point);
      map.setCenter(new naver.maps.LatLng(point.lat,point.lng));
      map.setZoom(12);
    };
    const query=destination.trim();
    if(!query){applyCenter(DEFAULT_MAP_CENTER);return()=>{cancelled=true}};
    geocodeAddress(query)
      .catch(()=>geocodeAddress(`${query} 시청`))
      .then(point=>applyCenter(point))
      .catch(()=>{if(!cancelled){setCityCenter(DEFAULT_MAP_CENTER);map.setCenter(new naver.maps.LatLng(DEFAULT_MAP_CENTER.lat,DEFAULT_MAP_CENTER.lng));map.setZoom(12)}});
    return()=>{cancelled=true};
  },[destination,status]);
  useEffect(()=>{
    const map=mapRef.current,naver=window.naver;
    if(!map||!naver?.maps||status!=='ready'||stops.length)return;
    map.setCenter(new naver.maps.LatLng(cityCenter.lat,cityCenter.lng));
    map.setZoom(12);
  },[stops.length,cityCenter,status]);
  useEffect(()=>{
    const map=mapRef.current, naver=window.naver;
    if(!map||!naver?.maps||status!=='ready')return;
    overlaysRef.current.forEach(o=>{try{o?.setMap(null)}catch{}}); overlaysRef.current=[];
    stops.forEach((stop,index)=>{
      const position=new naver.maps.LatLng(stop.lat,stop.lng), color=DAY_COLOR[stop.day];
      const marker=new naver.maps.Marker({map,position,title:stop.name,clickable:true,draggable:editableStopId===stop.id,zIndex:100+index,icon:{content:`<button type="button" class="naver-marker" style="--pin:${color}" aria-label="${escapeHtml(stop.name)} 정보 보기"><span>${index+1}</span></button>`,anchor:new naver.maps.Point(20,45)}});
      naver.maps.Event.addListener(marker,'click',()=>onSelect(stop));
      if(editableStopId===stop.id){naver.maps.Event.addListener(marker,'dragend',()=>{const point=marker.getPosition();onStopPositionChange(stop.id,point.lat(),point.lng())})}
      overlaysRef.current.push(marker);
    });
    if(stops.length>1){const line=new naver.maps.Polyline({map,path:stops.map(s=>new naver.maps.LatLng(s.lat,s.lng)),strokeColor:DAY_COLOR[stops[0].day],strokeWeight:5,strokeOpacity:.7,strokeStyle:'shortdash',zIndex:20});overlaysRef.current.push(line)}
  },[stops,status,onSelect,editableStopId,onStopPositionChange]);
  const fitItinerary=useCallback(()=>{
    const map=mapRef.current,naver=window.naver;
    if(!map||!naver?.maps||status!=='ready')return;
    if(!stops.length){
      map.setCenter(new naver.maps.LatLng(cityCenter.lat,cityCenter.lng));
      map.setZoom(12);
      return;
    }
    const bounds=new naver.maps.LatLngBounds();
    stops.forEach(stop=>bounds.extend(new naver.maps.LatLng(stop.lat,stop.lng)));
    if(stops.length===1){map.setCenter(bounds.getCenter());map.setZoom(15);return}
    map.fitBounds(bounds,{top:100,right:90,bottom:105,left:90});
  },[stops,cityCenter,status]);
  useEffect(()=>{
    const map=mapRef.current,naver=window.naver;
    if(!map||!naver?.maps||status!=='ready')return;
    const listener=naver.maps.Event.addListener(map,'click',(event:any)=>{
      if(!customPinMode)return;
      const point=event.coord||event.latlng;
      if(point){
        const next={lat:point.lat(),lng:point.lng()};
        onCustomLocationChange(next);
        reverseGeocodePoint(next.lat,next.lng).then(onCustomAddressChange).catch(()=>{});
      }
    });
    return()=>naver?.maps?.Event?.removeListener?.(listener);
  },[customPinMode,status,onCustomLocationChange]);
  useEffect(()=>{
    const map=mapRef.current,naver=window.naver;
    if(!map||!naver?.maps||status!=='ready')return;
    try{customOverlayRef.current?.setMap(null)}catch{} customOverlayRef.current=null;
    if(!customPin)return;
    const marker=new naver.maps.Marker({map,position:new naver.maps.LatLng(customPin.lat,customPin.lng),title:'임의 위치',draggable:customPinMode,zIndex:400,icon:{content:'<button type="button" class="custom-pin-marker" aria-label="임의 핀 위치"><span>＋</span></button>',anchor:new naver.maps.Point(18,42)}});
    naver.maps.Event.addListener(marker,'dragend',()=>{const point=marker.getPosition();const next={lat:point.lat(),lng:point.lng()};onCustomLocationChange(next);reverseGeocodePoint(next.lat,next.lng).then(onCustomAddressChange).catch(()=>{})});
    customOverlayRef.current=marker;
    if(customPinMode)map.panTo(marker.getPosition());
    return()=>{try{marker.setMap(null)}catch{} if(customOverlayRef.current===marker)customOverlayRef.current=null};
  },[customPin,status,customPinMode,onCustomLocationChange,onCustomAddressChange]);
  useEffect(()=>{
    const map=mapRef.current,naver=window.naver;
    if(!map||!naver?.maps||status!=='ready')return;
    placeOverlaysRef.current.forEach(o=>{try{o?.setMap(null)}catch{}});placeOverlaysRef.current=[];
    if(!placeResults.length)return;
    const bounds=new naver.maps.LatLngBounds();
    placeResults.forEach((place,index)=>{
      const position=new naver.maps.LatLng(Number(place.mapy)/1e7,Number(place.mapx)/1e7);
      const name=cleanTitle(place.title);
      const marker=new naver.maps.Marker({map,position,title:name,clickable:true,zIndex:250+index,icon:{content:`<button type="button" class="place-result-marker" aria-label="${escapeHtml(name)} 정보 보기"><span>${index+1}</span></button>`,anchor:new naver.maps.Point(17,40)}});
      naver.maps.Event.addListener(marker,'click',()=>onPlaceSelect(place));placeOverlaysRef.current.push(marker);bounds.extend(position);
    });
    if(placeResults.length===1)map.panTo(bounds.getCenter());else map.fitBounds(bounds,{top:120,right:70,bottom:110,left:70});
  },[placeResults,status,onPlaceSelect]);
  return <div className="map-stage">
    <div ref={containerRef} className="map-canvas" aria-label="네이버 지도" />
    {status!=='ready'&&<div className="map-gate"><div className="map-gate-card">
      {status==='loading'?<><div className="loading-orbit"/><strong>네이버 지도를 연결하는 중</strong><span>잠시만 기다려주세요.</span></>:status==='error'?<><CircleAlert/><strong>네이버 지도 인증에 실패했습니다</strong><span>Maps 앱의 10자 Client ID와 등록된 웹 서비스 URL을 확인해주세요.</span></>:<><Map className="text-[#03c75a]"/><strong>네이버 지도 연결이 필요합니다</strong><span>설정에서 Maps Client ID를 입력하면 실제 지도가 열립니다.</span></>}
    </div></div>}
    <button type="button" className="map-home-button" onClick={fitItinerary} aria-label={stops.length?'전체 동선 한눈에 보기':'여행지 전체 보기'} title={stops.length?'전체 동선 한눈에 보기':'여행지 전체 보기'}><House/></button>
    <div className="map-legend">{(['9/19','9/20'] as DayKey[]).map(day=><button type="button" key={day} className={`map-date-button ${activeDay===day?'is-active':''}`} aria-pressed={activeDay===day} onClick={()=>onDayChange(day)}><i style={{background:DAY_COLOR[day]}}/>{formatTripDate(dateLabels[day])}</button>)}</div>
    {customPinMode&&<div className="map-location-editor"><strong>지도에서 위치를 정하세요</strong><span>지도를 클릭하거나 초록 핀을 끌어 옮긴 뒤 계속하세요.</span><Button onClick={onCustomPinContinue} disabled={!customPin}>이 위치로 계속</Button></div>}
    {editableStopId&&<div className="map-location-editor"><strong>위치 수정 중</strong><span>선택한 장소의 핀을 드래그해 위치를 바꾸세요.</span><Button variant="outline" onClick={onCancelStopPositionEdit}>취소</Button></div>}
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
  const [editing,setEditing]=useState<Stop|null>(null), [editDraft,setEditDraft]=useState<Stop|null>(null), [editQuery,setEditQuery]=useState(''), [editPlaceLinked,setEditPlaceLinked]=useState(true);
  const [query,setQuery]=useState(''), [picked,setPicked]=useState<SearchPlace|null>(null);
  const [mapQuery,setMapQuery]=useState(''),[mapPicked,setMapPicked]=useState<SearchPlace|null>(null),[mapCandidate,setMapCandidate]=useState<SearchPlace|null>(null),[mapResultPlaces,setMapResultPlaces]=useState<SearchPlace[]>([]);
  const [customPinMode,setCustomPinMode]=useState(false),[customPin,setCustomPin]=useState<{lat:number;lng:number}|null>(null),[customPinOpen,setCustomPinOpen]=useState(false),[locationEditingId,setLocationEditingId]=useState<string|null>(null);
  const [customDay,setCustomDay]=useState<DayKey>('9/19'),[customName,setCustomName]=useState(''),[customAddress,setCustomAddress]=useState(''),[customMemo,setCustomMemo]=useState(''),[customTime,setCustomTime]=useState('12:00'),[customCategory,setCustomCategory]=useState<PlaceType>('관광'),[customAddressSearching,setCustomAddressSearching]=useState(false),[customAddressError,setCustomAddressError]=useState('');
  const [newTime,setNewTime]=useState('12:00'), [newCategory,setNewCategory]=useState<PlaceType>('식사'), [newMemo,setNewMemo]=useState(''), [draggedId,setDraggedId]=useState<string|null>(null), [dragOverId,setDragOverId]=useState<string|null>(null), [justMovedId,setJustMovedId]=useState<string|null>(null);
  const addSuggestions=usePlaceSuggestions(query,addOpen,tripSettings.destination),editSuggestions=usePlaceSuggestions(editQuery,Boolean(editing),tripSettings.destination),mapSuggestions=usePlaceSuggestions(mapQuery,true,tripSettings.destination);
  useEffect(()=>{
    const ss=localStorage.getItem('route-note-stops'),ts=localStorage.getItem('route-note-trip-settings');
    if(ss){try{const savedStops=JSON.parse(ss) as Stop[];setStops(savedStops.map(stop=>({...stop,category:normalizeCategory(String(stop.category))})))}catch{localStorage.removeItem('route-note-stops')}}
    if(ts){try{const saved={...DEFAULT_TRIP,...JSON.parse(ts)};setTripSettings(saved);setSettingsDraft(saved)}catch{localStorage.removeItem('route-note-trip-settings')}}
    const embedded=document.querySelector<HTMLMetaElement>('meta[name="naver-map-client-id"]')?.content;
    if(embedded){setClientId(embedded);return}
    void fetch('/api/config').then(response=>response.json()).then(data=>{
      if(data.mapClientId)setClientId(data.mapClientId)
    }).catch(()=>{});
  },[]);
  useEffect(()=>{localStorage.setItem('route-note-stops',JSON.stringify(stops))},[stops]);
  useEffect(()=>{
    const people=Math.max(1,tripSettings.people||1);
    setStops(current=>{
      let changed=false;
      const next=current.map(stop=>{
        if(stop.costBasis==='person'&&typeof stop.costPerPerson==='number'){
          const total=stop.costPerPerson*people;
          if(stop.costTotal!==total){changed=true;return {...stop,costTotal:total}}
        }
        if(stop.costBasis==='total'&&typeof stop.costTotal==='number'){
          const perPerson=Math.round(stop.costTotal/people);
          if(stop.costPerPerson!==perPerson){changed=true;return {...stop,costPerPerson:perPerson}}
        }
        return stop;
      });
      return changed?next:current;
    });
  },[tripSettings.people]);
  useEffect(()=>{
    const context=(document as any).modelContext;
    if(!context?.registerTool)return;
    const lifecycle=new AbortController();
    const categories=PLACE_CATEGORIES;
    void Promise.resolve(context.registerTool({
      name:'add_itinerary_stop',title:'여행 일정에 장소 추가',
      description:'날짜, 시간, 장소와 좌표를 받아 현재 여행 일정과 지도에 새 방문지를 추가합니다.',
      inputSchema:{type:'object',properties:{day:{type:'string',enum:['9/19','9/20']},time:{type:'string',pattern:'^([01]\\d|2[0-3]):[0-5]\\d$'},name:{type:'string',minLength:1},category:{type:'string',enum:categories},memo:{type:'string'},address:{type:'string',minLength:1},lat:{type:'number'},lng:{type:'number'}},required:['day','time','name','category','address','lat','lng'],additionalProperties:false},
      annotations:{readOnlyHint:false,untrustedContentHint:false},
      execute(input:unknown){
        const value=input as Partial<Stop>;
        if(!value.day||!['9/19','9/20'].includes(value.day)||!value.time||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time)||!value.name||!value.address||typeof value.lat!=='number'||typeof value.lng!=='number'||!value.category||!categories.includes(value.category))throw new Error('일정 정보가 올바르지 않습니다.');
        const stop:Stop={id:`tool-${Date.now()}`,day:value.day,time:value.time,name:value.name,category:value.category,memo:value.memo||'',address:value.address,lat:value.lat,lng:value.lng};
        setStops(current=>insertStopByTime(current,stop)); setActiveDay(stop.day);
        return {added:true,id:stop.id,day:stop.day,name:stop.name};
      }
    },{signal:lifecycle.signal})).catch(()=>{});
    return()=>lifecycle.abort();
  },[]);
  const dayStops=useMemo(()=>stops.filter(s=>s.day===activeDay),[stops,activeDay]);
  const peopleCount=Math.max(1,tripSettings.people||1);
  const dayCostSummary=useMemo(()=>dayStops.reduce((summary,stop)=>{const cost=costValues(stop,peopleCount);return {personal:summary.personal+cost.personal,total:summary.total+cost.total}},{personal:0,total:0}),[dayStops,peopleCount]);
  const tripCostSummary=useMemo(()=>stops.reduce((summary,stop)=>{const cost=costValues(stop,peopleCount);return {personal:summary.personal+cost.personal,total:summary.total+cost.total}},{personal:0,total:0}),[stops,peopleCount]);
  const selectStop=useCallback((stop:Stop)=>setSelected(stop),[]);
  const selectMapCandidate=useCallback((place:SearchPlace)=>setMapCandidate(place),[]);
  const updateCustomPin=useCallback((point:{lat:number;lng:number})=>setCustomPin(point),[]);
  const updateStopPosition=useCallback((id:string,lat:number,lng:number)=>{setStops(current=>current.map(stop=>stop.id===id?{...stop,lat,lng,customLocation:true}:stop));setLocationEditingId(null)},[]);
  const updateStopCost=useCallback((id:string,basis:'person'|'total',rawValue:string)=>{const value=parseCostInput(rawValue),people=Math.max(1,tripSettings.people||1);setStops(current=>current.map(stop=>{if(stop.id!==id)return stop;if(value===null)return {...stop,costPerPerson:undefined,costTotal:undefined,costBasis:undefined};return basis==='person'?{...stop,costBasis:basis,costPerPerson:value,costTotal:value*people}:{...stop,costBasis:basis,costTotal:value,costPerPerson:Math.round(value/people)}}))},[tripSettings.people]);
  const saveTripSettings=()=>{const next={...settingsDraft,title:settingsDraft.title.trim()||'나의 여행',destination:settingsDraft.destination.trim(),people:Math.max(1,Math.round(Number(settingsDraft.people)||1))};setTripSettings(next);setSettingsDraft(next);localStorage.setItem('route-note-trip-settings',JSON.stringify(next));setSettingsOpen(false)};
  const addStop=()=>{if(!picked)return;const stop:Stop={id:`${Date.now()}`,day:activeDay,time:newTime,name:cleanTitle(picked.title),category:newCategory,memo:newMemo.trim(),address:picked.roadAddress||picked.address,lat:Number(picked.mapy)/1e7,lng:Number(picked.mapx)/1e7,naverLink:picked.link};setStops(current=>insertStopByTime(current,stop));setAddOpen(false);setQuery('');setPicked(null);setNewMemo('')};
  const openEdit=(stop:Stop)=>{setEditing(stop);setEditDraft({...stop});setEditQuery(stop.name);setEditPlaceLinked(true)};
  const saveEdit=()=>{if(!editing||!editDraft||!isValidTime(editDraft.time))return;const updated={...editDraft,name:editDraft.name.trim()||editing.name,memo:editDraft.memo.trim()};setStops(current=>current.map(stop=>stop.id===editing.id?updated:stop));if(selected?.id===editing.id)setSelected(updated);setEditing(null);setEditDraft(null)};
  const moveStop=(id:string,direction:-1|1)=>setStops(current=>{const items=current.filter(s=>s.day===activeDay),i=items.findIndex(s=>s.id===id),t=i+direction;if(i<0||t<0||t>=items.length)return current;const next=[...items];[next[i],next[t]]=[next[t],next[i]];let cursor=0;return current.map(s=>s.day===activeDay?next[cursor++]:s)});
  const reorderByDrop=(targetId:string)=>{if(!draggedId||draggedId===targetId){setDraggedId(null);setDragOverId(null);return}const movedId=draggedId;setStops(current=>{const items=current.filter(s=>s.day===activeDay),from=items.findIndex(s=>s.id===movedId),to=items.findIndex(s=>s.id===targetId);if(from<0||to<0)return current;const next=[...items],[moved]=next.splice(from,1);next.splice(to,0,moved);let cursor=0;return current.map(s=>s.day===activeDay?next[cursor++]:s)});setJustMovedId(movedId);window.setTimeout(()=>setJustMovedId(current=>current===movedId?null:current),380);setDraggedId(null);setDragOverId(null)};
  const removeSelected=()=>{if(!selected)return;setStops(c=>c.filter(s=>s.id!==selected.id));setSelected(null)};
  const removeStop=(id:string)=>setStops(current=>current.filter(stop=>stop.id!==id));
  const commitMapSearch=()=>{setMapResultPlaces(mapSuggestions.results.slice(0,8));setMapPicked(null);setMapCandidate(null)};
  const prepareMapCandidate=()=>{if(!mapCandidate)return;setPicked(mapCandidate);setQuery(cleanTitle(mapCandidate.title));setMapCandidate(null);setAddOpen(true)};
  const openCustomPin=()=>{setCustomDay(activeDay);setCustomPin(null);setCustomName('');setCustomAddress('');setCustomMemo('');setCustomTime('12:00');setCustomCategory('관광');setCustomAddressError('');setCustomPinMode(false);setCustomPinOpen(true)};
  const startCustomPinPlacement=()=>{setCustomPinMode(true);setCustomPinOpen(false)};
  const continueCustomPin=()=>{if(customPin){setCustomPinMode(false);setCustomPinOpen(true)}};
  const cancelCustomPin=()=>{setCustomPinMode(false);setCustomPin(null);setCustomPinOpen(false);setCustomAddressError('')};
  const findCustomAddress=async()=>{const value=customAddress.trim();if(!value)return;setCustomAddressSearching(true);setCustomAddressError('');try{const point=await geocodeAddress(value);setCustomPin({lat:point.lat,lng:point.lng});setCustomAddress(point.address)}catch(error){setCustomAddressError(error instanceof Error?error.message:'주소를 찾지 못했습니다.')}finally{setCustomAddressSearching(false)}};
  const addCustomStop=()=>{if(!customPin||!customName.trim()||!isValidTime(customTime))return;const stop:Stop={id:`custom-${Date.now()}`,day:customDay,time:customTime,name:customName.trim(),category:customCategory,memo:customMemo.trim(),address:customAddress.trim()||'지도에서 직접 지정한 위치',lat:customPin.lat,lng:customPin.lng,customLocation:true};setStops(current=>insertStopByTime(current,stop));setActiveDay(customDay);cancelCustomPin()};
  const startLocationEdit=()=>{if(!selected)return;setLocationEditingId(selected.id);setSelected(null)};

  const dayDates:Record<DayKey,string>={'9/19':tripSettings.startDate,'9/20':tripSettings.endDate};

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark"><Navigation/></span><span>여행을 떠나요</span></div>
      <div className="trip-title"><strong>{tripSettings.title}</strong><span>{formatTripDate(tripSettings.startDate)} — {formatTripDate(tripSettings.endDate)} · {tripSettings.people}명</span></div>
      <div className="top-actions">
        <div className="trip-cost-total" aria-label="전체 예상 경비"><span>전체 예상 경비</span><strong>{formatWon(tripCostSummary.personal)} <small>개인별</small> · {formatWon(tripCostSummary.total)} <small>총 비용</small></strong></div>
        <Button variant="outline" className="settings-button" onClick={()=>{setSettingsDraft(tripSettings);setSettingsOpen(true)}}><CalendarDays/><span>여행 일정</span></Button>
      </div>
    </header>

    <Dialog open={addOpen} onOpenChange={open=>{setAddOpen(open);if(!open){setQuery('');setPicked(null)}}}>
      <DialogContent className="add-dialog sm:max-w-[540px]">
        <DialogHeader><DialogTitle>장소 추가</DialogTitle><DialogDescription>장소를 검색해 선택하세요.</DialogDescription></DialogHeader>
        <div className="form-grid">
          <label>날짜<select value={activeDay} onChange={e=>setActiveDay(e.target.value as DayKey)}><option value="9/19">{formatTripDate(tripSettings.startDate,true)}</option><option value="9/20">{formatTripDate(tripSettings.endDate,true)}</option></select></label>
          <label>시간(24시간)<Time24Input value={newTime} onChange={setNewTime}/></label>
          <label>카테고리<select value={newCategory} onChange={e=>setNewCategory(e.target.value as PlaceType)}>{PLACE_CATEGORIES.map(t=><option key={t}>{t}</option>)}</select></label>
        </div>
        <label className="place-search-field">장소 <PlacePicker query={query} onQueryChange={(value,userInput)=>{setQuery(value);if(userInput)setPicked(null)}} results={addSuggestions.results} value={picked} onPick={place=>{setPicked(place);if(place)setQuery(cleanTitle(place.title))}} searching={addSuggestions.searching} placeholder="장소 검색" selected={Boolean(picked)}/></label>
        {addSuggestions.error&&query.trim().length>=2&&<div className="inline-notice"><CircleAlert/>{addSuggestions.error}</div>}
        {picked&&<div className="linked-place"><MapPin/><span><strong>{cleanTitle(picked.title)}</strong><small>{picked.roadAddress||picked.address}</small></span><em>선택됨</em></div>}
        <label className="memo-field">메모 <Textarea value={newMemo} onChange={e=>setNewMemo(e.target.value)} placeholder="메뉴, 예약 시간 등"/></label>
        <DialogFooter><Button variant="outline" onClick={()=>setAddOpen(false)}>취소</Button><Button onClick={addStop} disabled={!picked||!isValidTime(newTime)}>일정에 추가</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={customPinOpen} onOpenChange={open=>{if(!open)cancelCustomPin()}}>
      <DialogContent className="custom-dialog sm:max-w-[540px]">
        <DialogHeader><DialogTitle>지도에 임의 핀 추가</DialogTitle><DialogDescription>검색되지 않는 장소도 직접 일정에 넣을 수 있어요.</DialogDescription></DialogHeader>
        <label>장소 이름<Input value={customName} onChange={e=>setCustomName(e.target.value)} placeholder="예: 숙소, 친구 추천 맛집"/></label>
        <div className="form-grid">
          <label>날짜<select value={customDay} onChange={e=>setCustomDay(e.target.value as DayKey)}><option value="9/19">{formatTripDate(tripSettings.startDate,true)}</option><option value="9/20">{formatTripDate(tripSettings.endDate,true)}</option></select></label>
          <label>시간(24시간)<Time24Input value={customTime} onChange={setCustomTime}/></label>
          <label>카테고리<select value={customCategory} onChange={e=>setCustomCategory(e.target.value as PlaceType)}>{PLACE_CATEGORIES.map(t=><option key={t}>{t}</option>)}</select></label>
        </div>
        <div className="custom-location-row"><label>주소(선택)<Input value={customAddress} onChange={e=>{setCustomAddress(e.target.value);setCustomAddressError('')}} placeholder="주소를 입력해 위치 찾기"/></label><Button variant="outline" onClick={findCustomAddress} disabled={!customAddress.trim()||customAddressSearching}>{customAddressSearching?'찾는 중…':'주소로 찾기'}</Button></div>
        {customAddressError&&<div className="inline-notice"><CircleAlert/>{customAddressError}</div>}
        <div className={`custom-location-status ${customPin?'is-set':''}`}><MapPin/><span>{customPin?(customAddress||'지도에서 지정한 위치'):'아직 위치를 정하지 않았어요.'}</span><Button variant="outline" onClick={startCustomPinPlacement}>{customPin?'지도에서 다시 지정':'지도에서 위치 찍기'}</Button></div>
        <label className="memo-field">메모 <Textarea value={customMemo} onChange={e=>setCustomMemo(e.target.value)} placeholder="메모를 남겨보세요"/></label>
        <DialogFooter><Button variant="outline" onClick={cancelCustomPin}>취소</Button><Button onClick={addCustomStop} disabled={!customPin||!customName.trim()||!isValidTime(customTime)}>일정에 추가</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    <section className="workspace">
      <aside className="planner-panel">
        <div className="day-switch" role="tablist" aria-label="여행 날짜">{(['9/19','9/20'] as DayKey[]).map((day,index)=><button key={day} role="tab" aria-selected={activeDay===day} onClick={()=>setActiveDay(day)}><span>DAY {index+1}</span><strong>{formatTripDate(dayDates[day],true)}</strong></button>)}</div>
        <div className="panel-heading"><div><span><CalendarDays/>방문 순서</span><strong>{dayStops.length}개 장소</strong></div></div>
        <div className="stop-list">
          {dayStops.map((stop,index)=>{
            const previous=dayStops[index-1],gap=previous?distanceKm(previous,stop):null,reverse=previous&&timeMinutes(stop.time)<timeMinutes(previous.time);
            return <div key={stop.id}>
              {gap!==null&&<div className="distance-chip"><span/>직선 {gap<1?`${Math.round(gap*1000)}m`:`${gap.toFixed(1)}km`}</div>}
              <article className={`stop-card ${draggedId===stop.id?'is-dragging':''} ${dragOverId===stop.id&&draggedId!==stop.id?'is-drag-over':''} ${justMovedId===stop.id?'just-moved':''}`} draggable onDragStart={()=>setDraggedId(stop.id)} onDragOver={e=>{e.preventDefault();if(draggedId!==stop.id)setDragOverId(stop.id)}} onDragLeave={()=>setDragOverId(current=>current===stop.id?null:current)} onDrop={()=>reorderByDrop(stop.id)} onDragEnd={()=>{setDraggedId(null);setDragOverId(null)}} onClick={()=>setSelected(stop)}>
                <div className="drag-handle" aria-hidden="true"><GripVertical/></div>
                <div className="order-pin" style={{background:DAY_COLOR[activeDay]}}>{index+1}</div>
                <div className="stop-main">
                  <div className="stop-time"><Clock3 className={reverse?'time-warning':''}/><span className={reverse?'time-warning':''} title={reverse?'앞 장소보다 시간이 이릅니다.':undefined}>{stop.time}</span><span className="stop-category">{stop.category}</span></div>
                  <strong>{stop.name}</strong>
                  {stop.memo&&<p>{stop.memo}</p>}
                  <div className='stop-cost' onClick={e=>e.stopPropagation()}><span className='cost-label'>예상 경비</span><div className='cost-fields'><label className={stop.costBasis==='person'?'cost-field entered':stop.costBasis==='total'?'cost-field calculated':'cost-field'}><span>개인별</span><div><Input type='text' inputMode='numeric' value={costInputValue(stop.costPerPerson)} onChange={e=>updateStopCost(stop.id,'person',e.target.value)} placeholder='0'/><b>원</b></div></label><label className={stop.costBasis==='total'?'cost-field entered':stop.costBasis==='person'?'cost-field calculated':'cost-field'}><span>총 비용</span><div><Input type='text' inputMode='numeric' value={costInputValue(stop.costTotal)} onChange={e=>updateStopCost(stop.id,'total',e.target.value)} placeholder='0'/><b>원</b></div></label></div></div>
                </div>
                <div className="card-actions">
                  <div className="move-buttons"><button aria-label={`${stop.name} 위로 이동`} disabled={index===0} onClick={e=>{e.stopPropagation();moveStop(stop.id,-1)}}><ArrowUp/></button><button aria-label={`${stop.name} 아래로 이동`} disabled={index===dayStops.length-1} onClick={e=>{e.stopPropagation();moveStop(stop.id,1)}}><ArrowDown/></button></div>
                  <div className="card-secondary-actions"><button className="edit-card-button" title="수정" aria-label={`${stop.name} 수정`} onClick={e=>{e.stopPropagation();openEdit(stop)}}><Pencil/></button><button className="remove-card-button" title="삭제" aria-label={`${stop.name} 삭제`} onClick={e=>{e.stopPropagation();removeStop(stop.id)}}><X/></button></div>
                </div>
              </article>
            </div>
          })}
        </div>
        <div className="day-cost-summary" aria-label={`${formatTripDate(dayDates[activeDay])} 예상 경비 총합`}><div><span>{formatTripDate(dayDates[activeDay])} 예상 경비 총합</span><small>입력한 장소 비용 기준</small></div><strong><span><em>개인별</em>{formatWon(dayCostSummary.personal)}</span><span><em>총 비용</em>{formatWon(dayCostSummary.total)}</span></strong></div>
        <div className="planner-add-actions"><Button variant="outline" className="wide-add" onClick={()=>setAddOpen(true)}><Plus/>이 날짜에 장소 추가</Button><Button variant="ghost" className="custom-add-button" onClick={openCustomPin}><MapPin/>지도에 임의 핀 추가</Button></div>
      </aside>
      <section className="map-panel">
        <div className="map-toolbar"><div><Sparkles/><span><strong>{activeDay==='9/19'?'첫째 날':'둘째 날'}</strong></span></div><span className="naver-badge"><b>N</b>NAVER 지도</span></div>
        <div className="map-place-search"><PlacePicker query={mapQuery} onQueryChange={(value,userInput)=>{setMapQuery(value);if(userInput){setMapPicked(null);setMapCandidate(null);setMapResultPlaces([])}}} results={mapSuggestions.results} value={mapPicked} onPick={place=>{setMapPicked(place);setMapCandidate(place);setMapResultPlaces(mapSuggestions.results.slice(0,8));if(place)setMapQuery(cleanTitle(place.title))}} onEnter={commitMapSearch} searching={mapSuggestions.searching} placeholder={`${tripSettings.destination} 장소 검색`} selected={Boolean(mapPicked)}/></div>
        <NaverMap stops={dayStops} clientId={clientId} destination={tripSettings.destination} onSelect={selectStop} placeResults={mapResultPlaces} onPlaceSelect={selectMapCandidate} dateLabels={dayDates} activeDay={activeDay} onDayChange={setActiveDay} editableStopId={locationEditingId} onStopPositionChange={updateStopPosition} onCancelStopPositionEdit={()=>setLocationEditingId(null)} customPin={customPin} customPinMode={customPinMode} onCustomLocationChange={updateCustomPin} onCustomAddressChange={setCustomAddress} onCustomPinContinue={continueCustomPin}/>
        {mapCandidate&&<div className="map-place-card"><button className="map-card-close" onClick={()=>setMapCandidate(null)} aria-label="장소 정보 닫기">×</button><span>{mapCandidate.category}</span><strong>{cleanTitle(mapCandidate.title)}</strong><p>{mapCandidate.roadAddress||mapCandidate.address}</p><div><a href={naverPlaceUrl({name:cleanTitle(mapCandidate.title),address:mapCandidate.roadAddress||mapCandidate.address})} target="_blank" rel="noreferrer">네이버지도에서 상세보기</a><Button onClick={prepareMapCandidate}><Plus/>이 장소로 결정</Button></div></div>}
      </section>
    </section>

    <Sheet open={Boolean(selected)} onOpenChange={open=>!open&&setSelected(null)}><SheetContent className="place-sheet sm:max-w-[430px]">{selected&&<><SheetHeader><div className="sheet-eyebrow"><span style={{background:DAY_COLOR[selected.day]}}>{dayStops.findIndex(s=>s.id===selected.id)+1}</span>{formatTripDate(dayDates[selected.day])} · {selected.time} · {selected.category}</div><SheetTitle>{selected.name}</SheetTitle><SheetDescription>{selected.address}</SheetDescription></SheetHeader><div className="sheet-body"><div className="section-title"><span>거리뷰</span><small>네이버 파노라마</small></div><PanoramaView stop={selected} clientId={clientId}/>{selected.memo&&<div className="place-note"><span>메모</span><p>{selected.memo}</p></div>}<a className="naver-link" href={naverPlaceUrl(selected)} target="_blank" rel="noreferrer"><span><b>N</b>네이버지도에서 상세보기</span><ExternalLink/></a><Button variant="outline" className="location-edit-button" onClick={startLocationEdit}><MapPin/>위치 임의 수정</Button><Button variant="destructive" className="delete-button" onClick={removeSelected}><Trash2/>이 장소 삭제</Button></div></>}</SheetContent></Sheet>

    <Dialog open={Boolean(editing)} onOpenChange={open=>{if(!open){setEditing(null);setEditDraft(null)}}}><DialogContent className="edit-dialog sm:max-w-[500px]">{editDraft&&<><DialogHeader><DialogTitle>장소 수정</DialogTitle><DialogDescription>장소를 바꾸려면 검색 결과에서 선택하세요.</DialogDescription></DialogHeader><div className="edit-grid"><label>장소 <PlacePicker query={editQuery} onQueryChange={(value,userInput)=>{setEditQuery(value);if(userInput)setEditPlaceLinked(false)}} results={editSuggestions.results} value={null} onPick={place=>{if(!place)return;const name=cleanTitle(place.title);setEditQuery(name);setEditPlaceLinked(true);setEditDraft({...editDraft,name,address:place.roadAddress||place.address,lat:Number(place.mapy)/1e7,lng:Number(place.mapx)/1e7})}} searching={editSuggestions.searching} placeholder="장소 검색" selected={editPlaceLinked}/></label>{editSuggestions.error&&editQuery.trim().length>=2&&!editPlaceLinked&&<div className="inline-notice"><CircleAlert/>{editSuggestions.error}</div>}<div className={`linked-place ${editPlaceLinked?'':'unlinked'}`}><MapPin/><span><strong>{editDraft.name}</strong><small>{editDraft.address}</small></span><em>{editPlaceLinked?'선택됨':'장소를 골라주세요'}</em></div><div className="form-grid two"><label>시간(24시간)<Time24Input value={editDraft.time} onChange={time=>setEditDraft({...editDraft,time})}/></label><label>카테고리<select value={editDraft.category} onChange={e=>setEditDraft({...editDraft,category:e.target.value as PlaceType})}>{PLACE_CATEGORIES.map(t=><option key={t}>{t}</option>)}</select></label></div><label>메모<Textarea value={editDraft.memo} onChange={e=>setEditDraft({...editDraft,memo:e.target.value})} placeholder="메모를 남겨보세요"/></label></div><DialogFooter><Button variant="outline" onClick={()=>{setEditing(null);setEditDraft(null)}}>취소</Button><Button onClick={saveEdit} disabled={!editPlaceLinked||!isValidTime(editDraft.time)}>저장</Button></DialogFooter></>}</DialogContent></Dialog>

    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}><DialogContent className="settings-dialog sm:max-w-[500px]"><DialogHeader><DialogTitle>여행 일정</DialogTitle><DialogDescription>어디로, 언제 떠날지 정하세요.</DialogDescription></DialogHeader><div className="trip-settings-grid"><label>여행 이름<Input value={settingsDraft.title} onChange={e=>setSettingsDraft({...settingsDraft,title:e.target.value})} placeholder="전주 맛집 여행"/></label><label>여행지<Input value={settingsDraft.destination} onChange={e=>setSettingsDraft({...settingsDraft,destination:e.target.value})} placeholder="전주"/></label><div className="date-fields"><label>출발일<Input type="date" value={settingsDraft.startDate} onChange={e=>setSettingsDraft({...settingsDraft,startDate:e.target.value})}/></label><label>돌아오는 날<Input type="date" min={settingsDraft.startDate} value={settingsDraft.endDate} onChange={e=>setSettingsDraft({...settingsDraft,endDate:e.target.value})}/></label></div><label>인원<div className="people-input"><Users/><Input type="number" min="1" max="99" value={settingsDraft.people} onChange={e=>setSettingsDraft({...settingsDraft,people:Number(e.target.value)})}/><span>명</span></div></label></div>{settingsDraft.startDate>settingsDraft.endDate&&<div className="inline-notice"><CircleAlert/>날짜를 다시 확인해주세요.</div>}<DialogFooter><Button variant="outline" onClick={()=>setSettingsOpen(false)}>취소</Button><Button onClick={saveTripSettings} disabled={!settingsDraft.destination.trim()||!settingsDraft.startDate||!settingsDraft.endDate||settingsDraft.startDate>settingsDraft.endDate}>저장</Button></DialogFooter></DialogContent></Dialog>
  </main>
}
