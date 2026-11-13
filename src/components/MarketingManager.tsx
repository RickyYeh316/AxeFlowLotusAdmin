'use client';

import { passengerNumber } from '../lib/passengerNumber';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { Plus, X, RefreshCw } from 'lucide-react';
import { auth } from '../firebase/config';
import { adminApi, AdminApiError } from '../lib/adminApi';

type Version = { seconds: number; nanoseconds: number };
type Distribution = { state: 'PENDING' | 'FAILED' | 'COMPLETED'; issuedCount: number; skippedCount: number; lastError: string };
type CouponRow = { id: string; type: number | null; title: string; description: string; discountAmount: number;
  status: string; startDate: string; endDate: string; expiresAtMillis: number | null; version: Version; notificationPreview?: string | null; distribution?: Distribution | null };
type Passenger = { id: string; passengerNumber?: string; name: string; phoneNumber: string; accountStatus: string; lineUid: string };
type Form = { type: number; title: string; description: string; discountAmount: string; startDate: string; endDate: string };
type Request = Record<string, unknown>;
const typeName = (type: number | null) => ({ 1: '新戶優惠券', 2: '活動優惠券', 3: '補償優惠券' }[type ?? 0] || '類型待確認');
const today = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
const emptyForm = (): Form => ({ type: 3, title: '', description: '', discountAmount: '', startDate: today(), endDate: '' });
const journalKey = (uid: string) => `lotus-coupon-operation:${uid}`;

export default function MarketingManager() {
  const [rows, setRows] = useState<CouponRow[]>([]), [loading, setLoading] = useState(true);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [history, setHistory] = useState(false), [page, setPage] = useState(1), [now, setNow] = useState(Date.now());
  const [sort, setSort] = useState<{ key: 'title' | 'type' | 'discountAmount' | 'startDate' | 'endDate'; ascending: boolean }>({ key: 'title', ascending: true });
  const [editing, setEditing] = useState<CouponRow | null | undefined>(undefined), [form, setForm] = useState<Form>(emptyForm);
  const [issuing, setIssuing] = useState<CouponRow | null>(null), [passengers, setPassengers] = useState<Passenger[]>([]);
  const [notifyPassenger, setNotifyPassenger] = useState(true);
  const [search, setSearch] = useState(''), [selected, setSelected] = useState(''), [membersLoading, setMembersLoading] = useState(false);
  const [busy, setBusy] = useState(false), [pending, setPending] = useState<Request | null>(null);
  const scope = useRef(0), requestLock = useRef(false), listSequence = useRef(0), listInFlight = useRef(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const modal = editing !== undefined || issuing !== null;

  const reload = useCallback(async (quiet = false) => {
    if (quiet && listInFlight.current) return;
    const generation = scope.current, sequence = ++listSequence.current;
    listInFlight.current = true;
    if (!quiet) setLoading(true); setError('');
    try {
      const all: CouponRow[] = []; let after: string | null = null;
      do {
        const result: { items: CouponRow[]; after: string | null } = await adminApi({ action: 'COUPONS', ...(after ? { after } : {}) });
        if (generation !== scope.current || sequence !== listSequence.current) return;
        all.push(...result.items); after = result.after;
      } while (after);
      setRows(all); setNow(Date.now());
    } catch (e) {
      if (generation === scope.current && sequence === listSequence.current) { if (!quiet) setRows([]); setError((e as Error).message); }
    } finally {
      if (sequence === listSequence.current) listInFlight.current = false;
      if (generation === scope.current && sequence === listSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      scope.current++; setRows([]); setPassengers([]); setEditing(undefined); setIssuing(null); setPending(null); setNotice('');
      if (!user) { setLoading(false); setError('請先使用管理員 Google 帳號登入。'); return; }
      try {
        const saved = sessionStorage.getItem(journalKey(user.uid));
        if (saved) { setPending(JSON.parse(saved)); setNotice('有一筆操作結果待確認，請重試原操作。'); }
      } catch { setError('無法讀取操作紀錄，請重新整理。'); return; }
      void reload();
    });
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { scope.current++; unsubscribe(); clearInterval(timer); };
  }, [reload]);

  const distributing = rows.some(row => row.distribution?.state === 'PENDING');
  useEffect(() => {
    if (!distributing || loading || busy || pending) return;
    const timer = setInterval(() => void reload(true), 5000);
    return () => clearInterval(timer);
  }, [distributing, loading, busy, pending, reload]);

  useEffect(() => {
    if (!modal) return;
    document.body.classList.add('modal-open');
    const previous = document.activeElement as HTMLElement | null;
    modalRef.current?.focus();
    return () => { document.body.classList.remove('modal-open'); previous?.focus(); };
  }, [modal]);

  async function mutate(input: Request) {
    if (requestLock.current || !auth.currentUser) return;
    const uid = auth.currentUser.uid, generation = scope.current;
    requestLock.current = true; setBusy(true); setError(''); setNotice('');
    try {
      // 先持久化同一operationId；換頁、重新整理或回應遺失後仍可安全重送。
      sessionStorage.setItem(journalKey(uid), JSON.stringify(input));
      setPending(input);
      await adminApi(input);
      sessionStorage.removeItem(journalKey(uid));
      if (generation !== scope.current) return;
      setPending(null); setEditing(undefined); setIssuing(null);
      setNotice(['COUPON_PUBLISH', 'COUPON_RETRY'].includes(String(input.action)) ? '已受理全體發券，後端會持續處理；可關閉此頁。'
        : input.action === 'COUPON_ISSUE' ? '已發送一張優惠券。' : '已儲存操作結果。');
      await reload();
    } catch (e) {
      if (generation !== scope.current) return;
      if (e instanceof AdminApiError && !e.uncertain) {
        sessionStorage.removeItem(journalKey(uid)); setPending(null);
      }
      setError((e as Error).message);
    } finally { requestLock.current = false; setBusy(false); }
  }
  function action(row: CouponRow, name: string, extra: Request = {}) {
    return mutate({ action: name, id: row.id, version: row.version, operationId: crypto.randomUUID(), ...extra });
  }
  function edit(row: CouponRow | null) {
    setError(''); setNotice(''); setEditing(row);
    setForm(row ? { type: row.type!, title: row.title, description: row.description, discountAmount: String(row.discountAmount), startDate: row.startDate, endDate: row.endDate } : emptyForm());
  }
  async function choosePassenger(row: CouponRow) {
    const generation = scope.current;
    setIssuing(row); setNotifyPassenger(true); setSelected(''); setSearch(''); setPassengers([]); setMembersLoading(true); setError(''); setNotice('');
    if (row.type === 2) { setMembersLoading(false); return; }
    try {
      const all: Passenger[] = []; let after: string | null = null;
      do {
        const result: { items: Passenger[]; after: string | null } = await adminApi({ action: 'USERS', filter: 'CURRENT', ...(after ? { after } : {}) });
        if (generation !== scope.current) return;
        all.push(...result.items); after = result.after;
      } while (after);
      setPassengers(all.filter(p => p.accountStatus === 'ACTIVE' && /^U[0-9a-f]{32}$/.test(p.lineUid)));
    } catch (e) { if (generation === scope.current) setError((e as Error).message); }
    finally { if (generation === scope.current) setMembersLoading(false); }
  }
  const filtered = useMemo(() => rows.filter(row => {
    const expired = row.type !== 1 && row.status !== 'draft' && row.expiresAtMillis !== null && now >= row.expiresAtMillis;
    return history ? expired : !expired;
  }).sort((a, b) => {
    const x = a[sort.key] ?? '', y = b[sort.key] ?? '';
    const value = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'zh-TW');
    return sort.ascending ? value : -value;
  }), [rows, history, now, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / 10)), currentPage = Math.min(page, pages);
  const disabled = busy || pending !== null;
  const memberMatches = passengers.filter(p => `${p.name} ${p.phoneNumber}`.toLowerCase().includes(search.trim().toLowerCase()) || passengerNumber(p.passengerNumber) === search.trim());
  const recipient = passengers.find(p => p.id === selected);
  const close = () => { if (!disabled) { setEditing(undefined); setIssuing(null); setError(''); } };
  const feedback = <>{error && <p role="alert" className="coupon-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    {pending && <button className="btn-secondary" disabled={busy} data-syslog="coupon.retry" onClick={() => void mutate(pending)}>{busy ? '處理中…' : '重試原操作（不重複發券）'}</button>}</>;

  return <>
    <div className="glass content-sheet animate-fade-in">
      <div className="sheet-title-row">
        <div><h2 className="sheet-title">優惠券管理 ({filtered.length})</h2>
          <p className="coupon-help">新戶自動配券、活動全體發券、指定乘客補償</p></div>
        <button className="btn-primary" disabled={disabled || loading} onClick={() => edit(null)}><Plus size={16} />新增優惠券草稿</button>
      </div>
      <div className="coupon-toolbar">
        <button className={history ? 'btn-secondary' : 'btn-primary'} onClick={() => { setHistory(false); setPage(1); }}>目前優惠券</button>
        <button className={history ? 'btn-primary' : 'btn-secondary'} onClick={() => { setHistory(true); setPage(1); }}>歷史優惠券</button>
        <button className="btn-secondary" disabled={loading || disabled} onClick={() => void reload()}><RefreshCw size={14} />重新整理</button>
      </div>
      {!modal && feedback}
      <p className="coupon-help">台灣時間：起始日 00:00:00 生效，到期日 23:59:59 截止。</p>
      {loading ? <p className="coupon-empty">載入優惠券中…</p> : !filtered.length ? <p className="coupon-empty">目前沒有{history ? '歷史優惠券' : '符合條件的優惠券'}。</p> : <>
        <div className="admin-table-container"><table className="admin-table"><thead><tr>
          {([['type', '類型'], ['title', '顯示名稱'], ['discountAmount', '折抵金額'], ['startDate', '有效起始日'], ['endDate', '有效到期日']] as const).map(([key, label]) =>
            <th key={key}><button className="coupon-sort" onClick={() => setSort({ key, ascending: sort.key === key ? !sort.ascending : true })}>{label}{sort.key === key ? sort.ascending ? ' ↑' : ' ↓' : ''}</button></th>)}
          <th>狀態</th><th>操作</th></tr></thead><tbody>
          {filtered.slice((currentPage - 1) * 10, currentPage * 10).map(row => <tr key={row.id}>
            <td>{typeName(row.type)}</td><td className="coupon-name"><strong>{row.title}</strong>{row.description && <p className="coupon-help">{row.description}</p>}</td>
            <td>{row.discountAmount} 元</td><td>{row.startDate || '尚未設定'}</td><td>{row.endDate || '尚未設定'}</td>
            <td>{row.type === 1 ? row.status === 'active' ? '啟用' : '停用' : row.status === 'draft' ? '草稿'
              : row.distribution?.state === 'PENDING' ? '發券中' : row.distribution?.state === 'FAILED' ? '發券中斷'
              : row.status === 'published' ? '已發券' : '狀態待確認'}
              {row.distribution && <p className="coupon-help">已發 {row.distribution.issuedCount} 張 · 略過 {row.distribution.skippedCount} 筆</p>}
              {row.distribution?.lastError && <p className="coupon-help">{row.distribution.lastError}</p>}
            </td>
            <td><div className="coupon-actions">
              {(row.type === 1 || ([2, 3].includes(row.type!) && row.status === 'draft')) && <button className="btn-secondary" disabled={disabled} onClick={() => edit(row)}>編輯</button>}
              {row.type === 1 ? <button className="btn-secondary" disabled={disabled} onClick={() => {
                if (window.confirm(`${row.status === 'active' ? '停用後新戶仍可正常註冊，但不配券' : '啟用新戶自動配券'}；已領券保持。確定繼續？`)) void action(row, 'COUPON_TOGGLE', { enabled: row.status !== 'active' });
              }}>{row.status === 'active' ? '停用' : '啟用'}</button> : <>
                {[2, 3].includes(row.type!) && row.status === 'draft' && <button className="btn-secondary" disabled={disabled} onClick={() => { if (window.confirm(`刪除草稿「${row.title}」？`)) void action(row, 'COUPON_DELETE'); }}>刪除</button>}
                {row.type === 3 && ['draft', 'published'].includes(row.status) && <button className="btn-primary" disabled={disabled || row.expiresAtMillis === null || now >= row.expiresAtMillis} onClick={() => void choosePassenger(row)}>發券</button>}
                {row.type === 2 && row.status === 'draft' && <button className="btn-primary" disabled={disabled || row.expiresAtMillis === null || now >= row.expiresAtMillis} onClick={() => void choosePassenger(row)}>發券</button>}
                {row.type === 2 && row.distribution?.state === 'FAILED' && <button className="btn-primary" disabled={disabled} onClick={() => void action(row, 'COUPON_RETRY')}>重試發券</button>}
              </>}
            </div></td>
          </tr>)}
        </tbody></table></div>
        <div className="coupon-toolbar"><button className="btn-secondary" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>上一頁</button>
          <span>{currentPage} / {pages}</span><button className="btn-secondary" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>下一頁</button></div>
      </>}
    </div>
    {modal && <div className="modal-overlay coupon-overlay"><div ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="coupon-dialog-title" className="glass modal-content coupon-modal" onKeyDown={e => {
      if (e.key === 'Escape') close();
      if (e.key === 'Tab') {
        const nodes = Array.from(modalRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)') || []);
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === modalRef.current)) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || document.activeElement === modalRef.current)) { e.preventDefault(); first?.focus(); }
      }
    }}>
      <div className="modal-header"><h3 id="coupon-dialog-title" className="modal-title">{issuing ? issuing.type === 2 ? '發券給全體乘客' : '發券給乘客' : editing ? editing.type === 1 ? '編輯新戶優惠券' : '編輯優惠券草稿' : '新增優惠券草稿'}</h3>
        <button className="tab-close-btn" aria-label="關閉" disabled={disabled} onClick={close}><X size={18} /></button></div>
      {feedback}
      {issuing ? <form onSubmit={e => {
        e.preventDefault(); if (disabled || (notifyPassenger && !issuing.notificationPreview)) return;
        if (issuing.type === 2) {
          if (window.confirm(`發送「${issuing.title}」${issuing.discountAmount}元券給全體有效乘客，每人一張？此活動只能發一次，發出後不回收。`)) void action(issuing, 'COUPON_PUBLISH', { notifyPassenger });
          return;
        }
        if (!recipient) return;
        if (window.confirm(`發送「${issuing.title}」${issuing.discountAmount}元券一張給「${recipient.name} · ${passengerNumber(recipient.passengerNumber) || '—'}」？發出後不回收。`)) void action(issuing, 'COUPON_ISSUE', { userId: selected, notifyPassenger });
      }}>
        <p><strong>{issuing.title}</strong> · 折抵 {issuing.discountAmount} 元</p>
        <p className="coupon-help">{issuing.startDate} ～ {issuing.endDate}（台灣時間）</p>
        {issuing.type === 2 ? <p className="coupon-help">每位正式有效乘客各一張；停權、已刪除與測試帳號略過。開始發券後的新戶不補發。此活動只能發一次，發出後不回收。<br />發券在背景處理，可關閉此頁。</p> : <>
        <p className="coupon-help">每次確認發送一張；同一乘客可再次獲得，發出後不回收。</p>
        <label className="form-group">搜尋乘客<input className="form-input" value={search} disabled={disabled} onChange={e => setSearch(e.target.value)} placeholder="姓名、電話或乘客編號" /></label>
        {membersLoading ? <p>載入乘客中…</p> : <label className="form-group">選擇乘客<select className="form-select" required value={selected} disabled={disabled} onChange={e => setSelected(e.target.value)}>
          <option value="">請選擇乘客</option>
          {recipient && !memberMatches.some(p => p.id === recipient.id) && <option value={recipient.id}>{recipient.name} · {passengerNumber(recipient.passengerNumber) || '—'}（已選擇）</option>}
          {memberMatches.map(p => <option key={p.id} value={p.id}>{p.name || '未命名'} · {passengerNumber(p.passengerNumber) || '—'}</option>)}
        </select></label>}</>}
        <label className="coupon-notify"><input type="checkbox" checked={notifyPassenger} disabled={disabled} onChange={e => setNotifyPassenger(e.target.checked)} />通知乘客</label>
        {notifyPassenger && <section className="coupon-preview" aria-label="LINE 訊息預覽">
          <p className="coupon-help">LINE 訊息預覽</p>
          <p className="coupon-preview-text">{issuing.notificationPreview || '訊息預覽尚未取得，請關閉後重新整理。'}</p>
          <p className="coupon-help">配券成功後發送；通知失敗不補送，優惠券仍保留。</p>
        </section>}
        <div className="modal-footer"><button type="button" className="btn-secondary" disabled={disabled} onClick={close}>取消</button><button className="btn-primary" disabled={disabled || (notifyPassenger && !issuing.notificationPreview) || (issuing.type !== 2 && (membersLoading || !recipient))} data-syslog="coupon.issue_confirm">確認發券</button></div>
      </form> : <form onSubmit={e => {
        e.preventDefault(); if (disabled) return;
        const amount = Number(form.discountAmount);
        if (!Number.isSafeInteger(amount) || amount <= 0) { setError('折抵金額必須是正整數。'); return; }
        if (form.endDate < form.startDate) { setError('到期日不可早於起始日。'); return; }
        void mutate({ action: editing ? 'COUPON_UPDATE' : 'COUPON_CREATE', operationId: crypto.randomUUID(),
          ...(editing ? { id: editing.id, version: editing.version } : {}), ...form, discountAmount: amount });
      }}>
        <fieldset disabled={disabled} className="coupon-fields">
          <label className="form-group">類型<select className="form-select" disabled={!!editing} value={form.type} onChange={e => setForm({ ...form, type: Number(e.target.value) })}>
            {editing?.type === 1 && <option value={1}>新戶優惠券</option>}<option value={2}>活動優惠券</option><option value={3}>補償優惠券</option></select></label>
          <label className="form-group">顯示名稱<input className="form-input" required maxLength={256} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="例如：2027來花蓮跨年" /></label>
          <label className="form-group">使用說明（選填）<textarea className="form-textarea" rows={2} maxLength={2000} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
          <label className="form-group">折抵金額（元）<input className="form-input" type="number" required min={1} step={1} value={form.discountAmount} onChange={e => setForm({ ...form, discountAmount: e.target.value })} /></label>
          <div className="form-row"><label className="form-group">有效起始日<input className="form-input" type="date" required value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} /></label>
            <label className="form-group">有效到期日<input className="form-input" type="date" required min={form.startDate || undefined} value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} /></label></div>
          <p className="coupon-help">台灣時間：起始日 00:00:00 生效，到期日 23:59:59 截止。{editing?.type === 1 ? '修改只影響未來新戶配券，已領券保持。' : '儲存草稿後，再從列表執行發券。'}</p>
        </fieldset>
        <div className="modal-footer"><button type="button" className="btn-secondary" disabled={disabled} onClick={close}>取消</button><button className="btn-primary" disabled={disabled}>{busy ? '儲存中…' : editing?.type === 1 ? '儲存設定' : '儲存草稿'}</button></div>
      </form>}
    </div></div>}
  </>;
}
