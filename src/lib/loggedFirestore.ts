'use client';
import { auth } from '../firebase/config';
import * as fs from 'firebase/firestore';
import { recordSystemLog } from './systemLogs/client';
export * from 'firebase/firestore';

// Keep Firebase overloads at the call sites. Only explicitly selected metadata reaches the logger.
const details = (ref: any, data: any = {}) => ({
  endpoint: ref?.path?.split('/')[0],
  orderId: ref?.path?.startsWith('orders/') ? ref.id : undefined,
  status: data?.status, tripStatus: data?.tripStatus, action: data?.action,
});
const errorCode = (error: any) => typeof error?.code === 'string' ? error.code.replaceAll('/', '.') : 'FIRESTORE_ERROR';
function scopedLog() {
  const uid = auth.currentUser?.uid;
  return (type: string, data: Record<string, unknown>, priority = false) => {
    if (uid && uid === auth.currentUser?.uid) recordSystemLog(type, data, priority);
  };
}
function execute(fn: Function, args: any[], action: string, priority = true) {
  const log = scopedLog(), started = Date.now();
  const data = { ...details(args[0], args[1]), action, attemptId: crypto.randomUUID() };
  log('REQUEST_SENT', data);
  return fn(...args).then((result: any) => {
    log('ACTION_RESULT', { ...data, orderId: result?.parent?.id === 'orders' ? result.id : data.orderId, durationMs: Date.now() - started }, priority);
    return result;
  }, (error: any) => {
    log('REQUEST_FAILED', { ...data, code: errorCode(error) }, true);
    throw error;
  });
}
export const updateDoc = ((...args: any[]) => execute(fs.updateDoc, args, 'UPDATE')) as typeof fs.updateDoc;
export const addDoc = ((...args: any[]) => execute(fs.addDoc, args, 'CREATE')) as typeof fs.addDoc;
export const deleteDoc = ((...args: any[]) => execute(fs.deleteDoc, args, 'DELETE')) as typeof fs.deleteDoc;
export const setDoc = ((...args: any[]) => execute(fs.setDoc, args, 'SET')) as typeof fs.setDoc;
export const getDoc = ((...args: any[]) => execute(fs.getDoc, args, 'READ', false)) as typeof fs.getDoc;
export const getDocs = ((...args: any[]) => execute(fs.getDocs, args, 'READ', false)) as typeof fs.getDocs;

// Current managers use (query, next, error). Observer-object overloads pass through unchanged.
export const onSnapshot = ((...args: any[]) => {
  const index = args.findIndex((value, i) => i > 0 && typeof value === 'function');
  if (index > 0) {
    const next = args[index], error = args[index + 1], log = scopedLog();
    let streamSignature = '', initial = true;
    const listenerId = crypto.randomUUID();
    const entities = new Map<string, string>();
    args[index] = (snapshot: any) => {
      try {
        const stream = { layer: "FIRESTORE", listenerId, initial, ...details(args[0]), count: snapshot.size ?? 1, cached: !!snapshot.metadata?.fromCache };
        const signature = JSON.stringify(stream);
        if (signature !== streamSignature) { streamSignature = signature; log('STREAM_STATE', stream); }
        for (const change of snapshot.docChanges?.() || []) {
          const data = change.doc.data();
          const observed = { layer: "FIRESTORE", ...details(change.doc.ref, data), readableId: data.readableId, orderStatus: data.status, eventId: data.eventHistory?.at(-1)?.eventId, visible: change.type !== 'removed' };
          const key = change.doc.ref.path, signature = JSON.stringify(observed);
          if (entities.get(key) !== signature) { entities.set(key, signature); log('ENTITY_STATE', { ...observed, listenerId, initial, changeType: change.type }); }
          if (change.type === 'removed') entities.delete(key);
        }
      } catch { /* Diagnostic decoding must never prevent the original callback. */ }
      initial = false;
      next(snapshot);
    };
    args[index + 1] = (value: any) => {
      log('STREAM_ERROR', { ...details(args[0]), layer: 'FIRESTORE', listenerId, code: errorCode(value) }, true);
      error?.(value);
    };
  }
  return (fs.onSnapshot as Function)(...args);
}) as typeof fs.onSnapshot;
