/* 地圖與卡片共用；勤務、連線、GPS 是不同概念。 */
window.LotusView = (() => {
  const statusColors = Object.freeze({
    SCHEDULED: '#64B5F6', PENDING: '#FF3B30', MATCHING: '#FFCC00', DISPATCHED: '#FFCC00',
    ACCEPTED: '#FF9500', EN_ROUTE: '#FF9500', ARRIVED: '#FF2D55',
    IN_PROGRESS: '#007AFF', IN_SERVICE: '#007AFF', IDLE: '#34C759', OFFLINE: '#8E8E93',
    COMPLETED: '#34C759', CANCELLED_BY_USER: '#FF3B30', DRIVER_CANCELLED: '#FF3B30',
    NO_SHOW: '#FF3B30', FAILED_MATCH: '#8E8E93', IN_QUEUE: '#34C759', BUSY: '#AF52DE', SUSPENDED: '#8E8E93',
  });
  const orderText = { SCHEDULED: '預約單', PENDING: '找車中', MATCHING: '配對中', ACCEPTED: '前往上車地點', ARRIVED: '車已到',
    IN_PROGRESS: '搭乘中', COMPLETED: '已完成', CANCELLED_BY_USER: '乘客取消',
    DRIVER_CANCELLED: '司機取消／待乘客決定', NO_SHOW: '乘客未出現', FAILED_MATCH: '媒合失敗' };
  // SCHEDULED 同時涵蓋未承接與已承接；缺少子狀態時只顯示中性名稱。
  const orderLabel = (status, reservationState, role) => status === 'SCHEDULED'
    ? ({ OPEN: '預約待承接', CLAIMED: '預約已承接', CONFIRMED: '司機已確認' }[reservationState] || orderText.SCHEDULED)
    : status === 'ACCEPTED' && role === 'USER' ? '司機前往中' : orderText[status] || status || '未知訂單狀態';
  const driverText = { IDLE: '空車', DISPATCHED: '派單', EN_ROUTE: '前往上車地點', ARRIVED: '抵達',
    IN_SERVICE: '載客', OFFLINE: '下線', IN_QUEUE: '排班中', BUSY: '私人忙碌', SUSPENDED: '停權' };
  // 只轉譯已知舊系統訊息的顯示文字，保留 Firestore 原始事件與其他自訂 memo。
  const eventMessage = (type, message) => {
    if (type === 'RESERVATION_ACTIVATE' && message === '預約開始接客') return '司機開始前往上車地點';
    return message || type || '事件';
  };
  // 卡片外觀與地圖／狀態文字的 statusColors 分開；不改業務狀態。
  const orderCardTone = (item, historical = false) => {
    if (historical || item.active === false || ['COMPLETED', 'CANCELLED_BY_USER'].includes(item.orderStatus)) return 'a';
    const display = item.display?.scheduledTime ? item.display : item.offer || item.display || {};
    if (['ACCEPTED', 'ARRIVED', 'IN_PROGRESS'].includes(item.orderStatus)
      || item.orderStatus === 'SCHEDULED' && ['CLAIMED', 'CONFIRMED'].includes(display.reservationState)) return 'c';
    return 'b';
  };
  const activeStatuses = ['SCHEDULED', 'PENDING', 'MATCHING', 'ACCEPTED', 'ARRIVED', 'IN_PROGRESS', 'DRIVER_CANCELLED', 'FAILED_MATCH', 'NO_SHOW'];
  const dutyStatuses = ['IDLE', 'IN_QUEUE', 'DISPATCHED', 'EN_ROUTE', 'ARRIVED', 'IN_SERVICE', 'BUSY'];
  const millis = value => value?.toMillis?.() ?? (value?.seconds != null ? value.seconds * 1000 + (value.nanoseconds || 0) / 1e6 : 0);
  const time = value => millis(value) ? new Date(millis(value)).toLocaleString('zh-TW', { hour12: false }) : '未提供';
  const validLocation = loc => Number.isFinite(loc?.lat) && Number.isFinite(loc?.lng)
    && Math.abs(loc.lat) <= 90 && Math.abs(loc.lng) <= 180;
  // 與 dispatch/distance.ts 使用相同球面公式及半徑；畫面缺座標時回 null。
  const getStraightLineDistanceMeters = (from, to) => {
    if (!validLocation(from) || !validLocation(to)) return null;
    const radians = degrees => degrees * Math.PI / 180;
    const a = Math.sin(radians(to.lat - from.lat) / 2) ** 2
      + Math.cos(radians(from.lat)) * Math.cos(radians(to.lat))
      * Math.sin(radians(to.lng - from.lng) / 2) ** 2;
    const bounded = Math.max(0, Math.min(1, a));
    return 2 * 6371008.8 * Math.atan2(Math.sqrt(bounded), Math.sqrt(1 - bounded));
  };
  const distanceText = meters => !Number.isFinite(meters) || meters < 0 ? 'n/a'
    : meters < 1000 ? `${Math.round(meters)} 公尺` : `${(meters / 1000).toFixed(1)} 公里`;
  const mapsLocationUrl = coordinates => validLocation(coordinates)
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${coordinates.lat.toFixed(6)},${coordinates.lng.toFixed(6)}`)}` : null;
  // 原單釋放指派後，不推測歷史服務司機；角色紀錄另有不可變快照。
  const orderDriverText = order => order.driverId
    ? [order.driverName, order.carPlate].filter(Boolean).join(' · ') || order.driverId
    : ({ COMPLETED: '服務已結束', CANCELLED_BY_USER: '訂單已取消',
      DRIVER_CANCELLED: '目前無指派', NO_SHOW: '目前無指派' }[order.status] || '尚未指派');
  return { orderCardTone, eventMessage, orderLabel, orderDriverText, statusColors, orderText, driverText, activeStatuses, dutyStatuses, millis, time, validLocation,
    getStraightLineDistanceMeters, distanceText, mapsLocationUrl };
})();
