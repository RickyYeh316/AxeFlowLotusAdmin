'use client';

import React, {useEffect, useRef} from 'react';
import {onAuthStateChanged} from 'firebase/auth';
import {auth} from '../firebase/config';
import {adminApi} from '../lib/adminApi';
import {recordSystemLog} from '../lib/systemLogs/client';

const channel = 'lotus-order-viewer-v3';
const readActions = new Set(['ORDER_DETAIL', 'ORDER_MAP', 'ORDER_CHAT', 'ORDER_CHAT_SEGMENT', 'ORDER_CHAT_MESSAGES']);

/** 模態外殼保存列表狀態；子頁只持有訂單呈現資料，登入 token 留在 adminApi。 */
export default function OrderDetail({orderId, onClose}: {orderId: string; onClose: () => void}) {
  const dialog = useRef<HTMLDialogElement>(null), frame = useRef<HTMLIFrameElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const owner = auth.currentUser?.uid;
    let alive = true;
    const opener = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    recordSystemLog('SUBPAGE_STATE', {subpage:'order_detail', orderId, visible:true});
    const stopAuth = onAuthStateChanged(auth, user => {if (user?.uid !== owner) closeRef.current();});
    const send = (data: Record<string, unknown>) => {
      if (alive && auth.currentUser?.uid === owner) frame.current?.contentWindow?.postMessage({channel,...data}, location.origin);
    };
    const receive = async (event: MessageEvent) => {
      if (!alive || event.origin !== location.origin || event.source !== frame.current?.contentWindow || event.data?.channel !== channel) return;
      const data = event.data;
      if (data.type === 'ready') {send({type:'init', mapsKey:process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}); return;}
      if (data.type === 'close') {closeRef.current(); return;}
      if (data.type === 'log') {
        if (['UI_CLICK','SUBPAGE_STATE'].includes(data.event)) recordSystemLog(data.event, {...data.details, orderId});
        return;
      }
      if (data.type !== 'request' || !Number.isSafeInteger(data.id) || !readActions.has(data.input?.action)) return;
      try {
        const result = await adminApi({...data.input, orderId});
        send({type:'response', id:data.id, result});
      } catch (error) {send({type:'response', id:data.id, error:error instanceof Error ? error.message : '讀取失敗，請重試。'});}
    };
    window.addEventListener('message', receive);
    return () => {
      alive = false; stopAuth(); window.removeEventListener('message', receive);
      recordSystemLog('SUBPAGE_STATE', {subpage:'order_detail',orderId,visible:false});
      opener?.focus();
    };
  }, [orderId]);
  return <dialog className="order-detail-dialog" ref={dialog} aria-labelledby="order-detail-title" onCancel={event => {event.preventDefault(); onClose();}}>
    <header><h2 id="order-detail-title">訂單詳細</h2><button type="button" autoFocus className="btn-secondary" aria-label="關閉訂單詳細" data-syslog="order.detail_close" onClick={onClose}>關閉</button></header>
    <iframe ref={frame} title="訂單卡片、行程地圖與對話" src="/passenger-order/index.html" />
  </dialog>;
}
