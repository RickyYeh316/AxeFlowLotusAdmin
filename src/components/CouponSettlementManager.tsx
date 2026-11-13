'use client';

import { passengerNumber } from '../lib/passengerNumber';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { Search, RefreshCw, X } from 'lucide-react';
import { auth } from '../firebase/config';
import { adminApi, AdminApiError } from '../lib/adminApi';

type Driver = { id: string; name: string; carPlate: string };
type Row = { id: string; name: string; amount: number; redeemedAt: number; readableId: string; orderId: string;
  driverId: string; driverName: string; carPlate: string; passengerId: string; passengerName: string; passengerNumber?: string; settledAt: number | null; batchId: string };
type Review = { batchId: string; totalAmount: number; count: number; version: { seconds: number; nanoseconds: number } };
type Preview = { driverId: string; driverName: string; carPlate: string; review: Review };
type Pending = { preview: Preview; request: { action: 'COUPON_CHECKOUT'; operationId: string; driverId: string; review: Review } };
type Cursor = { driverId: string; itemId?: string; batchId?: string; version?: { seconds: number; nanoseconds: number } | null };
type View = 'unsettled' | 'settled' | 'all';
type Field = 'driver' | 'passenger' | 'coupon' | 'order';
const money = (v: number) => v.toLocaleString('zh-TW');
const date = (v: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit',
  day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(v).replaceAll('-', '/');
const journalKey = (uid: string) => `lotus-coupon-checkout:${uid}`;

export default function CouponSettlementManager() {
  const [rows, setRows] = useState<Row[]>([]), [drivers, setDrivers] = useState<Driver[]>([]);
  const [view, setView] = useState<View>('unsettled'), [field, setField] = useState<Field>('driver');
  const [query, setQuery] = useState(''), [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null), [pending, setPending] = useState<Pending | null>(null);
  const [journalBlocked, setJournalBlocked] = useState(false), [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: keyof Row; ascending: boolean }>({ key: 'redeemedAt', ascending: false });
  const scope = useRef(0), sequence = useRef(0), requestLock = useRef(false);
  const dialog = useRef<HTMLDivElement>(null);

  const reload = useCallback(async () => {
    const generation = scope.current, request = ++sequence.current;
    setLoading(true); setError(''); setRows([]); setDrivers([]);
    try {
      const all: Row[] = [], people = new Map<string, Driver>(), seen = new Set<string>();
      let after: Cursor | null = null;
      do {
        const result: { items: Row[]; driver: Driver | null; after: Cursor | null } = await adminApi({ action: 'COUPON_LEDGER', ...(after ? { after } : {}) });
        if (generation !== scope.current || request !== sequence.current) return;
        all.push(...result.items);
        if (result.driver) people.set(result.driver.id, result.driver);
        after = result.after;
        if (after) { const key = JSON.stringify(after); if (seen.has(key)) throw new Error('讀取未完成，請重新整理。'); seen.add(key); }
      } while (after);
      setRows(all); setDrivers([...people.values()]); setPage(1);
    } catch (e) {
      if (generation === scope.current && request === sequence.current) setError((e as Error).message);
    } finally {
      if (generation === scope.current && request === sequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      scope.current++; sequence.current++; requestLock.current = false;
      setRows([]); setDrivers([]); setPreview(null); setPending(null); setBusy(false); setSelected(''); setQuery('');
      setNotice(''); setError(''); setJournalBlocked(false); setSignedIn(!!user);
      if (!user) { setLoading(false); setError('請先使用管理員 Google 帳號登入。'); return; }
      try {
        const raw = sessionStorage.getItem(journalKey(user.uid));
        if (raw) {
          const saved = JSON.parse(raw) as Pending;
          if (saved.request?.action !== 'COUPON_CHECKOUT' || !saved.request.operationId || !saved.preview?.review
            || saved.request.driverId !== saved.preview.driverId) throw new Error('Invalid journal');
          setPending(saved); setPreview(saved.preview);
          setNotice('有一筆結帳結果待確認，請重試原操作；不需要再次付現。');
        }
      } catch { setJournalBlocked(true); setLoading(false); setError('結帳操作紀錄無法讀取，請先確認瀏覽器儲存狀態。'); return; }
      void reload();
    });
    return () => { scope.current++; sequence.current++; unsubscribe(); };
  }, [reload]);

  const modalOpen = preview !== null;
  useEffect(() => {
    if (!modalOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    document.body.classList.add('modal-open'); dialog.current?.focus();
    return () => { document.body.classList.remove('modal-open'); previous?.focus(); };
  }, [modalOpen]);

  const locked = !signedIn || busy || pending !== null || journalBlocked;
  const term = query.trim().toLowerCase();
  const chosen = drivers.find(d => d.id === selected);
  const matches = drivers.filter(d => `${d.name} ${d.carPlate}`.toLowerCase().includes(term));
  const filtered = useMemo(() => rows.filter(row => {
    if (view === 'unsettled' && row.settledAt !== null || view === 'settled' && row.settledAt === null) return false;
    if (field === 'driver') return selected ? row.driverId === selected : `${row.driverName} ${row.carPlate}`.toLowerCase().includes(term);
    if (field === 'passenger') return row.passengerName.toLowerCase().includes(term) || passengerNumber(row.passengerNumber) === term;
    const value = field === 'coupon' ? row.name : row.readableId;
    return value.toLowerCase().includes(field === 'order' ? term.replace(/^#/, '') : term);
  }), [rows, view, field, selected, term]);
  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const x = a[sort.key], y = b[sort.key];
    const compared = typeof x === 'number' && typeof y === 'number' ? x - y
      : x === null ? -1 : y === null ? 1 : String(x).localeCompare(String(y), 'zh-TW');
    return (sort.ascending ? compared : -compared) || a.id.localeCompare(b.id);
  }), [filtered, sort]);
  const total = filtered.reduce((sum, row) => sum + row.amount, 0);
  const pages = Math.max(1, Math.ceil(sorted.length / 10)), currentPage = Math.min(page, pages);
  const canCheckout = !locked && !loading && !error && view === 'unsettled' && field === 'driver' && !!chosen && total > 0;
  const resetSearch = (value: Field) => { setField(value); setQuery(''); setSelected(''); setPage(1); setNotice(''); };

  const openCheckout = async () => {
    if (!canCheckout || requestLock.current) return;
    requestLock.current = true; setBusy(true); setError(''); setNotice('');
    const generation = scope.current;
    try {
      const value = await adminApi<Preview>({ action: 'COUPON_CHECKOUT_PREVIEW', driverId: selected });
      if (generation !== scope.current) return;
      if (value.review.totalAmount !== total || value.review.count !== filtered.length
        || filtered.some(row => row.batchId !== value.review.batchId)) {
        await reload();
        if (generation === scope.current) setNotice('待結帳資料已更新，請核對最新金額後再按結帳。');
      } else setPreview(value);
    } catch (e) { if (generation === scope.current) setError((e as Error).message); }
    finally { if (generation === scope.current) { requestLock.current = false; setBusy(false); } }
  };

  const checkout = async (saved?: Pending) => {
    const user = auth.currentUser;
    if (!user || requestLock.current || (!saved && !preview)) return;
    const generation = scope.current;
    const operation: Pending = saved ?? { preview: preview!, request: { action: 'COUPON_CHECKOUT', operationId: crypto.randomUUID(), driverId: preview!.driverId, review: preview!.review } };
    // 先持久保存同一操作；儲存失敗不發送，回應遺失可跨換頁重試。
    try { sessionStorage.setItem(journalKey(user.uid), JSON.stringify(operation)); }
    catch { setError('無法保存結帳操作，請確認瀏覽器儲存可用後再試。'); return; }
    requestLock.current = true; setBusy(true); setPending(operation); setError('');
    try {
      const result = await adminApi<{ totalAmount: number; count: number; settledAtMillis: number }>({ ...operation.request });
      if (generation !== scope.current) return;
      sessionStorage.removeItem(journalKey(user.uid));
      setPending(null); setPreview(null);
      setNotice(`已結帳 ${money(result.totalAmount)} 元，共 ${result.count} 張。結帳時間：${date(result.settledAtMillis)}`);
      await reload();
    } catch (e) {
      if (generation !== scope.current) return;
      if (e instanceof AdminApiError && !e.uncertain) {
        // 確定被拒絕才解除本次操作；409不會寫入本次帳務。
        try { sessionStorage.removeItem(journalKey(user.uid)); setPending(null); setPreview(null); }
        catch { setJournalBlocked(true); }
      }
      setError((e as Error).message);
    } finally { if (generation === scope.current) { requestLock.current = false; setBusy(false); } }
  };
  const close = () => { if (!busy && !pending) setPreview(null); };
  const headers: [keyof Row, string][] = [['name', '優惠券名稱'], ['amount', '折抵金額'], ['redeemedAt', '使用時間'],
    ['readableId', '訂單編號'], ['driverName', '司機'], ['passengerName', '乘客'], ['settledAt', '結帳時間']];
  const feedback = <>{error && <p role="alert" className="coupon-error">{error}</p>}{notice && <p role="status" className="coupon-help">{notice}</p>}</>;

  return <>
    <div className="glass content-sheet animate-fade-in">
      <div className="sheet-title-row">
        <h2 className="sheet-title">優惠券結帳{loading ? '' : ` (${filtered.length})`}</h2>
        <div className="checkout-action"><button className="btn-primary" disabled={!canCheckout} data-syslog="settlement.open" onClick={() => void openCheckout()}>結帳</button>
          {!canCheckout && !loading && <span className="coupon-help">請選定單一司機並切至未結帳；有待結款才可結帳。</span>}</div>
      </div>
      <div className="coupon-toolbar">
        {([['unsettled', '未結帳'], ['settled', '已結帳'], ['all', '全部']] as const).map(([value, label]) =>
          <button key={value} className={`category-pill ${view === value ? 'active' : ''}`} aria-pressed={view === value} disabled={locked}
            onClick={() => { setView(value); setPage(1); }}>{label}</button>)}
        <button className="btn-secondary" disabled={locked || loading} data-syslog="settlement.refresh" onClick={() => void reload()}><RefreshCw size={14} />重新整理</button>
      </div>
      <div className="checkout-filters">
        <label>搜尋欄位 <select className="form-select" aria-label="搜尋欄位" value={field} disabled={locked} onChange={e => resetSearch(e.target.value as Field)}>
          <option value="driver">司機</option><option value="passenger">乘客</option><option value="coupon">優惠券名稱</option><option value="order">訂單編號</option>
        </select></label>
        {chosen && field === 'driver' ? <div className="checkout-selected"><span>{chosen.name} · {chosen.carPlate || '車牌未提供'}</span>
          <button className="btn-secondary" aria-label="清除司機" disabled={locked} onClick={() => { setSelected(''); setQuery(''); setPage(1); }}><X size={16} /></button></div>
          : <div className="search-wrapper checkout-search"><span className="search-icon"><Search size={16} /></span>
            <input className="search-input" aria-label="搜尋內容" value={query} disabled={locked} placeholder={field === 'driver' ? '輸入司機姓名或車牌，再選定司機' : field === 'passenger' ? '輸入乘客姓名或乘客編號' : field === 'coupon' ? '輸入優惠券名稱' : '輸入訂單編號'}
              onChange={e => { setQuery(e.target.value); setSelected(''); setPage(1); }} /></div>}
      </div>
      {field === 'driver' && term && !selected && !loading && <div className="checkout-candidates" aria-label="符合的司機">
        {matches.length ? matches.map(driver => <button key={driver.id} className="btn-secondary" disabled={locked}
          onClick={() => { setSelected(driver.id); setQuery(''); setPage(1); }}>{driver.name} · {driver.carPlate || driver.id}</button>) : <span className="coupon-help">沒有符合的司機。</span>}
      </div>}
      {!modalOpen && feedback}
      {loading ? <p className="coupon-empty" role="status">讀取中…</p> : <>
        {!error && <p className="checkout-summary">{canCheckout ? '待結金額' : view === 'unsettled' && field === 'driver' && !term ? '未結帳合計' : '查詢合計'}：{money(total)} 元　共 {filtered.length} 張</p>}
        {!filtered.length ? <p className="coupon-empty">{error ? '資料尚未完整載入，請重新整理。' : '目前沒有符合條件的優惠券。'}</p> : <>
          <div className="admin-table-container"><table className="admin-table checkout-table"><thead><tr>
            {headers.map(([key, label]) => <th key={key}><button className="coupon-sort" onClick={() => { setSort({ key, ascending: sort.key === key ? !sort.ascending : true }); setPage(1); }}>
              {label}{sort.key === key ? sort.ascending ? ' ↑' : ' ↓' : ''}</button></th>)}
          </tr></thead><tbody>{sorted.slice((currentPage - 1) * 10, currentPage * 10).map(row => <tr key={row.id}>
            <td className="coupon-name">{row.name}</td><td>{money(row.amount)} 元</td><td>{date(row.redeemedAt)}</td>
            <td>{row.readableId ? `#${row.readableId}` : '尚未提供'}</td><td>{row.driverName}<p className="coupon-help">{row.carPlate || '車牌未提供'}</p></td>
            <td>{row.passengerName}<p className="coupon-help">乘客編號：{passengerNumber(row.passengerNumber) || '—'}</p></td><td>{row.settledAt === null ? '未結帳' : date(row.settledAt)}</td>
          </tr>)}</tbody></table></div>
          <div className="coupon-toolbar"><button className="btn-secondary" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>上一頁</button>
            <span>{currentPage} / {pages}</span><button className="btn-secondary" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>下一頁</button></div>
        </>}
      </>}
    </div>
    {preview && <div className="modal-overlay coupon-overlay"><div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="checkout-title"
      className="glass modal-content coupon-modal" onKeyDown={e => {
        if (e.key === 'Escape') { e.preventDefault(); close(); }
        if (e.key !== 'Tab') return;
        const nodes = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? [])];
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (!first) { e.preventDefault(); return; }
        if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { e.preventDefault(); first.focus(); }
      }}>
      <div className="modal-header"><h3 id="checkout-title" className="modal-title">確認優惠券結帳</h3>
        <button className="tab-close-btn" aria-label="關閉" disabled={busy || !!pending} onClick={close}><X size={18} /></button></div>
      <p>{preview.driverName} · {preview.carPlate || '車牌未提供'}</p>
      <p className="checkout-summary">待結金額：{money(preview.review.totalAmount)} 元　共 {preview.review.count} 張</p>
      <p className="coupon-help">本次將結帳這位司機的全部未結帳優惠券。請先付現給司機，再確認結帳。</p>
      {feedback}
      <div className="modal-footer"><button className="btn-secondary" disabled={busy || !!pending} onClick={close}>取消</button>
        <button className="btn-primary" disabled={busy || journalBlocked} data-syslog="settlement.confirm" onClick={() => void checkout(pending ?? undefined)}>
          {busy ? '處理中…' : pending ? '重試原操作（不重複結帳）' : '已付現，確認結帳'}</button></div>
    </div></div>}
  </>;
}
