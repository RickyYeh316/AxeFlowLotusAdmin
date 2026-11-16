'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase/config';
import { adminApi, AdminApiError } from '../lib/adminApi';

type Hint = { start: number; end: number; title: string; detail: string };
type Result = { hint: Hint | null; revision: string | null; enabled: boolean };
type Request = { operationId: string; expectedRevision: string | null } & (
  { action: 'HINT_AREA_SAVE'; hint: Hint | null } | { action: 'HINT_AREA_SET_ENABLED'; enabled: boolean }
);
type Pending = { owner: string; request: Request };
const key = (uid: string) => `lotus-hint-area:${uid}`;
const displayTime = (value: number) => new Date(value + 8 * 3600000).toISOString().slice(0, 16);
function parseTime(value: string) {
  const result = Date.parse(`${value}:00+08:00`);
  return Number.isFinite(result) && displayTime(result) === value ? result : NaN;
}

export default function HintAreaManager() {
  const [saved, setSaved] = useState<Result>({ hint: null, revision: null, enabled: false });
  const [start, setStart] = useState(''), [end, setEnd] = useState('');
  const [title, setTitle] = useState(''), [detail, setDetail] = useState('');
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(''), [pending, setPending] = useState<Pending | null>(null);
  const [now, setNow] = useState(0), [preview, setPreview] = useState(false);
  const scope = useRef(0), owner = useRef<string | null>(null), flight = useRef(false);
  const pendingRef = useRef<Pending | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  const apply = useCallback((result: Result) => {
    setSaved(result);
    setStart(result.hint ? displayTime(result.hint.start) : '');
    setEnd(result.hint ? displayTime(result.hint.end) : '');
    setTitle(result.hint?.title ?? ''); setDetail(result.hint?.detail ?? '');
    setReady(true);
  }, []);
  const load = useCallback(async () => {
    const uid = owner.current, generation = scope.current;
    if (!uid || flight.current || pendingRef.current) return;
    flight.current = true; setBusy(true); setReady(false); setMessage('');
    try {
      const result = await adminApi<Result>({ action: 'HINT_AREA_GET' });
      if (generation === scope.current && auth.currentUser?.uid === uid) apply(result);
    } catch (error) {
      if (generation === scope.current) setMessage(error instanceof Error ? error.message : '公告讀取失敗，請重新整理。');
    } finally {
      if (generation === scope.current) { flight.current = false; setBusy(false); }
    }
  }, [apply]);
  useEffect(() => {
    const invalidate = () => { scope.current++; owner.current = null; };
    const stop = onAuthStateChanged(auth, user => {
      setNow(Date.now());
      scope.current++; owner.current = user?.uid ?? null; flight.current = false; pendingRef.current = null;
      setPending(null); setReady(false); setBusy(false); setMessage(''); setPreview(false);
      setSaved({ hint: null, revision: null, enabled: false }); setStart(''); setEnd(''); setTitle(''); setDetail('');
      if (!user) return;
      try {
        const raw = sessionStorage.getItem(key(user.uid));
        if (raw) {
          const value: Pending = JSON.parse(raw);
          if (value.owner !== user.uid || !['HINT_AREA_SAVE', 'HINT_AREA_SET_ENABLED'].includes(value.request?.action) || !value.request.operationId)
            throw Error('Invalid journal');
          pendingRef.current = value; setPending(value);
          setMessage('上次公告操作結果待確認，請重試原操作。');
        } else void load();
      } catch { setMessage('無法讀取操作紀錄，請確認瀏覽器儲存空間後重新開啟此頁。'); }
    });
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { invalidate(); stop(); clearInterval(timer); };
  }, [load]);
  useEffect(() => {
    if (preview && !dialog.current?.open) dialog.current?.showModal();
    if (!preview) dialog.current?.close();
  }, [preview]);

  async function send(value: Pending, preserveEdits = false) {
    const generation = scope.current;
    const current = () => generation === scope.current && owner.current === value.owner && auth.currentUser?.uid === value.owner;
    if (!current() || flight.current) return;
    flight.current = true; setBusy(true); setMessage('');
    try {
      const changed = await adminApi<Result>(value.request);
      if (!current()) return;
      sessionStorage.removeItem(key(value.owner)); pendingRef.current = null; setPending(null);
      // 回放舊操作可能已有更新版本；成功後重新取得目前公告。
      const latest = await adminApi<Result>({ action: 'HINT_AREA_GET' });
      if (!current()) return;
      if (preserveEdits && latest.revision === changed.revision) { setSaved(latest); setReady(true); } else apply(latest);
      setMessage(value.request.action === 'HINT_AREA_SET_ENABLED'
        ? value.request.enabled ? '公告已啟用。' : '公告已停用。'
        : value.request.hint ? '公告已儲存。' : '公告已停用。');
    } catch (error) {
      if (!current()) return;
      if (error instanceof AdminApiError && !error.uncertain) {
        try { sessionStorage.removeItem(key(value.owner)); pendingRef.current = null; setPending(null); } catch { /* 保留原請求供安全重試。 */ }
        setReady(false); setMessage(error.message);
      } else {
        setReady(false);
        setMessage(pendingRef.current ? '操作結果待確認，請重試原操作。' : '公告已送出，請重新整理確認目前內容。');
      }
    } finally { if (current()) { flight.current = false; setBusy(false); } }
  }
  function save() {
    const uid = owner.current;
    if (!uid || auth.currentUser?.uid !== uid || !ready || flight.current || pendingRef.current) return;
    const hint = { start: parseTime(start), end: parseTime(end), title: title.trim(), detail: detail.trim() };
    if (hint && (!Number.isFinite(hint.start) || !Number.isFinite(hint.end) || hint.start >= hint.end)) {
      setMessage('請填寫有效時間，結束時間須晚於開始時間。'); return;
    }
    if (hint && (!hint.title || !hint.detail || hint.title.length > 120 || hint.detail.length > 6000)) {
      setMessage('請填寫標題（最多120字元）與完整內容（最多6000字元）。'); return;
    }
    const value: Pending = { owner: uid, request: { action: 'HINT_AREA_SAVE', operationId: crypto.randomUUID(), expectedRevision: saved.revision, hint } };
    submit(value);
  }
  function setEnabled(enabled: boolean) {
    const uid = owner.current;
    if (!uid || auth.currentUser?.uid !== uid || !ready || flight.current || pendingRef.current || !saved.hint) return;
    if (enabled && dirty) { setMessage('內容尚未儲存，請先儲存再啟用。'); return; }
    submit({ owner: uid, request: { action: 'HINT_AREA_SET_ENABLED', operationId: crypto.randomUUID(), expectedRevision: saved.revision, enabled } }, true);
  }
  function submit(value: Pending, preserveEdits = false) {
    try { sessionStorage.setItem(key(value.owner), JSON.stringify(value)); }
    catch { setMessage('無法保存操作紀錄，尚未送出公告。請確認瀏覽器儲存空間後重試。'); return; }
    pendingRef.current = value; setPending(value); void send(value, preserveEdits);
  }
  const disabled = !ready || busy || !!pending;
  const dirty = !!saved.hint && (start !== displayTime(saved.hint.start) || end !== displayTime(saved.hint.end)
    || title !== saved.hint.title || detail !== saved.hint.detail);
  const status = !ready ? '等待讀取' : !saved.hint ? '尚無公告'
    : !saved.enabled ? '已停用' : now < saved.hint.start ? '已啟用・尚未開始' : now >= saved.hint.end ? '已結束' : '顯示中';
  return <section className="glass content-sheet animate-fade-in hint-manager">
    <div className="sheet-title-row">
      <h2 className="sheet-title">公告 &amp; 維護</h2>
      <button className="btn-secondary" data-syslog="hint.refresh" disabled={busy || !!pending} onClick={() => void load()}>重新整理</button>
    </div>
    <p className="hint-status" role="status">{status}</p>
    <p className="hint-guidance">{saved.enabled ? '啟用中，儲存後會更新雙端公告。' : '儲存保留內容，啟用後才會依公告時間顯示。'}{dirty && ' 內容尚未儲存。'}</p>
    {message && <p className="hint-feedback" role="status">{message}</p>}
    {pending && <button className="btn-secondary" data-syslog="hint.retry" disabled={busy} onClick={() => void send(pending)}>重試原操作</button>}
    <form onSubmit={event => { event.preventDefault(); save(); }}>
      <fieldset disabled={disabled}>
        <div className="hint-times">
          <label>公告開始時間<input type="datetime-local" step="60" value={start} required onChange={e => setStart(e.target.value)} /></label>
          <label>公告結束時間<input type="datetime-local" step="60" value={end} required onChange={e => setEnd(e.target.value)} /></label>
        </div>
        <label>標題<input value={title} maxLength={120} required onChange={e => setTitle(e.target.value)} /></label>
        <label>完整內容<textarea value={detail} maxLength={6000} rows={8} required onChange={e => setDetail(e.target.value)} /></label>
      </fieldset>
      <div className="hint-actions">
        <button type="submit" className="btn-primary" data-syslog="hint.save" disabled={disabled}>儲存</button>
        <button type="button" className="btn-secondary" data-syslog="hint.preview" disabled={!title.trim() || !detail.trim() || disabled} onClick={() => setPreview(true)}>預覽</button>
        <button type="button" className="btn-secondary" data-syslog="hint.enable" disabled={disabled || !saved.hint || saved.enabled || dirty} onClick={() => setEnabled(true)}>啟用</button>
        <button type="button" className="btn-secondary" data-syslog="hint.disable" disabled={disabled || !saved.hint || !saved.enabled} onClick={() => setEnabled(false)}>停用</button>
      </div>
    </form>
    <dialog ref={dialog} className="hint-preview" aria-labelledby="hint-preview-title" onClose={() => setPreview(false)}>
      <h3 id="hint-preview-title">{title}</h3><p>{detail}</p>
      <button type="button" className="btn-secondary" onClick={() => setPreview(false)}>知道了</button>
    </dialog>
  </section>;
}
