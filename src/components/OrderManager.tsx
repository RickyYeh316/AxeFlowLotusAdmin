'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase/config';
import { collection, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { Plus, X, Check, Compass, AlertCircle, ShoppingBag, MapPin, Search, ChevronUp, ChevronDown, Trash2, Calendar } from 'lucide-react';
import { Order, Driver, User, OrderStatus, DriverStatus } from '../types';

export default function OrderManager() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  // Sorting State
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'ascending' | 'descending' } | null>({
    key: 'createdAt',
    direction: 'descending'
  });

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter]);

  // Form states for Dispatch
  const [showDispatchModal, setShowDispatchModal] = useState(false);

  useEffect(() => {
    if (showDispatchModal) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [showDispatchModal]);

  const [error, setError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [manualPassengerName, setManualPassengerName] = useState('');
  const [selectedDriverEmail, setSelectedDriverEmail] = useState('');
  const [startAddress, setStartAddress] = useState('台北車站');
  const [endAddress, setEndAddress] = useState('台北 101');
  const [customFare, setCustomFare] = useState('200');

  // Load orders, drivers, and users
  useEffect(() => {
    // 1. Subscribe to orders
    const unsubOrders = onSnapshot(collection(db, 'orders'), (snapshot) => {
      const list: Order[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        list.push({
          id: doc.id,
          readableId: data.readableId || doc.id.slice(0, 8),
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
          isElderlyCare: data.isElderlyCare || false,
          isScheduled: data.isScheduled || false,
          scheduledTime: data.scheduledTime,
          status: data.status || OrderStatus.PENDING,
          fare: data.fare,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt
        });
      });
      // Sort orders by date descending
      list.sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
        return timeB - timeA;
      });
      setOrders(list);
      setLoading(false);
    }, (error) => {
      console.error("Error subscribing to orders:", error);
      setLoading(false);
    });

    // 2. Subscribe to drivers (to select online ones)
    const unsubDrivers = onSnapshot(collection(db, 'drivers'), (snapshot) => {
      const list: Driver[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        let driverStatus = data.status || DriverStatus.OFFLINE;
        if (driverStatus === 0 || driverStatus === '0') driverStatus = DriverStatus.OFFLINE;
        else if (driverStatus === 1 || driverStatus === '1') driverStatus = DriverStatus.IDLE;
        else if (driverStatus === 2 || driverStatus === '2') driverStatus = DriverStatus.IN_SERVICE;

        list.push({
          email: doc.id,
          id: doc.id,
          name: data.name || '',
          phone: data.phone || '',
          plateNumber: data.plateNumber || data.carPlate || '',
          carPlate: data.carPlate || data.plateNumber || '',
          carColor: data.carColor || '',
          carMaker: data.carMaker || '',
          carModel: data.carModel || '',
          avatar: data.avatar || '',
          status: driverStatus as DriverStatus,
          working: driverStatus === DriverStatus.IDLE,
          isWorking: driverStatus === DriverStatus.IN_SERVICE,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt
        });
      });
      setDrivers(list);
    });

    // 3. Subscribe to users (to select passenger)
    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const list: User[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        list.push({
          userId: doc.id,
          name: data.name || data.displayName || '',
          displayName: data.displayName || data.name || '',
          pictureUrl: data.pictureUrl || '',
          status: data.status || 'NORMAL',
          noShowCount: data.noShowCount || 0,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt
        });
      });
      setUsers(list);
    });

    return () => {
      unsubOrders();
      unsubDrivers();
      unsubUsers();
    };
  }, []);

  // Filter online drivers
  const onlineDrivers = drivers.filter(d => d.status === DriverStatus.IDLE || d.status === DriverStatus.IN_QUEUE);

  // Form check fields
  const [isElderlyCare, setIsElderlyCare] = useState(false);
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledTime, setScheduledTime] = useState('');

  const handleOpenDispatch = () => {
    setSelectedUserId(users[0]?.userId || 'guest');
    setManualPassengerName('');
    setSelectedDriverEmail(onlineDrivers[0]?.email || '');
    setStartAddress('台北車站');
    setEndAddress('台北 101');
    setCustomFare('250');
    setIsElderlyCare(false);
    setIsScheduled(false);
    setScheduledTime('');
    setError(null);
    setShowDispatchModal(true);
  };

  const handleDispatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate
    if (!selectedDriverEmail) {
      setError('請選擇上線服務中的司機！如果沒有司機上線，請先在「司機管理」中將某個司機狀態改為空車。');
      return;
    }
    if (selectedUserId === 'manual' && !manualPassengerName.trim()) {
      setError('請輸入乘客姓名！');
      return;
    }
    if (!startAddress.trim() || !endAddress.trim()) {
      setError('起點與終點不能為空！');
      return;
    }

    try {
      // Find driver info
      const driver = drivers.find(d => d.email === selectedDriverEmail);
      if (!driver) throw new Error('找不到選定司機');

      // Prepare passenger info
      let passId = 'guest';
      let passName = '訪客乘客';
      let passAvatar = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150';

      if (selectedUserId === 'manual') {
        passId = 'manual_' + Date.now();
        passName = manualPassengerName.trim();
      } else if (selectedUserId !== 'guest') {
        const user = users.find(u => u.userId === selectedUserId);
        if (user) {
          passId = user.userId;
          passName = user.displayName;
          passAvatar = user.pictureUrl;
        }
      }

      let schedTime: any = null;
      if (isScheduled && scheduledTime) {
        schedTime = Timestamp.fromDate(new Date(scheduledTime));
      }

      const orderData: any = {
        userId: passId,
        passengerId: passId, // Compatibility
        passengerName: passName,
        passengerAvatar: passAvatar,
        driverId: driver.email,
        driverName: driver.name,
        carPlate: driver.plateNumber || driver.carPlate,
        pickupLocation: {
          lat: 25.0412 + (Math.random() - 0.5) * 0.01,
          lng: 121.5645 + (Math.random() - 0.5) * 0.01,
          address: startAddress.trim()
        },
        destination: {
          lat: 25.0412 + (Math.random() - 0.5) * 0.01,
          lng: 121.5645 + (Math.random() - 0.5) * 0.01,
          address: endAddress.trim()
        },
        startAddress: startAddress.trim(), // Compatibility
        endAddress: endAddress.trim(), // Compatibility
        isElderlyCare: isElderlyCare,
        isScheduled: isScheduled,
        status: OrderStatus.ACCEPTED,
        fare: Number(customFare) || 200,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      if (schedTime) {
        orderData.scheduledTime = schedTime;
      }

      // Add to Firestore
      await addDoc(collection(db, 'orders'), orderData);
      
      // Update driver status in Firestore to Busy (IN_SERVICE) so they can't be dispatched again immediately
      const driverRef = doc(db, 'drivers', driver.email);
      await updateDoc(driverRef, {
        status: DriverStatus.IN_SERVICE,
        updatedAt: serverTimestamp()
      });

      setShowDispatchModal(false);
    } catch (err: any) {
      console.error("Manual dispatch failed:", err);
      setError(err.message || '派車失敗，請重試。');
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, actionType: 'complete' | 'cancel', driverEmail: string) => {
    try {
      const orderRef = doc(db, 'orders', orderId);
      
      if (actionType === 'complete') {
        // Complete the order
        await updateDoc(orderRef, {
          status: OrderStatus.COMPLETED,
          updatedAt: serverTimestamp()
        });

        // Set driver status back to Online (DriverStatus.IDLE)
        if (driverEmail) {
          const driverRef = doc(db, 'drivers', driverEmail);
          await updateDoc(driverRef, {
            status: DriverStatus.IDLE,
            updatedAt: serverTimestamp()
          });
        }
      } else {
        // Cancel/Archive order
        await updateDoc(orderRef, {
          status: OrderStatus.CANCELLED_BY_USER,
          updatedAt: serverTimestamp()
        });

        // Set driver status back to Online (DriverStatus.IDLE)
        if (driverEmail) {
          const driverRef = doc(db, 'drivers', driverEmail);
          await updateDoc(driverRef, {
            status: DriverStatus.IDLE,
            updatedAt: serverTimestamp()
          });
        }
      }
    } catch (err) {
      console.error("Failed to update order status:", err);
      alert('更新狀態失敗！');
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (window.confirm('確定要刪除此訂單記錄嗎？此動作無法復原。')) {
      try {
        await deleteDoc(doc(db, 'orders', orderId));
      } catch (err) {
        console.error("Failed to delete order:", err);
        alert('刪除失敗。');
      }
    }
  };

  const getOrderStatusText = (status: any) => {
    const statusStr = String(status);
    switch (statusStr) {
      case '1': return '已派遣/進行中';
      case '2': return '已完成';
      case '0': return '已取消';
      case OrderStatus.PENDING: return '等待派車';
      case OrderStatus.MATCHING: return '系統配車中';
      case OrderStatus.ACCEPTED: return '司機接單';
      case OrderStatus.ARRIVED: return '司機已抵達';
      case OrderStatus.IN_PROGRESS: return '行程進行中';
      case OrderStatus.COMPLETED: return '已完成';
      case OrderStatus.CANCELLED_BY_USER: return '乘客取消';
      case OrderStatus.DRIVER_CANCELLED: return '司機取消';
      case OrderStatus.NO_SHOW: return '乘客未搭乘';
      case OrderStatus.FAILED_MATCH: return '配車失敗';
      default: return '處理中';
    }
  };

  const getOrderStatusClass = (status: any) => {
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

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '剛剛';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  // Filtering States
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  // Filter orders
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // 1. Status filter
      let matchesStatus = true;
      const statusStr = String(order.status);
      
      if (statusFilter === 'active') {
        matchesStatus = 
          order.status === 1 || 
          statusStr === 'PENDING' || 
          statusStr === 'MATCHING' || 
          statusStr === 'ACCEPTED' || 
          statusStr === 'ARRIVED' || 
          statusStr === 'IN_PROGRESS';
      } else if (statusFilter === 'completed') {
        matchesStatus = order.status === 2 || statusStr === 'COMPLETED';
      } else if (statusFilter === 'closed') {
        matchesStatus = 
          order.status === 0 || 
          statusStr === 'CANCELLED_BY_USER' || 
          statusStr === 'DRIVER_CANCELLED' || 
          statusStr === 'NO_SHOW' || 
          statusStr === 'FAILED_MATCH';
      }

      // 2. Search query filter
      let matchesSearch = true;
      if (searchQuery.trim()) {
        const searchLower = searchQuery.toLowerCase();
        const startAddr = order.pickupLocation?.address || order.startAddress || '';
        const endAddr = order.destination?.address || order.endAddress || '';
        matchesSearch = 
          order.id.toLowerCase().includes(searchLower) ||
          (order.readableId || '').toLowerCase().includes(searchLower) ||
          (order.passengerName || '').toLowerCase().includes(searchLower) ||
          (order.driverName || '').toLowerCase().includes(searchLower) ||
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
  }, [orders, statusFilter, searchQuery, typeFilter]);

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
          <h2 className="sheet-title">叫車訂單管理 ({filteredOrders.length})</h2>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={() => setStatusFilter('all')} className={`category-pill ${statusFilter === 'all' ? 'active' : ''}`}>全部訂單</button>
            <button onClick={() => setStatusFilter('active')} className={`category-pill ${statusFilter === 'active' ? 'active' : ''}`}>進行中</button>
            <button onClick={() => setStatusFilter('completed')} className={`category-pill ${statusFilter === 'completed' ? 'active' : ''}`}>已完成</button>
            <button onClick={() => setStatusFilter('closed')} className={`category-pill ${statusFilter === 'closed' ? 'active' : ''}`}>已取消</button>
          </div>
        </div>

        <button onClick={handleOpenDispatch} className="btn-primary">
          <Plus size={16} />
          手動派遣叫車
        </button>
      </div>

      {/* Advanced Filter Inputs Bar */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Search Input */}
        <div className="search-wrapper" style={{ width: 280 }}>
          <Search size={16} className="search-icon" />
          <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            placeholder="搜尋乘客、司機、地址、編號..." 
            className="search-input"
          />
        </div>

        {/* Order Type Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          <span>乘車類型:</span>
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
            <option value="REGULAR" style={{ background: '#0c0d14' }}>一般車單</option>
            <option value="ELDERLY" style={{ background: '#0c0d14' }}>敬老愛心車</option>
            <option value="SCHEDULED" style={{ background: '#0c0d14' }}>預約車單</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>載入訂單資料中...</div>
      ) : filteredOrders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>無任何訂單紀錄。</div>
      ) : (
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ cursor: 'pointer' }} onClick={() => requestSort('passengerName')}>乘客資訊 {getSortIcon('passengerName')}</th>
                <th style={{ cursor: 'pointer' }} onClick={() => requestSort('driverName')}>指派司機 / 車牌 {getSortIcon('driverName')}</th>
                <th style={{ cursor: 'pointer' }} onClick={() => requestSort('startAddress')}>行程起迄點 {getSortIcon('startAddress')}</th>
                <th style={{ cursor: 'pointer' }} onClick={() => requestSort('fare')}>車資費用 {getSortIcon('fare')}</th>
                <th style={{ cursor: 'pointer' }} onClick={() => requestSort('status')}>派遣狀態 {getSortIcon('status')}</th>
                <th style={{ cursor: 'pointer' }} onClick={() => requestSort('createdAt')}>派遣時間 {getSortIcon('createdAt')}</th>
                <th>後台管理</th>
              </tr>
            </thead>
            <tbody>
              {paginatedOrders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {order.passengerAvatar ? (
                        <img src={order.passengerAvatar} alt={order.passengerName} style={{ width: 28, height: 28, borderRadius: '50%' }} />
                      ) : (
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}>
                          {order.passengerName[0]}
                        </div>
                      )}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600 }}>{order.passengerName}</span>
                          {order.isElderlyCare && (
                            <span style={{ marginLeft: 6, fontSize: '0.65rem', padding: '1px 5px', background: 'rgba(99, 102, 241, 0.2)', color: 'var(--color-primary)', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: 4 }}>敬老</span>
                          )}
                          {order.isScheduled && (
                            <span style={{ marginLeft: 6, fontSize: '0.65rem', padding: '1px 5px', background: 'rgba(234, 179, 8, 0.2)', color: 'var(--color-accent)', border: '1px solid rgba(234, 179, 8, 0.3)', borderRadius: 4 }}>預約</span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>ID: {order.passengerId.slice(0, 10)}...</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span style={{ fontWeight: 600, color: order.driverName === '未指派' ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                      {order.driverName}
                    </span>
                    {order.carPlate && (
                      <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-secondary)', marginTop: 2 }}>
                        {order.carPlate}
                      </div>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <MapPin size={10} className="text-cyan" />
                        起點: {order.pickupLocation?.address || order.startAddress}
                      </span>
                      <span style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <MapPin size={10} className="text-gold" />
                        終點: {order.destination?.address || order.endAddress}
                      </span>
                    </div>
                  </td>
                  <td style={{ fontWeight: 700, color: 'white', fontFamily: 'Outfit' }}>
                    NT$ {order.fare || 0}
                  </td>
                  <td>
                    <span className={getOrderStatusClass(order.status)}>
                      {getOrderStatusText(order.status)}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {formatDate(order.createdAt)}
                  </td>
                  <td>
                    <div className="action-btn-row">
                      {(order.status === 1 || String(order.status) === 'ACCEPTED' || String(order.status) === 'IN_PROGRESS' || String(order.status) === 'ARRIVED' || String(order.status) === 'PENDING' || String(order.status) === 'MATCHING') && (
                        <>
                          <button 
                            onClick={() => handleUpdateOrderStatus(order.id, 'complete', order.driverId)}
                            className="btn-icon edit" 
                            style={{ borderColor: 'rgba(16, 185, 129, 0.3)', color: 'var(--color-success)' }}
                            title="完成行程"
                          >
                            <Check size={14} />
                          </button>
                          <button 
                            onClick={() => handleUpdateOrderStatus(order.id, 'cancel', order.driverId)}
                            className="btn-icon delete" 
                            title="取消叫車"
                          >
                            <X size={14} />
                          </button>
                        </>
                      )}
                      <button onClick={() => handleDeleteOrder(order.id)} className="btn-icon delete" title="刪除記錄">
                        <Trash2 size={14} />
                      </button>
                    </div>
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
      </div>

      {/* Manual Dispatch Modal */}
      {showDispatchModal && (
        <div className="modal-overlay">
          <div className="glass modal-content animate-fade-in" style={{ background: '#0c0d16', border: '1px solid var(--border-color-hover)' }}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Compass size={20} className="text-cyan" />
                後台人工手動指派車輛
              </h3>
              <button onClick={() => setShowDispatchModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            {error && (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: 12, borderRadius: 'var(--radius-sm)', color: '#f87171', fontSize: '0.8rem', display: 'flex', gap: 6, alignItems: 'center' }}>
                <AlertCircle size={16} />
                <span style={{ flexGrow: 1 }}>{error}</span>
              </div>
            )}

            <form onSubmit={handleDispatchSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Select Passenger */}
              <div className="form-group">
                <label className="form-label">選擇叫車乘客</label>
                <select 
                  value={selectedUserId} 
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="form-select"
                >
                  <option value="guest">訪客乘車 (免註冊)</option>
                  <option value="manual">手動輸入乘客姓名...</option>
                  {users.map(u => (
                    <option key={u.userId} value={u.userId}>{u.displayName} ({u.userId.slice(0, 8)})</option>
                  ))}
                </select>
              </div>

              {selectedUserId === 'manual' && (
                <div className="form-group">
                  <label className="form-label">輸入乘客姓名</label>
                  <input 
                    type="text" 
                    value={manualPassengerName}
                    onChange={(e) => setManualPassengerName(e.target.value)}
                    placeholder="例如：陳大明" 
                    className="form-input"
                    required
                  />
                </div>
              )}

              {/* Select Driver */}
              <div className="form-group">
                <label className="form-label">指派上線司機 (空車中)</label>
                <select 
                  value={selectedDriverEmail} 
                  onChange={(e) => setSelectedDriverEmail(e.target.value)}
                  className="form-select"
                  required
                >
                  {onlineDrivers.length === 0 ? (
                    <option value="">-- 無任何空閒司機上線中 --</option>
                  ) : (
                    onlineDrivers.map(d => (
                      <option key={d.email} value={d.email}>{d.name} ({d.carPlate}) - {d.carMaker} {d.carModel}</option>
                    ))
                  )}
                </select>
                {onlineDrivers.length === 0 && (
                  <p style={{ fontSize: '0.7rem', color: 'var(--color-accent)', marginTop: 4 }}>
                    請先至「司機管理」將至少一位司機的狀態變更為「服務中」以進行測試派遣。
                  </p>
                )}
              </div>

              {/* Addresses */}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">上車起點地址</label>
                  <input 
                    type="text" 
                    value={startAddress}
                    onChange={(e) => setStartAddress(e.target.value)}
                    placeholder="起點" 
                    className="form-input"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">下車終點地址</label>
                  <input 
                    type="text" 
                    value={endAddress}
                    onChange={(e) => setEndAddress(e.target.value)}
                    placeholder="終點" 
                    className="form-input"
                    required
                  />
                </div>
              </div>

              {/* Fare */}
              <div className="form-group">
                <label className="form-label">預估行程車資 (NT$)</label>
                <input 
                  type="number" 
                  value={customFare}
                  onChange={(e) => setCustomFare(e.target.value)}
                  placeholder="250" 
                  className="form-input"
                  min="0"
                />
              </div>

              {/* Elderly Care & Reservations checkboxes */}
              <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginTop: 4 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={isElderlyCare}
                    onChange={(e) => setIsElderlyCare(e.target.checked)}
                    style={{ cursor: 'pointer', accentColor: 'var(--color-primary)' }}
                  />
                  <span>敬老愛心車 (愛心卡優惠)</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={isScheduled}
                    onChange={(e) => setIsScheduled(e.target.checked)}
                    style={{ cursor: 'pointer', accentColor: 'var(--color-primary)' }}
                  />
                  <span>預約乘車單 (排定時間)</span>
                </label>
              </div>

              {isScheduled && (
                <div className="form-group animate-fade-in">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Calendar size={14} className="text-gold" />
                    選擇預約派遣時間
                  </label>
                  <input 
                    type="datetime-local" 
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="form-input"
                    required={isScheduled}
                    style={{
                      color: 'var(--text-primary)',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid var(--border-color)'
                    }}
                  />
                </div>
              )}

              <div className="modal-footer">
                <button type="button" onClick={() => setShowDispatchModal(false)} className="btn-secondary">
                  取消
                </button>
                <button type="submit" className="btn-primary" disabled={onlineDrivers.length === 0}>
                  <Compass size={16} />
                  確認派遣出車
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
