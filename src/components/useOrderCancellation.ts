'use client';

import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase/config';
import { adminApi, AdminApiError } from '../lib/adminApi';
import { canSystemCancelOrder } from '../lib/orderPresentation';
import { Order } from '../types';

type Request = { action: 'SYSTEM_CANCEL_ORDER'; orderId: string; operationId: string;
  expectedUpdatedAt: { seconds: number; nanoseconds: number } };
type Pending = { owner: string; label: string; request: Request };
const journalKey = (uid: string) => `lotus-order-cancellation:${uid}`;
function validPending(value: Pending, owner: string): boolean {
  const r = value?.request, t = r?.expectedUpdatedAt;
  return value?.owner === owner && typeof value.label === 'string' && r?.action === 'SYSTEM_CANCEL_ORDER'
    && typeof r.orderId === 'string' && !!r.orderId && typeof r.operationId === 'string' && !!r.operationId
    && Number.isSafeInteger(t?.seconds) && Number.isInteger(t?.nanoseconds) && t.nanoseconds >= 0 && t.nanoseconds < 1e9;
}

/** 已確認請求先保存，結果不明時跨頁恢復同一 operationId。 */
export function useOrderCancellation(onRefresh: () => void) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('');
  const [succeeded, setSucceeded] = useState(false);
  const pendingRef = useRef<Pending | null>(null);
  const flight = useRef(false);
  const scope = useRef(0);
  const ownerRef = useRef<string | null>(null);
  useEffect(() => {
    const stop = onAuthStateChanged(auth, user => {
      scope.current++;
      ownerRef.current = user?.uid ?? null;
      flight.current = false; pendingRef.current = null;
      setBusy(false); setPending(null); setReady(false); setMessage(''); setSucceeded(false);
      if (!user) return;
      try {
        const saved = sessionStorage.getItem(journalKey(user.uid));
        if (saved) {
          const value = JSON.parse(saved);
          if (!validPending(value, user.uid)) throw new Error('Invalid pending operation');
          pendingRef.current = value; setPending(value);
          setMessage('上次系統取消的結果待確認，請重試確認結果。');
        }
        setReady(true);
      } catch {
        setMessage('無法讀取操作紀錄，請確認瀏覽器儲存空間後重新開啟此頁。');
      }
    });
    return () => { scope.current++; ownerRef.current = null; stop(); };
  }, []);

  async function send(value: Pending) {
    if (flight.current || !ready || auth.currentUser?.uid !== value.owner || ownerRef.current !== value.owner) return;
    const generation = scope.current;
    const current = () => generation === scope.current && auth.currentUser?.uid === value.owner;
    flight.current = true; setBusy(true); setMessage(''); setSucceeded(false);
    try {
      await adminApi(value.request);
      if (!current()) return;
      sessionStorage.removeItem(journalKey(value.owner));
      pendingRef.current = null; setPending(null);
      setSucceeded(true); setMessage(`訂單 ${value.label} 已系統取消。`); onRefresh();
    } catch (error) {
      if (!current()) return;
      if (error instanceof AdminApiError && !error.uncertain) {
        try {
          sessionStorage.removeItem(journalKey(value.owner));
          pendingRef.current = null; setPending(null);
        } catch { /* 保留原請求，下一次仍可安全確認結果。 */ }
        setMessage(error.message); onRefresh();
      } else {
        setMessage('連線或儲存作業未完成，取消結果待確認，請重試確認結果。');
      }
    } finally {
      if (current()) { flight.current = false; setBusy(false); }
    }
  }

  function cancel(order: Order) {
    const owner = auth.currentUser?.uid;
    if (!ready || !owner || ownerRef.current !== owner || flight.current || pendingRef.current || !canSystemCancelOrder(order)) return;
    const time = order.updatedAt;
    if (!Number.isSafeInteger(time?.seconds) || !Number.isInteger(time?.nanoseconds)) {
      setMessage('訂單版本未提供，請重新整理後再操作。'); return;
    }
    const label = order.readableId ? `#${order.readableId}` : '（編號未提供）';
    if (!window.confirm(`確定系統取消訂單 ${label}？\n取消後無法恢復，乘客帳號狀態保持。`)) return;
    const value: Pending = { owner, label, request: { action: 'SYSTEM_CANCEL_ORDER', orderId: order.id,
      operationId: crypto.randomUUID(), expectedUpdatedAt: { seconds: time.seconds, nanoseconds: time.nanoseconds } } };
    try { sessionStorage.setItem(journalKey(owner), JSON.stringify(value)); }
    catch { setMessage('無法保存操作紀錄，尚未送出取消。請確認瀏覽器儲存空間後重試。'); return; }
    pendingRef.current = value; setPending(value); void send(value);
  }
  return { cancel, retry: () => { if (pendingRef.current) void send(pendingRef.current); }, pending, busy,
    disabled: !ready || busy || !!pending, message, succeeded };
}
