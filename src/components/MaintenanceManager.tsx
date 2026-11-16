'use client';

import {useEffect, useRef, useState} from 'react';
import {onAuthStateChanged} from 'firebase/auth';
import {auth} from '../firebase/config';
import {adminApi} from '../lib/adminApi';
import {recordSystemLog} from '../lib/systemLogs/client';
import {orderGroup, orderStatusText} from '../lib/orderPresentation';
import {OrderStatus} from '../types';
import ListPagination from './ListPagination';

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
const label = (phase: Phase) => phase === 'PRE' ? '維護半開始（預覽）' : '維護開始（預覽）';

export default function MaintenanceManager() {
  const [start, setStart] = useState(''), [end, setEnd] = useState('');
  const [result, setResult] = useState<Result | null>(null), [message, setMessage] = useState('');
  const [busy, setBusy] = useState<Phase | null>(null), [ready, setReady] = useState(false);
  const [stale, setStale] = useState(false), [page, setPage] = useState(1), [pageSize, setPageSize] = useState(10);
  const scope = useRef(0), owner = useRef<string | null>(null), flight = useRef(false), edits = useRef(0);
  useEffect(() => {
    const invalidate = () => { scope.current++; owner.current = null; };
    const stop = onAuthStateChanged(auth, user => {
      scope.current++; owner.current = user?.uid ?? null; flight.current = false;
      setReady(!!user); setResult(null); setBusy(null); setMessage(''); setStale(false);
      setStart(''); setEnd(''); setPage(1);
    });
    return () => { invalidate(); stop(); };
  }, []);
  function edit(which: 'start' | 'end', value: string) {
    edits.current++;
    (which === 'start' ? setStart : setEnd)(value);
    if (result || flight.current) setStale(true);
    setMessage('');
    recordSystemLog('UI_CHANGE', {control: `maintenance.${which}`});
  }
  async function preview(phase: Phase) {
    const uid = owner.current, generation = scope.current, editVersion = edits.current;
    if (!uid || flight.current || auth.currentUser?.uid !== uid) return;
    const plannedStartMs = parseTime(start), plannedEndMs = parseTime(end);
    if (!Number.isFinite(plannedStartMs) || !Number.isFinite(plannedEndMs) || plannedEndMs <= plannedStartMs) {
      setMessage('請設定有效的維護開始及結束時間，結束須晚於開始。'); return;
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
      if (current()) setMessage(`預覽未完成，未變更訂單。${error instanceof Error ? error.message : '請重新預覽。'}`);
    } finally {
      if (current()) { flight.current = false; setBusy(null); }
    }
  }
  return <section className="glass content-sheet animate-fade-in maintenance-manager">
    <div className="sheet-title-row"><h2 className="sheet-title">維護</h2><span className="maintenance-status">維護控制尚未啟用</span></div>
    <div className="hint-times maintenance-times">
      <label>預計維護開始時間<input type="datetime-local" step="60" value={start} disabled={!ready} onChange={e => edit('start', e.target.value)} /></label>
      <label>預計維護結束時間<input type="datetime-local" step="60" value={end} disabled={!ready} onChange={e => edit('end', e.target.value)} /></label>
    </div>
    <div className="hint-actions maintenance-actions">
      <button type="button" className="btn-secondary" data-syslog="maintenance.preview_pre" disabled={!ready || !!busy} onClick={() => void preview('PRE')}>維護半開始（預覽）</button>
      <button type="button" className="btn-secondary" disabled>維護半開始（只出不進）</button>
      <button type="button" className="btn-secondary" data-syslog="maintenance.preview_start" disabled={!ready || !!busy} onClick={() => void preview('START')}>維護開始（預覽）</button>
      <button type="button" className="btn-secondary" disabled>維護開始</button>
      <button type="button" className="btn-secondary" disabled>維護結束</button>
    </div>
    <p className="hint-guidance">目前提供訂單預覽，三個維護操作尚未開放。預計時間供查詢使用，到時不會自動切換營運狀態。</p>
    {message && <p className="hint-feedback" role="alert">{message}</p>}
    {busy && <p role="status">正在查詢{label(busy)}…</p>}
    {stale && <p className="maintenance-stale" role="status">時間已變更，請重新預覽。</p>}
    {!result && !busy && <p className="hint-guidance">設定維護時間後，選擇預覽受影響的訂單。</p>}
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
