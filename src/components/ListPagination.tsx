'use client';

import { recordSystemLog } from '../lib/systemLogs/client';

type Props = {
  totalItems: number;
  currentPage: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
};

export default function ListPagination({ totalItems, currentPage, itemsPerPage, onPageChange, onPageSizeChange }: Props) {
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
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
    <div className="list-pagination" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginTop: 20, padding: '12px 8px 4px 8px', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
          顯示第 {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, totalItems)} 筆，共 {totalItems} 筆資料
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
          <span>每頁顯示:</span>
          <select aria-label="每頁顯示筆數"
            value={itemsPerPage}
            onChange={(e) => {
              recordSystemLog('UI_CHANGE', { control: 'pagination.page_size', count: Number(e.target.value) });
              onPageSizeChange(Number(e.target.value));
              onPageChange(1);
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

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          data-syslog="pagination.previous"
          onClick={() => onPageChange(Math.max(currentPage - 1, 1))}
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
              data-syslog="pagination.page"
              onClick={() => onPageChange(Number(pageNum))}
              aria-current={currentPage === pageNum ? 'page' : undefined}
              className={currentPage === pageNum ? 'btn-primary' : 'btn-secondary'}
              style={{ padding: '6px 12px', fontSize: '0.75rem', minWidth: 32, height: 'auto', borderRadius: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {pageNum}
            </button>
          );
        })}

        <button
          data-syslog="pagination.next"
          onClick={() => onPageChange(Math.min(currentPage + 1, totalPages))}
          disabled={currentPage === totalPages}
          className="btn-secondary"
          style={{ padding: '6px 12px', fontSize: '0.75rem' }}
        >
          下一頁
        </button>
      </div>
    </div>
  );
}
