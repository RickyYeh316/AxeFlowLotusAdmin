'use client';

import OrderDetail from './OrderDetail';
import { passengerNumber } from '../lib/passengerNumber';

import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase/config';
import { collection, onSnapshot } from '../lib/loggedFirestore';
import { Search, ChevronUp, ChevronDown } from 'lucide-react';
import { Order, User, OrderStatus, UserTripStatus, UserAccountStatus } from '../types';

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
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);

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
  }, [statusFilter]);

  // Load orders and passenger numbers
  useEffect(() => {
    // 1. Subscribe to orders
    const unsubOrders = onSnapshot(collection(db, 'orders'), (snapshot) => {
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
          status: data.status || OrderStatus.PENDING,
          fare: data.fare,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt
        });
      });
      setOrders(list);
      setLoading(false);
    }, (error) => {
      console.error("Error subscribing to orders:", error);
      setLoading(false);
    });

    // 2. Subscribe to users for passenger numbers
    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
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
          name: data.name || data.displayName || '',
          displayName: data.displayName || data.name || '',
          pictureUrl: data.pictureUrl || '',
          tripStatus: parsedTripStatus as UserTripStatus,
          accountStatus: parsedAccountStatus as UserAccountStatus,
          noShowCount: data.noShowCount || 0,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt
        });
      });
      setUsers(list);
    });

    return () => {
      unsubOrders();
      unsubUsers();
    };
  }, []);

  const getOrderStatusText = (status: any) => {
    const statusStr = String(status);
    switch (statusStr) {
      case '1': return '已派遣/進行中';
      case '2': return '已完成';
      case '0': return '已取消';
      case 'SCHEDULED': return '預約中';
      case OrderStatus.PENDING: return '等待派車';
      case OrderStatus.MATCHING: return '媒合中';
      case OrderStatus.ACCEPTED: return '前往上車地點';
      case OrderStatus.ARRIVED: return '已抵達';
      case OrderStatus.IN_PROGRESS: return '載客中';
      case OrderStatus.COMPLETED: return '已完成';
      case OrderStatus.CANCELLED_BY_USER: return '乘客已取消';
      case OrderStatus.DRIVER_CANCELLED: return '已中止服務';
      case OrderStatus.NO_SHOW: return '已回報乘客未出現';
      case OrderStatus.FAILED_MATCH: return '媒合失敗';
      default: return '訂單狀態待確認';
    }
  };

  const getOrderStatusClass = (status: any) => {
    const statusStr = String(status);
    switch (statusStr) {
      case '1':
      case 'SCHEDULED':
      case OrderStatus.PENDING:
      case OrderStatus.MATCHING:
        return 'status-pill online';
      case OrderStatus.ACCEPTED:
      case OrderStatus.ARRIVED:
      case OrderStatus.IN_PROGRESS:
        return 'status-pill busy';
      case '2':
      case OrderStatus.COMPLETED:
        return 'status-pill online';
      default:
        return 'status-pill offline';
    }
  };

  const formatDate = (timestamp: Order['updatedAt']) => {
    if (!timestamp?.toDate) return '時間未提供';
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei', year: 'numeric',
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23' }).format(timestamp.toDate()).replaceAll('-', '/');
  };

  // Filtering States
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  const passengerNumbers = useMemo(() => new Map(users.map(user => [user.userId, passengerNumber(user.passengerNumber)])), [users]);

  // Filter orders
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // 1. Status filter
      let matchesStatus = true;
      const statusStr = String(order.status);
      
      if (statusFilter === 'active') {
        matchesStatus = 
          (order.status as any) === 1 || 
          statusStr === 'SCHEDULED' ||
          statusStr === 'PENDING' || 
          statusStr === 'MATCHING' || 
          statusStr === 'ACCEPTED' || 
          statusStr === 'ARRIVED' || 
          statusStr === 'IN_PROGRESS';
      } else if (statusFilter === 'completed') {
        matchesStatus = (order.status as any) === 2 || statusStr === 'COMPLETED';
      } else if (statusFilter === 'closed') {
        matchesStatus = 
          (order.status as any) === 0 || 
          statusStr === 'CANCELLED_BY_USER' || 
          statusStr === 'DRIVER_CANCELLED' || 
          statusStr === 'NO_SHOW' || 
          statusStr === 'FAILED_MATCH';
      }

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
          passengerNumbers.get(order.passengerId || order.userId) === searchLower ||
          (order.driverName || '').toLowerCase().includes(searchLower) ||
          (order.carPlate || '').toLowerCase().includes(searchLower) ||
          startAddr.toLowerCase().includes(searchLower) ||
          endAddr.toLowerCase().includes(searchLower);
      }

      // 3. Order type filter
      let matchesType = true;
      if (typeFilter !== 'ALL') {
        if (typeFilter === 'ELDERLY') {
          matchesType = order.isElderlyCare === true;
        } else if (typeFilter === 'SCHEDULED') {
          matchesType = order.isScheduled === true;
        } else if (typeFilter === 'REGULAR') {
          matchesType = !order.isElderlyCare && !order.isScheduled;
        }
      }

      return matchesStatus && matchesSearch && matchesType;
    });
  }, [orders, statusFilter, searchQuery, typeFilter, passengerNumbers]);

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
  }, [filteredOrders, sortConfig]);

  const totalPages = Math.ceil(sortedOrders.length / itemsPerPage);
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedOrders.slice(start, start + itemsPerPage);
  }, [sortedOrders, currentPage, itemsPerPage]);

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
    <>
      <div className="glass content-sheet animate-fade-in">
      <div className="sheet-title-row">
        <div>
          <h2 className="sheet-title">訂單管理 ({filteredOrders.length})</h2>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button data-syslog="order.filter.all" onClick={() => setStatusFilter('all')} className={`category-pill ${statusFilter === 'all' ? 'active' : ''}`}>全部訂單</button>
            <button data-syslog="order.filter.active" onClick={() => setStatusFilter('active')} className={`category-pill ${statusFilter === 'active' ? 'active' : ''}`}>進行中</button>
            <button data-syslog="order.filter.completed" onClick={() => setStatusFilter('completed')} className={`category-pill ${statusFilter === 'completed' ? 'active' : ''}`}>已完成</button>
            <button data-syslog="order.filter.closed" onClick={() => setStatusFilter('closed')} className={`category-pill ${statusFilter === 'closed' ? 'active' : ''}`}>取消／未完成</button>
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
            placeholder="搜尋乘客姓名／編號、車牌／司機、地址、訂單編號"
            className="search-input"
          />
        </div>

        {/* Order Type Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          <span>乘車類型：</span>
          <select 
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setCurrentPage(1); }}
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
            <option value="ALL" style={{ background: '#0c0d14' }}>全部類型</option>
            <option value="REGULAR" style={{ background: '#0c0d14' }}>一般叫車</option>
            <option value="ELDERLY" style={{ background: '#0c0d14' }}>敬老服務</option>
            <option value="SCHEDULED" style={{ background: '#0c0d14' }}>預約叫車</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>載入訂單資料中...</div>
      ) : filteredOrders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>無任何訂單紀錄。</div>
      ) : (
        <div className="admin-table-container">
          <table className="admin-table order-table">
            <colgroup><col style={{ width: '15%' }} /><col style={{ width: '28%' }} /><col style={{ width: '32%' }} /><col style={{ width: '17%' }} /><col style={{ width: '8%' }} /></colgroup>
            <thead>
              <tr>
                <th><button className="coupon-sort" onClick={() => requestSort('status')}>狀態 {getSortIcon('status')}</button><br />訂單編號</th>
                <th><button className="coupon-sort" onClick={() => requestSort('passengerName')}>乘客姓名／編號 {getSortIcon('passengerName')}</button><br /><button className="coupon-sort" onClick={() => requestSort('driverName')}>車號司機 {getSortIcon('driverName')}</button></th>
                <th><button className="coupon-sort" onClick={() => requestSort('startAddress')}>上車地 {getSortIcon('startAddress')}</button><br />目的地</th>
                <th><button className="coupon-sort" onClick={() => requestSort('updatedAt')}>紀錄時間 {getSortIcon('updatedAt')}</button></th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {paginatedOrders.map((order) => (
                <tr data-log-order={order.id} key={order.id}>
                  <td>
                    <div className="order-cell-stack">
                      <span className={getOrderStatusClass(order.status)}>{getOrderStatusText(order.status)}</span>
                      <span className="order-number">{order.readableId ? `#${order.readableId}` : '編號待產生'}</span>
                    </div>
                  </td>
                  <td>
                    <div className="order-cell-stack">
                      <div className="order-passenger"><strong>{order.passengerName || '未提供'}</strong><span className="order-passenger-number">{passengerNumbers.get(order.passengerId || order.userId) || '—'}</span></div>
                      <div className="order-driver">{order.carPlate && <span className="order-plate">{order.carPlate}</span>}<span>{order.driverName || (['PENDING', 'MATCHING', 'SCHEDULED'].includes(String(order.status)) ? '尚未指派' : '未提供')}</span></div>
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
                    <button type="button" data-syslog="order.detail_open" onClick={() => setDetailId(order.id)} className="btn-secondary order-detail-button">看詳細</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginTop: 20, padding: '12px 8px 4px 8px', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                  顯示第 {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, sortedOrders.length)} 筆，共 {sortedOrders.length} 筆資料
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
        {detailId && <OrderDetail key={detailId} orderId={detailId} onClose={() => setDetailId(null)} />}
    </div>


    </>
  );
}
