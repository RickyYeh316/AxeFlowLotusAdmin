/* 乘客與管理端共用訂單卡；管理端只替換讀取入口與停用業務操作。 */
window.LotusOrderCard = { create({orderMaps, orderChats, rebook, readOnly = false, getLatest = () => null, getActions = () => null}) {
  const view = window.LotusView;
  function node(tag, content, className) {
    const result = document.createElement(tag); result.textContent = content;
    if (className) result.className = className; return result;
  }
  function taiwanTime(value) {
    const time = view.millis(value);
    return Number.isFinite(time) && time > 0 ? new Intl.DateTimeFormat('zh-TW', {
      timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(new Date(time)) : '時間未提供';
  }
  function locationRow(label, address, coordinates, missing) {
    const row = node('div', '', 'location');
    row.append(node('span', label), node('strong', address || (view.validLocation(coordinates)
      ? `${coordinates.lat.toFixed(6)}, ${coordinates.lng.toFixed(6)}` : missing)));
    return row;
  }
  function fact(label, value) {
    const row = node('div', '', 'fact'); row.append(node('dt', label), node('dd', value)); return row;
  }
  function driverLocations(display, showCurrent = false, passenger = false, orderLocation = null, item = null) {
    const block = node('div', '', 'trip-locations');
    // 兩點模式只用訂單保存的地點，不讀目前司機位置。
    // 乘客只讀本人card的定位白名單，禁止把乘客profile當成司機位置。
    const profile = showCurrent && !passenger ? getLatest()?.profile : null;
    const state = showCurrent && !passenger ? getLatest()?.states.profile : null;
    const current = passenger ? view.validLocation(orderLocation) ? orderLocation : null
      : !state?.loading && !state?.error && view.validLocation(profile?.currentLocation) ? profile.currentLocation : null;
    function position(shape, label, address, coordinates, missing, mapButton) {
      const row = node('div', '', 'trip-location');
      const marker = node('span', shape === 'driver' ? '' : shape, 'trip-marker'); marker.setAttribute('aria-hidden', 'true');
      if (shape === 'driver') marker.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" fill-rule="evenodd" d="M12 1A11 11 0 1 0 12 23A11 11 0 1 0 12 1Z M12 4.5A7.5 7.5 0 1 1 12 19.5A7.5 7.5 0 1 1 12 4.5Z"/><path fill="currentColor" d="M4.5 8.5H19.5V11.5H13.5V21H10.5V11.5H4.5Z M15 11A3 3 0 1 0 9 11A3 3 0 1 0 15 11"/></svg>';
      row.append(marker, locationRow(label, address, coordinates, missing));
      if (mapButton) {
        const url = view.mapsLocationUrl(coordinates);
        const button = node(url ? 'a' : 'button', '地圖', 'trip-map');
        button.dataset.syslog='map.external'; button.setAttribute('aria-label', `在 Google Maps 開啟${label}`);
        if (url) { button.href = url; button.target = '_blank'; button.rel = 'noopener noreferrer'; }
        else { button.disabled = true; button.title = '尚無有效座標'; }
        row.append(button);
      }
      block.append(row);
    }
    function distance(from, to) {
      block.append(node('p', `直線距離 ${view.distanceText(view.getStraightLineDistanceMeters(from, to))}`, 'trip-distance'));
    }
    if (showCurrent) {
      position('driver', '司機位置', '', current, 'n/a', !passenger);
      distance(current, display.pickupLocation);
      if (passenger && item) block.append(orderMaps.preview(item));
    }
    position('●', '上車地', display.startAddress, display.pickupLocation, '上車資訊未提供', !passenger);
    distance(display.pickupLocation, display.destination);
    if (passenger && item && ['IN_PROGRESS','COMPLETED'].includes(item.orderStatus)) block.append(orderMaps.preview(item));
    position('▼', '目的地', display.endAddress, display.destination, '未輸入', !passenger);
    const freshness = state?.cached ? '司機位置來自快取。'
      : profile?.presenceStatus === 'DISCONNECTED' ? '司機已斷線，位置為末次回報。' : '';
    if (freshness) block.append(node('p', freshness, 'note'));
    return block;
  }
  const passengerHints = { PENDING: '正在等待派車。', MATCHING: '正在聯繫司機。', ACCEPTED: '司機正前往上車點。',
    ARRIVED: '司機已抵達。', IN_PROGRESS: '搭乘中。', FAILED_MATCH: '目前無合適司機，等待您決定取消或重派。',
    DRIVER_CANCELLED: '本次司機無法繼續服務，等待您決定取消或重派。',
    NO_SHOW: '司機回報乘客未出現，等待您決定取消或重派。', COMPLETED: '本次搭乘已完成。', CANCELLED_BY_USER: '您已取消這張訂單。' };
  function appendOrderNote(section, value) {
    if (typeof value !== 'string' || !value.trim()) return;
    const block = node('div', '', 'order-note');
    block.append(node('div', '備註：', 'note'), node('div', value, 'order-note-text'));
    section.append(block);
  }
  function card(item, role, historical = false) {
    const time = historical ? taiwanTime : view.time;
    const display = item.display || {};
    const section = node('article', '', 'order-card');
    section.dataset.logOrder = item.orderId || item.id || '';
    section.dataset.logEvent = item.eventId || '';
    section.style.setProperty('--status-color', view.statusColors[item.orderStatus] || '#718096');
    section.dataset.cardTone = view.orderCardTone(item, historical);
    const heading = node('div', '', 'card-head');
    const title = item.orderStatus === 'NO_SHOW' ? '司機回報乘客未出現' : view.orderLabel(item.orderStatus, display.reservationState, role);
    heading.append(node('h3', title));
    heading.dataset.noticeEvent = item.eventId || ''; heading.dataset.noticeOrder = item.orderId || item.id || '';
    if (historical) {
      const buttons = node('div', '', 'card-head-actions');
      const again = node('button', '再次叫車', 'rebook-button'); again.type = 'button'; again.dataset.syslog='order.rebook';
      again.disabled = readOnly;
      if (!readOnly) again.addEventListener('click', () => rebook(item));
      buttons.append(again);
      if (orderChats) buttons.append(orderChats.button(item.orderId || item.id));
      heading.append(buttons);
    } else if (orderChats) heading.append(orderChats.button(item.orderId || item.id));

    section.append(heading);
    const orderNumber = item.readableId ? `#${item.readableId}` : item.orderId;
    const passengerName = display.passengerName || ('本人');
    {
      const meta = node('div', '', 'card-meta');
      meta.append(node('div', `訂單編號：${orderNumber}`), node('div', `乘客姓名：${passengerName}`));
      const name = typeof item.driver?.name === 'string' ? item.driver.name.trim() : '';
      const plate = typeof item.driver?.carPlate === 'string' ? item.driver.carPlate.trim() : '';
      if (name || plate) {
        const identity = node('div', '', 'driver-identity');
        identity.append(node('span', '車號司機：', 'driver-label'));
        if (plate) identity.append(node('span', plate, 'taxi-plate'));
        if (name) identity.append(node('span', name, 'driver-name'));
        meta.append(identity);
      }
      section.append(meta);
    }
    // 前往／抵達顯示司上目；搭乘中及歷史只呈現訂單保存的上目。
    section.append(driverLocations(display, item.active === true && !historical
      && ['ACCEPTED', 'ARRIVED'].includes(item.orderStatus), true, item.driverLocation, item));
    const facts = node('dl', '', 'facts');
    facts.append(fact('優惠券', display.couponSnapshot ? `${display.couponSnapshot.name} · ${display.couponSnapshot.amount} 元` : display.couponId ? '舊券資訊未驗證'
      : item.orderStatus === 'SCHEDULED' && display.requestedCouponId ? '已預選優惠券' : '未提供'),
      fact('敬老服務', display.isElderlyCare === true ? '使用政府敬老方案' : display.isElderlyCare === false ? '未提出' : '未提供'));
    if (display.scheduledTime) facts.append(fact(display.isScheduled ? '預約上車時間' : '原預約時間', taiwanTime(display.scheduledTime)));
    if (item.orderStatus === 'SCHEDULED') facts.append(fact('預約狀態', { OPEN: '等待司機承接', CLAIMED: '司機已承接', CONFIRMED: '司機已確認，等待前一趟行程結束' }[display.reservationState] || '等待確認'));
    section.append(facts);
    if (item.orderStatus === 'SCHEDULED' && display.requestedCouponId) section.append(node('p', '已預選優惠券，尚未保留；司機開始前往上車地點時重新確認。', 'note'));
    if (display.couponUnavailableReason) section.append(node('p', `本趟未使用優惠券：${{ EXPIRED: '原選優惠券已過期或未生效', USED: '原選優惠券已使用', RESERVED: '原選優惠券已由其他訂單保留', UNAVAILABLE: '原選優惠券無法取得' }[display.couponUnavailableReason] || '無法套用'}。`, 'outcome'));

    appendOrderNote(section, display.note);
    if (item.orderStatus !== 'SCHEDULED') section.append(node('p', passengerHints[item.orderStatus] || '請確認訂單最新狀態。', 'outcome'));



    if (!historical) getActions()?.appendCard(section, item);
    return section;
  }
  return {card, taiwanTime};
}};
