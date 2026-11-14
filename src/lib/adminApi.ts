import {recordSystemLog} from './systemLogs/client';
import { auth } from '../firebase/config';

export class AdminApiError extends Error {
  constructor(message: string, public uncertain = false) { super(message); }
}
export async function adminApi<T>(input: Record<string, unknown>): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new AdminApiError('請先使用管理員 Google 帳號登入。');
  const token = await user.getIdToken();
  if (auth.currentUser?.uid !== user.uid) throw new AdminApiError('登入身分已變更，請重新開啟頁面。');
  let httpStatus: number | undefined, backendCode: string | undefined, timedOut=false;
  const controller = new AbortController(), timer = setTimeout(() => {timedOut=true;controller.abort();}, 35000);
  const attemptId=crypto.randomUUID(),started=Date.now();
  const trace={...input,attemptId,endpoint:'webAdmin'};
  const log=(type:string,details:Record<string,unknown>,priority=false)=>{if(auth.currentUser?.uid===user.uid)recordSystemLog(type,details,priority);};
  log('REQUEST_SENT',trace);
  try {
    const response = await fetch('https://asia-east1-axeflowlotus-6dc3b.cloudfunctions.net/webAdmin', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(input), signal: controller.signal, cache: 'no-store',
    });
    httpStatus=response.status;
    log('HTTP_RESPONSE',{...trace,httpStatus:response.status,durationMs:Date.now()-started},!response.ok);
    const body = await response.json();
    backendCode=typeof body.code==='string'?body.code:undefined;
    if (!response.ok) throw new AdminApiError(body.error || '操作失敗。', response.status >= 500);
    if (auth.currentUser?.uid !== user.uid) throw new AdminApiError('登入身分已變更，請重新開啟頁面。', true);
    log('ACTION_RESULT',{...trace,duplicate:body.duplicate,durationMs:Date.now()-started},!['USERS','COUPON_LEDGER','ORDER_DETAIL','ORDER_MAP','ORDER_CHAT','ORDER_CHAT_SEGMENT','ORDER_CHAT_MESSAGES'].includes(String(input.action)));
    return body as T;
  } catch (e) {
    log('REQUEST_FAILED',{...trace,code:backendCode || (httpStatus&&httpStatus>=400?'HTTP_'+httpStatus:timedOut?'TIMEOUT':e instanceof SyntaxError?'RESPONSE_INVALID':'CONNECTION_ERROR'),errorKind:httpStatus===401?'AUTH_REQUIRED':httpStatus===403?'PERMISSION_DENIED':httpStatus&&httpStatus>=400?'HTTP_ERROR':timedOut?'TIMEOUT':e instanceof SyntaxError?'RESPONSE_INVALID':'CONNECTION_ERROR',httpStatus,windowStart:started,durationMs:Date.now()-started},true);
    if (e instanceof AdminApiError) throw e;
    throw new AdminApiError('連線中斷，操作結果待確認；請重試原操作。', true);
  } finally { clearTimeout(timer); }
}
