'use client';

import { type DragEvent, type WheelEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDown, ArrowUp, CalendarDays, ChevronDown, ChevronUp, CircleAlert, Clock3,
  Copy, Eye, EyeOff, ExternalLink, GripVertical, House, LockKeyhole, Map, MapPin, Navigation, PanelLeftClose, PanelLeftOpen, Plus,
  Pencil, Save, Sparkles, Trash2, Users, X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { rememberPlanVisit } from '@/lib/client-plan-history';
import { readJsonResponse } from '@/lib/client-json';
import { tr, useCurrency, useLanguage } from '@/lib/i18n';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import 'leaflet/dist/leaflet.css';
import 'maplibre-gl/dist/maplibre-gl.css';

type DayKey = string;
type PlaceType = '식사' | '간식' | '관광' | '숙소' | '기타';
type MapProvider = 'naver' | 'google' | 'osm';
type Stop = { id: string; day: DayKey; time: string; name: string; category: PlaceType; memo: string; address: string; lat: number; lng: number; customLocation?: boolean; naverLink?: string; mapProvider?: MapProvider; placeId?: string; costPerPerson?: number; costTotal?: number; costBasis?: 'person'|'total' };
type SearchPlace = { title: string; category: string; address: string; roadAddress: string; mapx: string; mapy: string; link?: string; description?: string; titleEnglish?: string; categoryEnglish?: string; addressEnglish?: string; roadAddressEnglish?: string; provider?: MapProvider; placeId?: string; region?: string; country?: string; googlePrediction?: any };
type EditPolicy = 'owner' | 'all' | 'password';
type TripSettings = { title: string; destination: string; startDate: string; endDate: string; people: number; editPolicy: EditPolicy; mapProvider: MapProvider };
type StoredPlan = { id: string; title: string; destination: string; startDate: string; endDate: string; people: number; editPolicy?: EditPolicy; mapProvider?: MapProvider; passwordProtected?: boolean; editPasswordProtected?: boolean; updatedAt?: string; version?: number; stops: Stop[] };
type SavedDraft = { settings: TripSettings; stops: Stop[]; savedAt: string };

declare global {
  interface Window { naver?: any; google?: any; __naverMapsLoading?: Promise<void>; __googleMapsLoading?: Promise<void>; navermap_authFailure?: () => void }
}

const DAY_COLORS = ['#ff5b35', '#2279f2', '#7257d9', '#0c9b75', '#d15d9a', '#db8b18'];
const DEFAULT_MAP_CENTER = { lat:35.8242, lng:127.1534 };
const DEFAULT_WORLD_CENTER = { lat:20, lng:0 };
const DEFAULT_TRIP: TripSettings = { title:'전주 맛집 여행', destination:'전주', startDate:'2026-09-19', endDate:'2026-09-20', people:5, editPolicy:'owner', mapProvider:'naver' };
const PLACE_CATEGORIES: PlaceType[] = ['식사','간식','관광','숙소','기타'];
const suggestionCache = new globalThis.Map<string, SearchPlace[]>();

const seedStops: Stop[] = [
  { id:'station-arrive', day:'2026-09-19', time:'08:39', name:'전주역', category:'기타', memo:'전주 도착', address:'전북 전주시 덕진구 동부대로 680', lat:35.8500537, lng:127.1623649 },
  { id:'veteran', day:'2026-09-19', time:'10:00', name:'베테랑칼국수 본점', category:'식사', memo:'칼국수 또는 근처 길거리야 바게트버거', address:'전북 전주시 완산구 경기전길 135', lat:35.8134534, lng:127.1513383 },
  { id:'hanok', day:'2026-09-19', time:'12:30', name:'전주한옥마을', category:'관광', memo:'골목 산책과 주요 관광지', address:'전북 전주시 완산구 기린대로 99 일대', lat:35.8151786, lng:127.1538888 },
  { id:'jojeomrye', day:'2026-09-19', time:'13:00', name:'조점례남문피순대', category:'식사', memo:'순대국밥 · 피순대', address:'전북 전주시 완산구 풍남문2길 39', lat:35.81195, lng:127.1472 },
  { id:'grandma', day:'2026-09-19', time:'14:30', name:'외할머니솜씨', category:'간식', memo:'옛날팥빙수', address:'전북 전주시 완산구 오목대길 81-8', lat:35.812675632, lng:127.152030609 },
  { id:'namno', day:'2026-09-19', time:'18:30', name:'남노갈비 본점', category:'식사', memo:'전주식 물갈비', address:'전북 전주시 완산구 한지길 24', lat:35.8192024, lng:127.1531673 },
  { id:'nightmarket', day:'2026-09-19', time:'21:00', name:'전주남부시장 야시장', category:'간식', memo:'먹거리 여러 개 나눠 먹기', address:'전북 전주시 완산구 풍남문1길 19-3', lat:35.8122382, lng:127.1474635 },
  { id:'hyundaiok', day:'2026-09-20', time:'09:00', name:'현대옥 전주역점', category:'식사', memo:'콩나물국밥', address:'전북 전주시 덕진구 백제대로 813', lat:35.84755, lng:127.16115 },
  { id:'firstwelcome', day:'2026-09-20', time:'10:00', name:'전주역 첫마중길', category:'관광', memo:'전주역 앞 가벼운 산책', address:'전북 전주시 덕진구 우아동3가 746 일대', lat:35.8488, lng:127.1617 },
  { id:'station-leave', day:'2026-09-20', time:'14:47', name:'전주역', category:'기타', memo:'기차 탑승', address:'전북 전주시 덕진구 동부대로 680', lat:35.8500537, lng:127.1623649 },
];

function cleanTitle(value: string) { return value.replace(/<[^>]*>/g, '') }
function placeTitle(place: SearchPlace, language: 'ko' | 'en') { return cleanTitle(language === 'en' ? place.titleEnglish || place.title : place.title) }
function placeCategory(place: SearchPlace, language: 'ko' | 'en') { return language === 'en' ? place.categoryEnglish || place.category : place.category }
function placeAddress(place: SearchPlace, language: 'ko' | 'en') { return language === 'en' ? place.roadAddressEnglish || place.addressEnglish || place.roadAddress || place.address : place.roadAddress || place.address }
function normalizeCategory(value: string): PlaceType {
  if(value==='카페'||value==='야시장')return '간식';
  if(value==='교통')return '기타';
  return PLACE_CATEGORIES.includes(value as PlaceType)?value as PlaceType:'기타';
}
function escapeHtml(value:string){return value.replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':'&quot;'}[char]||char))}
function formatTripDate(value:string,weekday=false,language:'ko'|'en'='ko'){
  const date=new Date(`${value}T00:00:00`);
  if(Number.isNaN(date.getTime()))return value;
  return new Intl.DateTimeFormat(language==='en'?'en-US':'ko-KR',{month:'numeric',day:'numeric',...(weekday?{weekday:'short'}:{})}).format(date).replace(/\.\s/g,'. ');
}
function localDate(value:string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
  const [year,month,day]=value.split('-').map(Number),date=new Date(year,month-1,day);
  return date.getFullYear()===year&&date.getMonth()===month-1&&date.getDate()===day?date:null;
}
function dateKey(date:Date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
function dateDayKey(value:string){const date=localDate(value);return date?dateKey(date):''}
function tripDaysBetween(start:string,end:string){
  const first=localDate(start),last=localDate(end);if(!first||!last||first>last)return [] as Array<{key:DayKey;date:string}>;
  const days:Array<{key:DayKey;date:string}>=[],cursor=new Date(first);
  while(cursor<=last&&days.length<366){const value=dateKey(cursor);days.push({key:value,date:value});cursor.setDate(cursor.getDate()+1)}
  return days;
}
function normalizeStoredDay(value:string,start:string,end:string){
  const days=tripDaysBetween(start,end);if(days.some(day=>day.key===value))return value;
  const match=String(value).match(/^(\d{1,2})\/(\d{1,2})$/);
  if(match){const short=`${Number(match[1])}/${Number(match[2])}`,found=days.find(day=>{const date=localDate(day.date);return date?`${date.getMonth()+1}/${date.getDate()}`===short:false});if(found)return found.key}
  const parsed=dateDayKey(value),found=days.find(day=>day.key===parsed);return found?.key||days[0]?.key||dateDayKey(start)||value;
}
function dayColor(day:DayKey,orderedDays:DayKey[]){const index=orderedDays.indexOf(day);return DAY_COLORS[(index<0?0:index)%DAY_COLORS.length]}
function usePlaceSuggestions(query:string,enabled:boolean,context='',provider:MapProvider='naver',googleKey='',requestedQuery=''){
  const { language } = useLanguage();
  const text = useCallback((korean:string, english:string) => tr(language, korean, english), [language]);
  const [results,setResults]=useState<SearchPlace[]>([]),[searching,setSearching]=useState(false),[error,setError]=useState('');
  const searchQuery=provider==='osm'?requestedQuery:query;
  useEffect(()=>{
    const value=searchQuery.trim();
    if(!enabled||value.length<2){setResults([]);setSearching(false);setError('');return}
    const cacheKey=`${provider}|${language}|${context}|${value}`.toLocaleLowerCase('ko-KR'),cached=suggestionCache.get(cacheKey);
    if(cached){setResults(cached);setSearching(false);setError(cached.length?'':text('검색 결과가 없습니다.','No results found.'));return}
    const controller=new AbortController();
    const delay=180;
    const timer=window.setTimeout(async()=>{
      setSearching(true);setError('');
      try{
        let items:SearchPlace[]=[];
        if(provider==='google'){
          if(!googleKey)throw new Error(text('해외 장소 검색을 준비 중이에요.','International place search is not connected yet.'));
          await loadGoogleMaps(googleKey,language);
          const {AutocompleteSuggestion}=await window.google.maps.importLibrary('places');
          const input=context.trim()?`${value}, ${context.trim()}`:value;
          const response=await AutocompleteSuggestion.fetchAutocompleteSuggestions({input,language});
          items=(response.suggestions||[]).flatMap((suggestion:any)=>{
            const prediction=suggestion.placePrediction;
            if(!prediction)return [];
            const title=prediction.mainText?.text||prediction.text?.toString?.()||value;
            const address=prediction.secondaryText?.text||'';
            const category=(prediction.types?.[0]||'Google Maps').replaceAll('_',' ');
            return [{title,category,address,roadAddress:address,mapx:'',mapy:'',provider:'google' as const,placeId:prediction.placeId||prediction.id,googlePrediction:prediction}];
          }).slice(0,8);
        }else{
          const endpoint=provider==='osm'?`/api/free-search?q=${encodeURIComponent(value)}&near=${encodeURIComponent(context)}&lang=${language}`:`/api/search?q=${encodeURIComponent(value)}&near=${encodeURIComponent(context)}&lang=${language}`;
          const response=await fetch(endpoint,{signal:controller.signal}),body=await readJsonResponse<{items?:SearchPlace[];message?:string}>(response);
          if(!response.ok)throw new Error(body.message||text('검색에 실패했습니다.','Search failed.'));
          items=(body.items||[]).map(item=>({...item,provider:provider==='osm'?'osm' as const:'naver' as const}));
        }
        suggestionCache.set(cacheKey,items);setResults(items);if(!items.length)setError(text('검색 결과가 없습니다.','No results found.'));
      }catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:text('검색에 실패했습니다.','Search failed.'))}
      finally{if(!controller.signal.aborted)setSearching(false)}
    },delay);
    return()=>{window.clearTimeout(timer);controller.abort()};
  },[searchQuery,enabled,context,provider,googleKey,language,text]);
  return {results,searching,error};
}
function destinationLabel(place:SearchPlace,language:'ko'|'en'){
  const title=placeTitle(place,language),address=placeAddress(place,language);
  if(place.region||place.country){
    const region=place.region?.trim();
    const context=region&&region.toLocaleLowerCase()!==title.toLocaleLowerCase()?region:place.country?.trim();
    const parts=[title,context].filter((part):part is string=>Boolean(part));
    return parts.filter((part,index)=>parts.findIndex(value=>value.toLocaleLowerCase()===part.toLocaleLowerCase())===index).join(', ');
  }
  if(!address||address===title)return title;
  const parts=address.split(',').map(part=>part.trim()).filter(Boolean);
  const country=parts.at(-1)||'';
  return country&&country.toLocaleLowerCase()!==title.toLocaleLowerCase()&&!address.toLocaleLowerCase().startsWith(`${title.toLocaleLowerCase()}, ${country.toLocaleLowerCase()}`)?`${title}, ${country}`:address;
}
function useDestinationSuggestions(query:string,enabled:boolean){
  const { language } = useLanguage();
  const text = useCallback((korean:string, english:string) => tr(language, korean, english), [language]);
  const [results,setResults]=useState<SearchPlace[]>([]),[searching,setSearching]=useState(false);
  useEffect(()=>{
    const value=query.trim();
    if(!enabled||value.length<2){setResults([]);setSearching(false);return}
    const cacheKey=`destination|${language}|${value}`.toLocaleLowerCase('ko-KR'),cached=suggestionCache.get(cacheKey);
    if(cached){setResults(cached);setSearching(false);return}
    const controller=new AbortController();
    const timer=window.setTimeout(async()=>{
      setSearching(true);
      try{
        const response=await fetch(`/api/free-search?q=${encodeURIComponent(value)}&mode=city&lang=${language}&v=2`,{signal:controller.signal}),body=await readJsonResponse<{items?:SearchPlace[];message?:string}>(response);
        if(!response.ok)throw new Error(body.message||text('도시 검색에 실패했습니다.','City search failed.'));
        const items=(body.items||[]).map(item=>({...item,provider:'osm' as const}));
        const seen=new Set<string>(),deduped=items.filter(item=>{const key=destinationLabel(item,language).toLocaleLowerCase();if(seen.has(key))return false;seen.add(key);return true}).slice(0,8);
        suggestionCache.set(cacheKey,deduped);setResults(deduped);
      }catch{if(!controller.signal.aborted)setResults([])}
      finally{if(!controller.signal.aborted)setSearching(false)}
    },300);
    return()=>{window.clearTimeout(timer);controller.abort()};
  },[query,enabled,language,text]);
  return {results,searching};
}
function PlacePicker({query,onQueryChange,results,value,onPick,searching,placeholder,selected,onEnter,provider='naver'}:{query:string;onQueryChange:(value:string,userInput:boolean)=>void;results:SearchPlace[];value:SearchPlace|null;onPick:(place:SearchPlace|null)=>void|Promise<void>;searching:boolean;placeholder:string;selected:boolean;onEnter?:(value:string)=>void;provider?:MapProvider}){
  const { language } = useLanguage();
  const text = (korean:string, english:string) => tr(language, korean, english);
  const [open,setOpen]=useState(false);
  const [inputValue,setInputValue]=useState(query);
  const inputValueRef=useRef(query);
  const suppressClearRef=useRef(false);
  const composingRef=useRef(false);
  useEffect(()=>{if(!composingRef.current){inputValueRef.current=query;setInputValue(query)}},[query]);
  useEffect(()=>{setOpen(inputValue.trim().length>=2&&!selected)},[inputValue,selected]);
  return <Combobox<SearchPlace> items={results} filteredItems={results} filter={null} value={value} inputValue={inputValue} open={open} onOpenChange={setOpen} onInputValueChange={(next,details)=>{if(details.reason==='item-press')return;if(details.reason==='input-change'){inputValueRef.current=next;setInputValue(next);if(!composingRef.current)onQueryChange(next,true)}else if(details.reason==='input-clear'&&!suppressClearRef.current){const source=details.event as Event|undefined;const isUserDelete=Boolean(source&&'inputType' in source&&String((source as InputEvent).inputType||'').startsWith('delete'));if(isUserDelete||!inputValueRef.current.trim()){inputValueRef.current=next;setInputValue(next);onQueryChange(next,true)}}}} onValueChange={place=>{void onPick(place);if(place){const next=placeTitle(place,language);inputValueRef.current=next;setInputValue(next);setOpen(false)}}} itemToStringLabel={place=>placeTitle(place,language)}>
    <ComboboxInput className="place-combobox-input" placeholder={placeholder} showTrigger={false} inputMode="search" enterKeyHint="search" onFocus={()=>{if(!selected&&inputValue.trim().length>=2)setOpen(true)}} onCompositionStart={()=>{composingRef.current=true}} onCompositionEnd={event=>{composingRef.current=false;const committed=event.currentTarget.value;inputValueRef.current=committed;setInputValue(committed);onQueryChange(committed,true);setOpen(committed.trim().length>=2&&!selected)}} onKeyDown={event=>{const nativeEvent=event.nativeEvent as KeyboardEvent;if(event.key==='Enter'&&!nativeEvent.isComposing&&!composingRef.current){event.preventDefault();event.stopPropagation();const current=event.currentTarget.value;suppressClearRef.current=true;inputValueRef.current=current;setInputValue(current);onQueryChange(current,false);onEnter?.(current);setOpen(provider==='osm'&&current.trim().length>=2&&!selected);window.setTimeout(()=>{suppressClearRef.current=false},350)}}}/>
    <ComboboxContent className="place-combobox-content">
      <ComboboxEmpty>{searching?(provider==='google'?text('Google 지도에서 검색 중…','Searching Google Maps…'):provider==='osm'?text('지도에서 검색 중…','Searching the map…'):text('네이버 지도에서 검색 중…','Searching Naver Maps…')):provider==='osm'&&inputValue.trim().length>=2?text('엔터를 눌러 검색하세요.','Press Enter to search.'):text('검색 결과가 없습니다.','No results found.')}</ComboboxEmpty>
      <ComboboxList>{results.map((place,index)=><ComboboxItem className="place-combobox-item" key={`${place.mapx}-${place.mapy}-${index}`} value={place}><MapPin/><span><strong>{placeTitle(place,language)}</strong><small>{placeCategory(place,language)}</small><em>{placeAddress(place,language)}</em></span></ComboboxItem>)}</ComboboxList>
      {provider==='osm'&&<a className="geoapify-attribution" href="https://www.geoapify.com/" target="_blank" rel="noreferrer">Powered by Geoapify</a>}
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
function currencyUnit(currency:'KRW'|'USD'){return currency==='USD'?'$':'₩'}
function formatMoney(value:number,language:'ko'|'en'='ko',currency:'KRW'|'USD'='KRW'){const amount=Math.round(value).toLocaleString(language==='en'?'en-US':'ko-KR');return `${currencyUnit(currency)}${amount}`}
function mapProviderName(provider:MapProvider,_language:'ko'|'en'='ko'){return provider==='google'?'Google Maps':provider==='osm'?'OpenStreetMap':'NAVER Maps'}
function mapProviderDescription(provider:MapProvider,language:'ko'|'en'='ko'){return provider==='google'?tr(language,'해외 여행 지도','International trip map'):provider==='osm'?'':tr(language,'국내 여행 지도','Korea trip map')}
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
  const { language } = useLanguage();
  const invalid=value.length>0&&!isValidTime(value);
  return <Input type="text" inputMode="numeric" autoComplete="off" maxLength={5} placeholder="00:00" value={value} onChange={event=>onChange(normalizeTimeInput(event.target.value))} aria-label={tr(language,'시간(24시간)','Time (24-hour)')} aria-invalid={invalid}/>;
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
function itinerarySnapshot(settings:TripSettings,stops:Stop[],viewPassword='',viewPasswordTouched=false,editPassword='',editPasswordTouched=false){
  return JSON.stringify({settings,stops,viewPassword:viewPasswordTouched?viewPassword:'',editPassword:editPasswordTouched?editPassword:''});
}
function naverPlaceUrl(stop: Pick<Stop,'name'|'address'> & {naverLink?:string}) { return stop.naverLink?.startsWith('https://map.naver.com/') ? stop.naverLink : `https://map.naver.com/p/search/${encodeURIComponent(`${stop.name} ${stop.address}`)}` }
function googlePlaceUrl(place: {name:string;address?:string;placeId?:string;lat?:number;lng?:number}) {
  const query=place.placeId?place.name:[place.name,place.address].filter(Boolean).join(' ')||(Number.isFinite(place.lat)&&Number.isFinite(place.lng)?`${place.lat},${place.lng}`:'');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}${place.placeId?`&query_place_id=${encodeURIComponent(place.placeId)}`:''}`;
}
function googleStreetViewUrl(place: Pick<Stop,'lat'|'lng'>) { return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${encodeURIComponent(`${place.lat},${place.lng}`)}` }
function placeExternalUrl(place: {title:string;address:string;roadAddress:string;mapx?:string;mapy?:string;provider?:MapProvider;placeId?:string}) {
  return place.provider==='google'?googlePlaceUrl({name:cleanTitle(place.title),address:place.roadAddress||place.address,placeId:place.placeId}):place.provider==='osm'?googlePlaceUrl({name:cleanTitle(place.title),address:place.roadAddress||place.address,lat:Number(place.mapy)/1e7,lng:Number(place.mapx)/1e7}):naverPlaceUrl({name:cleanTitle(place.title),address:place.roadAddress||place.address});
}
function stopExternalUrl(stop:Stop,provider:MapProvider) { return provider==='google'||stop.mapProvider==='google'?googlePlaceUrl({name:stop.name,address:stop.address,placeId:stop.placeId,lat:stop.lat,lng:stop.lng}):provider==='osm'||stop.mapProvider==='osm'?googlePlaceUrl({name:stop.name,address:stop.address,lat:stop.lat,lng:stop.lng}):naverPlaceUrl(stop) }

function loadGoogleMaps(apiKey:string,language:'ko'|'en') {
  if(window.google?.maps?.importLibrary)return Promise.resolve();
  if(window.__googleMapsLoading)return window.__googleMapsLoading;
  window.__googleMapsLoading=new Promise<void>((resolve,reject)=>{
    const callbackName=`initGoogleMap_${Date.now()}`;
    (window as any)[callbackName]=()=>{delete (window as any)[callbackName];resolve()};
    const script=document.createElement('script');
    script.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&loading=async&libraries=places&language=${language}&callback=${callbackName}`;
    script.async=true;
    script.onerror=()=>{window.__googleMapsLoading=undefined;reject(new Error('Google Maps SDK를 불러오지 못했습니다.'))};
    document.head.appendChild(script);
  });
  return window.__googleMapsLoading;
}

async function resolveGooglePlace(place:SearchPlace,apiKey:string,language:'ko'|'en') {
  if(Number.isFinite(Number(place.mapx))&&Number.isFinite(Number(place.mapy)))return place;
  if(!place.placeId&&!place.googlePrediction)throw new Error(tr(language,'장소 위치를 확인하지 못했습니다.','Could not find this place on the map.'));
  await loadGoogleMaps(apiKey,language);
  const googlePlace=place.googlePrediction?.toPlace?.()||new window.google.maps.places.Place({id:place.placeId});
  await googlePlace.fetchFields({fields:['formattedAddress','location','types']});
  const lat=typeof googlePlace.location?.lat==='function'?googlePlace.location.lat():Number(googlePlace.location?.lat);
  const lng=typeof googlePlace.location?.lng==='function'?googlePlace.location.lng():Number(googlePlace.location?.lng);
  if(!Number.isFinite(lat)||!Number.isFinite(lng))throw new Error(tr(language,'장소 위치를 확인하지 못했습니다.','Could not find this place on the map.'));
  const address=googlePlace.formattedAddress||place.roadAddress||place.address;
  return {...place,address,roadAddress:address,mapx:String(Math.round(lng*1e7)),mapy:String(Math.round(lat*1e7)),category:(googlePlace.types?.[0]||place.category||'Google Maps').replaceAll('_',' '),provider:'google' as const,placeId:googlePlace.id||place.placeId,googlePrediction:undefined};
}

async function resolveSearchPlace(place:SearchPlace|null,provider:MapProvider,googleKey:string,language:'ko'|'en') {
  if(!place)return null;
  return provider==='google'?resolveGooglePlace({...place,provider:'google'},googleKey,language):{...place,provider:provider==='osm'?'osm' as const:'naver' as const};
}
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

async function googleGeocodeAddress(query:string,apiKey:string,language:'ko'|'en'):Promise<{lat:number;lng:number;address:string}> {
  if(!apiKey)throw new Error(tr(language,'Google 지도 연결이 필요합니다.','Google Maps is not connected yet.'));
  await loadGoogleMaps(apiKey,language);
  const geocoder=new window.google.maps.Geocoder();
  const response=await geocoder.geocode({address:query,language});
  const item=response.results?.[0],location=item?.geometry?.location;
  if(!item||!location)throw new Error(tr(language,'주소를 찾지 못했습니다.','Address not found.'));
  return {lat:location.lat(),lng:location.lng(),address:item.formatted_address||query};
}

async function googleReverseGeocodePoint(lat:number,lng:number,apiKey:string,language:'ko'|'en'):Promise<string> {
  if(!apiKey)throw new Error(tr(language,'Google 지도 연결이 필요합니다.','Google Maps is not connected yet.'));
  await loadGoogleMaps(apiKey,language);
  const response=await new window.google.maps.Geocoder().geocode({location:{lat,lng},language});
  const address=response.results?.[0]?.formatted_address;
  if(!address)throw new Error(tr(language,'주소를 찾지 못했습니다.','Address not found.'));
  return address;
}

async function osmGeocodeAddress(query:string,language:'ko'|'en'):Promise<{lat:number;lng:number;address:string}> {
  const response=await fetch(`/api/free-search?q=${encodeURIComponent(query)}&lang=${language}`);
  const body=await readJsonResponse<{items?:SearchPlace[];message?:string}>(response);
  const item=body.items?.[0];
  if(!response.ok||!item)throw new Error(body.message||tr(language,'주소를 찾지 못했습니다.','Address not found.'));
  const lat=Number(item.mapy)/1e7,lng=Number(item.mapx)/1e7;
  if(!Number.isFinite(lat)||!Number.isFinite(lng))throw new Error(tr(language,'주소 좌표를 확인하지 못했습니다.','Could not find the address coordinates.'));
  return {lat,lng,address:placeAddress(item,language)};
}

async function osmReverseGeocodePoint(lat:number,lng:number,language:'ko'|'en'):Promise<string> {
  const response=await fetch(`/api/free-search?mode=reverse&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&lang=${language}`);
  const body=await readJsonResponse<{address?:string;message?:string}>(response);
  if(!response.ok||!body.address)throw new Error(body.message||tr(language,'주소를 찾지 못했습니다.','Address not found.'));
  return body.address;
}

const CITY_CENTER_ALIASES: Array<[string, {lat:number;lng:number}]> = [
  ['전주',{lat:35.8242,lng:127.1534}], ['jeonju',{lat:35.8242,lng:127.1534}], ['청주',{lat:36.6424,lng:127.489}], ['cheongju',{lat:36.6424,lng:127.489}],
  ['서울',{lat:37.5665,lng:126.978}], ['seoul',{lat:37.5665,lng:126.978}], ['부산',{lat:35.1796,lng:129.0756}], ['busan',{lat:35.1796,lng:129.0756}],
  ['대구',{lat:35.8714,lng:128.6014}], ['daegu',{lat:35.8714,lng:128.6014}], ['인천',{lat:37.4563,lng:126.7052}], ['incheon',{lat:37.4563,lng:126.7052}],
  ['대전',{lat:36.3504,lng:127.3845}], ['daejeon',{lat:36.3504,lng:127.3845}], ['광주',{lat:35.1595,lng:126.8526}], ['gwangju',{lat:35.1595,lng:126.8526}],
  ['울산',{lat:35.5384,lng:129.3114}], ['ulsan',{lat:35.5384,lng:129.3114}], ['제주',{lat:33.4996,lng:126.5312}], ['jeju',{lat:33.4996,lng:126.5312}],
  ['수원',{lat:37.2636,lng:127.0286}], ['suwon',{lat:37.2636,lng:127.0286}], ['강릉',{lat:37.7519,lng:128.8761}], ['gangneung',{lat:37.7519,lng:128.8761}],
  ['경주',{lat:35.8562,lng:129.2247}], ['gyeongju',{lat:35.8562,lng:129.2247}], ['여수',{lat:34.7604,lng:127.6622}], ['yeosu',{lat:34.7604,lng:127.6622}],
  ['목포',{lat:34.8118,lng:126.3922}], ['mokpo',{lat:34.8118,lng:126.3922}], ['춘천',{lat:37.8813,lng:127.7298}], ['chuncheon',{lat:37.8813,lng:127.7298}],
  ['창원',{lat:35.2281,lng:128.6811}], ['changwon',{lat:35.2281,lng:128.6811}],
];

function knownCityCenter(value:string){
  const normalized=value.toLocaleLowerCase('en-US').replace(/[^a-z0-9가-힣]/g,'');
  return CITY_CENTER_ALIASES.find(([alias])=>normalized.includes(alias.toLocaleLowerCase('en-US').replace(/[^a-z0-9가-힣]/g,'')))?.[1] || null;
}

async function searchDestinationCenter(query:string){
  const candidates=[`${query} city hall`,`${query} 시청`,query];
  for(const candidate of candidates){
    try{
      const response=await fetch(`/api/search?q=${encodeURIComponent(candidate)}&near=${encodeURIComponent(query)}&lang=ko`,{cache:'no-store'});
      if(!response.ok)continue;
      const body=await readJsonResponse<{items?:SearchPlace[]}>(response);
      const item=body.items?.find(place=>Number.isFinite(Number(place.mapx))&&Number.isFinite(Number(place.mapy)));
      if(item)return {lat:Number(item.mapy)/1e7,lng:Number(item.mapx)/1e7};
    }catch{}
  }
  throw new Error('destination center not found');
}

function loadNaverMaps(clientId: string, language: 'ko' | 'en') {
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
    script.src=`https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(clientId)}&language=${language}&submodules=panorama,geocoder&callback=${callbackName}`;
    script.async=true;
    script.onerror=()=>{ window.__naverMapsLoading=undefined; reject(new Error('네이버 지도 SDK를 불러오지 못했습니다.')) };
    document.head.appendChild(script);
  });
  return window.__naverMapsLoading;
}

function NaverMap({stops,clientId,destination,onSelect,placeResults,onPlaceSelect,dateLabels,activeDay,onDayChange,editableStopId,onStopPositionChange,onCancelStopPositionEdit,customPin,customPinMode,onCustomLocationChange,onCustomAddressChange,onCustomPinContinue,onMapTap,mapFocused,onToggleMapFocus,plannerCollapsed}:{stops:Stop[];clientId:string;destination:string;onSelect:(stop:Stop)=>void;placeResults:SearchPlace[];onPlaceSelect:(place:SearchPlace)=>void;dateLabels:Record<DayKey,string>;activeDay:DayKey;onDayChange:(day:DayKey)=>void;editableStopId:string|null;onStopPositionChange:(id:string,lat:number,lng:number)=>void;onCancelStopPositionEdit:()=>void;customPin:{lat:number;lng:number}|null;customPinMode:boolean;onCustomLocationChange:(point:{lat:number;lng:number})=>void;onCustomAddressChange:(address:string)=>void;onCustomPinContinue:()=>void;onMapTap:()=>void;mapFocused:boolean;onToggleMapFocus:()=>void;plannerCollapsed:boolean}) {
  const { language } = useLanguage();
  const text = (korean:string, english:string) => tr(language, korean, english);
  const containerRef=useRef<HTMLDivElement>(null), mapRef=useRef<any>(null), overlaysRef=useRef<any[]>([]), placeOverlaysRef=useRef<any[]>([]), customOverlayRef=useRef<any>(null);
  const orderedDays=useMemo(()=>Object.keys(dateLabels),[dateLabels]);
  const [status,setStatus]=useState<'idle'|'loading'|'ready'|'error'>(clientId?'loading':'idle');
  const [cityCenter,setCityCenter]=useState(DEFAULT_MAP_CENTER);
  const [legendExpanded,setLegendExpanded]=useState(false);
  const visibleLegendDays=useMemo(()=>{if(orderedDays.length<=6||legendExpanded)return orderedDays;const first=orderedDays.slice(0,5);return first.includes(activeDay)?first:[...first,activeDay]},[orderedDays,legendExpanded,activeDay]);
  useEffect(()=>{if(orderedDays.length<=6)setLegendExpanded(false)},[orderedDays.length]);
  useEffect(()=>{
    if(!clientId||!containerRef.current)return;
    let cancelled=false; setStatus('loading');
    // The SDK reads its language when the script is loaded. Read the saved
    // preference immediately so the first client render does not briefly load
    // Korean tiles before the language hook finishes hydrating.
    const savedLanguage=window.localStorage.getItem('travel-note-language');
    const mapLanguage=savedLanguage==='en'?'en':'ko';
    const handleAuthFailure=()=>{if(!cancelled)setStatus('error')};
    window.addEventListener('naver-map-auth-failure',handleAuthFailure);
    loadNaverMaps(clientId,mapLanguage).then(()=>{
      if(cancelled||!containerRef.current)return;
      const naver=window.naver;
      mapRef.current=new naver.maps.Map(containerRef.current,{center:new naver.maps.LatLng(DEFAULT_MAP_CENTER.lat,DEFAULT_MAP_CENTER.lng),zoom:12,minZoom:8,zoomControl:true,zoomControlOptions:{position:naver.maps.Position.RIGHT_CENTER},mapTypeControl:false,scaleControl:false,logoControlOptions:{position:naver.maps.Position.BOTTOM_LEFT}});
      setStatus('ready');
    }).catch(()=>setStatus('error'));
    return()=>{cancelled=true;window.removeEventListener('naver-map-auth-failure',handleAuthFailure)};
  },[clientId]);
  useEffect(()=>{
    const canvas=containerRef.current, map=mapRef.current, naver=window.naver;
    if(!canvas||!map||!naver?.maps||status!=='ready')return;
    let frame=0;
    const resize=()=>{
      cancelAnimationFrame(frame);
      frame=requestAnimationFrame(()=>{
        const rect=canvas.getBoundingClientRect();
        if(rect.width<=0||rect.height<=0)return;
        try{
          if(typeof map.setSize==='function')map.setSize(new naver.maps.Size(Math.round(rect.width),Math.round(rect.height)));
          naver.maps.Event.trigger(map,'resize');
        }catch{}
      });
    };
    const observer=new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    const settleTimer=window.setTimeout(resize,360);
    return()=>{observer.disconnect();cancelAnimationFrame(frame);window.clearTimeout(settleTimer)};
  },[status,plannerCollapsed]);
  useEffect(()=>{
    const canvas=containerRef.current,stage=canvas?.parentElement;
    if(!stage)return;
    const isControlTarget=(target:Element|null)=>Boolean(target?.closest('button,a,input,textarea,select'));
    const dismissInputFocus=()=>{
      const active=document.activeElement;
      if(active instanceof HTMLElement&&active.matches('input,textarea,select'))active.blur();
    };
    const handlePointerDown=(event:PointerEvent)=>{
      if(!window.matchMedia('(max-width: 820px)').matches)return;
      if(isControlTarget(event.target as Element|null))return;
      dismissInputFocus();
    };
    const handleClick=(event:MouseEvent)=>{
      if(!window.matchMedia('(max-width: 820px)').matches)return;
      const target=event.target as Element|null;
      if(isControlTarget(target))return;
      dismissInputFocus();
      onMapTap();
    };
    stage.addEventListener('pointerdown',handlePointerDown,{passive:true});
    stage.addEventListener('click',handleClick);
    return()=>{stage.removeEventListener('pointerdown',handlePointerDown);stage.removeEventListener('click',handleClick)};
  },[onMapTap]);
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
    const knownCenter=knownCityCenter(query);
    (knownCenter?Promise.resolve(knownCenter):geocodeAddress(query).catch(()=>searchDestinationCenter(query)))
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
      const position=new naver.maps.LatLng(stop.lat,stop.lng), color=dayColor(stop.day,orderedDays);
      const marker=new naver.maps.Marker({map,position,title:stop.name,clickable:true,draggable:editableStopId===stop.id,zIndex:100+index,icon:{content:`<button type="button" class="naver-marker" style="--pin:${color}" aria-label="${escapeHtml(stop.name)} 정보 보기"><span>${index+1}</span></button>`,anchor:new naver.maps.Point(20,45)}});
      naver.maps.Event.addListener(marker,'click',()=>onSelect(stop));
      if(editableStopId===stop.id){naver.maps.Event.addListener(marker,'dragend',()=>{const point=marker.getPosition();onStopPositionChange(stop.id,point.lat(),point.lng())})}
      overlaysRef.current.push(marker);
    });
    if(stops.length>1){const line=new naver.maps.Polyline({map,path:stops.map(s=>new naver.maps.LatLng(s.lat,s.lng)),strokeColor:dayColor(stops[0].day,orderedDays),strokeWeight:5,strokeOpacity:.7,strokeStyle:'shortdash',zIndex:20});overlaysRef.current.push(line)}
  },[stops,status,onSelect,editableStopId,onStopPositionChange,dateLabels,orderedDays]);
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
  },[customPinMode,status,onCustomLocationChange,onCustomAddressChange]);
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
      const name=placeTitle(place,language);
      const marker=new naver.maps.Marker({map,position,title:name,clickable:true,zIndex:250+index,icon:{content:`<button type="button" class="place-result-marker" aria-label="${escapeHtml(name)} 정보 보기"><span>${index+1}</span></button>`,anchor:new naver.maps.Point(17,40)}});
      naver.maps.Event.addListener(marker,'click',()=>onPlaceSelect(place));placeOverlaysRef.current.push(marker);bounds.extend(position);
    });
    if(placeResults.length===1)map.panTo(bounds.getCenter());else map.fitBounds(bounds,{top:120,right:70,bottom:110,left:70});
  },[placeResults,status,onPlaceSelect,language]);
  return <div className="map-stage">
    <div ref={containerRef} className="map-canvas" aria-label={text('네이버 지도','Naver Map')} />
    {status!=='ready'&&<div className="map-gate"><div className="map-gate-card">
      {status==='loading'?<><div className="loading-orbit"/><strong>{text('네이버 지도를 연결하는 중','Connecting to Naver Maps')}</strong><span>{text('잠시만 기다려주세요.','Just a moment.')}</span></>:status==='error'?<><CircleAlert/><strong>{text('네이버 지도 인증에 실패했습니다','Naver Maps authentication failed')}</strong><span>{text('Maps 앱의 10자 Client ID와 등록된 웹 서비스 URL을 확인해주세요.','Check the 10-character Maps Client ID and the registered web service URL.')}</span></>:<><Map className="text-[#03c75a]"/><strong>{text('네이버 지도 연결이 필요합니다','Naver Maps connection required')}</strong><span>{text('설정에서 Maps Client ID를 입력하면 실제 지도가 열립니다.','Add your Maps Client ID in settings to open the live map.')}</span></>}
    </div></div>}
    {mapFocused&&<button type="button" className="map-planner-toggle" onClick={event=>{event.stopPropagation();onToggleMapFocus()}} aria-label={text('일정 패널 펼치기','Expand planner')}><ChevronDown/>{text('일정 보기','View plans')}</button>}
    <button type="button" className="map-home-button" onClick={fitItinerary} aria-label={stops.length?text('전체 동선 한눈에 보기','Fit the whole route'):text('여행지 전체 보기','Fit the destination')} title={stops.length?text('전체 동선 한눈에 보기','Fit the whole route'):text('여행지 전체 보기','Fit the destination')}><House/></button>
    <div className="map-legend"><div className="map-legend-days">{visibleLegendDays.map(day=><button type="button" key={day} className={`map-date-button ${activeDay===day?'is-active':''}`} aria-pressed={activeDay===day} onClick={()=>onDayChange(day)}><i style={{background:dayColor(day,orderedDays)}}/>{formatTripDate(dateLabels[day],false,language)}</button>)}</div>{orderedDays.length>6&&<button type="button" className="map-legend-toggle" onClick={()=>setLegendExpanded(current=>!current)} aria-expanded={legendExpanded}>{legendExpanded?<><ChevronUp/>{text('접기','Collapse')}</>:<><ChevronDown/>+{orderedDays.length-visibleLegendDays.length}{text('일',' days')}</>}</button>}</div>
    {customPinMode&&<div className="map-location-editor"><strong>{text('지도에서 위치를 정하세요','Choose a location on the map')}</strong><span>{text('지도를 클릭하거나 초록 핀을 끌어 옮긴 뒤 계속하세요.','Click the map or drag the green pin, then continue.')}</span><Button onClick={onCustomPinContinue} disabled={!customPin}>{text('이 위치로 계속','Continue with this location')}</Button></div>}
    {editableStopId&&<div className="map-location-editor"><strong>{text('위치 수정 중','Editing location')}</strong><span>{text('선택한 장소의 핀을 드래그해 위치를 바꾸세요.','Drag the selected place pin to move it.')}</span><Button variant="outline" onClick={onCancelStopPositionEdit}>{text('취소','Cancel')}</Button></div>}
  </div>
}

function GoogleMap({stops,apiKey,destination,onSelect,placeResults,onPlaceSelect,dateLabels,activeDay,onDayChange,editableStopId,onStopPositionChange,onCancelStopPositionEdit,customPin,customPinMode,onCustomLocationChange,onCustomAddressChange,onCustomPinContinue,onMapTap,mapFocused,onToggleMapFocus,plannerCollapsed}:{stops:Stop[];apiKey:string;destination:string;onSelect:(stop:Stop)=>void;placeResults:SearchPlace[];onPlaceSelect:(place:SearchPlace)=>void;dateLabels:Record<DayKey,string>;activeDay:DayKey;onDayChange:(day:DayKey)=>void;editableStopId:string|null;onStopPositionChange:(id:string,lat:number,lng:number)=>void;onCancelStopPositionEdit:()=>void;customPin:{lat:number;lng:number}|null;customPinMode:boolean;onCustomLocationChange:(point:{lat:number;lng:number})=>void;onCustomAddressChange:(address:string)=>void;onCustomPinContinue:()=>void;onMapTap:()=>void;mapFocused:boolean;onToggleMapFocus:()=>void;plannerCollapsed:boolean}) {
  const {language}=useLanguage();
  const text=(korean:string,english:string)=>tr(language,korean,english);
  const containerRef=useRef<HTMLDivElement>(null),mapRef=useRef<any>(null),overlaysRef=useRef<any[]>([]),placeOverlaysRef=useRef<any[]>([]),customOverlayRef=useRef<any>(null);
  const orderedDays=useMemo(()=>Object.keys(dateLabels),[dateLabels]);
  const [status,setStatus]=useState<'idle'|'loading'|'ready'|'error'>(apiKey?'loading':'idle');
  const [cityCenter,setCityCenter]=useState(DEFAULT_WORLD_CENTER);
  const [legendExpanded,setLegendExpanded]=useState(false);
  const visibleLegendDays=useMemo(()=>{if(orderedDays.length<=6||legendExpanded)return orderedDays;const first=orderedDays.slice(0,5);return first.includes(activeDay)?first:[...first,activeDay]},[orderedDays,legendExpanded,activeDay]);
  useEffect(()=>{if(orderedDays.length<=6)setLegendExpanded(false)},[orderedDays.length]);
  useEffect(()=>{
    if(!apiKey||!containerRef.current)return;
    let cancelled=false;setStatus('loading');
    loadGoogleMaps(apiKey,language).then(()=>{
      if(cancelled||!containerRef.current)return;
      mapRef.current=new window.google.maps.Map(containerRef.current,{center:DEFAULT_WORLD_CENTER,zoom:2,minZoom:2,zoomControl:true,mapTypeControl:false,streetViewControl:false,fullscreenControl:false,clickableIcons:true,gestureHandling:'greedy'});
      setStatus('ready');
    }).catch(()=>setStatus('error'));
    return()=>{cancelled=true};
  },[apiKey,language]);
  useEffect(()=>{
    const canvas=containerRef.current,map=mapRef.current,google=window.google;
    if(!canvas||!map||!google?.maps||status!=='ready')return;
    let frame=0;
    const resize=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const center=map.getCenter();google.maps.event.trigger(map,'resize');if(center)map.setCenter(center)})};
    const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
    const settleTimer=window.setTimeout(resize,360);
    return()=>{observer.disconnect();cancelAnimationFrame(frame);window.clearTimeout(settleTimer)};
  },[status,plannerCollapsed]);
  useEffect(()=>{
    const canvas=containerRef.current,stage=canvas?.parentElement;if(!stage)return;
    const isControlTarget=(target:Element|null)=>Boolean(target?.closest('button,a,input,textarea,select'));
    const dismissInputFocus=()=>{const active=document.activeElement;if(active instanceof HTMLElement&&active.matches('input,textarea,select'))active.blur()};
    const handlePointerDown=(event:PointerEvent)=>{if(!window.matchMedia('(max-width: 820px)').matches||isControlTarget(event.target as Element|null))return;dismissInputFocus()};
    const handleClick=(event:MouseEvent)=>{if(!window.matchMedia('(max-width: 820px)').matches)return;const target=event.target as Element|null;if(isControlTarget(target))return;dismissInputFocus();onMapTap()};
    stage.addEventListener('pointerdown',handlePointerDown,{passive:true});stage.addEventListener('click',handleClick);
    return()=>{stage.removeEventListener('pointerdown',handlePointerDown);stage.removeEventListener('click',handleClick)};
  },[onMapTap]);
  useEffect(()=>{
    const map=mapRef.current,google=window.google;if(!map||!google?.maps||status!=='ready')return;
    let cancelled=false;
    const applyCenter=(point:{lat:number;lng:number})=>{if(cancelled)return;setCityCenter(point);map.setCenter(point);map.setZoom(11)};
    const query=destination.trim();
    if(!query){applyCenter(DEFAULT_WORLD_CENTER);map.setZoom(2);return()=>{cancelled=true}};
    googleGeocodeAddress(query,apiKey,language).then(applyCenter).catch(()=>{if(!cancelled){setCityCenter(DEFAULT_WORLD_CENTER);map.setCenter(DEFAULT_WORLD_CENTER);map.setZoom(2)}});
    return()=>{cancelled=true};
  },[destination,status,apiKey,language]);
  useEffect(()=>{
    const map=mapRef.current;if(!map||status!=='ready'||stops.length)return;
    map.setCenter(cityCenter);map.setZoom(cityCenter===DEFAULT_WORLD_CENTER?2:11);
  },[stops.length,cityCenter,status]);
  useEffect(()=>{
    const map=mapRef.current,google=window.google;if(!map||!google?.maps||status!=='ready')return;
    overlaysRef.current.forEach(overlay=>{try{overlay.setMap(null)}catch{}});overlaysRef.current=[];
    stops.forEach((stop,index)=>{
      const color=dayColor(stop.day,orderedDays);
      const marker=new google.maps.Marker({map,position:{lat:stop.lat,lng:stop.lng},title:stop.name,clickable:true,draggable:editableStopId===stop.id,zIndex:100+index,label:{text:String(index+1),color:'#fff',fontWeight:'800'},icon:{path:google.maps.SymbolPath.CIRCLE,scale:17,fillColor:color,fillOpacity:1,strokeColor:'#fff',strokeWeight:3}});
      marker.addListener('click',()=>onSelect(stop));
      if(editableStopId===stop.id)marker.addListener('dragend',()=>{const point=marker.getPosition();if(point)onStopPositionChange(stop.id,point.lat(),point.lng())});
      overlaysRef.current.push(marker);
    });
    if(stops.length>1)overlaysRef.current.push(new google.maps.Polyline({map,path:stops.map(stop=>({lat:stop.lat,lng:stop.lng})),strokeColor:dayColor(stops[0].day,orderedDays),strokeWeight:5,strokeOpacity:.72,icons:[{icon:{path:'M 0,-1 0,1',strokeOpacity:1,scale:2},offset:'0',repeat:'14px'}]}));
  },[stops,status,onSelect,editableStopId,onStopPositionChange,orderedDays]);
  const fitItinerary=useCallback(()=>{
    const map=mapRef.current,google=window.google;if(!map||!google?.maps||status!=='ready')return;
    if(!stops.length){map.setCenter(cityCenter);map.setZoom(cityCenter===DEFAULT_WORLD_CENTER?2:11);return}
    if(stops.length===1){map.setCenter({lat:stops[0].lat,lng:stops[0].lng});map.setZoom(15);return}
    const bounds=new google.maps.LatLngBounds();stops.forEach(stop=>bounds.extend({lat:stop.lat,lng:stop.lng}));map.fitBounds(bounds,90);
  },[stops,cityCenter,status]);
  useEffect(()=>{
    const map=mapRef.current,google=window.google;if(!map||!google?.maps||status!=='ready')return;
    const listener=map.addListener('click',async(event:any)=>{
      if(customPinMode){const point=event.latLng;if(!point)return;const next={lat:point.lat(),lng:point.lng()};onCustomLocationChange(next);googleReverseGeocodePoint(next.lat,next.lng,apiKey,language).then(onCustomAddressChange).catch(()=>{});return}
      if(!event.placeId)return;
      event.stop?.();
      try{
        const place=new google.maps.places.Place({id:event.placeId});
        await place.fetchFields({fields:['displayName','formattedAddress','location','types']});
        const location=place.location;if(!location)return;
        const lat=typeof location.lat==='function'?location.lat():Number(location.lat),lng=typeof location.lng==='function'?location.lng():Number(location.lng);
        onPlaceSelect({title:place.displayName||place.formattedAddress||tr(language,'선택한 장소','Selected place'),category:(place.types?.[0]||'Google Maps').replaceAll('_',' '),address:place.formattedAddress||'',roadAddress:place.formattedAddress||'',mapx:String(Math.round(lng*1e7)),mapy:String(Math.round(lat*1e7)),provider:'google',placeId:place.id||event.placeId});
      }catch{}
    });
    return()=>google.maps.event.removeListener(listener);
  },[customPinMode,status,onCustomLocationChange,onCustomAddressChange,onPlaceSelect,apiKey,language]);
  useEffect(()=>{
    const map=mapRef.current,google=window.google;if(!map||!google?.maps||status!=='ready')return;
    try{customOverlayRef.current?.setMap(null)}catch{}customOverlayRef.current=null;
    if(!customPin)return;
    const marker=new google.maps.Marker({map,position:customPin,title:tr(language,'임의 위치','Custom location'),draggable:customPinMode,zIndex:400,label:{text:'+',color:'#fff',fontWeight:'900'},icon:{path:google.maps.SymbolPath.CIRCLE,scale:17,fillColor:'#03a94d',fillOpacity:1,strokeColor:'#fff',strokeWeight:3}});
    marker.addListener('dragend',()=>{const point=marker.getPosition();if(!point)return;const next={lat:point.lat(),lng:point.lng()};onCustomLocationChange(next);googleReverseGeocodePoint(next.lat,next.lng,apiKey,language).then(onCustomAddressChange).catch(()=>{})});
    customOverlayRef.current=marker;if(customPinMode)map.panTo(customPin);
    return()=>{try{marker.setMap(null)}catch{}if(customOverlayRef.current===marker)customOverlayRef.current=null};
  },[customPin,status,customPinMode,onCustomLocationChange,onCustomAddressChange,apiKey,language]);
  useEffect(()=>{
    const map=mapRef.current,google=window.google;if(!map||!google?.maps||status!=='ready')return;
    placeOverlaysRef.current.forEach(overlay=>{try{overlay.setMap(null)}catch{}});placeOverlaysRef.current=[];
    const valid=placeResults.filter(place=>Number.isFinite(Number(place.mapx))&&Number.isFinite(Number(place.mapy)));if(!valid.length)return;
    const bounds=new google.maps.LatLngBounds();
    valid.forEach((place,index)=>{const position={lat:Number(place.mapy)/1e7,lng:Number(place.mapx)/1e7};const marker=new google.maps.Marker({map,position,title:placeTitle(place,language),clickable:true,zIndex:250+index,label:{text:String(index+1),color:'#fff',fontWeight:'800'},icon:{path:google.maps.SymbolPath.CIRCLE,scale:15,fillColor:'#03a94d',fillOpacity:1,strokeColor:'#fff',strokeWeight:3}});marker.addListener('click',()=>onPlaceSelect(place));placeOverlaysRef.current.push(marker);bounds.extend(position)});
    if(valid.length===1){map.panTo(bounds.getCenter());map.setZoom(15)}else map.fitBounds(bounds,80);
  },[placeResults,status,onPlaceSelect,language]);
  return <div className="map-stage">
    <div ref={containerRef} className="map-canvas" aria-label={text('Google 지도','Google Map')}/>
    {status!=='ready'&&<div className="map-gate"><div className="map-gate-card">{status==='loading'?<><div className="loading-orbit"/><strong>{text('Google 지도를 연결하는 중','Connecting to Google Maps')}</strong><span>{text('잠시만 기다려주세요.','Just a moment.')}</span></>:status==='error'?<><CircleAlert/><strong>{text('Google 지도 인증에 실패했습니다','Google Maps authentication failed')}</strong><span>{text('API 키와 허용된 웹사이트 주소를 확인해주세요.','Check the API key and allowed website addresses.')}</span></>:<><Map className="text-[#4285f4]"/><strong>{text('해외 지도를 준비 중이에요','International maps are not connected yet')}</strong><span>{text('Google Maps API 키를 연결하면 해외 장소를 검색할 수 있어요.','Connect a Google Maps API key to search places worldwide.')}</span></>}</div></div>}
    {mapFocused&&<button type="button" className="map-planner-toggle" onClick={event=>{event.stopPropagation();onToggleMapFocus()}} aria-label={text('일정 패널 펼치기','Expand planner')}><ChevronDown/>{text('일정 보기','View plans')}</button>}
    <button type="button" className="map-home-button" onClick={fitItinerary} aria-label={stops.length?text('전체 동선 한눈에 보기','Fit the whole route'):text('여행지 전체 보기','Fit the destination')} title={stops.length?text('전체 동선 한눈에 보기','Fit the whole route'):text('여행지 전체 보기','Fit the destination')}><House/></button>
    <div className="map-legend"><div className="map-legend-days">{visibleLegendDays.map(day=><button type="button" key={day} className={`map-date-button ${activeDay===day?'is-active':''}`} aria-pressed={activeDay===day} onClick={()=>onDayChange(day)}><i style={{background:dayColor(day,orderedDays)}}/>{formatTripDate(dateLabels[day],false,language)}</button>)}</div>{orderedDays.length>6&&<button type="button" className="map-legend-toggle" onClick={()=>setLegendExpanded(current=>!current)} aria-expanded={legendExpanded}>{legendExpanded?<><ChevronUp/>{text('접기','Collapse')}</>:<><ChevronDown/>+{orderedDays.length-visibleLegendDays.length}{text('일',' days')}</>}</button>}</div>
    {customPinMode&&<div className="map-location-editor"><strong>{text('지도에서 위치를 정하세요','Choose a location on the map')}</strong><span>{text('지도를 클릭하거나 초록 핀을 끌어 옮긴 뒤 계속하세요.','Click the map or drag the green pin, then continue.')}</span><Button onClick={onCustomPinContinue} disabled={!customPin}>{text('이 위치로 계속','Continue with this location')}</Button></div>}
    {editableStopId&&<div className="map-location-editor"><strong>{text('위치 수정 중','Editing location')}</strong><span>{text('선택한 장소의 핀을 드래그해 위치를 바꾸세요.','Drag the selected place pin to move it.')}</span><Button variant="outline" onClick={onCancelStopPositionEdit}>{text('취소','Cancel')}</Button></div>}
  </div>;
}

async function fetchLocalizedFreeMapStyle(_language:'ko'|'en') {
  const response=await fetch('https://tiles.openfreemap.org/styles/liberty',{cache:'force-cache'});
  if(!response.ok)throw new Error(`Map style request failed: ${response.status}`);
  // Resolve the TileJSON URL here. This avoids relying on a second
  // client-side URL resolution step and keeps the vector tiles (including
  // Liberty's Latin/English + local label fields) available in MapLibre.
  const style=await response.json() as any;
  const source=style?.sources?.openmaptiles;
  if(source?.url){
    const tileJsonResponse=await fetch(source.url,{cache:'force-cache'});
    if(tileJsonResponse.ok){
      const tileJson=await tileJsonResponse.json() as any;
      if(Array.isArray(tileJson.tiles)&&tileJson.tiles.length){
        source.tiles=tileJson.tiles;
        delete source.url;
        if(Number.isFinite(tileJson.minzoom))source.minzoom=tileJson.minzoom;
        if(Number.isFinite(tileJson.maxzoom))source.maxzoom=tileJson.maxzoom;
      }
    }
  }
  // Liberty's default style intentionally shows the local name alongside a
  // latin name. Overseas maps are easier to scan when the English field is
  // the primary label, regardless of the app's interface language.
  if(Array.isArray(style.layers)){
    const englishName=['coalesce',['get','name_en'],['get','name:latin'],['get','name']];
    style.layers=style.layers.map((layer:any)=>{
      if(layer?.type!=='symbol'||!layer.layout?.['text-field'])return layer;
      return {...layer,layout:{...layer.layout,'text-field':englishName}};
    });
  }
  return style;
}

function OsmMap({stops,destination,onSelect,placeResults,onPlaceSelect,dateLabels,activeDay,onDayChange,editableStopId,onStopPositionChange,onCancelStopPositionEdit,customPin,customPinMode,onCustomLocationChange,onCustomAddressChange,onCustomPinContinue,onMapTap,mapFocused,onToggleMapFocus,plannerCollapsed}:{stops:Stop[];destination:string;onSelect:(stop:Stop)=>void;placeResults:SearchPlace[];onPlaceSelect:(place:SearchPlace)=>void;dateLabels:Record<DayKey,string>;activeDay:DayKey;onDayChange:(day:DayKey)=>void;editableStopId:string|null;onStopPositionChange:(id:string,lat:number,lng:number)=>void;onCancelStopPositionEdit:()=>void;customPin:{lat:number;lng:number}|null;customPinMode:boolean;onCustomLocationChange:(point:{lat:number;lng:number})=>void;onCustomAddressChange:(address:string)=>void;onCustomPinContinue:()=>void;onMapTap:()=>void;mapFocused:boolean;onToggleMapFocus:()=>void;plannerCollapsed:boolean}) {
  const { language } = useLanguage();
  const text = (korean:string, english:string) => tr(language,korean,english);
  const containerRef=useRef<HTMLDivElement>(null);
  const mapRef=useRef<any>(null);
  const maplibreRef=useRef<any>(null);
  const stopMarkersRef=useRef<any[]>([]);
  const resultMarkersRef=useRef<any[]>([]);
  const customMarkerRef=useRef<any>(null);
  const latestRef=useRef({stops,onSelect,placeResults,onPlaceSelect,editableStopId,onStopPositionChange,customPin,customPinMode,onCustomLocationChange,onCustomAddressChange,onMapTap,language});
  const [status,setStatus]=useState<'loading'|'ready'|'error'>('loading');
  latestRef.current={stops,onSelect,placeResults,onPlaceSelect,editableStopId,onStopPositionChange,customPin,customPinMode,onCustomLocationChange,onCustomAddressChange,onMapTap,language};

  useEffect(()=>{
    let alive=true;
    let mapInstance:any=null;
    void (async()=>{
      try{
        const maplibreModule=await import('maplibre-gl');
        const MapLibre=(maplibreModule as any).default??maplibreModule;
        const style=await fetchLocalizedFreeMapStyle(latestRef.current.language);
        if(!alive||!containerRef.current)return;
        maplibreRef.current=MapLibre;
        mapInstance=new MapLibre.Map({container:containerRef.current,style,center:[0,20],zoom:2,maxZoom:14,attributionControl:false,dragRotate:false,touchPitch:false});
        mapInstance.addControl(new MapLibre.NavigationControl({showCompass:false}),'bottom-right');
        mapInstance.addControl(new MapLibre.AttributionControl({compact:true,customAttribution:'<a href="https://openfreemap.org/" target="_blank" rel="noreferrer">OpenFreeMap</a> · <a href="https://www.openstreetmap.de/germanstyle.html" target="_blank" rel="noreferrer">OpenStreetMap.de</a> · &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'}),'bottom-right');
        const vectorSourceIds=Object.entries(style?.sources||{}).filter(([,source]:any)=>source?.type==='vector'||source?.url||source?.tiles).map(([id])=>id);
        const vectorLayerIds=(style?.layers||[]).filter((layer:any)=>['fill','line','symbol','circle','fill-extrusion','heatmap'].includes(layer?.type)).map((layer:any)=>layer.id).filter(Boolean);
        let fallbackTimer:number|null=null;
        const hasRenderedVector=()=>{
          try{return vectorLayerIds.length>0&&mapInstance.queryRenderedFeatures(undefined,{layers:vectorLayerIds}).length>0}catch{return false}
        };
        const removeRasterFallback=()=>{
          try{
            if(mapInstance.getLayer('osm-raster-fallback'))mapInstance.removeLayer('osm-raster-fallback');
            if(mapInstance.getSource('osm-raster-fallback'))mapInstance.removeSource('osm-raster-fallback');
          }catch{}
        };
        const addRasterFallback=()=>{
          if(!alive||hasRenderedVector()||mapInstance.getSource('osm-raster-fallback'))return;
          try{
            mapInstance.addSource('osm-raster-fallback',{type:'raster',tiles:['https://tile.openstreetmap.de/{z}/{x}/{y}.png'],tileSize:256,maxzoom:19,attribution:'OpenStreetMap.de · OpenStreetMap contributors'});
            // Put the emergency raster on top so an opaque but empty vector
            // background cannot hide it. It is removed as soon as vector
            // features become visible.
            mapInstance.addLayer({id:'osm-raster-fallback',type:'raster',source:'osm-raster-fallback',paint:{'raster-opacity':1,'raster-fade-duration':0}});
          }catch{}
        };
        const scheduleRasterFallback=(delay=3000)=>{if(fallbackTimer!==null)window.clearTimeout(fallbackTimer);fallbackTimer=window.setTimeout(()=>{fallbackTimer=null;addRasterFallback()},delay)};
        const onSourceData=(event:any)=>{
          if(vectorSourceIds.includes(event?.sourceId)&&event?.sourceDataType==='content')window.setTimeout(()=>{if(alive&&hasRenderedVector())removeRasterFallback()},180);
        };
        const onMapError=()=>scheduleRasterFallback(900);
        mapInstance.on('sourcedata',onSourceData);
        mapInstance.on('error',onMapError);
        mapInstance.on('click',(event:any)=>{
          const current=latestRef.current;
          if(current.customPinMode){
            const next={lat:event.lngLat.lat,lng:event.lngLat.lng};
            current.onCustomLocationChange(next);
            void osmReverseGeocodePoint(next.lat,next.lng,current.language).then(current.onCustomAddressChange).catch(()=>{});
            return;
          }
          if(window.matchMedia('(max-width: 820px)').matches)current.onMapTap();
        });
        mapInstance.on('style.load',()=>{
          if(!alive)return;
          mapRef.current=mapInstance;
          setStatus('ready');
          scheduleRasterFallback();
          window.setTimeout(()=>mapInstance?.resize(),0);
        });
        mapInstance.once('remove',()=>{if(fallbackTimer!==null)window.clearTimeout(fallbackTimer)});
      }catch{if(alive)setStatus('error')}
    })();
    return()=>{
      alive=false;
      stopMarkersRef.current.forEach(marker=>marker.remove());stopMarkersRef.current=[];
      resultMarkersRef.current.forEach(marker=>marker.remove());resultMarkersRef.current=[];
      customMarkerRef.current?.remove();customMarkerRef.current=null;
      mapInstance?.remove();
      mapRef.current=null;maplibreRef.current=null;
    };
  },[language]);

  useEffect(()=>{
    const map=mapRef.current;if(!map||status!=='ready')return;
    const resize=()=>map.resize();
    const observer=new ResizeObserver(resize);if(containerRef.current)observer.observe(containerRef.current);resize();
    const timer=window.setTimeout(resize,360);
    return()=>{observer.disconnect();window.clearTimeout(timer)};
  },[status,plannerCollapsed]);

  useEffect(()=>{
    const map=mapRef.current;if(!map||status!=='ready')return;
    let cancelled=false;
    const query=destination.trim();
    if(!query){map.jumpTo({center:[0,20],zoom:2});return()=>{cancelled=true}};
    void osmGeocodeAddress(query,language).then(point=>{if(!cancelled&&!latestRef.current.stops.length)map.flyTo({center:[point.lng,point.lat],zoom:11,duration:500})}).catch(()=>{});
    return()=>{cancelled=true};
  },[destination,language,status]);

  useEffect(()=>{
    const map=mapRef.current;if(!map||status!=='ready')return;
    const current=latestRef.current;
    stopMarkersRef.current.forEach(marker=>marker.remove());stopMarkersRef.current=[];
    const coordinates=current.stops.map(stop=>[stop.lng,stop.lat]);
    const sourceId='osm-itinerary-route';
    const data={type:'Feature',properties:{},geometry:{type:'LineString',coordinates:coordinates.length>1?coordinates:[]}};
    const source=map.getSource(sourceId);
    if(source)source.setData(data);else{
      map.addSource(sourceId,{type:'geojson',data});
      map.addLayer({id:sourceId,type:'line',source:sourceId,paint:{'line-color':current.stops[0]?dayColor(current.stops[0].day,Object.keys(dateLabels)):'#03a94d','line-width':5,'line-opacity':.72,'line-dasharray':[2,4]}});
    }
    if(map.getLayer(sourceId))map.setPaintProperty(sourceId,'line-color',current.stops[0]?dayColor(current.stops[0].day,Object.keys(dateLabels)):'#03a94d');
    const Marker=maplibreRef.current?.Marker;if(!Marker)return;
    current.stops.forEach((stop,index)=>{
      const element=document.createElement('div');element.className='osm-stop-icon-wrap';element.innerHTML=`<span class="osm-stop-icon" style="--pin:${dayColor(stop.day,Object.keys(dateLabels))}">${index+1}</span>`;element.setAttribute('title',stop.name);element.setAttribute('aria-label',stop.name);
      element.addEventListener('click',event=>{event.stopPropagation();current.onSelect(stop)});
      const marker=new Marker({element,draggable:current.editableStopId===stop.id}).setLngLat([stop.lng,stop.lat]).addTo(map);
      if(current.editableStopId===stop.id)marker.on('dragend',()=>{const point=marker.getLngLat();current.onStopPositionChange(stop.id,point.lat,point.lng)});
      stopMarkersRef.current.push(marker);
    });
  },[stops,status,editableStopId,onSelect,onStopPositionChange,dateLabels]);

  useEffect(()=>{
    const map=mapRef.current;if(!map||status!=='ready')return;
    const current=latestRef.current;
    resultMarkersRef.current.forEach(marker=>marker.remove());resultMarkersRef.current=[];
    const Marker=maplibreRef.current?.Marker;if(!Marker)return;
    const valid=current.placeResults.filter(place=>Number.isFinite(Number(place.mapx))&&Number.isFinite(Number(place.mapy)));
    const bounds=new maplibreRef.current.LngLatBounds();
    valid.forEach((place,index)=>{
      const lat=Number(place.mapy)/1e7,lng=Number(place.mapx)/1e7;
      const element=document.createElement('div');element.className='osm-result-icon-wrap';element.innerHTML=`<span class="osm-result-icon">${index+1}</span>`;element.setAttribute('title',placeTitle(place,language));element.setAttribute('aria-label',placeTitle(place,language));
      element.addEventListener('click',event=>{event.stopPropagation();latestRef.current.onPlaceSelect(place)});
      const marker=new Marker({element}).setLngLat([lng,lat]).addTo(map);resultMarkersRef.current.push(marker);bounds.extend([lng,lat]);
    });
    if(valid.length===1)map.flyTo({center:[Number(valid[0].mapx)/1e7,Number(valid[0].mapy)/1e7],zoom:15,duration:450});
    else if(valid.length>1)map.fitBounds(bounds,{padding:70,maxZoom:15,duration:450});
  },[placeResults,status,onPlaceSelect,language]);

  useEffect(()=>{
    const map=mapRef.current;if(!map||status!=='ready')return;
    customMarkerRef.current?.remove();customMarkerRef.current=null;
    const point=latestRef.current.customPin;if(!point)return;
    const Marker=maplibreRef.current?.Marker;if(!Marker)return;
    const current=latestRef.current;
    const element=document.createElement('div');element.className='osm-custom-icon-wrap';element.innerHTML='<span class="osm-custom-icon">＋</span>';
    const marker=new Marker({element,draggable:current.customPinMode}).setLngLat([point.lng,point.lat]).addTo(map);
    marker.on('dragend',()=>{const next=marker.getLngLat();current.onCustomLocationChange({lat:next.lat,lng:next.lng});void osmReverseGeocodePoint(next.lat,next.lng,current.language).then(current.onCustomAddressChange).catch(()=>{})});
    customMarkerRef.current=marker;
    if(current.customPinMode)map.panTo([point.lng,point.lat]);
  },[customPin,status,customPinMode,language]);

  const fitItinerary=useCallback(()=>{
    const map=mapRef.current;if(!map||status!=='ready')return;
    const current=latestRef.current.stops;
    if(!current.length){void osmGeocodeAddress(destination,language).then(point=>map.flyTo({center:[point.lng,point.lat],zoom:11,duration:500})).catch(()=>map.jumpTo({center:[0,20],zoom:2}));return}
    if(current.length===1){map.flyTo({center:[current[0].lng,current[0].lat],zoom:15,duration:500});return}
    const bounds=new maplibreRef.current.LngLatBounds();current.forEach(stop=>bounds.extend([stop.lng,stop.lat]));map.fitBounds(bounds,{padding:90,maxZoom:15,duration:550});
  },[destination,language,status]);

  return <div className="map-stage osm-map-stage">
    <div ref={containerRef} className="map-canvas" aria-label={text('지도','Map')}/>
    {status==='loading'&&<div className="map-gate map-gate-transparent"><div className="map-gate-card"><div className="loading-orbit"/><strong>{text('지도 준비 중','Preparing the map')}</strong><span>{text('잠시만 기다려주세요.','Just a moment.')}</span></div></div>}
    {status==='error'&&<div className="map-gate"><div className="map-gate-card"><CircleAlert/><strong>{text('지도를 불러오지 못했어요','The map could not be loaded')}</strong><span>{text('잠시 후 새로고침해 주세요.','Please refresh and try again.')}</span></div></div>}
    {mapFocused&&<button type="button" className="map-planner-toggle" onClick={event=>{event.stopPropagation();onToggleMapFocus()}} aria-label={text('일정 패널 펼치기','Expand planner')}><ChevronDown/>{text('일정 보기','View plans')}</button>}
    <button type="button" className="map-home-button" onClick={fitItinerary} aria-label={stops.length?text('전체 동선 한눈에 보기','Fit the whole route'):text('여행지 전체 보기','Fit the destination')} title={stops.length?text('전체 동선 한눈에 보기','Fit the whole route'):text('여행지 전체 보기','Fit the destination')}><House/></button>
    <div className="map-legend"><div className="map-legend-days">{Object.keys(dateLabels).map(day=><button type="button" key={day} className={`map-date-button ${activeDay===day?'is-active':''}`} aria-pressed={activeDay===day} onClick={()=>onDayChange(day)}><i style={{background:dayColor(day,Object.keys(dateLabels))}}/>{formatTripDate(dateLabels[day],false,language)}</button>)}</div><small className="osm-attribution-note">OpenFreeMap · OpenStreetMap</small></div>
    {customPinMode&&<div className="map-location-editor"><strong>{text('지도에서 위치를 정하세요','Choose a location on the map')}</strong><span>{text('지도를 클릭하거나 초록 핀을 끌어 옮긴 뒤 계속하세요.','Click the map or drag the green pin, then continue.')}</span><Button onClick={onCustomPinContinue} disabled={!customPin}>{text('이 위치로 계속','Continue with this location')}</Button></div>}
    {editableStopId&&<div className="map-location-editor"><strong>{text('위치 수정 중','Editing location')}</strong><span>{text('선택한 장소의 핀을 드래그해 위치를 바꾸세요.','Drag the selected place pin to move it.')}</span><Button variant="outline" onClick={onCancelStopPositionEdit}>{text('취소','Cancel')}</Button></div>}
  </div>;
}

function PanoramaView({stop,clientId}:{stop:Stop;clientId:string}) {
  const { language } = useLanguage();
  const ref=useRef<HTMLDivElement>(null); const [available,setAvailable]=useState(true);
  useEffect(()=>{
    if(!clientId||!ref.current||!window.naver?.maps?.Panorama)return;
    const pano=new window.naver.maps.Panorama(ref.current,{position:new window.naver.maps.LatLng(stop.lat,stop.lng),pov:{pan:0,tilt:0,fov:100}});
    const listener=window.naver.maps.Event.addListener(pano,'pano_status',(s:any)=>setAvailable(s===window.naver.maps.PanoramaStatus.OK));
    return()=>window.naver?.maps?.Event.removeListener(listener);
  },[clientId,stop]);
  return <div className="panorama-wrap"><div ref={ref} className="h-full w-full"/>{!clientId&&<span>{tr(language,'지도 Client ID 연결 후 거리뷰를 볼 수 있습니다.','Connect a Maps Client ID to view street panoramas.')}</span>}{clientId&&!available&&<span>{tr(language,'이 위치 주변에는 거리뷰가 없습니다.','Street panorama is not available at this location.')}</span>}</div>
}

export default function Home(){
  const { language } = useLanguage();
  const { currency } = useCurrency(language);
  const text = (korean:string, english:string) => tr(language, korean, english);
  const firstDefaultDay=dateDayKey(DEFAULT_TRIP.startDate);
  const [activeDay,setActiveDay]=useState<DayKey>(firstDefaultDay), [stops,setStops]=useState<Stop[]>(seedStops), [selected,setSelected]=useState<Stop|null>(null), [mapFocused,setMapFocused]=useState(false), [plannerCollapsed,setPlannerCollapsed]=useState(false);
  const [tripSettings,setTripSettings]=useState<TripSettings>(DEFAULT_TRIP), [settingsDraft,setSettingsDraft]=useState<TripSettings>(DEFAULT_TRIP);
  const [addOpen,setAddOpen]=useState(false), [settingsOpen,setSettingsOpen]=useState(false), [clientId,setClientId]=useState(''), [googleKey,setGoogleKey]=useState('');
  const [planId,setPlanId]=useState<string|null>(null), [planUpdatedAt,setPlanUpdatedAt]=useState(''), [planVersion,setPlanVersion]=useState(1), [planLoading,setPlanLoading]=useState(true), [planSaving,setPlanSaving]=useState(false), [planSaveMessage,setPlanSaveMessage]=useState(''), [isLocalDraft,setIsLocalDraft]=useState(true), [canEdit,setCanEdit]=useState(true), [planAction,setPlanAction]=useState<'duplicate'|'delete'|null>(null), [deleteDialogOpen,setDeleteDialogOpen]=useState(false), [editPasswordWarningOpen,setEditPasswordWarningOpen]=useState(false);
  const [planPassword,setPlanPassword]=useState(''), [planPasswordAuth,setPlanPasswordAuth]=useState(''), [passwordConfigured,setPasswordConfigured]=useState(false), [planPasswordTouched,setPlanPasswordTouched]=useState(false), [showPlanPassword,setShowPlanPassword]=useState(false), [editPassword,setEditPassword]=useState(''), [editPasswordAuth,setEditPasswordAuth]=useState(''), [editPasswordConfigured,setEditPasswordConfigured]=useState(false), [editPasswordTouched,setEditPasswordTouched]=useState(false), [showEditPassword,setShowEditPassword]=useState(false), [editPasswordPromptOpen,setEditPasswordPromptOpen]=useState(false), [editPasswordPrompt,setEditPasswordPrompt]=useState(''), [editPasswordPromptError,setEditPasswordPromptError]=useState(''), [passwordPromptOpen,setPasswordPromptOpen]=useState(false), [passwordPrompt,setPasswordPrompt]=useState(''), [passwordPromptError,setPasswordPromptError]=useState(''), [protectedPlanId,setProtectedPlanId]=useState<string|null>(null), [protectedPlanTitle,setProtectedPlanTitle]=useState('');
  const [adminMode,setAdminMode]=useState(false);
  const [editing,setEditing]=useState<Stop|null>(null), [editDraft,setEditDraft]=useState<Stop|null>(null), [editQuery,setEditQuery]=useState(''), [editPlaceLinked,setEditPlaceLinked]=useState(true), [osmEditQuery,setOsmEditQuery]=useState('');
  const [query,setQuery]=useState(''), [picked,setPicked]=useState<SearchPlace|null>(null), [osmAddQuery,setOsmAddQuery]=useState('');
  const [mapQuery,setMapQuery]=useState(''),[mapPicked,setMapPicked]=useState<SearchPlace|null>(null),[mapCandidate,setMapCandidate]=useState<SearchPlace|null>(null),[mapResultPlaces,setMapResultPlaces]=useState<SearchPlace[]>([]),[osmMapQuery,setOsmMapQuery]=useState('');
  const [customPinMode,setCustomPinMode]=useState(false),[customPin,setCustomPin]=useState<{lat:number;lng:number}|null>(null),[customPinOpen,setCustomPinOpen]=useState(false),[locationEditingId,setLocationEditingId]=useState<string|null>(null);
  const [customDay,setCustomDay]=useState<DayKey>(firstDefaultDay),[customName,setCustomName]=useState(''),[customAddress,setCustomAddress]=useState(''),[customMemo,setCustomMemo]=useState(''),[customTime,setCustomTime]=useState('12:00'),[customCategory,setCustomCategory]=useState<PlaceType>('관광'),[customAddressSearching,setCustomAddressSearching]=useState(false),[customAddressError,setCustomAddressError]=useState('');
  const [newTime,setNewTime]=useState('12:00'), [newCategory,setNewCategory]=useState<PlaceType>('식사'), [newMemo,setNewMemo]=useState(''), [draggedId,setDraggedId]=useState<string|null>(null), [dragOverId,setDragOverId]=useState<string|null>(null), [justMovedId,setJustMovedId]=useState<string|null>(null), [daysExpanded,setDaysExpanded]=useState(false);
  const [canDragCards,setCanDragCards]=useState(false);
  const [destinationSuggestionsOpen,setDestinationSuggestionsOpen]=useState(false);
  const plannerPanelRef=useRef<HTMLElement|null>(null);
  const draggedIdRef=useRef<string|null>(null);
  const dragScrollVelocityRef=useRef(0);
  const dragScrollFrameRef=useRef<number|null>(null);
  const savedSnapshotRef=useRef('');
  const saveInFlightRef=useRef(false);
  const savePlanRef=useRef<(silent?:boolean)=>Promise<void>>(async()=>{});
  const itineraryDays=useMemo(()=>{
    const days=tripDaysBetween(tripSettings.startDate,tripSettings.endDate);
    if(days.length)return days;
    const fallback=dateDayKey(tripSettings.startDate)||firstDefaultDay;
    return [{key:fallback,date:tripSettings.startDate||DEFAULT_TRIP.startDate}];
  },[tripSettings.startDate,tripSettings.endDate,firstDefaultDay]);
  const dayKeys=useMemo(()=>itineraryDays.map(day=>day.key),[itineraryDays]);
  const dayDates=useMemo(()=>Object.fromEntries(itineraryDays.map(day=>[day.key,day.date])) as Record<DayKey,string>,[itineraryDays]);
  const addSuggestions=usePlaceSuggestions(query,addOpen,tripSettings.destination,tripSettings.mapProvider,googleKey,osmAddQuery),editSuggestions=usePlaceSuggestions(editQuery,Boolean(editing),tripSettings.destination,tripSettings.mapProvider,googleKey,osmEditQuery),mapSuggestions=usePlaceSuggestions(mapQuery,true,tripSettings.destination,tripSettings.mapProvider,googleKey,osmMapQuery);
  const destinationSuggestions=useDestinationSuggestions(settingsDraft.destination,settingsOpen);
  useEffect(()=>{const media=window.matchMedia('(hover: hover) and (pointer: fine)');const update=()=>setCanDragCards(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update)},[]);
  const stopDragAutoScroll=useCallback(()=>{dragScrollVelocityRef.current=0;if(dragScrollFrameRef.current!==null){window.cancelAnimationFrame(dragScrollFrameRef.current);dragScrollFrameRef.current=null}},[]);
  const runDragAutoScroll=useCallback(()=>{const panel=plannerPanelRef.current,velocity=dragScrollVelocityRef.current;if(!panel||!velocity||!draggedIdRef.current){stopDragAutoScroll();return}panel.scrollTop+=velocity;dragScrollFrameRef.current=window.requestAnimationFrame(runDragAutoScroll)},[stopDragAutoScroll]);
  const updateDragAutoScroll=useCallback((event:DragEvent<HTMLElement>)=>{const panel=plannerPanelRef.current;if(!canDragCards||!draggedIdRef.current||!panel)return;event.preventDefault();const rect=panel.getBoundingClientRect(),edge=Math.min(112,Math.max(72,rect.height*.18)),distanceFromTop=event.clientY-rect.top,distanceFromBottom=rect.bottom-event.clientY;let velocity=0;if(distanceFromTop>=0&&distanceFromTop<edge)velocity=-(2+Math.round((edge-distanceFromTop)/edge*10));else if(distanceFromBottom>=0&&distanceFromBottom<edge)velocity=2+Math.round((edge-distanceFromBottom)/edge*10);dragScrollVelocityRef.current=velocity;if(velocity&&dragScrollFrameRef.current===null)dragScrollFrameRef.current=window.requestAnimationFrame(runDragAutoScroll);if(!velocity&&dragScrollFrameRef.current!==null)stopDragAutoScroll()},[canDragCards,runDragAutoScroll,stopDragAutoScroll]);
  const handlePlannerWheel=useCallback((event:WheelEvent<HTMLElement>)=>{if(!canDragCards||!draggedIdRef.current)return;const panel=plannerPanelRef.current;if(!panel)return;event.preventDefault();panel.scrollTop+=event.deltaY},[canDragCards]);
  useEffect(()=>stopDragAutoScroll,[stopDragAutoScroll]);
  const applyStoredPlan=useCallback((data:StoredPlan,editToken?:string,permission?:boolean,adminAuthenticated=false)=>{
    const mapProvider:MapProvider=data.mapProvider==='google'?'google':data.mapProvider==='osm'?'osm':'naver';
    const settings={title:data.title,destination:data.destination,startDate:data.startDate,endDate:data.endDate,people:data.people,editPolicy:data.editPolicy==='all'?'all':data.editPolicy==='password'?'password':'owner' as EditPolicy,mapProvider};
    const normalizedStops=(data.stops||[]).map(stop=>({...stop,day:normalizeStoredDay(String(stop.day),data.startDate,data.endDate),category:normalizeCategory(String(stop.category)),mapProvider:stop.mapProvider||mapProvider}));
    const editable=permission??Boolean(editToken);rememberPlanVisit(data);setPlanId(data.id);setPlanUpdatedAt(data.updatedAt||'');setPlanVersion(Math.max(1,Number(data.version)||1));setIsLocalDraft(false);setCanEdit(editable);setAdminMode(adminAuthenticated);setTripSettings(settings);setSettingsDraft(settings);setStops(normalizedStops);setActiveDay(dateDayKey(data.startDate)||firstDefaultDay);setCustomDay(dateDayKey(data.startDate)||firstDefaultDay);setPlanPassword('');setPlanPasswordAuth('');setPasswordConfigured(Boolean(data.passwordProtected));setPlanPasswordTouched(false);setShowPlanPassword(false);setEditPassword('');setEditPasswordAuth('');setEditPasswordConfigured(Boolean(data.editPasswordProtected));setEditPasswordTouched(false);setShowEditPassword(false);setPlanLoading(false);savedSnapshotRef.current=itinerarySnapshot(settings,normalizedStops);
    if(editToken)localStorage.setItem(`route-note-edit-token-${data.id}`,editToken);
    if(editable){const key=`route-note-server-draft-${data.id}`,raw=localStorage.getItem(key);if(raw){try{const draft=JSON.parse(raw) as SavedDraft;if(draft?.settings&&Array.isArray(draft.stops)&&itinerarySnapshot(draft.settings,draft.stops)!==savedSnapshotRef.current){if(window.confirm('이 기기에 저장되지 않은 변경이 남아 있어요. 이어서 편집할까요?')){setTripSettings(draft.settings);setSettingsDraft(draft.settings);setStops(draft.stops);setActiveDay(dateDayKey(draft.settings.startDate)||firstDefaultDay)}else localStorage.removeItem(key)}else localStorage.removeItem(key)}catch{localStorage.removeItem(key)}}}
  },[firstDefaultDay]);
  useEffect(()=>{
    let alive=true;
    const path=window.location.pathname.split('/').filter(Boolean), params=new URLSearchParams(window.location.search), routeId=path[0]==='plan'&&path[1]&&path[1]!=='new'?decodeURIComponent(path[1]):null, isDraft=params.get('draft')==='1', mode=params.get('mode');
    setPlanId(routeId);setIsLocalDraft(!routeId);
    const loadLocalDraft=()=>{
      const ss=localStorage.getItem('route-note-stops'),ts=localStorage.getItem('route-note-trip-settings');
      let saved={...DEFAULT_TRIP};
      let normalizedStops:Stop[]=[];
      if(ts){try{saved={...DEFAULT_TRIP,...JSON.parse(ts)};setTripSettings(saved);setSettingsDraft(saved)}catch{localStorage.removeItem('route-note-trip-settings')}}
      if(ss){try{const savedStops=JSON.parse(ss) as Stop[];normalizedStops=savedStops.map(stop=>({...stop,day:normalizeStoredDay(String(stop.day),saved.startDate,saved.endDate),category:normalizeCategory(String(stop.category))}));setStops(normalizedStops)}catch{localStorage.removeItem('route-note-stops')}}
      savedSnapshotRef.current=itinerarySnapshot(saved,normalizedStops);
    };
    const loadRoute=async()=>{
      if(routeId){
        try{
          const token=localStorage.getItem(`route-note-edit-token-${routeId}`);
          const response=await fetch(`/api/plans/${encodeURIComponent(routeId)}`,{cache:'no-store',headers:token?{'x-plan-edit-token':token}:undefined}), body=await readJsonResponse<{plan?:StoredPlan;canEdit?:boolean;adminAuthenticated?:boolean;requiresPassword?:boolean;message?:string}>(response);
          if(body.requiresPassword){if(alive){setProtectedPlanId(routeId);setProtectedPlanTitle(body.plan?.title||'이 여행 계획');setPasswordPromptOpen(true);setStops([]);setPlanLoading(false)}return}
          if(!response.ok||!body.plan)throw new Error(body.message||'계획을 불러오지 못했습니다.');
          if(alive)applyStoredPlan(body.plan,undefined,body.canEdit,body.adminAuthenticated);
        }catch(error){if(alive){setPlanLoading(false);setPlanSaveMessage(error instanceof Error?error.message:'계획을 불러오지 못했습니다. 다시 시도해주세요.')}}
      }else if(isDraft){loadLocalDraft();if(alive)setPlanLoading(false)}
      else if(alive){setStops([]);const clean={...DEFAULT_TRIP,title:window.localStorage.getItem('travel-note-language')==='en'?'My trip':'나의 여행',destination:'',people:1,editPolicy:'owner' as EditPolicy,mapProvider:mode==='overseas'?'osm' as MapProvider:'naver' as MapProvider};setTripSettings(clean);setSettingsDraft(clean);setPlanPassword('');setPlanPasswordAuth('');setPasswordConfigured(false);setPlanPasswordTouched(false);setShowPlanPassword(false);setEditPassword('');setEditPasswordAuth('');setEditPasswordConfigured(false);setEditPasswordTouched(false);setShowEditPassword(false);setCanEdit(true);setPlanUpdatedAt('');setPlanVersion(1);setPlanLoading(false);savedSnapshotRef.current=itinerarySnapshot(clean,[]);if(mode==='domestic'||mode==='overseas')window.setTimeout(()=>{if(alive)setSettingsOpen(true)},0)}
    };
    void loadRoute();
    const embedded=document.querySelector<HTMLMetaElement>('meta[name="naver-map-client-id"]')?.content;
    const embeddedGoogle=document.querySelector<HTMLMetaElement>('meta[name="google-maps-api-key"]')?.content;
    if(embedded)setClientId(embedded);
    if(embeddedGoogle)setGoogleKey(embeddedGoogle);
    if(!embedded||!embeddedGoogle)void fetch('/api/config').then(response=>readJsonResponse<{mapClientId?:string;googleMapsApiKey?:string}>(response)).then(data=>{if(data.mapClientId&&alive)setClientId(data.mapClientId);if(data.googleMapsApiKey&&alive)setGoogleKey(data.googleMapsApiKey)}).catch(()=>{});
    return()=>{alive=false};
  },[applyStoredPlan]);
  useEffect(()=>{
    if(!dayKeys.includes(activeDay))setActiveDay(dayKeys[0]);
    if(!dayKeys.includes(customDay))setCustomDay(dayKeys[0]);
    if(dayKeys.length<=6)setDaysExpanded(false);
  },[dayKeys,activeDay,customDay]);
  useEffect(()=>{
    if(planLoading)return;
    if(isLocalDraft){
      localStorage.setItem('route-note-stops',JSON.stringify(stops));
      localStorage.setItem('route-note-trip-settings',JSON.stringify(tripSettings));
    }else{
      localStorage.removeItem('route-note-stops');
      localStorage.removeItem('route-note-trip-settings');
    }
  },[stops,tripSettings,planLoading,isLocalDraft]);
  useEffect(()=>{
    if(planLoading||isLocalDraft||!planId||protectedPlanId||!canEdit)return;
    const key=`route-note-server-draft-${planId}`,snapshot=itinerarySnapshot(tripSettings,stops);
    if(snapshot===savedSnapshotRef.current){localStorage.removeItem(key);return}
    const timer=window.setTimeout(()=>localStorage.setItem(key,JSON.stringify({settings:tripSettings,stops,savedAt:new Date().toISOString()} satisfies SavedDraft)),500);
    return()=>window.clearTimeout(timer);
  },[stops,tripSettings,planLoading,isLocalDraft,planId,protectedPlanId,canEdit]);
  useEffect(()=>{
    const dirty=!planLoading&&canEdit&&itinerarySnapshot(tripSettings,stops)!==savedSnapshotRef.current;
    if(!dirty)return;
    const warn=(event:BeforeUnloadEvent)=>event.preventDefault();
    window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
  },[stops,tripSettings,planLoading,canEdit]);
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
      inputSchema:{type:'object',properties:{day:{type:'string',enum:dayKeys},time:{type:'string',pattern:'^([01]\\d|2[0-3]):[0-5]\\d$'},name:{type:'string',minLength:1},category:{type:'string',enum:categories},memo:{type:'string'},address:{type:'string',minLength:1},lat:{type:'number'},lng:{type:'number'}},required:['day','time','name','category','address','lat','lng'],additionalProperties:false},
      annotations:{readOnlyHint:false,untrustedContentHint:false},
      execute(input:unknown){
        const value=input as Partial<Stop>;
        if(!value.day||!dayKeys.includes(value.day)||!value.time||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time)||!value.name||!value.address||typeof value.lat!=='number'||typeof value.lng!=='number'||!value.category||!categories.includes(value.category))throw new Error('일정 정보가 올바르지 않습니다.');
        const stop:Stop={id:`tool-${Date.now()}`,day:value.day,time:value.time,name:value.name,category:value.category,memo:value.memo||'',address:value.address,lat:value.lat,lng:value.lng};
        setStops(current=>insertStopByTime(current,stop)); setActiveDay(stop.day);
        return {added:true,id:stop.id,day:stop.day,name:stop.name};
      }
    },{signal:lifecycle.signal})).catch(()=>{});
    return()=>lifecycle.abort();
  },[dayKeys]);
  const dayStops=useMemo(()=>stops.filter(s=>s.day===activeDay),[stops,activeDay]);
  const peopleCount=Math.max(1,tripSettings.people||1);
  const dayCostSummary=useMemo(()=>dayStops.reduce((summary,stop)=>{const cost=costValues(stop,peopleCount);return {personal:summary.personal+cost.personal,total:summary.total+cost.total}},{personal:0,total:0}),[dayStops,peopleCount]);
  const tripCostSummary=useMemo(()=>stops.reduce((summary,stop)=>{const cost=costValues(stop,peopleCount);return {personal:summary.personal+cost.personal,total:summary.total+cost.total}},{personal:0,total:0}),[stops,peopleCount]);
  const selectStop=useCallback((stop:Stop)=>setSelected(stop),[]);
  const toggleMapFocus=useCallback(()=>setMapFocused(current=>!current),[]);
  const selectMapCandidate=useCallback((place:SearchPlace)=>setMapCandidate(place),[]);
  const updateCustomPin=useCallback((point:{lat:number;lng:number})=>setCustomPin(point),[]);
  const updateStopPosition=useCallback((id:string,lat:number,lng:number)=>{setStops(current=>current.map(stop=>stop.id===id?{...stop,lat,lng,customLocation:true}:stop));setLocationEditingId(null)},[]);
  const updateStopCost=useCallback((id:string,basis:'person'|'total',rawValue:string)=>{const value=parseCostInput(rawValue),people=Math.max(1,tripSettings.people||1);setStops(current=>current.map(stop=>{if(stop.id!==id)return stop;if(value===null)return {...stop,costPerPerson:undefined,costTotal:undefined,costBasis:undefined};return basis==='person'?{...stop,costBasis:basis,costPerPerson:value,costTotal:value*people}:{...stop,costBasis:basis,costTotal:value,costPerPerson:Math.round(value/people)}}))},[tripSettings.people]);
  const saveTripSettings=()=>{const next={...settingsDraft,title:settingsDraft.title.trim()||text('나의 여행','My trip'),destination:settingsDraft.destination.trim(),people:Math.max(1,Math.round(Number(settingsDraft.people)||1)),editPolicy:settingsDraft.editPolicy==='all'?'all':settingsDraft.editPolicy==='password'?'password':'owner' as EditPolicy,mapProvider:settingsDraft.mapProvider==='google'?'google' as MapProvider:settingsDraft.mapProvider==='osm'?'osm' as MapProvider:'naver' as MapProvider};if(next.editPolicy==='password'&&((!editPasswordConfigured&&!editPassword.trim())||(editPasswordTouched&&!editPassword.trim()))){setEditPasswordWarningOpen(true);return}const nextStart=dateDayKey(next.startDate)||firstDefaultDay;setTripSettings(next);setSettingsDraft(next);setStops(current=>current.map(stop=>({...stop,day:normalizeStoredDay(stop.day,next.startDate,next.endDate),mapProvider:stop.mapProvider||next.mapProvider})));setActiveDay(nextStart);setCustomDay(nextStart);localStorage.setItem('route-note-trip-settings',JSON.stringify(next));setDestinationSuggestionsOpen(false);setSettingsOpen(false)};
  const chooseDestination=(place:SearchPlace)=>{const value=destinationLabel(place,language);setSettingsDraft(current=>({...current,destination:value}));setDestinationSuggestionsOpen(false)};
  const addStop=()=>{if(!picked)return;const provider=tripSettings.mapProvider;const stop:Stop={id:`${Date.now()}`,day:activeDay,time:newTime,name:placeTitle(picked,language),category:newCategory,memo:newMemo.trim(),address:placeAddress(picked,language),lat:Number(picked.mapy)/1e7,lng:Number(picked.mapx)/1e7,mapProvider:provider,placeId:picked.placeId,...(provider==='naver'?{naverLink:naverPlaceUrl({name:cleanTitle(picked.title),address:picked.roadAddress||picked.address})}:{})};setStops(current=>insertStopByTime(current,stop));setAddOpen(false);setQuery('');setPicked(null);setNewMemo('')};
  const openEdit=(stop:Stop)=>{setEditing(stop);setEditDraft({...stop});setEditQuery(stop.name);setOsmEditQuery('');setEditPlaceLinked(true)};
  const saveEdit=()=>{if(!editing||!editDraft||!isValidTime(editDraft.time))return;const updated={...editDraft,name:editDraft.name.trim()||editing.name,memo:editDraft.memo.trim()};setStops(current=>current.map(stop=>stop.id===editing.id?updated:stop));if(selected?.id===editing.id)setSelected(updated);setEditing(null);setEditDraft(null)};
  const moveStop=(id:string,direction:-1|1)=>setStops(current=>{const items=current.filter(s=>s.day===activeDay),i=items.findIndex(s=>s.id===id),t=i+direction;if(i<0||t<0||t>=items.length)return current;const next=[...items];[next[i],next[t]]=[next[t],next[i]];let cursor=0;return current.map(s=>s.day===activeDay?next[cursor++]:s)});
  const reorderByDrop=(targetId:string)=>{const activeDraggedId=draggedIdRef.current||draggedId;if(!activeDraggedId||activeDraggedId===targetId){draggedIdRef.current=null;stopDragAutoScroll();setDraggedId(null);setDragOverId(null);return}const movedId=activeDraggedId;setStops(current=>{const items=current.filter(s=>s.day===activeDay),from=items.findIndex(s=>s.id===movedId),to=items.findIndex(s=>s.id===targetId);if(from<0||to<0)return current;const next=[...items],[moved]=next.splice(from,1);next.splice(to,0,moved);let cursor=0;return current.map(s=>s.day===activeDay?next[cursor++]:s)});setJustMovedId(movedId);window.setTimeout(()=>setJustMovedId(current=>current===movedId?null:current),380);draggedIdRef.current=null;stopDragAutoScroll();setDraggedId(null);setDragOverId(null)};
  const removeSelected=()=>{if(!selected)return;setStops(c=>c.filter(s=>s.id!==selected.id));setSelected(null)};
  const removeStop=(id:string)=>setStops(current=>current.filter(stop=>stop.id!==id));
  const commitMapSearch=async()=>{setMapPicked(null);setMapCandidate(null);if(tripSettings.mapProvider==='naver'||tripSettings.mapProvider==='osm'){setMapResultPlaces(mapSuggestions.results.slice(0,8));return}try{const places=(await Promise.all(mapSuggestions.results.slice(0,8).map(place=>resolveSearchPlace(place,'google',googleKey,language)))).filter(Boolean) as SearchPlace[];setMapResultPlaces(places)}catch(error){setPlanSaveMessage(error instanceof Error?error.message:text('장소 검색에 실패했습니다.','Place search failed.'))}};
  useEffect(()=>{if(tripSettings.mapProvider==='osm'&&osmMapQuery.trim()&&mapSuggestions.results.length)setMapResultPlaces(mapSuggestions.results.slice(0,8))},[tripSettings.mapProvider,osmMapQuery,mapSuggestions.results]);
  const prepareMapCandidate=()=>{if(!mapCandidate)return;setPicked(mapCandidate);setQuery(placeTitle(mapCandidate,language));setMapCandidate(null);setAddOpen(true)};
  const openCustomPin=()=>{setCustomDay(activeDay);setCustomPin(null);setCustomName('');setCustomAddress('');setCustomMemo('');setCustomTime('12:00');setCustomCategory('관광');setCustomAddressError('');setCustomPinMode(false);setCustomPinOpen(true)};
  const startCustomPinPlacement=()=>{setCustomPinMode(true);setCustomPinOpen(false)};
  const continueCustomPin=()=>{if(customPin){setCustomPinMode(false);setCustomPinOpen(true)}};
  const cancelCustomPin=()=>{setCustomPinMode(false);setCustomPin(null);setCustomPinOpen(false);setCustomAddressError('')};
  const findCustomAddress=async()=>{const value=customAddress.trim();if(!value)return;setCustomAddressSearching(true);setCustomAddressError('');try{const point=tripSettings.mapProvider==='google'?await googleGeocodeAddress(value,googleKey,language):tripSettings.mapProvider==='osm'?await osmGeocodeAddress(value,language):await geocodeAddress(value);setCustomPin({lat:point.lat,lng:point.lng});setCustomAddress(point.address)}catch(error){setCustomAddressError(error instanceof Error?error.message:text('주소를 찾지 못했습니다.','Address not found.'))}finally{setCustomAddressSearching(false)}};
  const addCustomStop=()=>{if(!customPin||!customName.trim()||!isValidTime(customTime))return;const stop:Stop={id:`custom-${Date.now()}`,day:customDay,time:customTime,name:customName.trim(),category:customCategory,memo:customMemo.trim(),address:customAddress.trim()||text('지도에서 직접 지정한 위치','Location selected on the map'),lat:customPin.lat,lng:customPin.lng,customLocation:true,mapProvider:tripSettings.mapProvider};setStops(current=>insertStopByTime(current,stop));setActiveDay(customDay);cancelCustomPin()};
  const startLocationEdit=()=>{if(!selected)return;setLocationEditingId(selected.id);setSelected(null)};
  const unlockPlan=async()=>{
    if(!protectedPlanId||!passwordPrompt)return;
    setPasswordPromptError('');
    try{
      const response=await fetch(`/api/plans/${encodeURIComponent(protectedPlanId)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:passwordPrompt})}),body=await readJsonResponse<{plan?:StoredPlan;canEdit?:boolean;adminAuthenticated?:boolean;message?:string}>(response);
      if(!response.ok||!body.plan)throw new Error(body.message||'비밀번호가 맞지 않습니다.');
      applyStoredPlan(body.plan,undefined,body.canEdit,body.adminAuthenticated);if(!body.adminAuthenticated){setPlanPassword(passwordPrompt);setPlanPasswordAuth(passwordPrompt);setPlanPasswordTouched(false)}setPasswordPrompt('');setProtectedPlanId(null);setPasswordPromptOpen(false);
    }catch(error){setPasswordPromptError(error instanceof Error?error.message:'비밀번호가 맞지 않습니다.')}
  };
  const unlockEditPlan=async()=>{
    if(!planId||!editPasswordPrompt)return;
    setEditPasswordPromptError('');
    try{
      const response=await fetch(`/api/plans/${encodeURIComponent(planId)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'edit-auth',password:planPassword||undefined,editPassword:editPasswordPrompt})}),body=await readJsonResponse<{plan?:StoredPlan;canEdit?:boolean;adminAuthenticated?:boolean;message?:string}>(response);
      if(!response.ok||!body.plan)throw new Error(body.message||'편집 비밀번호가 맞지 않습니다.');
      setCanEdit(Boolean(body.canEdit));setAdminMode(Boolean(body.adminAuthenticated));if(!body.adminAuthenticated){setEditPassword(editPasswordPrompt);setEditPasswordAuth(editPasswordPrompt);setEditPasswordTouched(false);setEditPasswordConfigured(true)}setEditPasswordPrompt('');setEditPasswordPromptOpen(false);
    }catch(error){setEditPasswordPromptError(error instanceof Error?error.message:'편집 비밀번호가 맞지 않습니다.')}
  };
  const logoutAdmin=async()=>{await fetch('/api/admin/session',{method:'DELETE'}).catch(()=>{});window.location.reload()};
  const savePlan=async(silent=false)=>{
    if(saveInFlightRef.current){if(!silent)setPlanSaveMessage('이미 저장 중이에요.');return}
    if(planId&&!canEdit){if(!silent)setPlanSaveMessage('보기 전용 계획이라 저장할 수 없습니다.');return}
    if(!tripSettings.destination.trim()||!tripSettings.startDate||!tripSettings.endDate){if(!silent){setPlanSaveMessage('여행지와 날짜를 먼저 입력해주세요.');setSettingsOpen(true)}return}
    if(tripSettings.editPolicy==='password'&&((!editPasswordConfigured&&!editPassword)||(editPasswordTouched&&!editPassword))){if(silent)setPlanSaveMessage('자동저장하지 못했어요. 편집 비밀번호는 빈칸으로 저장할 수 없습니다.');else{setEditPasswordWarningOpen(true);setSettingsOpen(true)}return}
    if(silent&&savedSnapshotRef.current===itinerarySnapshot(tripSettings,stops,planPassword,planPasswordTouched,editPassword,editPasswordTouched))return;
    saveInFlightRef.current=true;if(!silent){setPlanSaving(true);setPlanSaveMessage('')}
    const payload={title:tripSettings.title,destination:tripSettings.destination,startDate:tripSettings.startDate,endDate:tripSettings.endDate,people:tripSettings.people,editPolicy:tripSettings.editPolicy,mapProvider:tripSettings.mapProvider,stops};
    try{
      const existing=Boolean(planId),token=planId?localStorage.getItem(`route-note-edit-token-${planId}`):null;
      const viewPasswordPayload=!existing?{password:planPassword}:planPasswordTouched?{password:planPassword,...(planPasswordAuth?{passwordAuth:planPasswordAuth}:{})}:(tripSettings.editPolicy==='all'&&passwordConfigured&&planPassword)?{password:planPassword,passwordAuth:planPasswordAuth||planPassword}:{};
      const editPasswordPayload={...(existing&&editPasswordAuth?{editPasswordAuth}:{}),...((!existing||editPasswordTouched||(tripSettings.editPolicy!=='password'&&editPasswordConfigured))?{editPassword:tripSettings.editPolicy==='password'?editPassword:''}:{})};
      const response=await fetch(existing?`/api/plans/${encodeURIComponent(planId as string)}`:'/api/plans',{method:existing?'PUT':'POST',headers:{'Content-Type':'application/json',...(token?{'x-plan-edit-token':token}:{})},body:JSON.stringify({...payload,...(existing?{baseVersion:planVersion}:{}),...viewPasswordPayload,...editPasswordPayload})}),body=await readJsonResponse<{id?:string;editToken?:string;conflict?:boolean;adminAuthenticated?:boolean;message?:string;plan?:StoredPlan}>(response);
      if(!response.ok)throw new Error(body.message||'계획을 저장하지 못했습니다.');
      if(body.id&&body.editToken&&(!existing||body.conflict)){setPlanId(body.id);setCanEdit(true);localStorage.setItem(`route-note-edit-token-${body.id}`,body.editToken);window.history.replaceState({},'',`/plan/${encodeURIComponent(body.id)}`)}
      if(body.plan){const savedSettings=body.conflict?{...tripSettings,title:body.plan.title}:tripSettings;setTripSettings(savedSettings);setSettingsDraft(savedSettings);setPlanUpdatedAt(body.plan.updatedAt||planUpdatedAt);setPlanVersion(Math.max(1,Number(body.plan.version)||planVersion));setPasswordConfigured(Boolean(body.plan.passwordProtected));setEditPasswordConfigured(Boolean(body.plan.editPasswordProtected));if(planPasswordTouched)setPlanPasswordAuth(planPassword);if(tripSettings.editPolicy==='password'&&editPassword){setEditPasswordAuth(editPassword)}else if(tripSettings.editPolicy!=='password'){setEditPasswordAuth('')}savedSnapshotRef.current=itinerarySnapshot(savedSettings,body.plan.stops||stops)}
      setAdminMode(current=>body.adminAuthenticated??current);setIsLocalDraft(false);localStorage.removeItem('route-note-stops');localStorage.removeItem('route-note-trip-settings');if(planId)localStorage.removeItem(`route-note-server-draft-${planId}`);if(body.id)localStorage.removeItem(`route-note-server-draft-${body.id}`);
      setPlanPasswordTouched(false);setEditPasswordTouched(false);
      if(!silent||body.conflict){const message=body.conflict?'동시 편집 내용은 별도 계획으로 저장했어요.':'저장됨';setPlanSaveMessage(message);window.setTimeout(()=>setPlanSaveMessage(current=>current===message?'':current),3200)}
    }catch(error){setPlanSaveMessage(silent?'자동저장하지 못했어요. 다시 시도해주세요.':error instanceof Error?error.message:'계획을 저장하지 못했습니다.')}
    finally{saveInFlightRef.current=false;setPlanSaving(false)}
  };
  useEffect(()=>{savePlanRef.current=savePlan});

  const duplicatePlan=async()=>{
    if(!planId||planAction)return;
    setPlanAction('duplicate');setPlanSaveMessage('');
    try{
      const token=localStorage.getItem(`route-note-edit-token-${planId}`),passwordPayload=planPassword?{password:planPassword}:{};
      const response=await fetch(`/api/plans/${encodeURIComponent(planId)}`,{method:'POST',headers:{'Content-Type':'application/json',...(token?{'x-plan-edit-token':token}:{})},body:JSON.stringify({action:'duplicate',...passwordPayload})});
      const body=await readJsonResponse<{id?:string;editToken?:string;message?:string}>(response);
      if(!response.ok||!body.id)throw new Error(body.message||'계획을 복제하지 못했습니다.');
      if(body.editToken)localStorage.setItem(`route-note-edit-token-${body.id}`,body.editToken);
      setPlanSaveMessage('복제본이 저장목록에 추가됐어요.');
      window.setTimeout(()=>setPlanSaveMessage(current=>current==='복제본이 저장목록에 추가됐어요.'?'':current),3200);
    }catch(error){setPlanSaveMessage(error instanceof Error?error.message:'계획을 복제하지 못했습니다.')}
    finally{setPlanAction(null)}
  };

  const deletePlan=async()=>{
    if(!planId||planAction||!canEdit)return;
    setPlanAction('delete');setPlanSaveMessage('');
    try{
      const token=localStorage.getItem(`route-note-edit-token-${planId}`),passwordPayload=tripSettings.editPolicy==='all'&&planPassword?{password:planPassword,passwordAuth:planPasswordAuth||planPassword}:{},editPasswordPayload=tripSettings.editPolicy==='password'&&editPassword?{editPassword,editPasswordAuth:editPasswordAuth||editPassword}:{};
      const response=await fetch(`/api/plans/${encodeURIComponent(planId)}`,{method:'DELETE',headers:{'Content-Type':'application/json',...(token?{'x-plan-edit-token':token}:{})},body:JSON.stringify({...passwordPayload,...editPasswordPayload})});
      const body=await readJsonResponse<{message?:string}>(response);
      if(!response.ok)throw new Error(body.message||'계획을 휴지통으로 옮기지 못했습니다.');
      // Keep the result visible after the page leaves the planner. The query string
      // is useful for a fresh navigation, while sessionStorage also survives
      // redirects that normalize or cache the plans URL.
      sessionStorage.setItem('route-note-delete-notice','계획을 휴지통으로 옮겼어요. 7일 후 자동 삭제됩니다.');
      window.location.href='/plans?deleted=1';
    }catch(error){setPlanSaveMessage(error instanceof Error?error.message:'계획을 휴지통으로 옮기지 못했습니다.');setDeleteDialogOpen(false)}
    finally{setPlanAction(null)}
  };

  useEffect(()=>{
    if(planLoading)return;
    const timer=window.setInterval(()=>{void savePlanRef.current(true)},300000);
    return()=>window.clearInterval(timer);
  },[planLoading]);

  const visibleDayKeys=useMemo(()=>{if(dayKeys.length<=6||daysExpanded)return dayKeys;const first=dayKeys.slice(0,5);return first.includes(activeDay)?first:[...first,activeDay]},[dayKeys,daysExpanded,activeDay]);
  const pickEditPlace=async(place:SearchPlace|null)=>{if(!place||!editDraft)return;try{const resolved=await resolveSearchPlace(place,tripSettings.mapProvider,googleKey,language);if(!resolved)return;const name=placeTitle(resolved,language);setEditQuery(name);setEditPlaceLinked(true);setEditDraft({...editDraft,name,address:placeAddress(resolved,language),lat:Number(resolved.mapy)/1e7,lng:Number(resolved.mapx)/1e7,mapProvider:tripSettings.mapProvider,placeId:resolved.placeId,...(tripSettings.mapProvider==='naver'?{naverLink:naverPlaceUrl({name:cleanTitle(resolved.title),address:resolved.roadAddress||resolved.address})}:{naverLink:undefined})})}catch(error){setPlanSaveMessage(error instanceof Error?error.message:text('장소를 확인하지 못했습니다.','Could not load this place.'))}};
  const mapViewProps={stops:dayStops,destination:tripSettings.destination,onSelect:selectStop,placeResults:mapResultPlaces,onPlaceSelect:selectMapCandidate,dateLabels:dayDates,activeDay,onDayChange:setActiveDay,editableStopId:locationEditingId,onStopPositionChange:updateStopPosition,onCancelStopPositionEdit:()=>setLocationEditingId(null),customPin,customPinMode,onCustomLocationChange:updateCustomPin,onCustomAddressChange:setCustomAddress,onCustomPinContinue:continueCustomPin,onMapTap:toggleMapFocus,mapFocused,onToggleMapFocus:toggleMapFocus,plannerCollapsed};

  return <main className="app-shell">
    <header className="topbar">
      <Link className="brand" href="/"><span className="brand-mark"><Navigation/></span><span>{text('여행을 떠나요', 'Let’s Travel')}</span></Link>
      <div className="trip-title"><strong>{tripSettings.title}</strong><span>{formatTripDate(tripSettings.startDate,false,language)} — {formatTripDate(tripSettings.endDate,false,language)} · {tripSettings.people}{text('명', ' people')}</span></div>
      <div className="top-actions">
        <div className="trip-cost-total" aria-label={text('전체 예상 경비','Total estimated budget')}><span>{text('전체 예상 경비','Total budget')}</span><strong>{formatMoney(tripCostSummary.personal,language,currency)} <small>{text('개인별','per person')}</small> · {formatMoney(tripCostSummary.total,language,currency)} <small>{text('총 비용','total')}</small></strong></div>
        {adminMode&&<Button variant="outline" className="admin-mode-button" onClick={()=>void logoutAdmin()} title={text('관리자 세션 종료','Exit admin session')} aria-label={text('관리자 세션 종료','Exit admin session')}><LockKeyhole/></Button>}
        {planId&&<>
          <Button variant="outline" className="plan-copy-button" aria-label={text('계획 복제','Duplicate plan')} onClick={()=>void duplicatePlan()} disabled={Boolean(planAction)||planLoading}><Copy/><span>{planAction==='duplicate'?text('복제 중…','Duplicating…'):text('계획 복제','Duplicate')}</span></Button>
          <Button variant="outline" className="plan-delete-button" aria-label={text('계획 삭제','Delete plan')} onClick={()=>setDeleteDialogOpen(true)} disabled={Boolean(planAction)||planLoading||!canEdit}><Trash2/><span>{text('계획 삭제','Delete plan')}</span></Button>
        </>}
        <Button variant="outline" className={`plan-save-button ${planSaveMessage==='저장됨'?'is-saved':''}`} aria-label={text('계획 저장','Save plan')} onClick={()=>void savePlan()} disabled={planSaving||planLoading||Boolean(planId&&!canEdit)}><Save/><span>{planSaving?text('저장 중…','Saving…'):text('계획 저장','Save plan')}</span></Button>
        {planSaveMessage&&<output className={`save-feedback ${planSaveMessage==='저장됨'||planSaveMessage==='복제본이 저장목록에 추가됐어요.'?'is-success':'is-error'}`} aria-live="polite">{planSaveMessage}</output>}
        <Button variant="outline" className="settings-button" aria-label={text('여행 일정','Trip settings')} onClick={()=>{setSettingsDraft(tripSettings);setSettingsOpen(true)}}><CalendarDays/><span>{text('여행 일정','Trip settings')}</span></Button>
      </div>
    </header>

    <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
      <AlertDialogContent className="delete-plan-dialog">
        <AlertDialogHeader className="sr-only"><AlertDialogTitle>{text('정말 삭제하시겠어요?', 'Delete this plan?')}</AlertDialogTitle><AlertDialogDescription>{text('계획은 바로 지워지지 않고 휴지통으로 이동합니다. 7일 동안 복원할 수 있고, 그 뒤에는 자동으로 삭제됩니다.', 'The plan will move to Trash first. You can restore it for 7 days, then it is deleted automatically.')}</AlertDialogDescription></AlertDialogHeader>
        <div className="delete-plan-copy"><strong>{text('정말 삭제하시겠어요?', 'Delete this plan?')}</strong><p>{text('계획은 바로 지워지지 않고 휴지통으로 이동합니다. 7일 동안 복원할 수 있고, 그 뒤에는 자동으로 삭제됩니다.', 'The plan will move to Trash first. You can restore it for 7 days, then it is deleted automatically.')}</p></div>
        <AlertDialogFooter><AlertDialogCancel disabled={planAction==='delete'}>{text('취소', 'Cancel')}</AlertDialogCancel><AlertDialogAction className="delete-plan-confirm" onClick={()=>void deletePlan()} disabled={planAction==='delete'}>{planAction==='delete'?text('옮기는 중…','Moving…'):text('휴지통으로 이동','Move to trash')}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={editPasswordWarningOpen} onOpenChange={setEditPasswordWarningOpen}>
      <AlertDialogContent className="delete-plan-dialog">
        <AlertDialogHeader><AlertDialogTitle>{text('편집 비밀번호를 입력해주세요', 'Enter an editing password')}</AlertDialogTitle><AlertDialogDescription>{text('편집 비밀번호는 빈칸으로 저장할 수 없습니다. 새 비밀번호를 입력하거나 편집 권한 설정을 바꿔주세요.', 'An editing password cannot be blank. Enter a new password or change the editing permission.')}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogAction onClick={()=>{setEditPasswordWarningOpen(false);setSettingsOpen(true)}}>{text('확인', 'OK')}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <Dialog open={passwordPromptOpen} onOpenChange={open=>{if(!open){setPasswordPromptOpen(false);setPasswordPromptError('')}}}><DialogContent className="password-dialog sm:max-w-[420px]"><DialogHeader><DialogTitle>{text('비밀번호가 있는 계획이에요', 'This plan is protected')}</DialogTitle><DialogDescription>{text(`${protectedPlanTitle}을(를) 열려면 비밀번호를 입력하세요.`, `Enter the password to open ${protectedPlanTitle}.`)}</DialogDescription></DialogHeader><label>{text('비밀번호', 'Password')}<Input type="password" value={passwordPrompt} onChange={e=>setPasswordPrompt(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void unlockPlan()}} placeholder={text('계획 비밀번호', 'Plan password')}/></label>{passwordPromptError&&<div className="inline-notice"><CircleAlert/>{passwordPromptError}</div>}<DialogFooter><Button variant="outline" onClick={()=>setPasswordPromptOpen(false)}>{text('취소', 'Cancel')}</Button><Button onClick={unlockPlan} disabled={!passwordPrompt}>{text('계획 열기', 'Open plan')}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={addOpen} onOpenChange={open=>{setAddOpen(open);if(!open){setQuery('');setPicked(null)}}}>
      <DialogContent className="add-dialog sm:max-w-[540px]">
        <DialogHeader><DialogTitle>{text('장소 추가', 'Add a place')}</DialogTitle><DialogDescription>{text('장소를 검색해 선택하세요.', 'Search for a place and choose a result.')}</DialogDescription></DialogHeader>
        <div className="form-grid">
          <label>{text('날짜', 'Date')}<select value={activeDay} onChange={e=>setActiveDay(e.target.value as DayKey)}>{itineraryDays.map(day=><option value={day.key} key={day.key}>{formatTripDate(day.date,true,language)}</option>)}</select></label>
          <label>{text('시간(24시간)', 'Time (24-hour)')}<Time24Input value={newTime} onChange={setNewTime}/></label>
          <label>{text('카테고리', 'Category')}<select value={newCategory} onChange={e=>setNewCategory(e.target.value as PlaceType)}>{PLACE_CATEGORIES.map(t=><option key={t}>{text(t, t==='식사'?'Meal':t==='간식'?'Snack':t==='관광'?'Sightseeing':t==='숙소'?'Stay':'Other')}</option>)}</select></label>
        </div>
          <label className="place-search-field">{text('장소', 'Place')} <PlacePicker provider={tripSettings.mapProvider} query={query} onQueryChange={(value,userInput)=>{setQuery(value);if(userInput){setPicked(null);if(tripSettings.mapProvider==='osm')setOsmAddQuery('')}}} onEnter={value=>{if(tripSettings.mapProvider==='osm')setOsmAddQuery(value)}} results={addSuggestions.results} value={picked} onPick={async place=>{try{const resolved=await resolveSearchPlace(place,tripSettings.mapProvider,googleKey,language);setPicked(resolved);if(resolved)setQuery(placeTitle(resolved,language))}catch(error){setPlanSaveMessage(error instanceof Error?error.message:text('장소를 확인하지 못했습니다.','Could not load this place.'))}}} searching={addSuggestions.searching} placeholder={text('장소 검색', 'Search places')} selected={Boolean(picked)}/></label>
        {addSuggestions.error&&query.trim().length>=2&&<div className="inline-notice"><CircleAlert/>{addSuggestions.error}</div>}
        {picked&&<div className="linked-place"><MapPin/><span><strong>{placeTitle(picked,language)}</strong><small>{placeAddress(picked,language)}</small></span><em>{text('선택됨', 'Selected')}</em></div>}
        <label className="memo-field">{text('메모', 'Note')} <Textarea value={newMemo} onChange={e=>setNewMemo(e.target.value)} placeholder={text('메뉴, 예약 시간 등', 'Menu, reservation time, etc.')}/></label>
        <DialogFooter><Button variant="outline" onClick={()=>setAddOpen(false)}>{text('취소', 'Cancel')}</Button><Button onClick={addStop} disabled={!picked||!isValidTime(newTime)}>{text('일정에 추가', 'Add to plan')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={customPinOpen} onOpenChange={open=>{if(!open)cancelCustomPin()}}>
      <DialogContent className="custom-dialog sm:max-w-[540px]">
        <DialogHeader><DialogTitle>{text('지도에 임의 핀 추가', 'Add a custom map pin')}</DialogTitle><DialogDescription>{text('검색되지 않는 장소도 직접 일정에 넣을 수 있어요.', 'Add a place that does not appear in search.')}</DialogDescription></DialogHeader>
        <label>{text('장소 이름', 'Place name')}<Input value={customName} onChange={e=>setCustomName(e.target.value)} placeholder={text('예: 숙소, 친구 추천 맛집', 'e.g. hotel, a friend’s favorite restaurant')}/></label>
        <div className="form-grid">
          <label>{text('날짜', 'Date')}<select value={customDay} onChange={e=>setCustomDay(e.target.value as DayKey)}>{itineraryDays.map(day=><option value={day.key} key={day.key}>{formatTripDate(day.date,true,language)}</option>)}</select></label>
          <label>{text('시간(24시간)', 'Time (24-hour)')}<Time24Input value={customTime} onChange={setCustomTime}/></label>
          <label>{text('카테고리', 'Category')}<select value={customCategory} onChange={e=>setCustomCategory(e.target.value as PlaceType)}>{PLACE_CATEGORIES.map(t=><option key={t}>{text(t, t==='식사'?'Meal':t==='간식'?'Snack':t==='관광'?'Sightseeing':t==='숙소'?'Stay':'Other')}</option>)}</select></label>
        </div>
        <div className="custom-location-row"><label>{text('주소(선택)', 'Address (optional)')}<Input value={customAddress} onChange={e=>{setCustomAddress(e.target.value);setCustomAddressError('')}} placeholder={text('주소를 입력해 위치 찾기', 'Enter an address to find it')}/></label><Button variant="outline" onClick={findCustomAddress} disabled={!customAddress.trim()||customAddressSearching}>{customAddressSearching?text('찾는 중…','Searching…'):text('주소로 찾기','Find address')}</Button></div>
        {customAddressError&&<div className="inline-notice"><CircleAlert/>{customAddressError}</div>}
        <div className={`custom-location-status ${customPin?'is-set':''}`}><MapPin/><span>{customPin?(customAddress||text('지도에서 지정한 위치','Location selected on the map')):text('아직 위치를 정하지 않았어요.','No location selected yet.')}</span><Button variant="outline" onClick={startCustomPinPlacement}>{customPin?text('지도에서 다시 지정','Choose again on map'):text('지도에서 위치 찍기','Pick on map')}</Button></div>
        <label className="memo-field">{text('메모', 'Note')} <Textarea value={customMemo} onChange={e=>setCustomMemo(e.target.value)} placeholder={text('메모를 남겨보세요', 'Leave a note')}/></label>
        <DialogFooter><Button variant="outline" onClick={cancelCustomPin}>{text('취소', 'Cancel')}</Button><Button onClick={addCustomStop} disabled={!customPin||!customName.trim()||!isValidTime(customTime)}>{text('일정에 추가', 'Add to plan')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    <section className={`workspace ${mapFocused?'map-focused':''} ${plannerCollapsed?'planner-collapsed':''}`}>
      <aside ref={plannerPanelRef} className="planner-panel" onDragOver={updateDragAutoScroll} onWheel={handlePlannerWheel}>
        {planId&&!canEdit&&<div className="inline-notice plan-readonly-notice"><CircleAlert/><span>{tripSettings.editPolicy==='password'?text('편집 비밀번호를 입력하면 일정을 수정할 수 있어요.','Enter the editing password to make changes.'):tripSettings.editPolicy==='all'?text('열람 비밀번호로 계획을 열면 수정할 수 있어요.','Open the plan with its viewing password to edit it.'):text('작성자의 편집 토큰이 있어야 일정을 바꿀 수 있어요.','The author token is required to edit this plan.')}</span>{tripSettings.editPolicy==='password'&&<Button variant="outline" onClick={()=>setEditPasswordPromptOpen(true)}>{text('편집 비밀번호 입력','Enter editing password')}</Button>}</div>}
        <div className="day-switch-wrap"><div className={`day-switch ${dayKeys.length>6&&!daysExpanded?'is-collapsed':''}`} role="tablist" aria-label={text('여행 날짜','Trip dates')}>{visibleDayKeys.map(day=>{const index=dayKeys.indexOf(day);return <button key={day} role="tab" aria-selected={activeDay===day} onClick={()=>setActiveDay(day)}><span style={{color:dayColor(day,dayKeys)}}>DAY {index+1}</span><strong>{formatTripDate(dayDates[day],true,language)}</strong></button>})}</div>{dayKeys.length>6&&<button type="button" className="day-rollup-toggle" onClick={()=>setDaysExpanded(current=>!current)} aria-expanded={daysExpanded}>{daysExpanded?<><ChevronUp/>{text('일정 접기','Collapse days')}</>:<><ChevronDown/>{text(`전체 ${dayKeys.length}일 보기`,`View all ${dayKeys.length} days`)}</>}</button>}</div>
        <div className="panel-heading"><div><span><CalendarDays/>{text('방문 순서','Visit order')}</span><strong>{dayStops.length}{text('개 장소',' stops')}</strong></div></div>
        <div className="stop-list">
          {dayStops.map((stop,index)=>{
            const previous=dayStops[index-1],gap=previous?distanceKm(previous,stop):null,reverse=previous&&timeMinutes(stop.time)<timeMinutes(previous.time);
            return <div key={stop.id}>
              {gap!==null&&<div className="distance-chip"><span/>{text('직선 ','Straight line ')}{gap<1?`${Math.round(gap*1000)}m`:`${gap.toFixed(1)}km`}</div>}
              <article className={`stop-card ${draggedId===stop.id?'is-dragging':''} ${dragOverId===stop.id&&draggedId!==stop.id?'is-drag-over':''} ${justMovedId===stop.id?'just-moved':''}`} draggable={canDragCards} onContextMenu={event=>{if(!canDragCards)event.preventDefault()}} onDragStart={()=>{if(canDragCards){draggedIdRef.current=stop.id;setDraggedId(stop.id)}}} onDragOver={event=>{if(!canDragCards)return;event.preventDefault();if(draggedId!==stop.id)setDragOverId(stop.id)}} onDragLeave={()=>setDragOverId(current=>current===stop.id?null:current)} onDrop={()=>{if(canDragCards)reorderByDrop(stop.id)}} onDragEnd={()=>{draggedIdRef.current=null;stopDragAutoScroll();setDraggedId(null);setDragOverId(null)}} onClick={()=>setSelected(stop)}>
                <div className="drag-handle" aria-hidden="true"><GripVertical/></div>
                <div className="order-pin" style={{background:dayColor(activeDay,dayKeys)}}>{index+1}</div>
                <div className="stop-main">
                  <div className="stop-time"><Clock3 className={reverse?'time-warning':''}/><span className={reverse?'time-warning':''} title={reverse?text('앞 장소보다 시간이 이릅니다.','This time is earlier than the previous stop.'):undefined}>{stop.time}</span><span className="stop-category">{text(stop.category,stop.category==='식사'?'Meal':stop.category==='간식'?'Snack':stop.category==='관광'?'Sightseeing':stop.category==='숙소'?'Stay':'Other')}</span></div>
                  <strong>{stop.name}</strong>
                  {stop.memo&&<p>{stop.memo}</p>}
                  <div className='stop-cost' onClick={e=>e.stopPropagation()}><span className='cost-label'>{text('예상 경비','Estimated cost')}</span><div className='cost-fields'><label className={stop.costBasis==='person'?'cost-field entered':stop.costBasis==='total'?'cost-field calculated':'cost-field'}><span>{text('개인별','Per person')}</span><div><Input type='text' inputMode='numeric' value={costInputValue(stop.costPerPerson)} onChange={e=>updateStopCost(stop.id,'person',e.target.value)} placeholder='0'/><b>{currencyUnit(currency)}</b></div></label><label className={stop.costBasis==='total'?'cost-field entered':stop.costBasis==='person'?'cost-field calculated':'cost-field'}><span>{text('총 비용','Total')}</span><div><Input type='text' inputMode='numeric' value={costInputValue(stop.costTotal)} onChange={e=>updateStopCost(stop.id,'total',e.target.value)} placeholder='0'/><b>{currencyUnit(currency)}</b></div></label></div></div>
                </div>
                <div className="card-actions">
                  <div className="move-buttons"><button aria-label={`${stop.name} ${text('위로 이동','move up')}`} disabled={index===0} onClick={e=>{e.stopPropagation();moveStop(stop.id,-1)}}><ArrowUp/></button><button aria-label={`${stop.name} ${text('아래로 이동','move down')}`} disabled={index===dayStops.length-1} onClick={e=>{e.stopPropagation();moveStop(stop.id,1)}}><ArrowDown/></button></div>
                  <div className="card-secondary-actions"><button className="edit-card-button" title={text('수정','Edit')} aria-label={`${stop.name} ${text('수정','edit')}`} onClick={e=>{e.stopPropagation();openEdit(stop)}}><Pencil/></button><button className="remove-card-button" title={text('삭제','Delete')} aria-label={`${stop.name} ${text('삭제','delete')}`} onClick={e=>{e.stopPropagation();removeStop(stop.id)}}><X/></button></div>
                </div>
              </article>
            </div>
          })}
        </div>
        <div className="day-cost-summary" aria-label={`${formatTripDate(dayDates[activeDay],false,language)} ${text('예상 경비 총합','estimated budget total')}`}><div><span>{formatTripDate(dayDates[activeDay],false,language)} {text('예상 경비 총합','estimated budget total')}</span><small>{text('입력한 장소 비용 기준','Based on entered place costs')}</small></div><strong><span><em>{text('개인별','Per person')}</em>{formatMoney(dayCostSummary.personal,language,currency)}</span><span><em>{text('총 비용','Total')}</em>{formatMoney(dayCostSummary.total,language,currency)}</span></strong></div>
        <div className="planner-add-actions"><Button variant="outline" className="wide-add" onClick={()=>setAddOpen(true)}><Plus/>{text('이 날짜에 장소 추가','Add a place to this day')}</Button><Button variant="ghost" className="custom-add-button" onClick={openCustomPin}><MapPin/>{text('지도에 임의 핀 추가','Add a custom map pin')}</Button></div>
      </aside>
      <section className="map-panel">
        <div className="map-toolbar"><div className="map-toolbar-left"><Sparkles/><span><strong>DAY {Math.max(1,dayKeys.indexOf(activeDay)+1)}</strong></span></div><div className="map-toolbar-right"><button type="button" className="planner-toggle-button" onClick={()=>setPlannerCollapsed(current=>!current)} aria-expanded={!plannerCollapsed} aria-label={plannerCollapsed?text('일정 패널 펼치기','Expand planner'):text('일정 패널 접기','Collapse planner')} title={plannerCollapsed?text('일정 패널 펼치기','Expand planner'):text('일정 접기','Collapse planner')}>{plannerCollapsed?<PanelLeftOpen/>:<PanelLeftClose/>}<span>{plannerCollapsed?text('일정 펼치기','Expand planner'):text('일정 접기','Collapse planner')}</span></button><span className={`naver-badge ${tripSettings.mapProvider==='google'?'google-badge':''} ${tripSettings.mapProvider==='osm'?'osm-badge':''}`}><b>{tripSettings.mapProvider==='google'?'G':tripSettings.mapProvider==='osm'?'O':'N'}</b>{mapProviderName(tripSettings.mapProvider,language)}</span></div></div>
        <div className="map-place-search"><PlacePicker provider={tripSettings.mapProvider} query={mapQuery} onQueryChange={(value,userInput)=>{setMapQuery(value);if(userInput){setMapPicked(null);setMapCandidate(null);setMapResultPlaces([]);if(tripSettings.mapProvider==='osm')setOsmMapQuery('')}}} onEnter={value=>{if(tripSettings.mapProvider==='osm')setOsmMapQuery(value);else void commitMapSearch()}} results={mapSuggestions.results} value={mapPicked} onPick={async place=>{try{const resolved=await resolveSearchPlace(place,tripSettings.mapProvider,googleKey,language);setMapPicked(resolved);setMapCandidate(resolved);setMapResultPlaces(resolved?[resolved]:[]);if(resolved)setMapQuery(placeTitle(resolved,language))}catch(error){setPlanSaveMessage(error instanceof Error?error.message:text('장소를 확인하지 못했습니다.','Could not load this place.'))}}} searching={mapSuggestions.searching} placeholder={`${tripSettings.destination} ${text('장소 검색','search places')}`} selected={Boolean(mapPicked)}/></div>
        {tripSettings.mapProvider==='google'?<GoogleMap {...mapViewProps} apiKey={googleKey}/>:tripSettings.mapProvider==='osm'?<OsmMap {...mapViewProps}/>:<NaverMap {...mapViewProps} clientId={clientId}/>}
        {mapCandidate&&<div className="map-place-card"><button className="map-card-close" onClick={()=>setMapCandidate(null)} aria-label={text('장소 정보 닫기','Close place info')}>×</button><span>{placeCategory(mapCandidate,language)}</span><strong>{placeTitle(mapCandidate,language)}</strong><p>{placeAddress(mapCandidate,language)}</p><div><a href={placeExternalUrl(mapCandidate)} target="_blank" rel="noreferrer">{tripSettings.mapProvider==='naver'?text('네이버지도에서 상세보기','View on Naver Maps'):text('Google 지도에서 상세보기','View on Google Maps')}</a><Button onClick={prepareMapCandidate}><Plus/>{text('이 장소로 결정','Choose this place')}</Button></div></div>}
      </section>
    </section>

    <Sheet open={Boolean(selected)} onOpenChange={open=>!open&&setSelected(null)}><SheetContent className="place-sheet sm:max-w-[430px]">{selected&&<><SheetHeader><div className="sheet-eyebrow"><span style={{background:dayColor(selected.day,dayKeys)}}>{stops.filter(s=>s.day===selected.day).findIndex(s=>s.id===selected.id)+1}</span>{formatTripDate(dayDates[selected.day],false,language)} · {selected.time} · {text(selected.category,selected.category==='식사'?'Meal':selected.category==='간식'?'Snack':selected.category==='관광'?'Sightseeing':selected.category==='숙소'?'Stay':'Other')}</div><SheetTitle>{selected.name}</SheetTitle><SheetDescription>{selected.address}</SheetDescription></SheetHeader><div className="sheet-body"><div className="section-title"><span>{text('거리뷰','Street view')}</span><small>{mapProviderName(tripSettings.mapProvider,language)}</small></div>{tripSettings.mapProvider==='naver'?<PanoramaView stop={selected} clientId={clientId}/>:<a className="panorama-external-link" href={googleStreetViewUrl(selected)} target="_blank" rel="noreferrer"><Navigation/><span><strong>{text('Google 지도에서 스트리트뷰 열기','Open Street View in Google Maps')}</strong><small>{text('촬영된 거리뷰가 없는 곳은 일반 지도로 열릴 수 있어요.','Places without Street View coverage may open as a regular map.')}</small></span><ExternalLink/></a>} {selected.memo&&<div className="place-note"><span>{text('메모','Note')}</span><p>{selected.memo}</p></div>}<a className={`naver-link ${tripSettings.mapProvider==='naver'?'':'google-link'}`} href={stopExternalUrl(selected,tripSettings.mapProvider)} target="_blank" rel="noreferrer"><span><b>{tripSettings.mapProvider==='naver'?'N':'G'}</b>{tripSettings.mapProvider==='naver'?text('네이버지도에서 상세보기','View on Naver Maps'):text('Google 지도에서 상세보기','View on Google Maps')}</span><ExternalLink/></a><Button variant="outline" className="location-edit-button" onClick={startLocationEdit}><MapPin/>{text('위치 임의 수정','Edit location')}</Button><Button variant="destructive" className="delete-button" onClick={removeSelected}><Trash2/>{text('이 장소 삭제','Delete place')}</Button></div></>}</SheetContent></Sheet>

    <Dialog open={Boolean(editing)} onOpenChange={open=>{if(!open){setEditing(null);setEditDraft(null)}}}><DialogContent className="edit-dialog sm:max-w-[500px]">{editDraft&&<><DialogHeader><DialogTitle>{text('장소 수정','Edit place')}</DialogTitle><DialogDescription>{text('장소를 바꾸려면 검색 결과에서 선택하세요.','Choose a search result if you want to change the place.')}</DialogDescription></DialogHeader><div className="edit-grid"><label>{text('장소','Place')} <PlacePicker provider={tripSettings.mapProvider} query={editQuery} onQueryChange={(value,userInput)=>{setEditQuery(value);if(userInput){setEditPlaceLinked(false);if(tripSettings.mapProvider==='osm')setOsmEditQuery('')}}} onEnter={value=>{if(tripSettings.mapProvider==='osm')setOsmEditQuery(value)}} results={editSuggestions.results} value={null} onPick={pickEditPlace} searching={editSuggestions.searching} placeholder={text('장소 검색','Search places')} selected={editPlaceLinked}/></label>{editSuggestions.error&&editQuery.trim().length>=2&&!editPlaceLinked&&<div className="inline-notice"><CircleAlert/>{editSuggestions.error}</div>}<div className={`linked-place ${editPlaceLinked?'':'unlinked'}`}><MapPin/><span><strong>{editDraft.name}</strong><small>{editDraft.address}</small></span><em>{editPlaceLinked?text('선택됨','Selected'):text('장소를 골라주세요','Choose a place')}</em></div><div className="form-grid two"><label>{text('시간(24시간)','Time (24-hour)')}<Time24Input value={editDraft.time} onChange={time=>setEditDraft({...editDraft,time})}/></label><label>{text('카테고리','Category')}<select value={editDraft.category} onChange={e=>setEditDraft({...editDraft,category:e.target.value as PlaceType})}>{PLACE_CATEGORIES.map(t=><option key={t}>{text(t, t==='식사'?'Meal':t==='간식'?'Snack':t==='관광'?'Sightseeing':t==='숙소'?'Stay':'Other')}</option>)}</select></label></div><label>{text('메모','Note')}<Textarea value={editDraft.memo} onChange={e=>setEditDraft({...editDraft,memo:e.target.value})} placeholder={text('메모를 남겨보세요','Leave a note')}/></label></div><DialogFooter><Button variant="outline" onClick={()=>{setEditing(null);setEditDraft(null)}}>{text('취소','Cancel')}</Button><Button onClick={saveEdit} disabled={!editPlaceLinked||!isValidTime(editDraft.time)}>{text('저장','Save')}</Button></DialogFooter></>}</DialogContent></Dialog>

    <Dialog open={editPasswordPromptOpen} onOpenChange={open=>{if(!open){setEditPasswordPromptOpen(false);setEditPasswordPromptError('')}}}><DialogContent className="password-dialog sm:max-w-[420px]"><DialogHeader><DialogTitle>{text('편집 비밀번호가 필요해요','Editing password required')}</DialogTitle><DialogDescription>{text('이 계획을 수정하려면 편집 비밀번호를 입력하세요.','Enter the editing password to change this plan.')}</DialogDescription></DialogHeader><label>{text('편집 비밀번호','Editing password')}<Input type="password" value={editPasswordPrompt} onChange={e=>setEditPasswordPrompt(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void unlockEditPlan()}} placeholder={text('편집 비밀번호','Editing password')}/></label>{editPasswordPromptError&&<div className="inline-notice"><CircleAlert/>{editPasswordPromptError}</div>}<DialogFooter><Button variant="outline" onClick={()=>setEditPasswordPromptOpen(false)}>{text('취소','Cancel')}</Button><Button onClick={unlockEditPlan} disabled={!editPasswordPrompt}>{text('편집 권한 확인','Check edit access')}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}><DialogContent className="settings-dialog sm:max-w-[500px]"><DialogHeader><DialogTitle>{text('여행 일정','Trip settings')}</DialogTitle><DialogDescription>{text('어디로, 언제 떠날지 정하세요.','Choose where and when you are going.')}</DialogDescription></DialogHeader><div className="trip-settings-grid"><label>{text('여행 이름','Trip name')}<Input value={settingsDraft.title} onChange={e=>setSettingsDraft({...settingsDraft,title:e.target.value})} placeholder={text("전주 맛집 여행","Jeonju food trip")}/></label><label className="destination-field">{text('여행지','Destination')}<Input value={settingsDraft.destination} onChange={e=>{setSettingsDraft({...settingsDraft,destination:e.target.value});setDestinationSuggestionsOpen(true)}} onFocus={()=>setDestinationSuggestionsOpen(true)} onKeyDown={e=>{if(e.key==='Escape')setDestinationSuggestionsOpen(false)}} placeholder={settingsDraft.mapProvider==='google'||settingsDraft.mapProvider==='osm'?text('예: 도쿄, 파리','e.g. Tokyo, Paris'):text('전주','e.g. Jeonju')} autoComplete="off" />{destinationSuggestionsOpen&&(settingsDraft.destination.trim().length>=2)&&(destinationSuggestions.searching||destinationSuggestions.results.length>0)&&<div className="destination-suggestions">{destinationSuggestions.searching&&<div className="destination-suggestion-status">{text('도시를 찾는 중…','Finding cities…')}</div>}{destinationSuggestions.results.map((place,index)=><button type="button" key={`${place.placeId||place.mapx||place.title}-${index}`} className="destination-suggestion" onMouseDown={event=>event.preventDefault()} onClick={()=>chooseDestination(place)}><MapPin/><span><strong>{destinationLabel(place,language)}</strong><small>{placeAddress(place,language)}</small></span></button>)}</div>}</label><div className={`map-provider-setting ${settingsDraft.mapProvider==='google'?'is-google':settingsDraft.mapProvider==='osm'?'is-osm':''}`}><Map/><span><strong>{mapProviderName(settingsDraft.mapProvider,language)}</strong><small>{mapProviderDescription(settingsDraft.mapProvider,language)}</small></span></div><div className="date-fields"><label>{text('출발일','Start date')}<Input type="date" value={settingsDraft.startDate} onChange={e=>setSettingsDraft({...settingsDraft,startDate:e.target.value})}/></label><label>{text('돌아오는 날','End date')}<Input type="date" min={settingsDraft.startDate} value={settingsDraft.endDate} onChange={e=>setSettingsDraft({...settingsDraft,endDate:e.target.value})}/></label></div><label>{text('인원','Travelers')}<div className="people-input"><Users/><Input type="number" min="1" max="99" value={settingsDraft.people} onChange={e=>setSettingsDraft({...settingsDraft,people:Number(e.target.value)})}/><span>{text('명','people')}</span></div></label><label>{text('편집 권한','Edit access')}<select value={settingsDraft.editPolicy} onChange={e=>setSettingsDraft({...settingsDraft,editPolicy:e.target.value as EditPolicy})}><option value="owner">{text("작성자만","Author only")}</option><option value="all">{text("모두가","Everyone")}</option><option value="password">{text("편집 비밀번호 설정","Editing password")}</option></select></label>{settingsDraft.editPolicy==='password'&&<label>{text('편집 비밀번호','Editing password')} <div className="password-field"><Input type={showEditPassword?'text':'password'} value={editPassword} onChange={e=>{setEditPassword(e.target.value);setEditPasswordTouched(true)}} placeholder={editPasswordConfigured&&!editPasswordTouched?'****':text('편집 비밀번호 입력','Enter editing password')} aria-label={text("편집 비밀번호","Editing password")}/><button type="button" className="password-eye" onClick={()=>{if(!editPassword){setPlanSaveMessage(editPasswordConfigured?text('현재 편집 비밀번호는 보안상 확인할 수 없어요. 새 비밀번호를 입력하세요.','Your current editing password is hidden for security. Enter a new one to change it.'):text('편집 비밀번호를 먼저 입력하세요.','Enter an editing password first.'));return}setShowEditPassword(current=>!current)}} aria-label={showEditPassword?text('편집 비밀번호 숨기기','Hide editing password'):text('입력한 편집 비밀번호 보기','Show entered editing password')} title={editPassword?text('입력한 편집 비밀번호 보기','Show entered editing password'):text('기존 편집 비밀번호는 확인할 수 없어요','The existing password cannot be viewed')}>{showEditPassword?<EyeOff/>:<Eye/>}</button></div></label>}<label>{text('열람 비밀번호','Viewing password')} <div className="password-field"><Input type={showPlanPassword?'text':'password'} value={planPassword} onChange={e=>{setPlanPassword(e.target.value);setPlanPasswordTouched(true)}} placeholder={passwordConfigured&&!planPasswordTouched?'****':text('선택 입력','Optional')} aria-label={text("열람 비밀번호","Viewing password")}/><button type="button" className="password-eye" onClick={()=>{if(!planPassword){setPlanSaveMessage(passwordConfigured?text('현재 비밀번호는 보안상 확인할 수 없어요. 새 비밀번호를 입력하세요.','Your current viewing password is hidden for security. Enter a new one to change it.'):text('비밀번호를 먼저 입력하세요.','Enter a password first.'));return}setShowPlanPassword(current=>!current)}} aria-label={showPlanPassword?text('열람 비밀번호 숨기기','Hide viewing password'):text('입력한 열람 비밀번호 보기','Show entered viewing password')} title={planPassword?text('입력한 열람 비밀번호 보기','Show entered viewing password'):text('기존 비밀번호는 확인할 수 없어요','The existing password cannot be viewed')}>{showPlanPassword?<EyeOff/>:<Eye/>}</button></div></label></div><p className="settings-hint edit-policy-hint">{settingsDraft.editPolicy==='all'?text('열람할 수 있는 사람은 일정도 수정하거나 삭제할 수 있어요.','Anyone who can view the plan can also edit or delete it.'):settingsDraft.editPolicy==='password'?text('편집 비밀번호를 아는 사람만 일정도 수정하거나 삭제할 수 있어요.','Only people with the editing password can edit or delete the plan.'):text('작성자 토큰이 있어야 수정하거나 삭제할 수 있어요. 열람 비밀번호는 보기 전용이에요.','The author token is required to edit or delete. The viewing password is view-only.')}</p><p className="settings-hint password-status">{text('편집 권한이 있으면 열람 비밀번호와 편집 비밀번호를 변경할 수 있어요.','Anyone with edit access can change both passwords.')}</p>{settingsDraft.editPolicy==='password'&&<p className="settings-hint password-status edit-password-status">{editPasswordTouched?(editPassword?text('새 편집 비밀번호 입력됨 · 상단 계획 저장 후 적용돼요.','New editing password entered · save the plan above to apply it.'):editPasswordConfigured?text('편집 비밀번호를 유지하려면 새 값을 입력하세요.','Enter a new value to keep the editing password.'):text('편집 비밀번호는 필수예요.','An editing password is required.')):(editPasswordConfigured?text('편집 비밀번호 설정됨 · 기존 비밀번호는 확인할 수 없어요.','Editing password set · the existing password cannot be viewed.'):text('편집 비밀번호 없음 · 입력이 필요해요.','No editing password · enter one to continue.'))}</p>}<p className="settings-hint password-status">{planPasswordTouched?(planPassword?text('새 열람 비밀번호 입력됨 · 상단 계획 저장 후 적용돼요.','New viewing password entered · save the plan above to apply it.'):passwordConfigured?text('저장하면 열람 비밀번호를 해제해요.','Saving will remove the viewing password.'):text('열람 비밀번호 없이 저장돼요.','The plan will be saved without a viewing password.')):(passwordConfigured?text('열람 비밀번호 설정됨 · 기존 비밀번호는 확인할 수 없어요.','Viewing password set · the existing password cannot be viewed.'):text('열람 비밀번호 없음 · 선택 입력','No viewing password · optional'))}</p>{settingsDraft.editPolicy==='owner'&&!passwordConfigured&&!planPassword&&<div className="inline-notice owner-recovery-notice"><CircleAlert/>{text('열람 비밀번호 없이 작성자만을 선택하면 이 브라우저의 저장정보를 지울 때 편집 권한을 잃을 수 있어요. 편집 비밀번호 설정을 사용하면 별도 비밀번호로 복구할 수 있어요.','If you choose Author only without a viewing password, clearing this browser’s data may remove your edit access. Set an editing password so you can recover access separately.')}</div>}{!canEdit&&planId&&<div className="inline-notice plan-settings-readonly"><CircleAlert/><span>{settingsDraft.editPolicy==='password'?text('편집 비밀번호를 입력하면 일정을 수정할 수 있어요.','Enter the editing password to make changes.'):settingsDraft.editPolicy==='all'?text('열람 비밀번호로 계획을 열면 수정할 수 있어요.','Open the plan with its viewing password to edit it.'):text('이 계획은 보기 전용으로 열려 있어 설정을 저장할 수 없어요.','This plan is view-only, so settings cannot be saved.')}</span>{settingsDraft.editPolicy==='password'&&<Button variant="outline" onClick={()=>setEditPasswordPromptOpen(true)}>{text('편집 비밀번호 입력','Enter editing password')}</Button>}</div>}{passwordConfigured&&!planPasswordTouched&&<button type="button" className="password-clear" onClick={()=>{setPlanPassword('');setPlanPasswordTouched(true);setShowPlanPassword(false)}}>{text('열람 비밀번호 해제','Remove viewing password')}</button>}{!settingsDraft.destination.trim()&&<div className="inline-notice"><CircleAlert/>{text('여행지를 입력하면 계획을 저장할 수 있어요.','Enter a destination before saving the plan.')}</div>}{planSaveMessage&&planSaveMessage!=='저장됨'&&<div className="inline-notice"><CircleAlert/>{planSaveMessage}</div>}{settingsDraft.startDate>settingsDraft.endDate&&<div className="inline-notice"><CircleAlert/>{text('날짜를 다시 확인해주세요.','Please check the dates.')}</div>}<DialogFooter><Button variant="outline" onClick={()=>setSettingsOpen(false)}>{text('취소','Cancel')}</Button><Button onClick={saveTripSettings} disabled={!settingsDraft.startDate||!settingsDraft.endDate||settingsDraft.startDate>settingsDraft.endDate||Boolean(planId&&!canEdit)}>{text('저장','Save')}</Button></DialogFooter></DialogContent></Dialog>  </main>
}
