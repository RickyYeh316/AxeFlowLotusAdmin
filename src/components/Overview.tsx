'use client';

import React, { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { collection, onSnapshot, query, orderBy, limit } from '../lib/loggedFirestore';
import { Car, Users, ClipboardList, Tag, Clock, ArrowUpRight } from 'lucide-react';
import { Driver, User, Order, Coupon, DriverTripStatus, DriverAccountStatus, UserTripStatus, UserAccountStatus, OrderStatus } from '../types';

interface OverviewProps {
  onNavigate: (tab: string) => void;
}

export default function Overview({ onNavigate }: OverviewProps) {
  const [stats, setStats] = useState({
    driversCount: 0,
    onlineDriversCount: 0,
    usersCount: 0,
    ordersCount: 0,
    couponsCount: 0
  });
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Listen to drivers
    const unsubDrivers = onSnapshot(collection(db, 'drivers'), (snapshot) => {
      let total = 0;
      let online = 0;
      snapshot.forEach((doc) => {
        total++;
        const data = doc.data();
        let tripStatus = data.tripStatus || data.status || DriverTripStatus.OFFLINE;
        if (tripStatus === 1 || tripStatus === '1') tripStatus = DriverTripStatus.IDLE;
        else if (tripStatus === 2 || tripStatus === '2') tripStatus = DriverTripStatus.IN_SERVICE;
        else if (tripStatus === 0 || tripStatus === '0' || tripStatus === 'SUSPENDED' || tripStatus === 'WAIT_APPROVAL') tripStatus = DriverTripStatus.OFFLINE;

        let accountStatus = data.accountStatus;
        if (!accountStatus) {
          if (data.status === 'WAIT_APPROVAL') {
            accountStatus = DriverAccountStatus.PENDING;
          } else if (data.status === 'SUSPENDED') {
            accountStatus = DriverAccountStatus.SUSPENDED;
          } else {
            accountStatus = DriverAccountStatus.ACTIVE;
          }
        }

        const isOnline = tripStatus === DriverTripStatus.IDLE || tripStatus === DriverTripStatus.IN_QUEUE || tripStatus === DriverTripStatus.IN_SERVICE;
        const isActive = accountStatus === DriverAccountStatus.ACTIVE;
        if (isOnline && isActive) {
          online++;
        }
      });
      setStats(prev => ({ ...prev, driversCount: total, onlineDriversCount: online }));
    });

    // 2. Listen to users
    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setStats(prev => ({ ...prev, usersCount: snapshot.size }));
    });

    // 3. Listen to orders
    const unsubOrders = onSnapshot(collection(db, 'orders'), (snapshot) => {
      setStats(prev => ({ ...prev, ordersCount: snapshot.size }));
    });

    // 4. Listen to coupons
    const unsubCoupons = onSnapshot(collection(db, 'coupons'), (snapshot) => {
      setStats(prev => ({ ...prev, couponsCount: snapshot.size }));
    });

    // 5. Query recent 5 orders
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(5));
    const unsubRecentOrders = onSnapshot(q, (snapshot) => {
      const list: Order[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        list.push({
          id: doc.id,
          userId: data.userId || data.passengerId || 'guest',
          passengerId: data.passengerId || data.userId || 'guest',
          passengerName: data.passengerName || '訪客',
          passengerAvatar: data.passengerAvatar || '',
          driverId: data.driverId || '',
          driverName: data.driverName || '未指派',
          carPlate: data.carPlate || '',
          pickupLocation: data.pickupLocation || { lat: 0, lng: 0, address: data.startAddress || '' },
          destination: data.destination || { lat: 0, lng: 0, address: data.endAddress || '' },
          startAddress: data.startAddress || data.pickupLocation?.address || '',
          endAddress: data.endAddress || data.destination?.address || '',
          status: data.status || OrderStatus.PENDING,
          isElderlyCare: !!data.isElderlyCare,
          isScheduled: !!data.isScheduled,
          scheduledTime: data.scheduledTime || null,
          fare: data.fare,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt
        });
      });
      setRecentOrders(list);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching recent orders:", error);
      setLoading(false);
    });

    return () => {
      unsubDrivers();
      unsubUsers();
      unsubOrders();
      unsubCoupons();
      unsubRecentOrders();
    };
  }, []);

  const formatTime = (timestamp: any) => {
    if (!timestamp) return '剛剛';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
  };

  const getOrderStatusText = (status: any) => {
    const statusStr = String(status);
    switch (statusStr) {
      case '1': return '進行中';
      case '2': return '已完成';
      case '0': return '已取消';
      case OrderStatus.PENDING: return '等待派車';
      case OrderStatus.MATCHING: return '系統配車';
      case OrderStatus.ACCEPTED: return '已接單';
      case OrderStatus.ARRIVED: return '司機抵達';
      case OrderStatus.IN_PROGRESS: return '載客中';
      case OrderStatus.COMPLETED: return '已完成';
      default: return '已取消';
    }
  };

  const getOrderStatusBadgeClass = (status: any) => {
    const statusStr = String(status);
    switch (statusStr) {
      case '1':
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

  return (
    <div className="animate-fade-in">
      <div className="overview-grid">
        {/* Metric 1: Drivers */}
        <div className="glass metric-card emerald">
          <div className="metric-header">
            <span className="metric-title">司機管理</span>
            <div className="metric-icon-box">
              <Car size={20} />
            </div>
          </div>
          <div className="metric-value">{stats.driversCount}</div>
          <div className="metric-trend">
            目前有 <span className="text-green font-bold">{stats.onlineDriversCount}</span> 位司機上線服務中
          </div>
        </div>

        {/* Metric 2: Members */}
        <div className="glass metric-card purple">
          <div className="metric-header">
            <span className="metric-title">註冊乘客</span>
            <div className="metric-icon-box">
              <Users size={20} />
            </div>
          </div>
          <div className="metric-value">{stats.usersCount}</div>
          <div className="metric-trend">
            Line LIFF 綁定乘客總數
          </div>
        </div>

        {/* Metric 3: Orders */}
        <div className="glass metric-card indigo">
          <div className="metric-header">
            <span className="metric-title">總訂單數</span>
            <div className="metric-icon-box">
              <ClipboardList size={20} />
            </div>
          </div>
          <div className="metric-value">{stats.ordersCount}</div>
          <div className="metric-trend">
            所有叫車歷史與派遣紀錄
          </div>
        </div>

        {/* Metric 4: Coupons */}
        <div className="glass metric-card amber">
          <div className="metric-header">
            <span className="metric-title">行銷優惠券</span>
            <div className="metric-icon-box">
              <Tag size={20} />
            </div>
          </div>
          <div className="metric-value">{stats.couponsCount}</div>
          <div className="metric-trend">
            流通中促銷優惠代碼
          </div>
        </div>
      </div>

      {/* Row 2: Recent Orders & Quick Navigation Links */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
        
        {/* Recent Activity List */}
        <div className="glass content-sheet" style={{ margin: 0 }}>
          <div className="sheet-title-row" style={{ marginBottom: 16 }}>
            <h2 className="sheet-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={18} className="text-cyan" />
              即時派遣動態 (最新訂單)
            </h2>
            <button 
              onClick={() => onNavigate('orders')}
              style={{ background: 'transparent', border: 'none', color: 'var(--color-primary)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              檢視全部訂單 <ArrowUpRight size={14} />
            </button>
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>載入中...</div>
          ) : recentOrders.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>尚無任何訂單記錄。</div>
          ) : (
            <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>乘客</th>
                    <th>司機</th>
                    <th>起點 / 終點</th>
                    <th>狀態</th>
                    <th>時間</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {order.passengerAvatar ? (
                            <img src={order.passengerAvatar} alt={order.passengerName || '乘客'} style={{ width: 24, height: 24, borderRadius: '50%' }} />
                          ) : (
                            <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem' }}>
                              {(order.passengerName || '客')[0]}
                            </div>
                          )}
                          <span style={{ fontWeight: 600 }}>{order.passengerName || '訪客乘客'}</span>
                        </div>
                      </td>
                      <td>
                        <span style={{ color: order.driverName === '未指派' ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                          {order.driverName}
                        </span>
                      </td>
                      <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{order.pickupLocation?.address || order.startAddress}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>→ {order.destination?.address || order.endAddress}</div>
                      </td>
                      <td>
                        <span className={getOrderStatusBadgeClass(order.status)}>
                          {getOrderStatusText(order.status)}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {formatTime(order.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Quick Operations Guide */}
        <div className="glass content-sheet" style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h2 className="sheet-title">快速操作選單</h2>
          
          <button 
            onClick={() => onNavigate('dispatch')}
            className="btn-primary" 
            style={{ width: '100%', justifyContent: 'center', padding: 14 }}
          >
            即時派車現況地圖
          </button>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>系統操作說明</span>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              1. <b>派車現況</b>: 提供滿版地圖，即時更新線上司機軌跡，並可檢視叫車熱點。
            </p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              2. <b>手動指派</b>: 在「訂單管理」分頁，可手動為任何乘客指派特定上線司機。
            </p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              3. <b>行銷折扣</b>: 「優惠券管理」可建立草稿；新戶券依設定自動配發，補償券由管理員選擇乘客發送。
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
