'use client';
import {useEffect,useRef,useState} from 'react';
import type {QueueArea} from './QueueAreaManager';
import {recordSystemLog} from '../lib/systemLogs/client';

type AreaMaps={preview:(area:QueueArea)=>HTMLElement;destroy:()=>void};
declare global {interface Window {
  LotusOrderMap?:{create:(read:unknown,options:{area:boolean})=>AreaMaps};
  LotusMapsConfig?:{key:string;v:string;language:string;region:string};
  LotusClientLog?:{record:typeof recordSystemLog};
}}
let library:Promise<void>|undefined;
function loadScript(src:string) {return new Promise<void>((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=()=>resolve();s.onerror=()=>{s.remove();reject(Error('地圖載入失敗'));};document.head.append(s);});}
function load() {
  if(!library)library=(async()=>{
    window.LotusMapsConfig={key:process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY||'',v:'weekly',language:'zh-TW',region:'TW'};
    if(!window.google?.maps?.importLibrary)await loadScript('/passenger-order/shared/google-maps.js?v=queue-20261117');
    if(!window.LotusOrderMap)await loadScript('/passenger-order/shared/order-map.js?v=queue-20261117');
    window.LotusClientLog={record:recordSystemLog};
  })().catch(e=>{library=undefined;throw e;});
  return library;
}
export default function QueueAreaMap({area}:{area:QueueArea}) {
  const root=useRef<HTMLDivElement>(null),maps=useRef<AreaMaps|null>(null),latest=useRef(area);
  useEffect(()=>{latest.current=area;},[area]);
  const [error,setError]=useState(false),[retry,setRetry]=useState(0);
  useEffect(()=>{
    let alive=true;
    void load().then(()=>{
      if(!alive)return;
      maps.current=window.LotusOrderMap!.create(null,{area:true});
      root.current?.replaceChildren(maps.current.preview(latest.current));setError(false);
    }).catch(()=>{if(alive)setError(true);});
    return()=>{alive=false;maps.current?.destroy();maps.current=null;};
  },[retry]);
  useEffect(()=>{if(maps.current)root.current?.replaceChildren(maps.current.preview(area));},[area]);
  return <><div className="queue-map" ref={root}/>{error&&<button className="btn-secondary" onClick={()=>setRetry(n=>n+1)}>地圖暫時無法載入，點擊重試</button>}</>;
}
