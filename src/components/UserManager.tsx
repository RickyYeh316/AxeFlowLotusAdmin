'use client';

import { passengerNumber } from '../lib/passengerNumber';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { auth, db } from '../firebase/config';
import { collection, onSnapshot, doc } from '../lib/loggedFirestore';
import { Search, ChevronUp, ChevronDown, Ban, CheckCircle, RefreshCw } from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { adminApi, AdminApiError } from '../lib/adminApi';
import { recordSystemLog } from '../lib/systemLogs/client';
import { User, UserTripStatus, UserAccountStatus, Order } from '../types';
import { orderGroup, orderStatusText } from '../lib/orderPresentation';

type PassengerCounts = { completedTripCount: number; cancelAfterAcceptCount: number; noShowCount: number };

type CurrentOrder = Pick<Order, 'status' | 'reservationState' | 'userId'>;
type CurrentOrderRead = { order: CurrentOrder | null; failed: boolean };
const validOrderId = (id: string) => !!id && !id.includes('/') && id !== '.' && id !== '..';

export default function UserManager() {
  const [users, setUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [counts, setCounts] = useState<Record<string, PassengerCounts | null>>({});
  const [countsLoading, setCountsLoading] = useState(true);
  const [countsError, setCountsError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [currentOrders, setCurrentOrders] = useState<{ key: string; items: Record<string, CurrentOrderRead> }>({ key: '', items: {} });

  const [statusBusy, setStatusBusy] = useState(false);
  const statusFlight = useRef(false);
  const statusPending = useRef<{owner: string; userId: string; operationId: string; expectedStatus: string; accountStatus: string} | null>(null);

  // Sorting State
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'ascending' | 'descending' } | null>({
    key: 'passengerName',
    direction: 'ascending'
  });

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  // Subscribe to Firestore users collection
  useEffect(() => {
    let active = true, revision = 0;
    const owner = auth.currentUser?.uid;
    const sameOwner = () => active && auth.currentUser?.uid === owner;
    const stopAuth = onAuthStateChanged(auth, user => {
      if (active && user?.uid !== owner) {
        active = false;
        setUsers([]); setCounts({}); setCountsLoading(false); setCountsError(''); setLoading(false);
        setCurrentOrders({ key: '', items: {} });
        setLoadError('登入身分已變更，請重新開啟頁面。');
      }
    });
    setLoading(true); setLoadError(''); setCounts({}); setCountsError(''); setCountsLoading(true);
    const readCounts = async (list: User[], version: number) => {
      try {
        const values: Record<string, PassengerCounts | null> = {};
        for (let offset = 0; offset < list.length; offset += 100) {
          if (!sameOwner() || version !== revision) return;
          const result = await adminApi<{ items: { userId: string; counts: PassengerCounts | null }[] }>({
            action: 'PASSENGER_COUNTS', userIds: list.slice(offset, offset + 100).map(user => user.userId),
          });
          if (!sameOwner() || version !== revision) return;
          result.items.forEach(item => { values[item.userId] = item.counts; });
        }
        if (!sameOwner() || version !== revision) return;
        setCounts(values); setCountsLoading(false);
      } catch (error) {
        if (!sameOwner() || version !== revision) return;
        setCounts({}); setCountsLoading(false);
        setCountsError(error instanceof Error ? error.message : '乘客統計讀取失敗，請重試。');
      }
    };
    const unsub = onSnapshot(collection(db, 'users'), (snapshot) => {
      if (!sameOwner()) return;
      const version = ++revision;
      setCounts({}); setCountsError(''); setCountsLoading(true);
      const list: User[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        // 1. Parsing Trip Status with migration fallbacks
        let parsedTripStatus = data.tripStatus || data.status || UserTripStatus.IDLE;
        if (parsedTripStatus === 0 || parsedTripStatus === '0' || parsedTripStatus === 'NORMAL') parsedTripStatus = UserTripStatus.IDLE;
        else if (parsedTripStatus === 1 || parsedTripStatus === '1') parsedTripStatus = UserTripStatus.REQUESTING;
        else if (parsedTripStatus === 2 || parsedTripStatus === '2') parsedTripStatus = UserTripStatus.IN_TRIP;
        else if (parsedTripStatus === 'BANNED' || parsedTripStatus === 3 || parsedTripStatus === '3') parsedTripStatus = UserTripStatus.IDLE;

        // 只有正式 ACTIVE 值可顯示正常啟用；未知／缺值保持待確認。
        const parsedAccountStatus = typeof data.accountStatus === 'string' ? data.accountStatus : '';

        list.push({
          userId: doc.id,
          passengerNumber: passengerNumber(data.passengerNumber),
          id: doc.id,
          passengerName: data.passengerName || '未設定名稱',
          pictureUrl: data.pictureUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
          tripStatus: parsedTripStatus as UserTripStatus,
          currentOrderId: typeof data.currentOrderId === 'string' ? data.currentOrderId : undefined,
          accountStatus: parsedAccountStatus as UserAccountStatus,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt
        });
      });
      setUsers(list);
      setLoading(false);
      void readCounts(list, version);
    }, (error) => {
      if (!sameOwner()) return;
      revision++;
      setUsers([]); setCounts({}); setCountsLoading(false); setCountsError(''); setLoading(false);
      setLoadError('乘客名單讀取失敗，請確認登入權限後重試。');
    });

    return () => { active = false; revision++; stopAuth(); unsub(); };
  }, [reloadKey]);

  // Only follow the explicit current link; never query a passenger's latest/history order.
  const currentOrderKey = useMemo(() => JSON.stringify([reloadKey,
    users.map(user => [user.userId, user.currentOrderId || '']).sort()]), [users, reloadKey]);
  useEffect(() => {
    let active = true;
    const owner = auth.currentUser?.uid;
    const [, links] = JSON.parse(currentOrderKey) as [number, [string, string][]];
    const ids = [...new Set(links.map(([, id]) => id).filter(validOrderId))];
    setCurrentOrders({ key: currentOrderKey, items: {} });
    const stops = ids.map(id => {
      let signature = '';
      return onSnapshot(doc(db, 'orders', id), snapshot => {
        if (!active || auth.currentUser?.uid !== owner) return;
        const data = snapshot.data();
        const order = data ? { userId: data.userId, status: data.status, reservationState: data.reservationState } as CurrentOrder : null;
        setCurrentOrders(previous => previous.key === currentOrderKey
          ? { key: currentOrderKey, items: { ...previous.items, [id]: { order, failed: false } } } : previous);
        const next = JSON.stringify(order);
        if (signature !== next) {
          signature = next;
          recordSystemLog('ENTITY_STATE', { screen: 'users', orderId: id, orderStatus: order?.status,
            status: order?.reservationState, visible: !!order, reason: 'CURRENT_ORDER' });
        }
      }, () => {
        if (!active || auth.currentUser?.uid !== owner) return;
        setCurrentOrders(previous => previous.key === currentOrderKey
          ? { key: currentOrderKey, items: { ...previous.items, [id]: { order: null, failed: true } } } : previous);
      });
    });
    return () => { active = false; stops.forEach(stop => stop()); };
  }, [currentOrderKey]);

  const currentOrderViews = useMemo(() => new Map(users.map(user => {
    const id = user.currentOrderId;
    const read = currentOrders.key === currentOrderKey ? currentOrders.items[id || ''] : undefined;
    let group = 'none', label = '—';
    if (id) {
      if (!validOrderId(id)) { group = 'unknown'; label = '訂單狀態待確認'; }
      else if (!read) { group = 'loading'; label = '…'; }
      else if (read.failed) { group = 'error'; label = '讀取失敗'; }
      else if (!read.order || read.order.userId !== user.userId) { group = 'unknown'; label = '訂單狀態待確認'; }
      else {
        const category = orderGroup(read.order);
        // A terminal snapshot can arrive before the user-link removal notification.
        if (category !== 'closed') { group = category; label = orderStatusText(read.order); }
      }
    }
    return [user.userId, { group, label }];
  })), [users, currentOrders, currentOrderKey]);
  const ordersLoading = [...currentOrderViews.values()].some(view => view.group === 'loading');
  const ordersError = [...currentOrderViews.values()].some(view => view.group === 'error');

  useEffect(() => {
    recordSystemLog('SCREEN_STATE', { screen: 'users', loading: loading || countsLoading || ordersLoading,
      count: users.length, enabled: !loadError && !countsError && !ordersError,
      ...(loadError || countsError || ordersError ? { reason: 'READ_FAILED' } : {}) });
  }, [loading, countsLoading, ordersLoading, loadError, countsError, ordersError, users.length]);

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '未記錄';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (!Number.isFinite(date.getTime())) return '未記錄';
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei', year: 'numeric',
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23' }).format(date).replaceAll('-', '/');
  };

  // Filtering States
  const [accountFilter, setAccountFilter] = useState<string>('ALL');
  const [currentOrderFilter, setCurrentOrderFilter] = useState<string>('ALL');

  // Filter users based on search & status
  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const searchLower = searchQuery.trim().toLowerCase();
      const nameMatch = user.passengerName.toLowerCase().includes(searchLower);
      const idMatch = passengerNumber(user.passengerNumber) === searchLower;
      const matchesSearch = nameMatch || idMatch;

      let matchesAccount = true;
      if (accountFilter !== 'ALL') {
        matchesAccount = user.accountStatus === accountFilter;
      }

      const matchesCurrentOrder = currentOrderFilter === 'ALL'
        || currentOrderViews.get(user.userId)?.group === currentOrderFilter;
      return matchesSearch && matchesAccount && matchesCurrentOrder;
    });
  }, [users, searchQuery, accountFilter, currentOrderFilter, currentOrderViews]);

  const handleToggleBan = async (user: User) => {
    const owner = auth.currentUser?.uid;
    if (!owner || statusFlight.current) return;
    if (statusPending.current?.owner !== owner) statusPending.current = null;
    const pending = statusPending.current;
    if (pending && pending.userId !== user.userId) { alert('前一筆操作結果待確認，請先重試原乘客操作。'); return; }
    if (!pending && ![UserAccountStatus.ACTIVE, UserAccountStatus.BANNED].includes(user.accountStatus)) return;
    const request = pending || { owner, userId: user.userId, operationId: crypto.randomUUID(),
      expectedStatus: user.accountStatus,
      accountStatus: user.accountStatus === UserAccountStatus.BANNED ? UserAccountStatus.ACTIVE : UserAccountStatus.BANNED };
    const message = pending ? '重試確認上一筆帳號操作？' : request.accountStatus === UserAccountStatus.BANNED
      ? `確定停權乘客 ${user.passengerName}？所有未完成訂單（含載客中）將系統取消。`
      : `確定解除乘客 ${user.passengerName} 的停權？已取消訂單不會恢復。`;
    if (!window.confirm(message)) return;
    statusPending.current = request; statusFlight.current = true; setStatusBusy(true);
    try {
      const {owner: _owner, ...input} = request;
      await adminApi({action:'SET_MEMBER_STATUS', ...input});
      statusPending.current = null;
    } catch (error) {
      if (auth.currentUser?.uid !== owner) { statusPending.current = null; return; }
      if (!(error instanceof AdminApiError) || !error.uncertain) statusPending.current = null;
      alert(error instanceof Error ? error.message : '帳號操作失敗，請重試。');
    } finally { statusFlight.current = false; setStatusBusy(false); }
  };

  // Sorting & Pagination Logic
  const requestSort = (key: string) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
    recordSystemLog('UI_CHANGE', { control: 'users.sort', status: key, reason: direction });
    setCurrentPage(1);
  };

  const getSortIcon = (key: string) => {
    if (!sortConfig || sortConfig.key !== key) return null;
    return sortConfig.direction === 'ascending' ? (
      <ChevronUp size={14} style={{ display: 'inline', marginLeft: 4, verticalAlign: 'middle' }} />
    ) : (
      <ChevronDown size={14} style={{ display: 'inline', marginLeft: 4, verticalAlign: 'middle' }} />
    );
  };

  const sortedUsers = useMemo(() => {
    let sortable = [...filteredUsers];
    if (sortConfig !== null) {
      sortable.sort((a: any, b: any) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];
        if (sortConfig.key === 'currentOrder') {
          aVal = currentOrderViews.get(a.userId)?.label || '';
          bVal = currentOrderViews.get(b.userId)?.label || '';
        }

        if (sortConfig.key === 'createdAt' || sortConfig.key === 'lastLoginAt') {
          aVal = aVal?.toDate ? aVal.toDate().getTime() : new Date(aVal || 0).getTime();
          bVal = bVal?.toDate ? bVal.toDate().getTime() : new Date(bVal || 0).getTime();
        }

        if (typeof aVal === 'string') {
          return sortConfig.direction === 'ascending'
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal);
        } else {
          if (aVal < bVal) return sortConfig.direction === 'ascending' ? -1 : 1;
          if (aVal > bVal) return sortConfig.direction === 'ascending' ? 1 : -1;
          return 0;
        }
      });
    }
    return sortable;
  }, [filteredUsers, sortConfig, currentOrderViews]);

  const totalPages = Math.ceil(sortedUsers.length / itemsPerPage);
  useEffect(() => { setCurrentPage(page => Math.min(page, Math.max(1, totalPages))); }, [totalPages]);
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedUsers.slice(start, start + itemsPerPage);
  }, [sortedUsers, currentPage, itemsPerPage]);

  // Generate page numbers with ellipsis
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
      return pages;
    }

    pages.push(1);

    if (currentPage > 4) {
      pages.push('...');
    }

    let start = Math.max(2, currentPage - 2);
    let end = Math.min(totalPages - 1, currentPage + 2);

    if (currentPage <= 4) {
      end = 5;
    }
    if (currentPage >= totalPages - 3) {
      start = totalPages - 4;
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (currentPage < totalPages - 3) {
      pages.push('...');
    }

    pages.push(totalPages);
    return pages;
  };

  return (
    <div className="glass content-sheet animate-fade-in passenger-sheet">
      <div className="sheet-title-row">
        <div>
          <h2 className="sheet-title">乘客管理 ({filteredUsers.length})</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4 }}>
            所有透過 LINE LIFF 授權登入的乘客
          </p>
        </div>
        
        {/* Search Bar */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Account Status Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <span>帳號狀態:</span>
            <select 
              value={accountFilter}
              onChange={(e) => { setAccountFilter(e.target.value); setCurrentPage(1); }}
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-color)',
                borderRadius: 6,
                padding: '6px 12px',
                color: 'var(--text-primary)',
                fontSize: '0.8rem',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="ALL" style={{ background: '#0c0d14' }}>全部帳號狀態</option>
              <option value="ACTIVE" style={{ background: '#0c0d14' }}>啟用正常 (ACTIVE)</option>
              <option value="DELETED" style={{background: '#0c0d14'}}>已封存 (DELETED)</option>
              <option value="BANNED" style={{ background: '#0c0d14' }}>限制停權 (BANNED)</option>
            </select>
          </div>

          {/* Current Order Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <span>當前訂單:</span>
            <select 
              value={currentOrderFilter}
              data-syslog="users.currentOrder.filter"
              onChange={(e) => { setCurrentOrderFilter(e.target.value); setCurrentPage(1); }}
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-color)',
                borderRadius: 6,
                padding: '6px 12px',
                color: 'var(--text-primary)',
                fontSize: '0.8rem',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="ALL" style={{ background: '#0c0d14' }}>全部當前訂單</option>
              <option value="none" style={{ background: '#0c0d14' }}>無當前訂單</option>
              <option value="serving" style={{ background: '#0c0d14' }}>服務中</option>
              <option value="waiting" style={{ background: '#0c0d14' }}>待處理</option>
              <option value="unknown" style={{ background: '#0c0d14' }}>狀態待確認</option>
            </select>
          </div>

          <div className="search-wrapper" style={{ width: 280 }}>
            <Search size={16} className="search-icon" />
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜尋姓名或乘客編號"
              className="search-input"
            />
          </div>
          <button className="btn-secondary" data-syslog="users.reload" onClick={() => setReloadKey(key => key + 1)} disabled={loading || countsLoading || ordersLoading}>
            <RefreshCw size={16} /> 重新整理
          </button>
        </div>
      </div>

      {(loadError || countsError || ordersError) && <div role="alert" className="passenger-read-error">
        <span>{loadError || (countsError ? `乘客統計讀取失敗：${countsError}` : '當前訂單讀取失敗，請重試。')}</span>
        <button className="btn-secondary" data-syslog="users.retry" onClick={() => setReloadKey(key => key + 1)}>重試</button>
      </div>}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>載入乘客名單中...</div>
      ) : filteredUsers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          {searchQuery || accountFilter !== 'ALL' || currentOrderFilter !== 'ALL' ? '找不到符合篩選條件的乘客。' : '目前尚無註冊乘客。'}
        </div>
      ) : (
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th><div className="passenger-heading">
                  <button data-syslog="users.sort.name" onClick={() => requestSort('passengerName')}>乘客姓名{getSortIcon('passengerName')}</button>
                  <span>/</span>
                  <button data-syslog="users.sort.number" onClick={() => requestSort('passengerNumber')}>編號{getSortIcon('passengerNumber')}</button>
                </div></th>
                <th style={{ cursor: 'pointer' }} onClick={() => requestSort('accountStatus')}>帳號權限 {getSortIcon('accountStatus')}</th>
                <th><button className="coupon-sort" data-syslog="users.sort.currentOrder" onClick={() => requestSort('currentOrder')}>當前訂單 {getSortIcon('currentOrder')}</button></th>
                <th className="passenger-count">完成搭乘</th>
                <th className="passenger-count">棄單</th>
                <th className="passenger-count">未出現</th>
                <th style={{ cursor: 'pointer' }} onClick={() => requestSort('createdAt')}>註冊時間 {getSortIcon('createdAt')}</th>
                <th>管理操作</th>
              </tr>
            </thead>
            <tbody>
              {paginatedUsers.map((user) => {
                let accText = '狀態待確認';
                let accClass = 'status-pill offline';
                if (user.accountStatus === UserAccountStatus.ACTIVE) { accText = '正常啟用'; accClass = 'status-pill online'; }
                else if (user.accountStatus === UserAccountStatus.DELETED) accText = '已封存';
                if (user.accountStatus === UserAccountStatus.BANNED) {
                  accText = '已停權';
                  accClass = 'status-pill offline';
                }

                const currentOrder = currentOrderViews.get(user.userId)!;

                return (
                  <tr key={user.userId}>
                    <td>
                      <div className="passenger-identity">
                        <img src={user.pictureUrl} alt={user.passengerName} />
                        <div className="passenger-name-number">
                          <span className="passenger-name">{user.passengerName}</span>
                          <span className="passenger-number">{passengerNumber(user.passengerNumber) || '—'}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={accClass}>
                        {accText}
                      </span>
                    </td>
                    <td className="passenger-current-order">
                      {['serving', 'waiting', 'unknown'].includes(currentOrder.group)
                        ? <span className={`status-pill order-status order-tone-${currentOrder.group}`}>{currentOrder.label}</span>
                        : currentOrder.label}
                    </td>
                    {(['completedTripCount', 'cancelAfterAcceptCount', 'noShowCount'] as const).map(key => (
                      <td className="passenger-count" key={key}>
                        {countsLoading ? '…' : countsError ? '讀取失敗' : counts[user.userId]?.[key] ?? '—'}
                      </td>
                    ))}
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {formatDate(user.createdAt)}
                    </td>
                    <td>
                      <button 
                        onClick={() => handleToggleBan(user)}
                        data-syslog="users.accountStatus.toggle"
                        disabled={statusBusy || (statusPending.current?.owner === auth.currentUser?.uid && statusPending.current?.userId !== user.userId) || ![UserAccountStatus.ACTIVE, UserAccountStatus.BANNED].includes(user.accountStatus)}
                        className={`btn-icon ${user.accountStatus === UserAccountStatus.BANNED ? 'edit' : 'delete'}`}
                        title={statusPending.current?.userId === user.userId ? '重試確認上一筆帳號操作' : user.accountStatus === UserAccountStatus.BANNED ? '啟用帳號' : '停權帳號'}
                        style={{ display: 'inline-flex', padding: 6 }}
                      >
                        {user.accountStatus === UserAccountStatus.BANNED ? <CheckCircle size={14} /> : <Ban size={14} />}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginTop: 20, padding: '12px 8px 4px 8px', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                  顯示第 {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, sortedUsers.length)} 筆，共 {sortedUsers.length} 筆資料
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                  <span>每頁顯示:</span>
                  <select 
                    value={itemsPerPage} 
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 4,
                      padding: '2px 8px',
                      color: 'var(--text-primary)',
                      fontSize: '0.75rem',
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    <option value={10} style={{ background: '#0c0d14' }}>10 筆</option>
                    <option value={20} style={{ background: '#0c0d14' }}>20 筆</option>
                    <option value={50} style={{ background: '#0c0d14' }}>50 筆</option>
                    <option value={100} style={{ background: '#0c0d14' }}>100 筆</option>
                  </select>
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button 
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} 
                  disabled={currentPage === 1}
                  className="btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                >
                  上一頁
                </button>
                
                {getPageNumbers().map((pageNum, idx) => {
                  if (pageNum === '...') {
                    return (
                      <span key={`ellipsis-${idx}`} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 32, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        ...
                      </span>
                    );
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(Number(pageNum))}
                      className={currentPage === pageNum ? 'btn-primary' : 'btn-secondary'}
                      style={{ padding: '6px 12px', fontSize: '0.75rem', minWidth: 32, height: 'auto', borderRadius: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      {pageNum}
                    </button>
                  );
                })}

                <button 
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} 
                  disabled={currentPage === totalPages}
                  className="btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                >
                  下一頁
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
