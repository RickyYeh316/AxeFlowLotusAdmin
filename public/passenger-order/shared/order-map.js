/* 本人訂單地圖：卡片與展開頁共用資料；不接入選點、搜尋或 Routing。 */
window.LotusOrderMap = (() => {
  const markerKinds = ['driver', 'pickup', 'destination'];
  // 僅訂單地圖套用；locationPicker 保留原彩色樣式。
  const styles = [
    {elementType:'geometry',stylers:[{color:'#eeeeee'}]},
    {elementType:'labels.text.fill',stylers:[{color:'#666666'}]},
    {elementType:'labels.text.stroke',stylers:[{color:'#ffffff'}]},
    {featureType:'poi',stylers:[{visibility:'off'}]},
    {featureType:'transit',stylers:[{visibility:'off'}]},
    {featureType:'road',elementType:'geometry',stylers:[{color:'#ffffff'}]},
    {featureType:'road',elementType:'geometry.stroke',stylers:[{color:'#d4d4d4'}]},
    {featureType:'water',elementType:'geometry',stylers:[{color:'#cccccc'}]},
  ];
  function pinIcon(kind, Point, Size) {
    const wheel = '<circle cx="14" cy="14" r="7.5" fill="#27251e"/><path d="M6.5 12H21.5M14 12V22" stroke="#ffcf28" stroke-width="3"/><circle cx="14" cy="13" r="3" fill="#ffcf28"/>';
    const head = kind === 'destination' ? '<path fill="#ffcf28" d="M4 7H24L14 25Z"/>'
      : '<circle cx="14" cy="14" r="11" fill="#ffcf28"/>' + (kind === 'driver' ? wheel : '');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="38" viewBox="0 0 28 38"><path fill="#27251e" d="M7 22H21L14 38Z"/><circle cx="14" cy="14" r="14" fill="#27251e"/>${head}</svg>`;
    return {url:'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent(svg),scaledSize:new Size(28,38),anchor:new Point(14,38)};
  }

  const valid = p => p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
  // 與 AOS OrderMapViewport 相同；使用 CSS px / dp，pin 為 28 × 38、底部中央錨點。
  const wrap = value => ((value % 1) + 1) % 1;
  const worldX = lng => (lng + 180) / 360;
  const worldY = lat => {
    const s = Math.sin(Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI / 180);
    return .5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
  };
  function fitCamera(points, width, height, interactive) {
    const gap = interactive ? 24 : 12, availableWidth = width - 2 * (gap + 14), availableHeight = height - 2 * gap - 38;
    if (!points.length || availableWidth <= 0 || availableHeight <= 0) return null;
    const xs = points.map(p => wrap(worldX(p.lng))).sort((a,b) => a-b);
    let cut = 0, largest = -1;
    xs.forEach((x,i) => { const gap = (i === xs.length-1 ? xs[0]+1 : xs[i+1]) - x; if (gap > largest) { largest = gap; cut = i; } });
    const west = xs[(cut+1)%xs.length], east = xs[cut] + (xs[cut] < west ? 1 : 0);
    let north = Infinity, south = -Infinity;
    points.forEach(p => { const y = worldY(p.lat); north = Math.min(north,y); south = Math.max(south,y); });
    const spanX = east-west, spanY = south-north;
    let zoom = spanX < 1e-12 && spanY < 1e-12 ? 16 : Math.max(0, Math.min(18,
      spanX > 0 ? Math.log2(availableWidth/(256*spanX)) : 18,
      spanY > 0 ? Math.log2(availableHeight/(256*spanY)) : 18));
    if (!interactive) zoom = Math.floor(zoom); // 與 Lite Map 對齊，避免四捨五入後裁切。
    const centerY = (north+south)/2 - 19/(256*2**zoom);
    return {center:{lat:Math.atan(Math.sinh(Math.PI*(1-2*centerY)))*180/Math.PI,lng:wrap((west+east)/2)*360-180},zoom};
  }
  function containsCamera(camera, points, width, height, interactive) {
    const gap = interactive ? 24 : 12, scale = 256*2**camera.zoom;
    return points.every(p => {
      const x = width/2 + (wrap(worldX(p.lng)-worldX(camera.center.lng)+.5)-.5)*scale;
      const y = height/2 + (worldY(p.lat)-worldY(camera.center.lat))*scale;
      return x >= gap+14-.01 && x <= width-gap-14+.01 && y >= gap+38-.01 && y <= height-gap+.01;
    });
  }
  function segments(batches) {
    const groups = new Map();
    for (const batch of batches.values()) for (const p of batch.points || []) if (valid(p)) {
      if (!groups.has(p.segment)) groups.set(p.segment, new Map());
      groups.get(p.segment).set(p.time, p);
    }
    return [...groups.values()].map(points => [...points.values()].sort((a,b) => a.time-b.time));
  }
  function latestTrackPoint(paths) {
    return paths.flat().filter(p => valid(p) && Number.isFinite(p.time))
      .reduce((latest, point) => !latest || point.time > latest.time ? point : latest, null);
  }
  function create(read) {
    const entries = new Map(); let generation = 0, dialogRun = 0, dialogEntry = null, dialogSurface = null;
    const dialog = document.createElement('dialog'); dialog.className = 'order-map-dialog';
    // 初始焦點放在標題，避免 showModal 自動選中第一顆返回按鈕。
    dialog.innerHTML = '<header><button type="button" data-close data-syslog="map.back">返回</button><h2 tabindex="-1" autofocus>行程地圖</h2><button type="button" data-fit data-syslog="map.fit">全貌</button></header><div class="order-map-status" role="status"></div><div class="order-map-full"></div>';
    document.body.append(dialog);
    const full = dialog.querySelector('.order-map-full'), note = dialog.querySelector('[role=status]');
    function close() { if(dialogEntry)window.LotusClientLog?.record('SUBPAGE_STATE',{subpage:'order_map',orderId:dialogEntry.id,visible:false}); dialogRun++; dialogEntry = null; dialogSurface?.dispose(); dialogSurface = null; full.replaceChildren(); if (dialog.open) dialog.close(); }
    dialog.querySelector('[data-close]').onclick = close;
    dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
    dialog.querySelector('[data-fit]').onclick = () => dialogSurface?.fit();
    const observer = new IntersectionObserver(items => {
      for (const item of items) { const entry = entries.get(item.target.dataset.orderMap); if (entry) { entry.visible = item.isIntersecting; if (entry.visible) activate(entry); } }
    });
    async function surface(container, interactive, entry) {
      const run = generation;
      const [{ Map, Polyline }, { Marker }, { Point, Size }] = await Promise.all([google.maps.importLibrary('maps'), google.maps.importLibrary('marker'), google.maps.importLibrary('core')]);
      if (run !== generation || entries.get(entry.id) !== entry) return null;
      const canvas = document.createElement('div'); canvas.className = 'order-map-canvas'; container.prepend(canvas);
      const map = new Map(canvas, { center: {lat:23.8,lng:121}, zoom:10, maxZoom:18, isFractionalZoomEnabled:interactive, disableDefaultUI:true,
        gestureHandling: interactive ? 'greedy' : 'none', keyboardShortcuts:interactive, clickableIcons:false, zoomControl:interactive, styles });
      const markers = new MapStore(), lines = []; let points = [], fitted = false, camera = null, signature = '', mode = '';
      function fit() {
        const next = fitCamera(points, canvas.clientWidth, canvas.clientHeight, interactive);
        if (!next) return;
        map.moveCamera({...next,heading:0,tilt:0}); camera = next;
        fitted = true;
      }
      function draw() {
        const data = entry.data, approach = ['ACCEPTED','ARRIVED'].includes(data.status), track = ['IN_PROGRESS','COMPLETED'].includes(data.status);
        const nextMode = approach ? 'A' : track ? 'B' : ''; if (mode !== nextMode) { fitted = false; mode = nextMode; }
        const paths = track ? segments(entry.batches) : [];
        const locations = approach ? {driver:data.driver,pickup:data.pickup} : track ? {pickup:data.pickup,destination:data.destination,driver:data.status === 'IN_PROGRESS' ? latestTrackPoint(paths) : null} : {};
        points = Object.values(locations).filter(valid);
        for (const key of markerKinds) {
          const p = locations[key];
          if (!valid(p)) { markers.get(key)?.setMap(null); markers.delete(key); continue; }
          if (markers.has(key)) markers.get(key).setPosition(p);
          else markers.set(key, new Marker({map,position:p,clickable:false,zIndex:10,title:{driver:'司機位置',pickup:'上車地',destination:'目的地'}[key],
            icon:pinIcon(key,Point,Size)}));
        }
        paths.forEach(path => points.push(...path));
        const next = JSON.stringify(paths);
        if (signature !== next) { lines.splice(0).forEach(line => line.setMap(null));
          paths.filter(p => p.length > 1).forEach(path => {
            lines.push(new Polyline({map,path,strokeColor:'#ffffff',strokeWeight:7,zIndex:1,clickable:false}));
            lines.push(new Polyline({map,path,strokeColor:'#263238',strokeWeight:4,zIndex:2,clickable:false}));
          }); signature = next; }
        if (!fitted || !interactive && !containsCamera(camera, points, canvas.clientWidth, canvas.clientHeight, false)) fit();
      }
      const resize = new ResizeObserver(() => fit()); resize.observe(canvas);
      return { draw, fit, dispose() { resize.disconnect(); markers.forEach(m=>m.setMap(null)); lines.forEach(l=>l.setMap(null)); google.maps.event.clearInstanceListeners(map); canvas.remove(); } };
    }
    // 避免 Maps library 的 Map 類別遮蔽 JavaScript Map。
    const MapStore = Map;
    function show(entry) {
      entry.surface?.draw(); entry.label.textContent = entry.error || (entry.surface ? '展開地圖' : '載入地圖…');
      if (dialogEntry === entry) { dialogSurface?.draw(); note.textContent = entry.error || ''; dialog.querySelector('h2').textContent = ['ACCEPTED','ARRIVED'].includes(entry.data.status) ? '司機位置' : '行程軌跡'; }
    }
    async function activate(entry) {
      if (document.hidden || entry !== dialogEntry && (!entry.root.isConnected || entry.root.closest('[hidden]'))) return;
      if (!entry.surface && !entry.loadingMap) {
        entry.loadingMap = true;
        try { entry.surface = await surface(entry.root, false, entry); show(entry); }
        catch { entry.error = '地圖暫時無法載入，點擊重試'; show(entry); }
        finally { entry.loadingMap = false; }
      }
      refresh(entry);
    }
    async function refresh(entry) {
      if (entry.busy || document.hidden || !entry.live && entry.loaded || Date.now() < entry.nextRead) return;
      entry.busy = true; const run = generation, revision = entry.revision;
      try {
        let page;
        do {
          page = await read({action:'ORDER_MAP',orderId:entry.id,cursor:entry.cursor});
          if (run !== generation || revision !== entry.revision) return;
          entry.data = page;
          if (!['IN_PROGRESS','COMPLETED'].includes(page.status)) entry.batches.clear();
          for (const batch of page.batches || []) entry.batches.set(batch.id,batch);
          entry.cursor = page.cursor; entry.live = page.live; entry.loaded = true; entry.error = ''; show(entry);
        } while (page.more && !document.hidden && (entry.visible || dialogEntry === entry));
      } catch { if (run === generation && revision === entry.revision) { entry.data = {}; entry.batches.clear(); entry.cursor = null; entry.error = '地圖資料暫時無法讀取'; entry.loaded = false; show(entry); } }
      finally { entry.busy = false; entry.nextRead = revision === entry.revision ? Date.now()+5000 : 0; }
    }
    async function open(entry) {
      close(); const run = dialogRun; dialogEntry = entry; dialog.showModal(); window.LotusClientLog?.record('SUBPAGE_STATE',{subpage:'order_map',orderId:entry.id,visible:true}); note.textContent = '載入地圖…';
      try { const s = await surface(full,true,entry); if (dialogEntry !== entry || run !== dialogRun) { s?.dispose(); return; } dialogSurface = s; show(entry); refresh(entry); }
      catch { note.textContent = '地圖暫時無法載入，請返回後重試'; }
    }
    function preview(item) {
      const id = item.orderId || item.id;
      let entry = entries.get(id);
      if (!entry) {
        const root = document.createElement('div'); root.className = 'order-map-preview'; root.dataset.orderMap = id; root.dataset.syslog='map.expand'; root.dataset.logOrder=id;
        root.tabIndex = 0; root.setAttribute('role','button'); root.setAttribute('aria-label','展開行程地圖');
        const label = document.createElement('span'); label.className = 'order-map-label'; label.textContent='載入地圖…'; root.append(label);
        entry = {id,root,label,data:{},batches:new Map(),cursor:null,live:true,nextRead:0,revision:0}; entries.set(id,entry);
        root.onclick = () => open(entry); root.onkeydown = e => { if (['Enter',' '].includes(e.key)) {e.preventDefault();open(entry);} }; observer.observe(root);
      }
      const status = item.orderStatus;
      if (entry.data.status && entry.data.status !== status) { entry.revision++; entry.cursor=null; entry.batches.clear(); entry.loaded=false; entry.live=true; entry.nextRead=0; }
      entry.data = {...entry.data,status,pickup:item.display?.pickupLocation,destination:item.display?.destination,driver:item.driverLocation};
      show(entry); return entry.root;
    }
    setInterval(() => {
      for (const entry of entries.values()) {
        if (!entry.root.isConnected && entry !== dialogEntry) {
          entry.detachedAt ||= Date.now();
          if (Date.now() - entry.detachedAt > 5000) {
            entry.revision++; observer.unobserve(entry.root); entry.surface?.dispose(); entries.delete(entry.id);
          }
          continue;
        }
        entry.detachedAt = 0;
        if (entry === dialogEntry || entry.visible && !entry.root.closest('[hidden]')) activate(entry);
      }
    }, 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) for (const entry of entries.values()) if (entry.visible) activate(entry); });
    function reset() { generation++; close(); observer.disconnect(); entries.forEach(e => e.surface?.dispose()); entries.clear(); }
    return {preview,reset};
  }
  return {create,segments,fitCamera,containsCamera};
})();
