'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase/config';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { Search, Plus, Edit2, Trash2, X, Check, AlertTriangle, Star, ChevronUp, ChevronDown } from 'lucide-react';
import { Driver, DriverTripStatus, DriverAccountStatus } from '../types';

export default function DriverManager() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Sorting State
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'ascending' | 'descending' } | null>({
    key: 'name',
    direction: 'ascending'
  });
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [carPlate, setCarPlate] = useState('');
  const [carColor, setCarColor] = useState('黃');
  const [carMaker, setCarMaker] = useState('Toyota');
  const [carModel, setCarModel] = useState('Sienta');
  const [vehicleType, setVehicleType] = useState('standard');
  const [tripStatus, setTripStatus] = useState<DriverTripStatus>(DriverTripStatus.OFFLINE);
  const [accountStatus, setAccountStatus] = useState<DriverAccountStatus>(DriverAccountStatus.ACTIVE);

  useEffect(() => {
    if (showModal) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [showModal]);

  // Listen to Firestore
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'drivers'), (snapshot) => {
      const list: Driver[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        
        // 1. Parsing Trip Status with migration fallbacks
        let parsedTripStatus = data.tripStatus || data.status || DriverTripStatus.OFFLINE;
        if (parsedTripStatus === 0 || parsedTripStatus === '0') parsedTripStatus = DriverTripStatus.OFFLINE;
        else if (parsedTripStatus === 1 || parsedTripStatus === '1') parsedTripStatus = DriverTripStatus.IDLE;
        else if (parsedTripStatus === 2 || parsedTripStatus === '2') parsedTripStatus = DriverTripStatus.IN_SERVICE;
        else if (parsedTripStatus === 'SUSPENDED' || parsedTripStatus === 'WAIT_APPROVAL') parsedTripStatus = DriverTripStatus.OFFLINE;

        // 2. Parsing Account Status with migration fallbacks
        let parsedAccountStatus = data.accountStatus;
        if (!parsedAccountStatus) {
          if (data.status === 'WAIT_APPROVAL') {
            parsedAccountStatus = DriverAccountStatus.PENDING;
          } else if (data.status === 'SUSPENDED') {
            parsedAccountStatus = DriverAccountStatus.SUSPENDED;
          } else {
            parsedAccountStatus = DriverAccountStatus.ACTIVE;
          }
        }

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
          avatar: data.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
          tripStatus: parsedTripStatus as DriverTripStatus,
          accountStatus: parsedAccountStatus as DriverAccountStatus,
          working: parsedTripStatus === DriverTripStatus.IDLE,
          isWorking: parsedTripStatus === DriverTripStatus.IN_SERVICE,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt
        });
      });
      setDrivers(list);
      setLoading(false);
    }, (err) => {
      console.error("Error reading drivers:", err);
      setLoading(false);
    });

    return () => unsub();
  }, []);

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

  // Filtering States
  const [searchQuery, setSearchQuery] = useState('');
  const [accountFilter, setAccountFilter] = useState<string>('ALL');
  const [tripFilter, setTripFilter] = useState<string>('ALL');

  // Filtering & Sorting Logic
  const filteredDrivers = useMemo(() => {
    return drivers.filter((driver) => {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = 
        driver.name.toLowerCase().includes(searchLower) ||
        driver.email.toLowerCase().includes(searchLower) ||
        (driver.phone || '').toLowerCase().includes(searchLower) ||
        driver.plateNumber.toLowerCase().includes(searchLower);

      let matchesAccount = true;
      if (accountFilter !== 'ALL') {
        matchesAccount = driver.accountStatus === accountFilter;
      }

      let matchesTrip = true;
      if (tripFilter !== 'ALL') {
        if (tripFilter === 'ONLINE_IDLE') {
          matchesTrip = driver.tripStatus === DriverTripStatus.IDLE || driver.tripStatus === DriverTripStatus.IN_QUEUE;
        } else if (tripFilter === 'BUSY') {
          matchesTrip = 
            driver.tripStatus === DriverTripStatus.DISPATCHED ||
            driver.tripStatus === DriverTripStatus.EN_ROUTE ||
            driver.tripStatus === DriverTripStatus.ARRIVED ||
            driver.tripStatus === DriverTripStatus.IN_SERVICE;
        } else {
          matchesTrip = driver.tripStatus === tripFilter;
        }
      }

      return matchesSearch && matchesAccount && matchesTrip;
    });
  }, [drivers, searchQuery, accountFilter, tripFilter]);

  const sortedDrivers = useMemo(() => {
    let sortable = [...filteredDrivers];
    if (sortConfig !== null) {
      sortable.sort((a: any, b: any) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];

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
  }, [filteredDrivers, sortConfig]);

  const totalPages = Math.ceil(sortedDrivers.length / itemsPerPage);
  const paginatedDrivers = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedDrivers.slice(start, start + itemsPerPage);
  }, [sortedDrivers, currentPage, itemsPerPage]);

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

  const openAddModal = () => {
    setIsEdit(false);
    setEmail('');
    setName('');
    setPhone('');
    setCarPlate('');
    setCarColor('黃');
    setCarMaker('Toyota');
    setCarModel('Sienta');
    setTripStatus(DriverTripStatus.OFFLINE);
    setAccountStatus(DriverAccountStatus.PENDING);
    setError(null);
    setShowModal(true);
  };

  const openEditModal = (driver: Driver) => {
    setIsEdit(true);
    setEmail(driver.email);
    setName(driver.name);
    setPhone(driver.phone || '');
    setCarPlate(driver.plateNumber || driver.carPlate || '');
    setCarColor(driver.carColor || '');
    setCarMaker(driver.carMaker || '');
    setCarModel(driver.carModel || '');
    setTripStatus(driver.tripStatus);
    setAccountStatus(driver.accountStatus);
    setError(null);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !name.trim() || !phone.trim() || !carPlate.trim()) {
      setError('請填寫所有必要欄位！');
      return;
    }

    try {
      const driverEmail = email.trim().toLowerCase();
      const driverRef = doc(db, 'drivers', driverEmail);

      const driverData: any = {
        name: name.trim(),
        phone: phone.trim(),
        plateNumber: carPlate.trim().toUpperCase(),
        carPlate: carPlate.trim().toUpperCase(),
        carColor: carColor.trim(),
        carMaker: carMaker.trim(),
        carModel: carModel.trim(),
        tripStatus: tripStatus,
        accountStatus: accountStatus,
        updatedAt: new Date()
      };

      if (!isEdit) {
        // New Driver defaults
        driverData.createdAt = new Date();
        driverData.loginCount = 0;
        driverData.avatar = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80';
        driverData.currentLocation = {
          lat: 25.0412 + (Math.random() - 0.5) * 0.02,
          lng: 121.5645 + (Math.random() - 0.5) * 0.02,
          bearing: Math.floor(Math.random() * 360),
          speed: 0,
          updatedAt: new Date()
        };
      }

      await setDoc(driverRef, driverData, { merge: true });
      setShowModal(false);
    } catch (err: any) {
      console.error("Failed to save driver:", err);
      setError(err.message || '儲存失敗，請重試。');
    }
  };

  const handleDelete = async (driverEmail: string) => {
    if (window.confirm(`確定要刪除司機 ${driverEmail} 嗎？此動作無法復原。`)) {
      try {
        await deleteDoc(doc(db, 'drivers', driverEmail));
      } catch (err) {
        console.error("Failed to delete driver:", err);
        alert('刪除失敗，請檢查權限。');
      }
    }
  };

  const getDriverAccountStatusText = (driver: Driver) => {
    switch (driver.accountStatus) {
      case DriverAccountStatus.PENDING: return '等待開通';
      case DriverAccountStatus.ACTIVE: return '正常啟用';
      case DriverAccountStatus.SUSPENDED: return '限制停權';
      default: return '正常啟用';
    }
  };

  const getDriverAccountStatusClass = (driver: Driver) => {
    switch (driver.accountStatus) {
      case DriverAccountStatus.ACTIVE: return 'status-pill online';
      case DriverAccountStatus.PENDING: return 'status-pill pending';
      case DriverAccountStatus.SUSPENDED: return 'status-pill offline';
      default: return 'status-pill online';
    }
  };

  const getDriverTripStatusText = (driver: Driver) => {
    switch (driver.tripStatus) {
      case DriverTripStatus.OFFLINE: return '已下線';
      case DriverTripStatus.IDLE: return '上線空車';
      case DriverTripStatus.IN_QUEUE: return '排班中';
      case DriverTripStatus.DISPATCHED: return '媒合中';
      case DriverTripStatus.EN_ROUTE: return '前往接客';
      case DriverTripStatus.ARRIVED: return '抵達乘客點';
      case DriverTripStatus.IN_SERVICE: return '載客中';
      default: return '已下線';
    }
  };

  const getDriverTripStatusClass = (driver: Driver) => {
    switch (driver.tripStatus) {
      case DriverTripStatus.OFFLINE: return 'status-pill offline';
      case DriverTripStatus.IDLE:
      case DriverTripStatus.IN_QUEUE:
        return 'status-pill online';
      default:
        return 'status-pill busy';
    }
  };

  return (
    <>
      <div className="glass content-sheet animate-fade-in">
      <div className="sheet-title-row">
        <h2 className="sheet-title">司機管理 ({drivers.length})</h2>
        <button onClick={openAddModal} className="btn-primary">
          <Plus size={16} />
          註冊新司機
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>載入司機名冊中...</div>
      ) : (
        <>
          {/* Filters Bar */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Search */}
            <div className="search-wrapper" style={{ width: 280 }}>
              <Search size={16} className="search-icon" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                placeholder="搜尋司機姓名、電話、車牌..." 
                className="search-input"
              />
            </div>

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
                <option value="PENDING" style={{ background: '#0c0d14' }}>等待開通 (PENDING)</option>
                <option value="ACTIVE" style={{ background: '#0c0d14' }}>啟用正常 (ACTIVE)</option>
                <option value="SUSPENDED" style={{ background: '#0c0d14' }}>限制停權 (SUSPENDED)</option>
              </select>
            </div>

            {/* Trip Status Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <span>行程狀態:</span>
              <select 
                value={tripFilter}
                onChange={(e) => { setTripFilter(e.target.value); setCurrentPage(1); }}
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
                <option value="ALL" style={{ background: '#0c0d14' }}>全部行程狀態</option>
                <option value="OFFLINE" style={{ background: '#0c0d14' }}>已下線 (OFFLINE)</option>
                <option value="ONLINE_IDLE" style={{ background: '#0c0d14' }}>空車候客 (IDLE/排班中)</option>
                <option value="BUSY" style={{ background: '#0c0d14' }}>載客忙碌 (媒合/載客中)</option>
              </select>
            </div>
          </div>

          {filteredDrivers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              {searchQuery || accountFilter !== 'ALL' || tripFilter !== 'ALL' ? '找不到符合篩選條件的司機。' : '目前尚無註冊司機。'}
            </div>
          ) : (
            <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th style={{ cursor: 'pointer' }} onClick={() => requestSort('name')}>司機姓名 {getSortIcon('name')}</th>
                    <th style={{ cursor: 'pointer' }} onClick={() => requestSort('email')}>電子郵件 {getSortIcon('email')}</th>
                    <th style={{ cursor: 'pointer' }} onClick={() => requestSort('phone')}>聯絡電話 {getSortIcon('phone')}</th>
                    <th style={{ cursor: 'pointer' }} onClick={() => requestSort('plateNumber')}>車牌號碼 {getSortIcon('plateNumber')}</th>
                    <th style={{ cursor: 'pointer' }} onClick={() => requestSort('carMaker')}>車款車色 {getSortIcon('carMaker')}</th>
                    <th style={{ cursor: 'pointer' }} onClick={() => requestSort('accountStatus')}>帳號狀態 {getSortIcon('accountStatus')}</th>
                    <th style={{ cursor: 'pointer' }} onClick={() => requestSort('tripStatus')}>工作行程 {getSortIcon('tripStatus')}</th>
                    <th>操作</th>
                  </tr>
                </thead>
            <tbody>
              {paginatedDrivers.map((driver) => (
                <tr key={driver.email}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <img src={driver.avatar} alt={driver.name} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border-color)' }} />
                      <div>
                        <div style={{ fontWeight: 700 }}>{driver.name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                          <Star size={10} fill="var(--color-accent)" stroke="var(--color-accent)" />
                          <span>4.9 (滿意)</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {driver.email}
                  </td>
                  <td>{driver.phone}</td>
                  <td>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border-color)' }}>
                      {driver.plateNumber}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {driver.carColor}色 {driver.carMaker} {driver.carModel}
                  </td>
                  <td>
                    <span className={getDriverAccountStatusClass(driver)}>
                      {getDriverAccountStatusText(driver)}
                    </span>
                  </td>
                  <td>
                    <span className={getDriverTripStatusClass(driver)}>
                      {getDriverTripStatusText(driver)}
                    </span>
                  </td>
                  <td>
                    <div className="action-btn-row">
                      <button onClick={() => openEditModal(driver)} className="btn-icon edit" title="編輯">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => handleDelete(driver.email)} className="btn-icon delete" title="刪除">
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
                  顯示第 {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, sortedDrivers.length)} 筆，共 {sortedDrivers.length} 筆資料
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
      )
    }
  </>
)}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="glass modal-content animate-fade-in" style={{ background: '#0c0d16', border: '1px solid var(--border-color-hover)' }}>
            <div className="modal-header">
              <h3 className="modal-title">{isEdit ? '編輯司機資訊' : '註冊新司機帳號'}</h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            {error && (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: 12, borderRadius: 'var(--radius-sm)', color: '#f87171', fontSize: '0.8rem', display: 'flex', gap: 8, alignItems: 'center' }}>
                <AlertTriangle size={16} />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="form-group">
                <label className="form-label">電子郵件 (帳號唯一 ID / 必填)</label>
                <input 
                  type="email" 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isEdit}
                  placeholder="driver.name@gmail.com" 
                  className="form-input"
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">司機姓名 (必填)</label>
                  <input 
                    type="text" 
                    value={name} 
                    onChange={(e) => setName(e.target.value)}
                    placeholder="姓名" 
                    className="form-input"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">聯絡電話 (必填)</label>
                  <input 
                    type="text" 
                    value={phone} 
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0912-345-678" 
                    className="form-input"
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">車牌號碼 (必填)</label>
                  <input 
                    type="text" 
                    value={carPlate} 
                    onChange={(e) => setCarPlate(e.target.value)}
                    placeholder="ABC-1234" 
                    className="form-input"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">車輛外觀顏色</label>
                  <input 
                    type="text" 
                    value={carColor} 
                    onChange={(e) => setCarColor(e.target.value)}
                    placeholder="黃、黑、白" 
                    className="form-input"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">汽車廠牌</label>
                  <input 
                    type="text" 
                    value={carMaker} 
                    onChange={(e) => setCarMaker(e.target.value)}
                    placeholder="Toyota, Tesla" 
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">汽車車款</label>
                  <input 
                    type="text" 
                    value={carModel} 
                    onChange={(e) => setCarModel(e.target.value)}
                    placeholder="Sienta, Model Y" 
                    className="form-input"
                  />
                </div>
              </div>

              <div className="form-row" style={{ gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">帳號狀態</label>
                  <select 
                    value={accountStatus} 
                    onChange={(e) => setAccountStatus(e.target.value as DriverAccountStatus)}
                    className="form-select"
                    style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '8px 12px',
                      color: 'var(--text-primary)',
                      fontSize: '0.85rem',
                      outline: 'none'
                    }}
                  >
                    <option value={DriverAccountStatus.PENDING} style={{ background: '#0c0d14' }}>等待開通 (PENDING)</option>
                    <option value={DriverAccountStatus.ACTIVE} style={{ background: '#0c0d14' }}>啟用正常 (ACTIVE)</option>
                    <option value={DriverAccountStatus.SUSPENDED} style={{ background: '#0c0d14' }}>限制停權 (SUSPENDED)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">行程狀態</label>
                  <select 
                    value={tripStatus} 
                    onChange={(e) => setTripStatus(e.target.value as DriverTripStatus)}
                    className="form-select"
                    style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '8px 12px',
                      color: 'var(--text-primary)',
                      fontSize: '0.85rem',
                      outline: 'none'
                    }}
                  >
                    <option value={DriverTripStatus.OFFLINE} style={{ background: '#0c0d14' }}>已下線 (OFFLINE)</option>
                    <option value={DriverTripStatus.IDLE} style={{ background: '#0c0d14' }}>上線空車 (IDLE)</option>
                    <option value={DriverTripStatus.IN_QUEUE} style={{ background: '#0c0d14' }}>排班中 (IN_QUEUE)</option>
                    <option value={DriverTripStatus.DISPATCHED} style={{ background: '#0c0d14' }}>媒合中 (DISPATCHED)</option>
                    <option value={DriverTripStatus.EN_ROUTE} style={{ background: '#0c0d14' }}>接送前往 (EN_ROUTE)</option>
                    <option value={DriverTripStatus.ARRIVED} style={{ background: '#0c0d14' }}>抵達點 (ARRIVED)</option>
                    <option value={DriverTripStatus.IN_SERVICE} style={{ background: '#0c0d14' }}>載客中 (IN_SERVICE)</option>
                  </select>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">
                  取消
                </button>
                <button type="submit" className="btn-primary">
                  <Check size={16} />
                  確認儲存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
