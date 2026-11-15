'use client';

import ListPagination from './ListPagination';

import { useOrderCancellation } from './useOrderCancellation';
import OrderDetail from './OrderDetail';
import { canSystemCancelOrder, orderGroup, orderStatusText, orderSubcategory, orderSubcategories, OrderFilter } from '../lib/orderPresentation';
import { recordSystemLog } from '../lib/systemLogs/client';
import { passengerNumber } from '../lib/passengerNumber';

import React, { useState, useEffect, useMemo } from 'react';
import { auth, db } from '../firebase/config';
import { onAuthStateChanged } from 'firebase/auth';
import { adminApi } from '../lib/adminApi';
import { collection, onSnapshot } from '../lib/loggedFirestore';
import { Search, ChevronUp, ChevronDown, RefreshCw } from 'lucide-react';
import { Order, User, UserTripStatus, UserAccountStatus } from '../types';

function mapUrl(location: Order['destination']): string | null {
  if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number' ||
      !Number.isFinite(location.lat) || !Number.isFinite(location.lng) ||
      Math.abs(location.lat) > 90 || Math.abs(location.lng) > 180) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${location.lat},${location.lng}`)}`;
}

function OrderAddress({ location, address, pickup }: { location: Order['destination']; address?: string; pickup: boolean }) {
  const href = mapUrl(location);
  return <div className="order-address">
    <span className="order-location-dot" aria-hidden="true">{pickup ? '●' : '▼'}</span>
    <span className="order-address-content">
      {address || <span className="order-address-empty">{pickup ? '上車資訊未提供' : '未輸入'}</span>}
      {href && <a className="order-map-link" href={href} target="_blank" rel="noopener noreferrer"
        data-syslog={pickup ? 'order.pickup_map' : 'order.destination_map'}
        aria-label={pickup ? '查看上車地地圖（另開分頁）' : '查看目的地地圖（另開分頁）'}>地圖</a>}
    </span>
  </div>;
}

export default function OrderManager() {
  const [detailId, setDetailId] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [statusFilter, setStatusFilter] = useState<OrderFilter>('serving');
  const [subcategory, setSubcategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [driverReadFailures, setDriverReadFailures] = useState<Set<string>>(new Set());
  const [reloadKey, setReloadKey] = useState(0);
  const cancellation = useOrderCancellation(() => setReloadKey(key => key + 1));

  // Sorting State
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'ascending' | 'descending' } | null>({
    key: 'updatedAt',
    direction: 'descending'
  });

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, subcategory]);

  // Load orders and passenger numbers
  useEffect(() => {
    let active = true;
    const owner = auth.currentUser?.uid;
    let revision = 0;
    let hydration = Promise.resolve();
    const driverCache = new Map<string, { name: string; carPlate: string }>();
    const sameOwner = () => active && auth.currentUser?.uid === owner;
    const stopAuth = onAuthStateChanged(auth, user => {
      if (active && user?.uid !== owner) {
        active = false;
        driverCache.clear();
        setOrders([]);
        setUsers([]);
        setDriverReadFailures(new Set());
        setLoading(false);
        setLoadError('登入身分已變更，請重新開啟頁面。');
      }
    });
    setDriverReadFailures(new Set());
    setLoading(true);
    setLoadError('');
    // 1. Subscribe to orders
    const unsubOrders = onSnapshot(collection(db, 'orders'), (snapshot) => {
      if (!active) return;
      const list: Order[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        list.push({
          id: doc.id,
          readableId: data.readableId || '',
          userId: data.userId || data.passengerId || 'guest',
          passengerId: data.passengerId || data.userId || 'guest',
          passengerName: data.passengerName || '訪客',
          passengerAvatar: data.passengerAvatar || '',
          driverId: data.driverId || '',
          driverName: data.driverName || '',
          carPlate: data.carPlate || '',
          pickupLocation: data.pickupLocation || { lat: Number.NaN, lng: Number.NaN },
          destination: data.destination,
          couponId: typeof data.couponId === 'string' ? data.couponId : '',
          startAddress: data.startAddress || data.pickupLocation?.address || '',
          endAddress: data.endAddress || data.destination?.address || '',
          isElderlyCare: data.isElderlyCare || false,
          isScheduled: data.isScheduled || false,
          scheduledTime: data.scheduledTime,
          reservationState: typeof data.reservationState === 'string' ? data.reservationState : '',
          status: data.status ?? '',
          fare: data.fare,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt
        });
      });
      const version = ++revision;
      const current = () => sameOwner() && version === revision;
      setLoading(true);
      // 完單原欄位已釋放，沿詳情 API 讀同一份歷史快照。最多同時四筆，既有快照依版本快取。
      hydration = hydration.then(async () => {
        if (!current()) return;
        const completed = list.filter(order => String(order.status) === 'COMPLETED');
        const failures = new Set<string>();
        let cursor = 0;
        await Promise.all(Array.from({ length: Math.min(4, completed.length) }, async () => {
          while (current() && cursor < completed.length) {
            const order = completed[cursor++];
            const key = JSON.stringify([order.id, order.userId, order.updatedAt?.seconds,
              order.updatedAt?.nanoseconds, order.updatedAt?.toDate?.().getTime()]);
            try {
              let driver = driverCache.get(key);
              if (!driver) {
                const result = await adminApi<{ card: { orderId: string; orderStatus: string; driver?: { name?: string; carPlate?: string } | null } }>(
                  { action: 'ORDER_DETAIL', orderId: order.id });
                if (!sameOwner()) return;
                if (result.card.orderId !== order.id || result.card.orderStatus !== 'COMPLETED') throw new Error('歷史訂單資料已變更');
                driver = { name: typeof result.card.driver?.name === 'string' ? result.card.driver.name : '',
                  carPlate: typeof result.card.driver?.carPlate === 'string' ? result.card.driver.carPlate : '' };
                driverCache.set(key, driver);
              }
              order.driverName = driver.name;
              order.carPlate = driver.carPlate;
            } catch {
              failures.add(order.id);
              order.driverName = '';
              order.carPlate = '';
            }
          }
        }));
        if (!current()) return;
        setDriverReadFailures(failures);
        setOrders(list);
        setLoading(false);
      });
    }, (error) => {
      if (!active) return;
      revision++;
      setLoadError('訂單讀取失敗，請重新整理。');
      console.error("Error subscribing to orders:", error);
      setLoading(false);
    });

    // 2. Subscribe to users for passenger numbers
    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      if (!active) return;
      const list: User[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();

        // 1. Parsing Trip Status with migration fallbacks
        let parsedTripStatus = data.tripStatus || data.status || UserTripStatus.IDLE;
        if (parsedTripStatus === 0 || parsedTripStatus === '0' || parsedTripStatus === 'NORMAL') parsedTripStatus = UserTripStatus.IDLE;
        else if (parsedTripStatus === 1 || parsedTripStatus === '1') parsedTripStatus = UserTripStatus.REQUESTING;
        else if (parsedTripStatus === 2 || parsedTripStatus === '2') parsedTripStatus = UserTripStatus.IN_TRIP;
        else if (parsedTripStatus === 'BANNED' || parsedTripStatus === 3 || parsedTripStatus === '3') parsedTripStatus = UserTripStatus.IDLE;

        // 2. Parsing Account Status with migration fallbacks
        let parsedAccountStatus = data.accountStatus;
        if (!parsedAccountStatus) {
          if (data.status === 'BANNED' || data.status === 3 || data.status === '3') {
            parsedAccountStatus = UserAccountStatus.BANNED;
          } else {
            parsedAccountStatus = UserAccountStatus.ACTIVE;
          }
        }

        list.push({
          userId: doc.id,
          passengerNumber: passengerNumber(data.passengerNumber),
          passengerName: data.passengerName || '',
          pictureUrl: data.pictureUrl || '',
          tripStatus: parsedTripStatus as UserTripStatus,
          accountStatus: parsedAccountStatus as UserAccountStatus,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt
        });
      });
      setUsers(list);
    });

    return () => {
      active = false;
      stopAuth();
      driverCache.clear();
      unsubOrders();
      unsubUsers();
    };
  }, [reloadKey]);

  const formatDate = (timestamp: Order['updatedAt']) => {
    if (!timestamp?.toDate) return '時間未提供';
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei', year: 'numeric',
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23' }).format(timestamp.toDate()).replaceAll('-', '/');
  };

  // Filtering States
  const [searchQuery, setSearchQuery] = useState('');

  const passengerNumbers = useMemo(() => new Map(users.map(user => [user.userId, passengerNumber(user.passengerNumber)])), [users]);

  const groupCounts = useMemo(() => ({
    serving: orders.filter(order => orderGroup(order) === 'serving').length,
    waiting: orders.filter(order => orderGroup(order) === 'waiting').length,
    closed: orders.filter(order => orderGroup(order) === 'closed').length,
    all: orders.length,
  }), [orders]);

  const subcategoryOptions = useMemo(() => orderSubcategories
    .filter(option => statusFilter === 'all' || option.group === statusFilter)
    .map(option => ({ ...option, count: orders.filter(order => orderSubcategory(order) === option.value).length })),
    [orders, statusFilter]);

  // Filter orders
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // 1. Status filter
      const matchesStatus = statusFilter === 'all' || orderGroup(order) === statusFilter;

      // 2. Search query filter
      let matchesSearch = true;
      if (searchQuery.trim()) {
        const searchLower = searchQuery.trim().toLowerCase();
        const startAddr = order.pickupLocation?.address || order.startAddress || '';
        const endAddr = order.destination?.address || order.endAddress || '';
        matchesSearch = 
          order.id.toLowerCase().includes(searchLower) ||
          (order.readableId || '').toLowerCase().includes(searchLower.replace(/^#/, '')) ||
          (order.passengerName || '').toLowerCase().includes(searchLower) ||
          (passengerNumbers.get(order.passengerId || order.userId) || '').includes(searchLower) ||
          (order.driverName || '').toLowerCase().includes(searchLower) ||
          (order.carPlate || '').toLowerCase().includes(searchLower) ||
          startAddr.toLowerCase().includes(searchLower) ||
          endAddr.toLowerCase().includes(searchLower);
      }

      return matchesStatus && (subcategory === 'all' || orderSubcategory(order) === subcategory) && matchesSearch;
    });
  }, [orders, statusFilter, subcategory, searchQuery, passengerNumbers]);

  // Sorting & Pagination Logic
  const requestSort = (key: string) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
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

  const sortedOrders = useMemo(() => {
    let sortable = [...filteredOrders];
    if (sortConfig !== null) {
      sortable.sort((a: any, b: any) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];

        if (sortConfig.key === 'passengerNumber') {
          aVal = passengerNumbers.get(a.passengerId || a.userId) || '';
          bVal = passengerNumbers.get(b.passengerId || b.userId) || '';
        }

        if (sortConfig.key === 'readableId' || sortConfig.key === 'endAddress') {
          const result = String(aVal ?? '').localeCompare(String(bVal ?? ''), 'zh-Hant', { numeric: true });
          return sortConfig.direction === 'ascending' ? result : -result;
        }

        if (sortConfig.key === 'createdAt' || sortConfig.key === 'updatedAt') {
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
  }, [filteredOrders, sortConfig, passengerNumbers]);

  const totalPages = Math.ceil(sortedOrders.length / itemsPerPage);
  useEffect(() => {
    setCurrentPage(page => Math.min(page, Math.max(1, totalPages)));
  }, [totalPages]);
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedOrders.slice(start, start + itemsPerPage);
  }, [sortedOrders, currentPage, itemsPerPage]);


  return (
    <>
      <div className="glass content-sheet animate-fade-in">
      <div className="sheet-title-row">
        <div className="order-title-content">
          <h2 className="sheet-title">訂單管理 ({filteredOrders.length})</h2>
          <div className="order-status-toolbar">
            {([['serving', '服務中'], ['waiting', '待處理'], ['closed', '已結束'], ['all', '全部']] as const).map(([value, label]) => (
              <div key={value} className={`order-filter-group order-tone-${value}`}>
              <button type="button" data-syslog={`order.filter.${value}`} aria-pressed={statusFilter === value}
                onClick={() => { setStatusFilter(value); if (statusFilter !== value) setSubcategory('all'); }} className={`category-pill order-filter order-tone-${value} ${statusFilter === value ? 'active' : ''}`}>
                {label}{!loading && !loadError && ` (${groupCounts[value]})`}
              </button>
              {statusFilter === value && <select className="order-subcategory" aria-label={`${label}子類`}
                value={subcategory} onChange={event => {
                  setSubcategory(event.target.value);
                  recordSystemLog('UI_CLICK', { control: 'order.subcategory', action: event.target.value });
                }}>
                <option value="all">全部狀態</option>
                {subcategoryOptions.map(option => <option key={option.value} value={option.value}>
                  {option.label}{!loading && !loadError && ` (${option.count})`}
                </option>)}
              </select>}
              </div>
            ))}
            <button type="button" className="btn-secondary" data-syslog="order.refresh" disabled={loading}
              onClick={() => setReloadKey(key => key + 1)}><RefreshCw size={14} />重新整理</button>
          </div>
        </div>


      </div>

      {/* Advanced Filter Inputs Bar */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Search Input */}
        <div className="search-wrapper order-search">
          <Search size={16} className="search-icon" />
          <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            placeholder="搜尋訂單編號、乘客姓名、乘客編號、車牌、司機姓名、上車地／目的地"
            className="search-input"
          />
        </div>

      </div>

      {driverReadFailures.size > 0 && <p role="alert" className="coupon-error">部分司機資料讀取失敗，車牌／司機搜尋結果尚未完整，請重新整理。</p>}
      {loadError && <p role="alert" className="coupon-error">{loadError}</p>}
      {cancellation.message && <p role="status" className={cancellation.succeeded ? undefined : "coupon-error"}>{cancellation.message}</p>}
      {cancellation.pending && <div style={{ marginBottom: 16 }}>
        <span>訂單 {cancellation.pending.label}：{cancellation.busy ? '系統取消處理中…' : '取消結果待確認。'} </span>
        <button type="button" className="btn-secondary table-action-button" data-syslog="order.system_cancel_retry"
          disabled={cancellation.busy} onClick={cancellation.retry}>重試確認結果</button>
      </div>}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>載入訂單資料中...</div>
      ) : filteredOrders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>目前沒有符合條件的訂單。</div>
      ) : (
        <div className="admin-table-container">
          <table className="admin-table order-table">
            <colgroup><col style={{ width: '15%' }} /><col style={{ width: '28%' }} /><col style={{ width: '32%' }} /><col style={{ width: '17%' }} /><col style={{ width: '8%' }} /></colgroup>
            <thead>
              <tr>
                <th><button className="coupon-sort" onClick={() => requestSort('status')}>狀態 {getSortIcon('status')}</button><br /><button className="coupon-sort" data-syslog="order.sort.number" onClick={() => requestSort('readableId')}>訂單編號 {getSortIcon('readableId')}</button></th>
                <th><div className="passenger-heading">
                  <button data-syslog="order.sort.passengerName" onClick={() => requestSort('passengerName')}>乘客姓名{getSortIcon('passengerName')}</button>
                  <span>/</span>
                  <button data-syslog="order.sort.passengerNumber" onClick={() => requestSort('passengerNumber')}>編號{getSortIcon('passengerNumber')}</button>
                </div><button className="coupon-sort" onClick={() => requestSort('driverName')}>車號司機 {getSortIcon('driverName')}</button></th>
                <th><button className="coupon-sort" onClick={() => requestSort('startAddress')}>上車地 {getSortIcon('startAddress')}</button><br /><button className="coupon-sort" data-syslog="order.sort.destination" onClick={() => requestSort('endAddress')}>目的地 {getSortIcon('endAddress')}</button></th>
                <th><button className="coupon-sort" onClick={() => requestSort('updatedAt')}>紀錄時間 {getSortIcon('updatedAt')}</button></th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {paginatedOrders.map((order) => (
                <tr data-log-order={order.id} key={order.id}>
                  <td>
                    <div className="order-cell-stack">
                      <span className={`status-pill order-status order-tone-${orderGroup(order)}`}>{orderStatusText(order)}</span>
                      <span className="order-number">{order.readableId ? `#${order.readableId}` : '編號待產生'}</span>
                    </div>
                  </td>
                  <td>
                    <div className="order-cell-stack">
                      <div className="order-passenger"><strong>{order.passengerName || '未提供'}</strong><span className="order-passenger-number">{passengerNumbers.get(order.passengerId || order.userId) || '—'}</span></div>
                      <div className="order-driver">{order.carPlate && <span className="order-plate">{order.carPlate}</span>}<span>{order.driverName || (driverReadFailures.has(order.id) ? '司機資料讀取失敗' : ['PENDING', 'MATCHING', 'SCHEDULED'].includes(String(order.status)) ? '尚未指派' : '未提供')}</span></div>
                    </div>
                  </td>
                  <td>
                    <div className="order-cell-stack">
                      <OrderAddress pickup location={order.pickupLocation} address={order.startAddress || order.pickupLocation?.address} />
                      <OrderAddress pickup={false} location={order.destination} address={order.endAddress || order.destination?.address} />
                    </div>
                  </td>
                  <td className="order-recorded-at">
                    <div className="order-cell-stack">
                      <span>{formatDate(order.updatedAt)}</span>
                      <div className="order-tags"><span data-kind={order.isScheduled ? 'scheduled' : 'instant'}>{order.isScheduled ? '預約' : '即時'}</span>{order.couponId && <span data-kind="coupon">優惠券</span>}{order.isElderlyCare && <span data-kind="elderly">敬老服務</span>}</div>
                    </div>
                  </td>
                  <td>
                    <div className="order-cell-stack">
                    <button type="button" data-syslog="order.detail_open" onClick={() => setDetailId(order.id)} className="btn-secondary table-action-button order-detail-button">看詳細</button>
                    {canSystemCancelOrder(order) && <button type="button" data-syslog="order.system_cancel"
                      className="btn-secondary table-action-button" disabled={cancellation.disabled || !!loadError}
                      onClick={() => cancellation.cancel(order)}>系統取消</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <ListPagination totalItems={sortedOrders.length} currentPage={currentPage} itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage} onPageSizeChange={setItemsPerPage} />
        </div>
      )}
        {detailId && <OrderDetail key={detailId} orderId={detailId} onClose={() => setDetailId(null)} />}
    </div>


    </>
  );
}
