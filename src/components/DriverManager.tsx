'use client';

import ListPagination from './ListPagination';
import { useActionBarSelection } from './TabActionBar';

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

type DutyStatus = DriverTripStatus | 'UNKNOWN';
type DriverRow = Omit<Driver, 'tripStatus'> & { tripStatus: DutyStatus };

const dutyBadges: Record<DutyStatus, { label: string; tone: string }> = {
  OFFLINE: { label: '下線', tone: 'order-tone-all' },
  IDLE: { label: '空車', tone: 'duty-tone-vacant' },
  IN_QUEUE: { label: '排班中', tone: 'duty-tone-vacant' },
  BUSY: { label: '私人忙碌', tone: 'duty-tone-private' },
  DISPATCHED: { label: '收到派單', tone: 'order-tone-waiting' },
  EN_ROUTE: { label: '前往上車地點', tone: 'order-tone-serving' },
  ARRIVED: { label: '已抵達', tone: 'order-tone-serving' },
  IN_SERVICE: { label: '載客中', tone: 'order-tone-serving' },
  UNKNOWN: { label: '未知', tone: 'order-tone-unknown' }
};

function readDutyStatus(tripStatus: unknown, legacyStatus: unknown): DutyStatus {
  const raw = tripStatus ?? legacyStatus;
  if (raw === 0 || raw === '0') return DriverTripStatus.OFFLINE;
  if (raw === 1 || raw === '1') return DriverTripStatus.IDLE;
  if (raw === 2 || raw === '2') return DriverTripStatus.IN_SERVICE;
  if (tripStatus == null && (raw === 'SUSPENDED' || raw === 'WAIT_APPROVAL')) return DriverTripStatus.OFFLINE;
  return Object.values(DriverTripStatus).find(status => status === raw) ?? 'UNKNOWN';
}

function vehicleLabel(driver: DriverRow) {
  return [driver.carMaker, driver.carModel].filter(Boolean).join(' ');
}

export default function DriverManager() {
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
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
  const [editingDriver, setEditingDriver] = useState<DriverRow | null>(null);
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
      const list: DriverRow[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        
        const parsedTripStatus = readDutyStatus(data.tripStatus, data.status);
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
          tripStatus: parsedTripStatus,
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
  const [accountFilter, setAccountFilter] = useActionBarSelection<string>('category', 'ALL');

  // Filtering & Sorting Logic
  const filteredDrivers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return drivers.filter(driver => {
      const matchesAccount = accountFilter === 'ALL' || accountCategory(driver.accountStatus) === accountFilter;
      const matchesSearch = [driver.name, driver.email, driver.phone, driver.plateNumber, vehicleLabel(driver)]
        .some(value => value?.toLowerCase().includes(query));
      return matchesAccount && matchesSearch;
    });
  }, [drivers, searchQuery, accountFilter]);

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

  const openEditModal = (driver: DriverRow) => {
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

  const changeAccountStatus = async (driver: DriverRow, target: DriverAccountStatus, label: string) => {
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

  const getDriverAccountStatusText = (driver: DriverRow) => {
    switch (accountCategory(driver.accountStatus)) {
      case DriverAccountStatus.ACTIVE: return '正常啟用';
      case DriverAccountStatus.SUSPENDED: return '已停權';
      case DriverAccountStatus.ARCHIVED: return '已封存';
      default: return '未知';
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
            <div className="search-wrapper order-search">
              <Search size={16} className="search-icon" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                placeholder="搜尋司機姓名、帳號、手機、車牌、廠牌或車款"
                className="search-input"
              />
            </div>
          </div>

          {filteredDrivers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              {searchQuery || accountFilter !== 'ALL' ? '找不到符合篩選條件的司機。' : '目前尚無註冊司機。'}
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
                    <th style={{ cursor: 'pointer' }} onClick={() => requestSort('tripStatus')}>勤務狀態 {getSortIcon('tripStatus')}</th>
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
                    {vehicleLabel(driver)}
                  </td>
                  <td>
                    <span className={driver.accountStatus === DriverAccountStatus.ACTIVE ? 'status-pill online' : 'status-pill offline'}>
                      {getDriverAccountStatusText(driver)}
                    </span>
                  </td>
                  <td>
                    <span className={`status-pill driver-duty ${dutyBadges[driver.tripStatus].tone}`}>
                      {dutyBadges[driver.tripStatus].label}
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

          <ListPagination totalItems={sortedDrivers.length} currentPage={currentPage} itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage} onPageSizeChange={setItemsPerPage} />
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
