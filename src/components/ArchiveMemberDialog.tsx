'use client';

import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase/config';
import { adminApi, AdminApiError } from '../lib/adminApi';

type MemberVersion = { seconds: number; nanoseconds: number };
type Target = { owner: string; userId: string; name: string; number: string };

export default function ArchiveMemberDialog({ target, onClose }: { target: Target; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const active = useRef(false);
  const flight = useRef(false);
  const [version, setVersion] = useState<MemberVersion | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [failed, setFailed] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    let live = true;
    active.current = true;
    dialog.current?.showModal();
    const stop = onAuthStateChanged(auth, user => {
      if (user?.uid !== target.owner) {
        active.current = false;
        closeRef.current();
      }
    });
    void (async () => {
      try {
        const result = await adminApi<{ items: { id: string; accountStatus: string; version: MemberVersion | null }[] }>({
          action: 'USERS', filter: 'ALL', userId: target.userId,
        });
        if (!live || !active.current || auth.currentUser?.uid !== target.owner) return;
        const row = result.items.find(item => item.id === target.userId);
        if (!row || !['ACTIVE', 'BANNED'].includes(row.accountStatus) || !row.version) {
          throw new Error('乘客狀態已改變，請取消並重新整理後再操作。');
        }
        setVersion(row.version);
      } catch (e) {
        if (live && active.current) setError(e instanceof Error ? e.message : '會員資料讀取失敗，請取消後重試。');
      } finally {
        if (live && active.current) setBusy(false);
      }
    })();
    return () => { live = false; active.current = false; stop(); };
  }, [target.owner, target.userId]);

  const archive = async () => {
    if (!active.current || flight.current || !version || failed || auth.currentUser?.uid !== target.owner) return;
    flight.current = true;
    setBusy(true); setError('');
    try {
      await adminApi({ action: 'DELETE_MEMBER', userId: target.userId, version });
      if (active.current && auth.currentUser?.uid === target.owner) closeRef.current();
    } catch (e) {
      if (!active.current || auth.currentUser?.uid !== target.owner) return;
      const retry = e instanceof AdminApiError && e.uncertain;
      setUncertain(retry); setFailed(!retry);
      setError(retry ? '封存結果尚待確認，請按「重試封存」。系統會確認原會員的同一筆操作。'
        : e instanceof Error ? e.message : '封存失敗，請取消後重新確認。');
    } finally {
      flight.current = false;
      if (active.current) setBusy(false);
    }
  };

  return <dialog ref={dialog} className="member-archive-dialog modal-content" aria-labelledby="member-archive-title"
    onCancel={event => { event.preventDefault(); if (!busy && !uncertain) onClose(); }}>
    <h2 id="member-archive-title" className="modal-title" tabIndex={-1} autoFocus>封存乘客帳號</h2>
    <p>{target.name} ／ {target.number}</p>
    <p>封存後將無法恢復或重新啟用此帳號。所有未完成訂單（含載客中）將「系統取消」，歷史訂單、優惠券及統計紀錄保留。</p>
    <p>乘客端將停止使用。相同 LINE 帳號再次登入，會建立全新會員與乘客編號，依當時新戶規則領券；新會員不繼承舊紀錄。</p>
    {busy && <p role="status">{version ? '正在確認封存結果…' : '正在確認會員資料…'}</p>}
    {error && <p role="alert" style={{ color: '#f5cf60' }}>{error}</p>}
    <div className="modal-footer">
      <button className="btn-secondary table-action-button" data-syslog="users.archive.cancel" disabled={busy || uncertain} onClick={onClose}>取消</button>
      <button className="btn-secondary table-action-button" data-syslog="users.archive.confirm" disabled={busy || !version || failed} onClick={archive}>{uncertain ? '重試封存' : '確認封存'}</button>
    </div>
  </dialog>;
}
