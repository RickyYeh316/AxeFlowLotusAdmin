'use client';

import {useEffect, useRef, useState} from 'react';
import {onAuthStateChanged} from 'firebase/auth';
import {auth} from '../firebase/config';
import {adminApi, AdminApiError} from '../lib/adminApi';
import {recordSystemLog} from '../lib/systemLogs/client';
import {orderGroup, orderStatusText} from '../lib/orderPresentation';
import {OrderStatus} from '../types';
import ListPagination from './ListPagination';
import {useCommonToast} from './CommonToast';

type Control = {state: {phase: 'NORMAL'|'PRE'|'START'; revision: string|null; operationId?:string; processing?:boolean; plannedStartMs?:number; plannedEndMs?:number; preStartedAtMs?:number|null; startedAtMs?:number|null; endedAtMs?:number|null}; operation: {id:string; phase:string; nowMs:number; status:string; total:number; cancelled:number; skipped:number; todo:string[]; error?:{code:string;orderId:string}}|null};
type Phase = 'PRE' | 'START';
type Item = {id: string; readableId: string; status: OrderStatus; reservationState: string; isScheduled: boolean;
  passengerName: string; passengerNumber: string; driverName: string; carPlate: string;
  startAddress: string; endAddress: string; updatedAtMs: number | null; scheduledTimeMs: number | null; t30Ms: number | null; reason: string};
type Result = {phase: Phase; nowMs: number; untilMs: number; plannedStartMs: number; plannedEndMs: number;
  total: number; servingCount: number; items: Item[]};
const time = (ms: number | null) => ms === null ? '時間未提供' : new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
}).format(new Date(ms)).replaceAll('-', '/');
function parseTime(value: string) {
  const ms = Date.parse(`${value}:00+08:00`);
  return Number.isFinite(ms) && new Date(ms + 8 * 3600000).toISOString().slice(0, 16) === value ? ms : NaN;
}
const label = (phase: Phase) => phase === 'PRE' ? '維護半開始 (當下時間起 預覽)' : '維護開始 (當下時間起 預覽)';
const inputTime = (ms?: number) => ms ? new Date(ms + 8 * 3600000).toISOString().slice(0, 16) : '';

export default function MaintenanceManager() {
  const commonToast = useCommonToast();
  const [recoveryNeeded, setRecoveryNeeded] = useState(false);
  const [identity,setIdentity]=useState<string|null>(null);
  const [control, setControl] = useState<Control|null>(null), [acting,setActing] = useState(false);
  const actionFlight = useRef(false);
  const [start, setStart] = useState(''), [end, setEnd] = useState('');
  const [result, setResult] = useState<Result | null>(null), [message, setMessage] = useState('');
  const [busy, setBusy] = useState<Phase | null>(null), [ready, setReady] = useState(false);
  const [stale, setStale] = useState(false), [page, setPage] = useState(1), [pageSize, setPageSize] = useState(10);
  const scope = useRef(0), owner = useRef<string | null>(null), flight = useRef(false), edits = useRef(0);
  const dirty = useRef({start:false,end:false}), reads = useRef(0);
  const loggedState = useRef('');
  function applyControl(value: Control) {
    setControl(value);
    if (!dirty.current.start) setStart(inputTime(value.state.plannedStartMs));
    if (!dirty.current.end) setEnd(inputTime(value.state.plannedEndMs));
  }
  useEffect(() => {
    const invalidate = () => { scope.current++; owner.current = null; };
    const stop = onAuthStateChanged(auth, user => {
      scope.current++; owner.current = user?.uid ?? null; flight.current = false;
      dirty.current={start:false,end:false}; reads.current++;
      setIdentity(user?.uid??null); setControl(null); setActing(false); actionFlight.current=false; setReady(!!user); setResult(null); setBusy(null); setMessage(''); setStale(false);
      setStart(''); setEnd(''); setPage(1); setRecoveryNeeded(false);
      if (user) {
        try { setRecoveryNeeded(!!localStorage.getItem(`lotus.maintenance.${user.uid}`)); }
        catch { setMessage('無法讀取維護操作紀錄，請確認瀏覽器儲存空間。'); }
      }
    });
    return () => { invalidate(); stop(); };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const generation=scope.current, uid=owner.current;
    const refresh=async()=>{
      const read=++reads.current;
      try { const value=await adminApi<Control>({action:'MAINTENANCE_GET'});
        if(generation===scope.current && auth.currentUser?.uid===uid && read===reads.current && !actionFlight.current) applyControl(value);
      } catch { /* API日誌保留失敗；正式操作須已取得狀態 */ }
    };
    void refresh(); const timer=setInterval(()=>{if(!document.hidden&&!actionFlight.current)void refresh();},15000);
    return ()=>clearInterval(timer);
  },[ready,identity]);
  useEffect(() => {
    if(!control) {loggedState.current='';return;}
    const key=JSON.stringify([identity,control.state.phase,control.state.revision,control.state.processing]);
    if(key===loggedState.current)return;
    loggedState.current=key;
    recordSystemLog('STATE_SNAPSHOT',{control:'maintenance.state',stage:control.state.phase,
      pendingCount:control.state.processing?1:0});
  },[control,identity]); // 僅狀態切換時記錄，避免輪詢重複上傳。
  async function operate(phase: 'PRE'|'START'|'END'|'CANCEL_PRE'|'RESUME') {
    const uid=owner.current,generation=scope.current;
    if (!uid || !control || actionFlight.current || flight.current) return;
    const key=`lotus.maintenance.${uid}`;
    const current=()=>generation===scope.current && auth.currentUser?.uid===uid;
    actionFlight.current=true;reads.current++;setActing(true);setMessage('');setResult(null);
    try {
      let id=control.state.processing ? control.state.operationId : undefined;
      const pending=localStorage.getItem(key);
      if (pending) {
        const response=await adminApi<{operationId:string}>(JSON.parse(pending)); id=response.operationId;
        if(!current())return; localStorage.removeItem(key);setRecoveryNeeded(false);
      } else if (phase!=='RESUME') {
        const plannedStartMs=parseTime(start),plannedEndMs=parseTime(end);
        const withPlan=phase==='PRE'||phase==='START';
        if (withPlan && (!Number.isFinite(plannedStartMs)||!Number.isFinite(plannedEndMs)||plannedEndMs<=plannedStartMs)) throw Error('請設定有效的維護開始及結束時間。');
        if(!window.confirm(phase==='CANCEL_PRE'?'確定恢復正常營運？重新開放媒合與新預約；既有行程繼續，已取消的訂單維持結束。':phase==='START'?'確定開始維護？剩餘行程（包含載客中）將系統取消，保留優惠券將歸還，雙端停止操作。':phase==='PRE'?'確定半開始？停止新媒合與新預約，受影響訂單將系統取消；既有實際行程繼續。':'確定結束維護？先清理維護期間到期的預約，再恢復營運。')) return;
        const command={action:'MAINTENANCE_TRANSITION',operationId:crypto.randomUUID(),phase,expectedRevision:control.state.revision??null,
          ...(withPlan?{plannedStartMs,plannedEndMs}:{})};
        localStorage.setItem(key,JSON.stringify(command));setRecoveryNeeded(true);
        const response=await adminApi<{operationId:string}>(command);id=response.operationId;
        if(!current())return;localStorage.removeItem(key);setRecoveryNeeded(false);
      }
      if(!id) {
        const value=await adminApi<Control>({action:'MAINTENANCE_GET'});
        if(!current())return;
        applyControl(value);
        setRecoveryNeeded(false);
        id=value.state.processing ? value.state.operationId : undefined;
        if(!id) {commonToast('已確認目前維護狀態。');return;}
      }
      dirty.current={start:false,end:false};
      while(current()) {
        const value:Control=await adminApi<Control>({action:'MAINTENANCE_CONTINUE',operationId:id});
        if(!current())return; applyControl(value);
        if(value.operation?.status==='ERROR') {setMessage(`收尾待重試：${value.operation.error?.orderId ?? ''}（${value.operation.error?.code}）。維護門禁維持。`);break;}
        if(!value.state.processing) {
          setRecoveryNeeded(false);
          const outcome=value.state.phase==='NORMAL'?'已恢復正常營運':value.state.phase==='PRE'?'已進入維護半開始':'已進入維護中';
          commonToast(`${outcome}。${value.operation?.cancelled ? `系統取消 ${value.operation.cancelled} 筆。` : ''}`);
          break;
        }
        id=value.state.operationId; // 若其他管理員已接下一階段，接續目前操作，避免重送舊操作形成空轉。
      }
    } catch(error) {
      if(current() && error instanceof AdminApiError && !error.uncertain){localStorage.removeItem(key);setRecoveryNeeded(false);}
      if(current()) {
        const uncertain=error instanceof AdminApiError && error.uncertain;
        if(uncertain) {setRecoveryNeeded(true);setMessage('操作結果待確認，請接續處理。');}
        else commonToast(`操作未完成。${error instanceof Error?error.message:''}`);
        // 確定失敗後重讀目前狀態；保留尚未送出的時間，供管理員修正。
        if(!uncertain) {try {const value=await adminApi<Control>({action:'MAINTENANCE_GET'});if(current())applyControl(value);} catch { /* 原錯誤保留 */ }}
      }
    } finally {if(current()){actionFlight.current=false;setActing(false);}}
  }
  function edit(which: 'start' | 'end', value: string) {
    edits.current++;
    dirty.current[which]=true;
    (which === 'start' ? setStart : setEnd)(value);
    if (result || flight.current) setStale(true);
    setMessage('');
    recordSystemLog('UI_CHANGE', {control: `maintenance.${which}`});
  }
  async function preview(phase: Phase) {
    const uid = owner.current, generation = scope.current, editVersion = edits.current;
    if (!uid || actionFlight.current || flight.current || auth.currentUser?.uid !== uid) return;
    const plannedStartMs = parseTime(start), plannedEndMs = parseTime(end);
    if (!Number.isFinite(plannedStartMs) || !Number.isFinite(plannedEndMs) || plannedEndMs <= plannedStartMs) {
      commonToast('請設定有效的維護開始及結束時間，結束須晚於開始。'); return;
    }
    const current = () => generation === scope.current && auth.currentUser?.uid === uid;
    flight.current = true; setBusy(phase); setMessage(''); setResult(null); setStale(false); setPage(1);
    try {
      const value = await adminApi<Result>({action: 'MAINTENANCE_PREVIEW', phase, plannedStartMs, plannedEndMs});
      if (!current()) return;
      setResult(value); setStale(editVersion !== edits.current);
      recordSystemLog('STATE_SNAPSHOT', {control: 'maintenance.preview', stage: phase, count: value.total,
        pendingCount: value.servingCount, windowStart: value.nowMs, windowEnd: value.untilMs});
    } catch (error) {
      if (current()) commonToast(`預覽未完成，未變更訂單。${error instanceof Error ? error.message : '請重新預覽。'}`);
    } finally {
      if (current()) { flight.current = false; setBusy(null); }
    }
  }
  const state=control?.state, operation=control?.operation;
  const disabled=(phase: 'NORMAL'|'PRE'|'START') => recoveryNeeded || !state || state.phase!==phase || !!state.processing || acting || !!busy;
  const timesDisabled=!control || acting || !!state?.processing || state?.phase==='START';
  const edited=!!state && (start!==inputTime(state.plannedStartMs)||end!==inputTime(state.plannedEndMs));
  const showRecovery=!acting && (recoveryNeeded || !!state?.processing);
  return <section className="glass content-sheet animate-fade-in maintenance-manager">
    <div className="sheet-title-row"><h2 className="sheet-title">維護</h2><span className="maintenance-status">{!control ? '正在讀取維護狀態' : control.state.phase==='NORMAL'?'正常營運':control.state.phase==='PRE'?'維護半開始（只出不進）':'維護中'}{control?.state.processing?'・收尾中':''}</span></div>
    <div className="maintenance-columns maintenance-actions maintenance-times">
      <div className="maintenance-column" data-phase="NORMAL" aria-current={state?.phase==='NORMAL'?'step':undefined}>
        <h3>正常營運</h3>
        <button type="button" className="btn-secondary maintenance-preview" data-syslog="maintenance.preview_pre" disabled={disabled('NORMAL')} onClick={() => void preview('PRE')}>{label('PRE')}</button>
        <div className="maintenance-time-space" />
        <button type="button" className="btn-secondary" data-syslog="maintenance.pre" disabled={disabled('NORMAL')} onClick={()=>void operate('PRE')}>維護半開始（只出不進）</button>
      </div>
      <div className="maintenance-column" data-phase="PRE" aria-current={state?.phase==='PRE'?'step':undefined}>
        <h3>維護半開始（只出不進）</h3>
        <button type="button" className="btn-secondary maintenance-preview" data-syslog="maintenance.preview_start" disabled={disabled('PRE')} onClick={() => void preview('START')}>{label('START')}</button>
        <label>預計開始時間<input aria-label="預計維護開始時間" type="datetime-local" step="60" value={start} disabled={timesDisabled} onChange={e => edit('start', e.target.value)} /></label>
        <button type="button" className="btn-secondary" data-syslog="maintenance.start" disabled={disabled('PRE')} onClick={()=>void operate('START')}>維護開始</button>
        <button type="button" className="btn-secondary" data-syslog="maintenance.cancel_pre" disabled={disabled('PRE')} onClick={()=>void operate('CANCEL_PRE')}>恢復正常營運</button>
      </div>
      <div className="maintenance-column" data-phase="START" aria-current={state?.phase==='START'?'step':undefined}>
        <h3>維護中</h3>
        <div className="maintenance-preview-space" />
        <label>預計結束時間<input aria-label="預計維護結束時間" type="datetime-local" step="60" value={end} disabled={timesDisabled} onChange={e => edit('end', e.target.value)} /></label>
        <button type="button" className="btn-secondary" data-syslog="maintenance.end" disabled={disabled('START')} onClick={()=>void operate('END')}>維護結束</button>
      </div>
    </div>
    {edited && <p className="maintenance-stale">時間尚未送出，確認維護操作後生效。</p>}
    {acting && <p role="status">正在處理維護操作…</p>}
    {showRecovery && <div className="maintenance-recovery">
      <p className="hint-feedback" role="status">{recoveryNeeded ? '上次操作結果待確認。' : `維護收尾尚有 ${operation?.todo.length ?? 0} 筆待處理。`}</p>
      <button type="button" className="btn-secondary" data-syslog="maintenance.resume" disabled={!control || !!busy} onClick={()=>void operate('RESUME')}>接續處理</button>
    </div>}
    {message && <p className="hint-feedback" role="alert">{message}</p>}
    {busy && <p role="status">正在查詢{label(busy)}…</p>}
    {stale && <p className="maintenance-stale" role="status">時間已變更，請重新預覽。</p>}
    {result && <div className="maintenance-result" aria-busy={!!busy}>
      <h3>{label(result.phase)}：預計系統取消 {result.total} 筆</h3>
      <p>查詢時間：{time(result.nowMs)}</p>
      <p>預約影響區間：{time(result.nowMs)} ～ {time(result.untilMs)}（含起點、不含終點；已進 T30／已到上車時間一併列入）</p>
      <p>{result.phase === 'PRE' ? '既有實際行程（含預約）繼續完成。' : `包含 ${result.servingCount} 筆既有實際行程。`}預覽為查詢當下結果，訂單仍會繼續變動。</p>
      {result.total === 0 ? <p className="maintenance-empty">目前沒有符合條件的受影響訂單。</p> : <>
        <div className="admin-table-container"><table className="admin-table order-table maintenance-table">
          <thead><tr><th>狀態<br />訂單編號</th><th>乘客姓名／編號<br />車號司機</th><th>上車地<br />目的地</th><th>紀錄時間／預約時間</th><th>預計處理原因</th></tr></thead>
          <tbody>{result.items.slice((page - 1) * pageSize, page * pageSize).map(item => <tr key={item.id} data-log-order={item.id}>
            <td><div className="order-cell-stack"><span className={`status-pill order-status order-tone-${orderGroup(item)}`}>{orderStatusText(item)}</span><span className="order-number">{item.readableId ? `#${item.readableId}` : '編號待產生'}</span></div></td>
            <td><div className="order-cell-stack"><div className="order-passenger"><strong>{item.passengerName || '未提供'}</strong><span className="order-passenger-number">{item.passengerNumber || '—'}</span></div><div className="order-driver">{item.carPlate && <span className="order-plate">{item.carPlate}</span>}<span>{item.driverName || '未提供'}</span></div></div></td>
            <td><div className="order-cell-stack"><div className="order-address"><span className="order-location-dot">●</span><span>{item.startAddress || '上車資訊未提供'}</span></div><div className="order-address"><span className="order-location-dot">▼</span><span>{item.endAddress || '未輸入'}</span></div></div></td>
            <td className="order-recorded-at"><div className="order-cell-stack"><span>{time(item.updatedAtMs)}</span><div className="order-tags"><span data-kind={item.isScheduled ? 'scheduled' : 'instant'}>{item.isScheduled ? '預約' : '即時'}</span></div>{item.isScheduled && <><span>T30：{time(item.t30Ms)}</span><span>上車：{time(item.scheduledTimeMs)}</span></>}</div></td>
            <td>{item.reason}</td>
          </tr>)}</tbody>
        </table></div>
        <ListPagination totalItems={result.total} currentPage={page} itemsPerPage={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
      </>}
    </div>}
  </section>;
}
