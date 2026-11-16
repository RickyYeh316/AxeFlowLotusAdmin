'use client';

import {createContext, useCallback, useContext, useEffect, useRef, useState} from 'react';
import {onAuthStateChanged} from 'firebase/auth';
import {auth} from '../firebase/config';

const ToastContext = createContext<((message: string) => void) | null>(null);

/** wA 全站操作回饋：最新訊息取代前一則，重複訊息亦重新計時，不移動焦點。 */
export function CommonToastProvider({children}: {children: React.ReactNode}) {
  const [toast, setToast] = useState<{id: number; message: string} | null>(null);
  const serial = useRef(0), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null; setToast(null);
  }, []);
  const commonToast = useCallback((message: string) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({id: ++serial.current, message});
    timer.current = setTimeout(dismiss, 3000);
  }, [dismiss]);
  useEffect(() => {
    const stop = onAuthStateChanged(auth, dismiss);
    return () => { stop(); if (timer.current) clearTimeout(timer.current); };
  }, [dismiss]);
  return <ToastContext.Provider value={commonToast}>
    {children}
    <div className="common-toast-region" role="status" aria-live="polite" aria-atomic="true">
      {toast && <div className="common-toast" key={toast.id}>
        <span>{toast.message}</span><button type="button" aria-label="關閉提示" onClick={dismiss}>×</button>
      </div>}
    </div>
  </ToastContext.Provider>;
}

export function useCommonToast() {
  const commonToast = useContext(ToastContext);
  if (!commonToast) throw new Error('commonToast requires CommonToastProvider');
  return commonToast;
}
