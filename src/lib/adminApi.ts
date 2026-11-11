import { auth } from '../firebase/config';

export class AdminApiError extends Error {
  constructor(message: string, public uncertain = false) { super(message); }
}
export async function adminApi<T>(input: Record<string, unknown>): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new AdminApiError('請先使用管理員 Google 帳號登入。');
  const token = await user.getIdToken();
  if (auth.currentUser?.uid !== user.uid) throw new AdminApiError('登入身分已變更，請重新開啟頁面。');
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 35000);
  try {
    const response = await fetch('https://asia-east1-axeflowlotus-6dc3b.cloudfunctions.net/webAdmin', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(input), signal: controller.signal, cache: 'no-store',
    });
    const body = await response.json();
    if (!response.ok) throw new AdminApiError(body.error || '操作失敗。', response.status >= 500);
    if (auth.currentUser?.uid !== user.uid) throw new AdminApiError('登入身分已變更，請重新開啟頁面。', true);
    return body as T;
  } catch (e) {
    if (e instanceof AdminApiError) throw e;
    throw new AdminApiError('連線中斷，操作結果待確認；請重試原操作。', true);
  } finally { clearTimeout(timer); }
}
