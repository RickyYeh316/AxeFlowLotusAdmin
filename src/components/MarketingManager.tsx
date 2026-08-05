'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase/config';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { Plus, Trash2, X, Check, Ticket, ToggleLeft, ToggleRight, AlertCircle, ChevronUp, ChevronDown } from 'lucide-react';
import { Coupon } from '../types';

export default function MarketingManager() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);

  // Sorting State
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'ascending' | 'descending' } | null>({
    key: 'couponCode',
    direction: 'ascending'
  });

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Form states
  const [showModal, setShowModal] = useState(false);

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

  const [error, setError] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [discountAmount, setDiscountAmount] = useState('100');
  const [minOrderAmount, setMinOrderAmount] = useState('200');
  const [expiryDays, setExpiryDays] = useState('30');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');

  // Listen to coupons in Firestore
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'coupons'), (snapshot) => {
      const list: Coupon[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        list.push({
          couponCode: doc.id,
          title: data.title || '',
          description: data.description || '',
          discountAmount: data.discountAmount || 0,
          minOrderAmount: data.minOrderAmount || 0,
          expiryDate: data.expiryDate,
          status: data.status || 'active',
          createdAt: data.createdAt,
          updatedAt: data.updatedAt
        });
      });
      setCoupons(list);
      setLoading(false);
    }, (error) => {
      console.error("Error subscribing to coupons:", error);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const openAddModal = () => {
    setCouponCode('');
    setTitle('');
    setDescription('');
    setDiscountAmount('100');
    setMinOrderAmount('200');
    setExpiryDays('30');
    setStatus('active');
    setError(null);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const code = couponCode.trim().toUpperCase();
    if (!code || !title.trim() || !discountAmount || !minOrderAmount) {
      setError('請填寫所有必要欄位！');
      return;
    }

    try {
      const couponRef = doc(db, 'coupons', code);
      
      // Calculate expiry date
      const days = Number(expiryDays) || 30;
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + days);

      const couponData = {
        couponCode: code,
        title: title.trim(),
        description: description.trim(),
        discountAmount: Number(discountAmount),
        minOrderAmount: Number(minOrderAmount),
        expiryDate: expiryDate,
        status: status,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await setDoc(couponRef, couponData);
      setShowModal(false);
    } catch (err: any) {
      console.error("Failed to add coupon:", err);
      setError(err.message || '新增優惠券失敗。');
    }
  };

  const handleToggleStatus = async (coupon: Coupon) => {
    try {
      const couponRef = doc(db, 'coupons', coupon.couponCode);
      const nextStatus = coupon.status === 'active' ? 'inactive' : 'active';
      await setDoc(couponRef, { status: nextStatus, updatedAt: new Date() }, { merge: true });
    } catch (err) {
      console.error("Failed to toggle coupon status:", err);
      alert('變更狀態失敗！');
    }
  };

  const handleDelete = async (code: string) => {
    if (window.confirm(`確定要刪除促銷代碼 ${code} 嗎？此動作將立即生效。`)) {
      try {
        await deleteDoc(doc(db, 'coupons', code));
      } catch (err) {
        console.error("Failed to delete coupon:", err);
        alert('刪除失敗。');
      }
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '無效期限';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };

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

  const sortedCoupons = useMemo(() => {
    let sortable = [...coupons];
    if (sortConfig !== null) {
      sortable.sort((a: any, b: any) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];

        if (sortConfig.key === 'expiryDate') {
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
  }, [coupons, sortConfig]);

  const totalPages = Math.ceil(sortedCoupons.length / itemsPerPage);
  const paginatedCoupons = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedCoupons.slice(start, start + itemsPerPage);
  }, [sortedCoupons, currentPage, itemsPerPage]);

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
          <h2 className="sheet-title">行銷優惠管理 ({coupons.length})</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4 }}>
            新增乘車折扣代碼與專屬乘車金券
          </p>
        </div>

        <button onClick={openAddModal} className="btn-primary">
          <Plus size={16} />
          發行促銷代碼
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>載入行銷優惠中...</div>
      ) : coupons.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>無任何流通之行銷優惠券。</div>
      ) : (
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ cursor: 'pointer' }} onClick={() => requestSort('couponCode')}>優惠代碼 (Code) {getSortIcon('couponCode')}</th>
                <th style={{ cursor: 'pointer' }} onClick={() => requestSort('title')}>活動標題 {getSortIcon('title')}</th>
                <th style={{ cursor: 'pointer' }} onClick={() => requestSort('discountAmount')}>折扣金額 {getSortIcon('discountAmount')}</th>
                <th style={{ cursor: 'pointer' }} onClick={() => requestSort('minOrderAmount')}>最低消費門檻 {getSortIcon('minOrderAmount')}</th>
                <th style={{ cursor: 'pointer' }} onClick={() => requestSort('expiryDate')}>有效到期日 {getSortIcon('expiryDate')}</th>
                <th style={{ cursor: 'pointer' }} onClick={() => requestSort('status')}>活動狀態 {getSortIcon('status')}</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {paginatedCoupons.map((coupon) => (
                <tr key={coupon.couponCode}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 6, background: coupon.status === 'active' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: coupon.status === 'active' ? 'var(--color-accent)' : 'var(--text-muted)' }}>
                        <Ticket size={16} />
                      </div>
                      <span style={{ fontWeight: 800, fontFamily: 'monospace', letterSpacing: '0.05em', color: coupon.status === 'active' ? 'white' : 'var(--text-muted)' }}>
                        {coupon.couponCode}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, color: coupon.status === 'active' ? 'var(--text-primary)' : 'var(--text-muted)' }}>{coupon.title}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>{coupon.description}</div>
                  </td>
                  <td style={{ fontWeight: 700, color: coupon.status === 'active' ? 'var(--color-success)' : 'var(--text-muted)', fontSize: '1rem', fontFamily: 'Outfit' }}>
                    NT$ {coupon.discountAmount}
                  </td>
                  <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    滿 NT$ {coupon.minOrderAmount} 可用
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {formatDate(coupon.expiryDate)}
                  </td>
                  <td>
                    <button 
                      onClick={() => handleToggleStatus(coupon)}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: coupon.status === 'active' ? 'var(--color-success)' : 'var(--text-muted)' }}
                      title={coupon.status === 'active' ? '停用優惠券' : '啟用優惠券'}
                    >
                      {coupon.status === 'active' ? (
                        <ToggleRight size={28} />
                      ) : (
                        <ToggleLeft size={28} />
                      )}
                    </button>
                  </td>
                  <td>
                    <div className="action-btn-row">
                      <button onClick={() => handleDelete(coupon.couponCode)} className="btn-icon delete" title="廢止">
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
                  顯示第 {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, sortedCoupons.length)} 筆，共 {sortedCoupons.length} 筆資料
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

      {/* Add Coupon Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="glass modal-content animate-fade-in" style={{ background: '#0c0d16', border: '1px solid var(--border-color-hover)' }}>
            <div className="modal-header">
              <h3 className="modal-title">發行全新促銷優惠碼</h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            {error && (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: 12, borderRadius: 'var(--radius-sm)', color: '#f87171', fontSize: '0.8rem', display: 'flex', gap: 6, alignItems: 'center' }}>
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="form-group">
                <label className="form-label">折扣代碼 (英數字 / 必填)</label>
                <input 
                  type="text" 
                  value={couponCode} 
                  onChange={(e) => setCouponCode(e.target.value)}
                  placeholder="例如：LOTUS2026" 
                  className="form-input"
                  style={{ textTransform: 'uppercase', fontFamily: 'monospace', fontWeight: 700 }}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">活動標題 (例如：夏季特惠 100 元券 / 必填)</label>
                <input 
                  type="text" 
                  value={title} 
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="標題" 
                  className="form-input"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">詳細說明 (乘客可於 LIFF 卡片查閱)</label>
                <textarea 
                  value={description} 
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="優惠限制與使用說明..." 
                  className="form-textarea"
                  rows={2}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">面額折抵金額 (NT$)</label>
                  <input 
                    type="number" 
                    value={discountAmount} 
                    onChange={(e) => setDiscountAmount(e.target.value)}
                    className="form-input"
                    min="1"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">最低消費門檻 (NT$)</label>
                  <input 
                    type="number" 
                    value={minOrderAmount} 
                    onChange={(e) => setMinOrderAmount(e.target.value)}
                    className="form-input"
                    min="0"
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">有效天數 (自新增日起算)</label>
                  <input 
                    type="number" 
                    value={expiryDays} 
                    onChange={(e) => setExpiryDays(e.target.value)}
                    className="form-input"
                    min="1"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">發行初始狀態</label>
                  <select 
                    value={status} 
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="form-select"
                  >
                    <option value="active">立即啟用 (Active)</option>
                    <option value="inactive">暫不啟用 (Inactive)</option>
                  </select>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">
                  取消
                </button>
                <button type="submit" className="btn-primary">
                  <Check size={16} />
                  確認發行
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
