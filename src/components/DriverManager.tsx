'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase/config';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { Plus, Edit2, Trash2, X, Check, AlertTriangle, Star, ChevronUp, ChevronDown } from 'lucide-react';
import { Driver } from '../types';

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
  const [status, setStatus] = useState(1); // 1 = online, 2 = busy, 0 = offline

  // Listen to Firestore
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'drivers'), (snapshot) => {
      const list: Driver[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        list.push({
          email: doc.id,
          name: data.name || '',
          phone: data.phone || '',
          carPlate: data.carPlate || '',
          carColor: data.carColor || '',
          carMaker: data.carMaker || '',
          carModel: data.carModel || '',
          avatar: data.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
          status: data.status || 0,
          working: data.working || false,
          isWorking: data.isWorking || false,
          loginCount: data.loginCount || 0,
          currentLocation: data.currentLocation,
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

  const sortedDrivers = useMemo(() => {
    let sortable = [...drivers];
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
  }, [drivers, sortConfig]);

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
    setStatus(1);
    setError(null);
    setShowModal(true);
  };

  const openEditModal = (driver: Driver) => {
    setIsEdit(true);
    setEmail(driver.email);
    setName(driver.name);
    setPhone(driver.phone);
    setCarPlate(driver.carPlate);
    setCarColor(driver.carColor);
    setCarMaker(driver.carMaker);
    setCarModel(driver.carModel);
    setStatus(driver.status);
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
        carPlate: carPlate.trim().toUpperCase(),
        carColor: carColor.trim(),
        carMaker: carMaker.trim(),
        carModel: carModel.trim(),
        status: status,
        working: status === 1,
        isWorking: status === 2,
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

  const getDriverStatusText = (driver: Driver) => {
    if (driver.status === 2 || driver.isWorking) return '載客中 (忙碌)';
    if (driver.status === 1 || driver.working) return '服務中 (空車)';
    return '已下線';
  };

  const getDriverStatusClass = (driver: Driver) => {
    if (driver.status === 2 || driver.isWorking) return 'status-pill busy';
    if (driver.status === 1 || driver.working) return 'status-pill online';
    return 'status-pill offline';
  };

  return (
    <div className="glass content-sheet animate-fade-in">
      <div className="sheet-title-row">
        <h2 className="sheet-title">司機名冊管理 ({drivers.length})</h2>
        <button onClick={openAddModal} className="btn-primary">
          <Plus size={16} />
          註冊新司機
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>載入司機名冊中...</div>
      ) : drivers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>無任何註冊司機。</div>
      ) : (
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ cursor: 'pointer' }} onClick={() => requestSort('name')}>司機姓名 {getSortIcon('name')}</th>
                <th style={{ cursor: 'pointer' }} onClick={() => requestSort('email')}>電子郵件 {getSortIcon('email')}</th>
                <th style={{ cursor: 'pointer' }} onClick={() => requestSort('phone')}>聯絡電話 {getSortIcon('phone')}</th>
                <th style={{ cursor: 'pointer' }} onClick={() => requestSort('carPlate')}>車牌號碼 {getSortIcon('carPlate')}</th>
                <th style={{ cursor: 'pointer' }} onClick={() => requestSort('carMaker')}>車款車色 {getSortIcon('carMaker')}</th>
                <th style={{ cursor: 'pointer' }} onClick={() => requestSort('status')}>即時狀態 {getSortIcon('status')}</th>
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
                      {driver.carPlate}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {driver.carColor}色 {driver.carMaker} {driver.carModel}
                  </td>
                  <td>
                    <span className={getDriverStatusClass(driver)}>
                      {getDriverStatusText(driver)}
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
      )}

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

              <div className="form-group">
                <label className="form-label">服務狀態</label>
                <select 
                  value={status} 
                  onChange={(e) => setStatus(Number(e.target.value))}
                  className="form-select"
                >
                  <option value={1}>空車服務中 (Online)</option>
                  <option value={2}>載客忙碌中 (Busy)</option>
                  <option value={0}>下線休息中 (Offline)</option>
                </select>
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
    </div>
  );
}
