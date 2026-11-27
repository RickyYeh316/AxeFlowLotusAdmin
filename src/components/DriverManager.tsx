'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { adminApi, AdminApiError } from '../lib/adminApi';
import { db } from '../firebase/config';
import { collection, onSnapshot, doc, updateDoc } from '../lib/loggedFirestore';
import { Search, RefreshCw, X, Check, AlertTriangle, ChevronUp, ChevronDown } from 'lucide-react';
import { Driver, DriverTripStatus, DriverAccountStatus } from '../types';

const defaultAvatar = '/passenger-avatar-default.svg';
const legacyAvatar = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde';

const categories = [
  [DriverAccountStatus.ACTIVE, '啟用', 'serving'],
  [DriverAccountStatus.SUSPENDED, '停用', 'waiting'],
  [DriverAccountStatus.ARCHIVED, '封存', 'closed'],
  ['ALL', '全部', 'all']
] as const;

function accountCategory(status: DriverAccountStatus) {
  return status === DriverAccountStatus.PENDING ? DriverAccountStatus.SUSPENDED : status;
}

export default function DriverManager() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [reloadKey, setReloadKey] = useState(0);
  const [listError, setListError] = useState('');
  const [statusBusy, setStatusBusy] = useState(false);
  const submittingStatus = useRef(false);

  // Sorting State
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'ascending' | 'descending' } | null>({
    key: 'name',
    direction: 'ascending'
  });
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Modal states
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [carPlate, setCarPlate] = useState('');
  const [carMaker, setCarMaker] = useState('');
  const [carModel, setCarModel] = useState('');

  useEffect(() => {
    if (editingDriver) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [editingDriver]);

  // Listen to Firestore
  useEffect(() => {
    setLoading(true);
    setListError('');
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
        if (parsedAccountStatus == null) {
          if (data.status === 'WAIT_APPROVAL') {
            parsedAccountStatus = DriverAccountStatus.PENDING;
          } else if (data.status === 'SUSPENDED') {
            parsedAccountStatus = DriverAccountStatus.SUSPENDED;
          } else {
            parsedAccountStatus = DriverAccountStatus.ACTIVE;
          }
        }

        const carPlate = data.carPlate || data.plateNumber || '';
        list.push({
          email: doc.id,
          id: doc.id,
          name: data.name || '',
          phone: data.phone || '',
          plateNumber: carPlate,
          carPlate,
          carColor: data.carColor || '',
          carMaker: data.carMaker || '',
          carModel: data.carModel || '',
          avatar: typeof data.avatar === 'string' && data.avatar.split('?')[0] !== legacyAvatar ? data.avatar.trim() : '',
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
      setDrivers([]);
      setListError('無法載入司機名冊，請重新整理。');
      setLoading(false);
    });

    return () => unsub();
  }, [reloadKey]);

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
        matchesAccount = accountCategory(driver.accountStatus) === accountFilter;
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
  useEffect(() => { setCurrentPage(page => Math.min(page, Math.max(1, totalPages))); }, [totalPages]);
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

  const openEditModal = (driver: Driver) => {
    setEditingDriver(driver);
    setName(driver.name);
    setPhone(driver.phone || '');
    setCarPlate(driver.plateNumber || driver.carPlate || '');
    setCarMaker(driver.carMaker || '');
    setCarModel(driver.carModel || '');
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!editingDriver) return;
    if (!name.trim() || !phone.trim() || !carPlate.trim()) {
      setError('請填寫所有必要欄位！');
      return;
    }

    try {
      const driverRef = doc(db, 'drivers', editingDriver.email);
      const plate = carPlate.trim().toUpperCase();
      const changes: Record<string, string> = {};
      if (name.trim() !== editingDriver.name) changes.name = name.trim();
      if (phone.trim() !== (editingDriver.phone || '')) changes.phone = phone.trim();
      if (plate !== editingDriver.carPlate) {
        changes.carPlate = plate;
        changes.plateNumber = plate;
      }
      if (carMaker.trim() !== (editingDriver.carMaker || '')) changes.carMaker = carMaker.trim();
      if (carModel.trim() !== (editingDriver.carModel || '')) changes.carModel = carModel.trim();
      if (Object.keys(changes).length) {
        await updateDoc(driverRef, { ...changes, updatedAt: new Date() });
      }
      setEditingDriver(null);
    } catch (err: any) {
      console.error("Failed to save driver:", err);
      setError(err.message || '儲存失敗，請重試。');
    }
  };

  const changeAccountStatus = async (driver: Driver, target: DriverAccountStatus, label: string) => {
    if (submittingStatus.current || !window.confirm(`確定要${label}司機 ${driver.email} 嗎？`)) return;
    submittingStatus.current = true;
    setStatusBusy(true);
    try {
      await adminApi({action: 'SET_DRIVER_STATUS', driverId: driver.email, expectedStatus: driver.accountStatus,
        accountStatus: target, operationId: crypto.randomUUID()});
    } catch (err) {
      if (err instanceof AdminApiError && err.uncertain) window.alert('帳號狀態待確認，請重新整理列表。');
      else window.alert(err instanceof Error ? err.message : '操作失敗，請重新整理。');
    } finally {
      submittingStatus.current = false;
      setStatusBusy(false);
    }
  };

  const getDriverAccountStatusText = (driver: Driver) => {
    switch (accountCategory(driver.accountStatus)) {
      case DriverAccountStatus.ACTIVE: return '正常啟用';
      case DriverAccountStatus.SUSPENDED: return '已停權';
      case DriverAccountStatus.ARCHIVED: return '已封存';
      default: return '未知';
    }
  };

  const getDriverTripStatusText = (driver: Driver) => {
    switch (driver.tripStatus) {
      case DriverTripStatus.OFFLINE: return '已下線';
      case DriverTripStatus.IDLE: return '上線空車';
      case DriverTripStatus.IN_QUEUE: return '排班中';
      case DriverTripStatus.DISPATCHED: return '媒合中';
      case DriverTripStatus.EN_ROUTE: return '前往上車地點';
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
        <div className="order-title-content">
          <h2 className="sheet-title">司機管理 ({filteredDrivers.length})</h2>
          <div className="order-status-toolbar">
            {categories.map(([value, label, tone]) => (
              <button key={value} type="button" data-syslog={`drivers.filter.${value}`}
                aria-pressed={accountFilter === value}
                className={`category-pill order-filter order-tone-${tone} ${accountFilter === value ? 'active' : ''}`}
                onClick={() => { setAccountFilter(value); setCurrentPage(1); }}>
                {label}{!loading && !listError && ` (${value === 'ALL' ? drivers.length : drivers.filter(d => accountCategory(d.accountStatus) === value).length})`}
              </button>
            ))}
            <button type="button" className="btn-secondary" disabled={loading} data-syslog="drivers.reload"
              onClick={() => setReloadKey(key => key + 1)}><RefreshCw size={14} /> 重新整理</button>
          </div>
        </div>
      </div>

      {listError ? <p role="alert">{listError}</p> : loading ? (
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
                    <th>
                      <div className="passenger-heading">
                        <button onClick={() => requestSort('email')}>帳號{getSortIcon('email')}</button>
                      </div>
                      <div className="passenger-heading">
                        <button onClick={() => requestSort('carPlate')}>車牌{getSortIcon('carPlate')}</button>
                        <span>/</span>
                        <button onClick={() => requestSort('name')}>司機{getSortIcon('name')}</button>
                      </div>
                    </th>
                    <th style={{ cursor: 'pointer' }} onClick={() => requestSort('phone')}>手機 {getSortIcon('phone')}</th>
                    <th style={{ cursor: 'pointer' }} onClick={() => requestSort('carMaker')}>車款 {getSortIcon('carMaker')}</th>
                    <th style={{ cursor: 'pointer' }} onClick={() => requestSort('accountStatus')}>帳號狀態 {getSortIcon('accountStatus')}</th>
                    <th style={{ cursor: 'pointer' }} onClick={() => requestSort('tripStatus')}>工作行程 {getSortIcon('tripStatus')}</th>
                    <th>操作</th>
                  </tr>
                </thead>
            <tbody>
              {paginatedDrivers.map((driver) => (
                <tr key={driver.email}>
                  <td>
                    <div className="passenger-identity">
                      <img src={driver.avatar || defaultAvatar} alt="" onError={event => {
                        const image = event.currentTarget;
                        if (image.getAttribute('src') !== defaultAvatar) image.src = defaultAvatar;
                      }} />
                      <div>
                        <div>{driver.email}</div>
                        <div className="order-driver">
                          {driver.carPlate && <span className="order-plate">{driver.carPlate}</span>}
                          {driver.name && <span>{driver.name}</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>{driver.phone}</td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {[driver.carMaker, driver.carModel].filter(Boolean).join(' ')}
                  </td>
                  <td>
                    <span className={driver.accountStatus === DriverAccountStatus.ACTIVE ? 'status-pill online' : 'status-pill offline'}>
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
                      <button type="button" onClick={() => openEditModal(driver)} className="btn-secondary table-action-button" data-syslog="drivers.edit">
                        編輯
                      </button>
                      {categories.map(([target, label]) => target !== 'ALL' &&
                        Object.values(DriverAccountStatus).includes(driver.accountStatus) &&
                        target !== accountCategory(driver.accountStatus) && (
                          <button key={target} className="btn-secondary table-action-button" type="button" disabled={statusBusy}
                            data-syslog={`drivers.status.${target}`} onClick={() => changeAccountStatus(driver, target, label)}>
                            {label}
                          </button>
                        ))}
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

      {/* Edit Modal */}
      {editingDriver && (
        <div className="modal-overlay driver-edit-overlay">
          <div className="glass modal-content animate-fade-in" style={{ background: '#0c0d16', border: '1px solid var(--border-color-hover)' }}>
            <div className="modal-header">
              <h3 className="modal-title">編輯司機資訊</h3>
              <button onClick={() => setEditingDriver(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
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
                <label htmlFor="driver-account" className="form-label">帳號</label>
                <input id="driver-account" type="email" value={editingDriver.email} className="form-input" disabled />
              </div>

              <div className="driver-edit-fields">
                <label className="form-group">
                  <span className="form-label">車牌</span>
                  <input className="form-input" name="carPlate" value={carPlate} onChange={e => setCarPlate(e.target.value)} placeholder="ABC-1234" required />
                </label>
                <label className="form-group">
                  <span className="form-label">司機</span>
                  <input className="form-input" name="name" value={name} onChange={e => setName(e.target.value)} required />
                </label>
                <label className="form-group driver-edit-phone">
                  <span className="form-label">手機</span>
                  <input className="form-input" type="tel" name="phone" value={phone} onChange={e => setPhone(e.target.value)} required />
                </label>
                <label className="form-group">
                  <span className="form-label">廠牌</span>
                  <input className="form-input" name="carMaker" value={carMaker} onChange={e => setCarMaker(e.target.value)} />
                </label>
                <label className="form-group">
                  <span className="form-label">車款</span>
                  <input className="form-input" name="carModel" value={carModel} onChange={e => setCarModel(e.target.value)} />
                </label>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => setEditingDriver(null)} className="btn-secondary">
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
