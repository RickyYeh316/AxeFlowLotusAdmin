import type { ReactNode } from 'react';
import type { Driver } from '../types';

type LoginFields = Pick<Driver, 'createdAt' | 'lastLoginAt' | 'loginCount'>;
type LoginKey = keyof LoginFields;
type Sorting = { onSort: (key: LoginKey) => void; icon: (key: LoginKey) => ReactNode; scope: 'drivers' | 'users' };

const labels = { createdAt: '註冊時間', lastLoginAt: '最近登入', loginCount: '登入次數' };
const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit',
  day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });

function timestampMs(value: unknown): number | undefined {
  let date: Date;
  if (value instanceof Date) date = value;
  else if (typeof value === 'number' || typeof value === 'string') date = new Date(value);
  else if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') date = value.toDate();
  else return undefined;
  return Number.isFinite(date.getTime()) ? date.getTime() : undefined;
}

export function isLoginKey(key: string): key is LoginKey {
  return key === 'createdAt' || key === 'lastLoginAt' || key === 'loginCount';
}

export function loginValue(account: LoginFields, key: LoginKey) {
  if (key !== 'loginCount') return timestampMs(account[key]);
  const value = account.loginCount;
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

export function compareNumbers(a: number | undefined, b: number | undefined, direction: string) {
  if (a === b) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  return direction === 'ascending' ? a - b : b - a;
}

export function AccountLoginHead({ onSort, icon, scope }: Sorting) {
  const button = (key: LoginKey) => <button type="button" className="coupon-sort" data-syslog={`${scope}.sort.${key}`}
    onClick={() => onSort(key)}>{labels[key]}{icon(key)}</button>;
  return <>
    <th><div className="account-times">{button('createdAt')}{button('lastLoginAt')}</div></th>
    <th>{button('loginCount')}</th>
  </>;
}

export function AccountLoginCells({ account }: { account: LoginFields }) {
  const time = (key: 'createdAt' | 'lastLoginAt') => {
    const ms = loginValue(account, key);
    return ms === undefined ? '—' : formatter.format(ms).replaceAll('-', '/');
  };
  return <>
    <td><div className="account-times"><span>{time('createdAt')}</span><span>{time('lastLoginAt')}</span></div></td>
    <td>{loginValue(account, 'loginCount') ?? '—'}</td>
  </>;
}
