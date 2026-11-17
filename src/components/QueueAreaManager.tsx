'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {onAuthStateChanged} from 'firebase/auth';
import {ArrowUp, ArrowDown, Pencil, RefreshCw} from 'lucide-react';
import {auth} from '../firebase/config';
import {adminApi, AdminApiError} from '../lib/adminApi';
import {recordSystemLog} from '../lib/systemLogs/client';
import {useCommonToast} from './CommonToast';
import QueueAreaMap from './QueueAreaMap';

export type QueueRow = {driverId:string; entryId:string; tripStatus:string; orderId:string|null; rank:number|null; name:string; carPlate:string; rb:number; joinedAt:number|null};
export type QueueArea = {areaId:string; name:string; sort:number; enabled:boolean; revision:string; polygon:{lat:number;lng:number}[]; pickupPolygon:{lat:number;lng:number}[]; members:QueueRow[]; holds:QueueRow[]};
type Request = Record<string, unknown> & {action:string; operationId:string};
type Edit = {kind:'name'|'enabled'|'remove'; area:QueueArea; row?:QueueRow};
const journalKey = (uid:string) => `lotus-queue-management:${uid}`;
const timeText = (value:number|null) => value === null ? '—' : new Date(value).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false});

export default function QueueAreaManager() {
  const [areas,setAreas] = useState<QueueArea[]>([]), [sorting,setSorting] = useState(false);
  const [edit,setEdit] = useState<Edit|null>(null), [name,setName] = useState('');
  const [busy,setBusy] = useState(false), [ready,setReady] = useState(false), [message,setMessage] = useState('');
  const [pending,setPending] = useState<Request|null>(null);
  const scope = useRef(0), owner = useRef<string|null>(null), flight = useRef(false), blocked = useRef(false);
  const pendingRef = useRef<Request|null>(null), editing = useRef(false);
  useEffect(()=>{editing.current = sorting || !!edit;},[sorting,edit]);
  const observed = useRef('');
  const toast = useCommonToast();
  const load = useCallback(async () => {
    const uid = owner.current, run = scope.current;
    if (!uid || flight.current || pendingRef.current || blocked.current) return;
    flight.current = true; setBusy(true);
    try {
      const result = await adminApi<{areas:QueueArea[]}>({action:'QUEUE_MANAGEMENT_GET'});
      if (run !== scope.current || auth.currentUser?.uid !== uid) return;
      if (!editing.current) setAreas(result.areas);
      setReady(true); setMessage('');
      const stateKey=JSON.stringify(result.areas.map(a=>[a.areaId,a.revision,...a.members.map(r=>[r.entryId,r.tripStatus]),...a.holds.map(r=>[r.entryId,r.tripStatus])]));
      if(observed.current!==stateKey){observed.current=stateKey;recordSystemLog('STATE_SNAPSHOT',{control:'queue.board',count:result.areas.reduce((n,a)=>n+a.members.length+a.holds.length,0)});}
    } catch (e) { if (run === scope.current) {setReady(false);setMessage(e instanceof Error ? e.message : '讀取失敗，請重新整理。');} }
    finally { if(run === scope.current) {flight.current=false;setBusy(false);} }
  },[]);
  useEffect(() => {
    const stop = onAuthStateChanged(auth,user => {
      scope.current++; owner.current=user?.uid ?? null; flight.current=false;blocked.current=false; pendingRef.current=null;
      observed.current='';setAreas([]);setEdit(null);setSorting(false);setPending(null);setReady(false);setBusy(false);setMessage('');
      if (!user) return;
      try {
        const raw = sessionStorage.getItem(journalKey(user.uid));
        if(raw) {
          const request:Request=JSON.parse(raw);
          if (!['QUEUE_AREA_NAME','QUEUE_AREA_ENABLED','QUEUE_AREA_SORT','QUEUE_REMOVE'].includes(request.action) || !request.operationId) throw Error();
          pendingRef.current=request;setPending(request);setMessage('上次操作結果待確認，請重試原操作。');
        } else void load();
      } catch {blocked.current=true;setMessage('無法讀取操作紀錄，請確認瀏覽器儲存空間後重新開啟此頁。');}
    });
    const timer=setInterval(()=>{if(!document.hidden&&!editing.current)void load();},5000);
    const invalidate=()=>{scope.current++;owner.current=null;};
    return ()=>{invalidate();stop();clearInterval(timer);};
  },[load]);
  async function send(request:Request, retry=false) {
    const uid=owner.current,run=scope.current;
    if(!uid||flight.current||blocked.current||pendingRef.current&&!retry)return;
    try {sessionStorage.setItem(journalKey(uid),JSON.stringify(request));}
    catch {setMessage('無法保存操作紀錄，請確認瀏覽器儲存空間後重試。');return;}
    pendingRef.current=request;setPending(request);flight.current=true;setBusy(true);setMessage('');
    let success=false;
    try {
      await adminApi(request);
      if(run!==scope.current||auth.currentUser?.uid!==uid)return;
      sessionStorage.removeItem(journalKey(uid));pendingRef.current=null;setPending(null);
      setEdit(null);setSorting(false);editing.current=false;toast(request.action==='QUEUE_REMOVE'?'已移除排班':'已儲存');setReady(false);success=true;
    } catch(e) {
      if(run!==scope.current)return;
      setEdit(null);setSorting(false);editing.current=false;
      if(e instanceof AdminApiError&&!e.uncertain) {
        sessionStorage.removeItem(journalKey(uid));pendingRef.current=null;setPending(null);
        setEdit(null);setSorting(false);editing.current=false;setReady(false);
      }
      setMessage(e instanceof Error?e.message:'操作結果待確認，請重試原操作。');
    } finally {if(run===scope.current){flight.current=false;setBusy(false);}}
    // 保留失敗訊息供管理員閱讀；下一次重新整理或輪詢取得最新資料。
    if(run===scope.current&&!pendingRef.current) {setReady(false);if(success)void load();}
  }
  function confirm() {
    if(!edit)return;
    const request:Request={action:edit.kind==='name'?'QUEUE_AREA_NAME':edit.kind==='enabled'?'QUEUE_AREA_ENABLED':'QUEUE_REMOVE',
      operationId:crypto.randomUUID(),areaId:edit.area.areaId};
    if(edit.kind==='remove'&&edit.row)Object.assign(request,{driverId:edit.row.driverId,expectedEntryId:edit.row.entryId,
      expectedTripStatus:edit.row.tripStatus,expectedOrderId:edit.row.orderId});
    else Object.assign(request,{expectedRevision:edit.area.revision,...(edit.kind==='name'?{name:name.trim()}:{enabled:!edit.area.enabled})});
    void send(request);
  }
  function move(index:number,delta:number) {setAreas(old=>{const next=[...old];[next[index],next[index+delta]]=[next[index+delta],next[index]];return next;});}
  const locked=busy||!!pending||!ready;
  const rows=(area:QueueArea,values:QueueRow[],holding=false)=><div className="queue-members">
    {values.length===0?<p className="queue-muted">{holding?'目前無承接中保號。':'目前無人排班。'}</p>:values.map(row=><div className="queue-member" key={row.entryId}>
      <div className="queue-identity"><strong>{holding?'承接中保號':`第 ${row.rank} 位`}</strong><span className="queue-plate">{row.carPlate||'未提供'}</span><span>{row.name||'姓名未提供'}</span></div>
      <div className="queue-member-meta"><span>保號 {row.rb} 次</span><span>領號時間：{timeText(row.joinedAt)}</span>
        {row.tripStatus==='DISPATCHED'&&<span>邀請中</span>}</div>
      <button className="btn-secondary queue-remove" disabled={locked||sorting} data-syslog="queue.remove" onClick={()=>setEdit({kind:'remove',area,row})}>移除排班</button>
    </div>)}
  </div>;
  return <section className="queue-manager">
    <header className="queue-toolbar"><h2>排班區管理</h2><div>
      {sorting?<><button className="btn-secondary" disabled={busy||!!pending} onClick={()=>{setSorting(false);editing.current=false;void load();}}>取消排序</button>
        <button className="btn-primary" disabled={locked} onClick={()=>void send({action:'QUEUE_AREA_SORT',operationId:crypto.randomUUID(),areas:areas.map(a=>({areaId:a.areaId,revision:a.revision}))})}>儲存排序</button></>
        :<><button className="btn-secondary" disabled={locked||areas.length<2} onClick={()=>setSorting(true)}>調整排序</button>
          <button className="btn-secondary" disabled={busy||!!pending} onClick={()=>void load()}><RefreshCw size={16}/>重新整理</button></>}
    </div></header>
    {message&&<p role="status" className="queue-feedback">{message}</p>}
    {pending&&<button className="btn-primary" disabled={busy} onClick={()=>void send(pending,true)}>重試原操作</button>}
    {!areas.length&&<p>{busy?'讀取排班區…':ready?'目前沒有排班區。':''}</p>}
    {areas.map((area,index)=><article className="queue-area" key={area.areaId}>
      <header className="queue-area-header"><h3>{area.name}</h3>
        <button className="btn-secondary queue-icon" aria-label={`編輯 ${area.name} 名稱`} disabled={locked||sorting} onClick={()=>{setName(area.name);setEdit({kind:'name',area});}}><Pencil size={16}/></button>
        <span className={area.enabled?'queue-enabled':'queue-muted'}>{area.enabled?'啟用中':'停用中'}</span>
        <div className="queue-area-actions">{sorting?<><button className="btn-secondary queue-icon" aria-label={`上移 ${area.name}`} disabled={locked||index===0} onClick={()=>move(index,-1)}><ArrowUp size={18}/></button>
          <button className="btn-secondary queue-icon" aria-label={`下移 ${area.name}`} disabled={locked||index===areas.length-1} onClick={()=>move(index,1)}><ArrowDown size={18}/></button></>
          :<button className="btn-secondary" disabled={locked} onClick={()=>setEdit({kind:'enabled',area})}>{area.enabled?'停用':'啟用'}</button>}</div>
      </header>
      <div className="queue-area-body"><div><QueueAreaMap area={area}/><p className="queue-legend"><span>藍色：司機排班區</span><span>橘色：乘客上車區</span></p></div>
        <div className="queue-area-lists">
          <div className="queue-holds"><h4>承接中保號：{area.holds.length} 位</h4>
            <p className="queue-hold-description">已承接訂單，乘客上車前保留回排資格。</p>{rows(area,area.holds,true)}</div>
          <div className="queue-waiting"><h4>排班人數：{area.members.length} 位</h4>{rows(area,area.members)}</div>
        </div></div>
    </article>)}
    {edit&&<QueueConfirm edit={edit} name={name} setName={setName} busy={busy||!!pending} onClose={()=>setEdit(null)} onConfirm={confirm}/>}
  </section>;
}
function QueueConfirm({edit,name,setName,busy,onClose,onConfirm}:{edit:Edit;name:string;setName:(s:string)=>void;busy:boolean;onClose:()=>void;onConfirm:()=>void}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const opener=document.activeElement as HTMLElement|null;ref.current?.showModal();return()=>opener?.focus();},[]);
  const row=edit.row, enable=!edit.area.enabled;
  return <dialog ref={ref} className="queue-confirm" onCancel={e=>{e.preventDefault();if(!busy)onClose();}} aria-labelledby="queue-confirm-title">
    <h3 id="queue-confirm-title">{edit.kind==='name'?'編輯排班區名稱':edit.kind==='enabled'?`${enable?'啟用':'停用'}「${edit.area.name}」？`:'移除排班？'}</h3>
    {edit.kind==='name'?<label>顯示名稱<input autoFocus value={name} maxLength={100} disabled={busy} onChange={e=>setName(e.target.value)}/></label>
      :edit.kind==='enabled'?<p>{enable?'此區將恢復領號與排班順序派單。':<>此區將停止領號與排班順序派單。<br/>已有排班與保號資格保留。</>}</p>
      :<><p>{edit.area.name}</p><p><span className="queue-plate">{row?.carPlate}</span> {row?.name}</p>
        <p>{row?.tripStatus==='DISPATCHED'?'將撤回目前邀請、移除排班並清除保號次數。':['EN_ROUTE','ARRIVED'].includes(row?.tripStatus||'')?'將取消本輪保號資格；目前接送繼續，之後不再自動回排。':'將移除本輪排班並清除保號次數，司機維持上線。'}</p></>}
    <footer><button autoFocus={edit.kind!=='name'} className="btn-secondary" disabled={busy} onClick={onClose}>取消</button>
      <button className="btn-primary" disabled={busy||edit.kind==='name'&&!name.trim()} data-syslog="queue.confirm" onClick={onConfirm}>{edit.kind==='name'?'儲存':edit.kind==='remove'?'移除排班':enable?'啟用':'停用'}</button></footer>
  </dialog>;
}
