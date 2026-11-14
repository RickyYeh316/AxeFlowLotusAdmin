/* 正式乘客訂單對話；文字只建立Text節點，網址只允許HTTP(S)。 */
window.LotusOrderChat = (() => {
  const node = (tag, text = '', cls = '') => { const e = document.createElement(tag); e.textContent = text; e.className = cls; return e; };
  function appendText(element, text) {
    const pattern = /https?:\/\/[^\s<>"']+/giu;
    let start = 0;
    for (const match of text.matchAll(pattern)) {
      const value = match[0].replace(/[.,!?;:，。！？；：、）)\]」』]+$/u, '');
      let url;
      try { url = new URL(value); } catch { continue; }
      if (!['http:', 'https:'].includes(url.protocol)) continue;
      element.append(document.createTextNode(text.slice(start, match.index)));
      const link = node('a', value); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.addEventListener('click', event => {
        if (!window.getSelection()?.isCollapsed) { event.preventDefault(); return; }
        if (window.liff?.isInClient()) { event.preventDefault(); window.liff.openWindow({url:link.href, external:true}); }
      });
      element.append(link); start = match.index + value.length;
    }
    element.append(document.createTextNode(text.slice(start)));
  }
  const time = t => t?.toDate ? t.toDate().toLocaleString('zh-TW', {timeZone:'Asia/Taipei', month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';
  function create(host) {
    const watches = new Map();
    let openedOrderId = '', page = null, pageCleanup = () => {}, epoch = 0;
    function close() { if(openedOrderId)window.LotusClientLog?.record('SUBPAGE_STATE',{subpage:'chat',orderId:openedOrderId,visible:false}); openedOrderId = ''; pageCleanup(); pageCleanup = () => {}; page?.remove(); page = null; document.body.classList.remove('chat-open'); }
    function summary(id) {
      if (watches.has(id)) return watches.get(id);
      const state = { buttons: new Set(), data: null, changed: () => {}, stop: () => {} };
      watches.set(id, state);
      const generation = epoch;
      state.stop = host.chatDb().doc(`orders/${id}/chatViews/USER-${host.personId}`).onSnapshot(s => {
        if (generation !== epoch) return;
        state.data = s.data();
        for (const b of state.buttons) {
          b.hidden = !state.data?.segmentIds?.length;
          b.classList.toggle('unread', (state.data?.unreadCount || 0) > 0);
          b.setAttribute('aria-label', (state.data?.unreadCount || 0) > 0 ? '文字對話，有未讀訊息' : '文字對話');
        }
        state.changed();
      }, () => { if (generation === epoch) { state.data = null; state.buttons.forEach(b => { b.hidden = true; }); state.changed(); } });
      return state;
    }
    function button(id) {
      const b = node('button', '對話', 'chat-entry'); b.type = 'button'; b.dataset.syslog='chat.open'; b.hidden = true;
      const icon = node('span', '', 'chat-icon'); icon.setAttribute('aria-hidden','true'); b.prepend(icon);
      const badge = node('span', '', 'chat-dot'); badge.setAttribute('aria-hidden','true'); b.append(badge);
      const state = summary(id); state.buttons.add(b);
      b.hidden = !state.data?.segmentIds?.length;
      b.classList.toggle('unread', (state.data?.unreadCount || 0) > 0);
      b.addEventListener('click', () => open(id)); return b;
    }
    function open(id) {
      close(); openedOrderId = id;
      const generation = epoch, owner = host.personId, state = summary(id), segments = new Map();
      let alive = true, busy = false, currentSegment = '', rendered = '', first = true, reading = new Map();
      const storageKey = `lotus-chat-pending:${owner}:${id}`;
      let pending = null, storageError = false;
      try { if (!host.readOnly) pending = JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch { storageError = true; }
      page = node('section', '', 'order-chat'); page.setAttribute('aria-label','文字對話');
      const header = node('header'), back = node('button','返回'), title = node('h2','文字對話');
      window.LotusClientLog?.record('SUBPAGE_STATE',{subpage:'chat',orderId:id,visible:true});
      page.dataset.logOrder=id; back.dataset.syslog='chat.back'; back.type = 'button'; back.onclick = close; header.append(back,title);
      const list = node('div','','chat-messages'), feedback = node('p','','chat-feedback');
      const composer = node('form','','chat-composer'), input = node('textarea');
      input.rows = 2; input.placeholder = '輸入訊息…'; input.setAttribute('aria-label','訊息');
      const send = node('button','送出'); send.type = 'submit'; send.dataset.syslog='chat.send';
      const retry = node('button','重試原訊息'); retry.type = 'button'; retry.dataset.syslog='chat.retry'; retry.hidden = true;
      composer.append(input,send); page.append(header,list,feedback,retry,composer);
      document.body.append(page); document.body.classList.add('chat-open');
      function controls() {
        const length = Array.from(input.value).length;
        if (currentSegment && length > 200 && !pending && !storageError) feedback.textContent = '訊息最多 200 字。';
        else if (feedback.textContent === '訊息最多 200 字。') feedback.textContent = '';
        composer.hidden = host.readOnly || !currentSegment;
        input.disabled = busy || !!pending || storageError;
        send.disabled = input.disabled || !input.value.trim() || length > 200;
        retry.hidden = !pending || busy; retry.disabled = storageError;
        if (storageError) feedback.textContent = '無法保存訊息，請確認瀏覽器儲存空間後重開。';
      }
      const valid = () => alive && generation === epoch && host.personId === owner;
      const visualViewport = window.visualViewport;
      let viewportFrame = 0;
      function updateViewport() {
        viewportFrame = 0;
        if (!valid()) return;
        const bottom = list.scrollHeight - list.scrollTop - list.clientHeight < 48;
        // iOS鍵盤可能只縮小／平移可見視窗；標題與輸入列留在可見區，僅訊息區縮高。
        page.style.setProperty('--chat-height', `${visualViewport?.height || innerHeight}px`);
        page.style.setProperty('--chat-top', `${visualViewport?.offsetTop || 0}px`);
        if (bottom) list.scrollTop = list.scrollHeight;
        markVisible();
      }
      function viewportChanged() {
        if (!viewportFrame) viewportFrame = requestAnimationFrame(updateViewport);
      }
      function markVisible() {
        if (host.readOnly || !valid() || document.hidden || document.hasFocus && !document.hasFocus()) return;
        const box = list.getBoundingClientRect();
        const seen = new Map();
        list.querySelectorAll('[data-sequence]').forEach(b => {
          const r = b.getBoundingClientRect();
          if (r.bottom <= box.bottom + 1 && r.bottom > box.top) seen.set(b.dataset.segment, Math.max(seen.get(b.dataset.segment) || 0, Number(b.dataset.sequence)));
        });
        for (const [segmentId, sequence] of seen) {
          if ((reading.get(segmentId) || 0) >= sequence) continue;
          reading.set(segmentId, sequence);
          host.request({action:'CHAT_READ',orderId:id,segmentId,sequence}).catch(() => { if (valid() && reading.get(segmentId) === sequence) reading.delete(segmentId); });
        }
      }
      function render() {
        if (!valid()) return;
        const rows = [...segments.values()].filter(s => s.header).sort((a,b) => (a.header.startedAt?.toMillis() || 0) - (b.header.startedAt?.toMillis() || 0));
        currentSegment = rows.find(s => s.header.open)?.id || '';
        const key = JSON.stringify(rows.map(s => [s.id,s.header.open,s.header.driverName,s.header.carPlate,[...s.messages.values()].map(m=>[m.sequence,m.text]),s.more,s.error]));
        if (key !== rendered) {
          const bottom = first || list.scrollHeight - list.scrollTop - list.clientHeight < 48, top = list.scrollTop;
          rendered = key; list.replaceChildren();
          for (const segment of rows) {
            const block = node('section','','chat-segment');
            block.append(node('h3',`${segment.header.carPlate} ${segment.header.driverName}`.trim()));
            if (segment.more) {
              const more = node('button','載入較早訊息'); more.type='button'; more.dataset.syslog='chat.load_earlier'; more.onclick=()=>{segment.limit+=50; listenMessages(segment);}; block.append(more);
            }
            for (const m of [...segment.messages.values()].sort((a,b)=>a.sequence-b.sequence)) {
              const wrap = node('div','',`chat-message ${m.senderRole === 'USER' ? 'mine' : 'theirs'}`);
              const bubble = node('div','','chat-bubble'); appendText(bubble,m.text);
              wrap.dataset.segment=segment.id; wrap.dataset.sequence=String(m.sequence);
              wrap.append(bubble,node('small',time(m.createdAt))); block.append(wrap);
            }
            if (segment.error) block.append(node('p','訊息讀取失敗，請返回後重試。','error'));
            if (!segment.header.open) block.append(node('p','本段服務已結束・唯讀','chat-ended'));
            list.append(block);
          }
          if (!rows.length) list.append(node('p',state.data ? '正在載入對話…' : '對話暫時無法讀取，請返回後重試。'));
          if (bottom) list.scrollTop=list.scrollHeight; else list.scrollTop=top;
          first = false;
        }
        if (!pending && !busy) feedback.textContent = host.readOnly ? '管理員唯讀' : currentSegment ? '' : '目前沒有開放中的對話。';
        controls(); requestAnimationFrame(markVisible);
      }
      function listenMessages(segment) {
        segment.stopMessages?.();
        segment.stopMessages = host.chatDb().collection(`orders/${id}/conversations/${segment.id}/messages`).orderBy('sequence','desc').limit(segment.limit).onSnapshot(s => {
          if (!valid()) return; segment.messages = new Map(s.docs.map(d=>[d.id,d.data()])); segment.more=s.size===segment.limit; segment.error=false; render();
        },()=>{if(valid()){segment.error=true;segment.messages.clear();render();}});
      }
      function updateSegments() {
        if (!valid()) return;
        if (!state.data) { segments.forEach(s=>{s.stopHeader();s.stopMessages?.();});segments.clear();render();return; }
        for (const segmentId of state.data.segmentIds || []) {
          if (segments.has(segmentId)) continue;
          const segment={id:segmentId,header:null,messages:new Map(),limit:50,more:false,error:false}; segments.set(segmentId,segment);
          segment.stopHeader=host.chatDb().doc(`orders/${id}/conversations/${segmentId}`).onSnapshot(s=>{if(valid()){segment.header=s.data();render();}},()=>{if(valid()){segment.header=null;segment.error=true;render();}});
          listenMessages(segment);
        }
      }
      async function submit() {
        if (host.readOnly || busy || storageError || !valid()) return;
        if (!pending) {
          if (!currentSegment || !input.value.trim() || Array.from(input.value).length>200) return;
          pending={action:'CHAT_SEND',orderId:id,segmentId:currentSegment,operationId:crypto.randomUUID(),text:input.value};
          try { localStorage.setItem(storageKey,JSON.stringify(pending)); } catch { storageError=true; controls(); return; }
        }
        const sent=pending; busy=true; feedback.textContent='傳送中…';controls();
        try {
          await host.request(sent);
          // 即使頁面已關閉仍清除此身分的原收據，避免下次重新送出。
          if (localStorage.getItem(storageKey)===JSON.stringify(sent)) localStorage.removeItem(storageKey);
          pending=null;
          if(valid()){input.value='';feedback.textContent='';}
        } catch(error) {
          if (['STALE_OPERATION','INVALID_ARGUMENT'].includes(error.code)) {
            localStorage.removeItem(storageKey);pending=null;
            if(valid()) input.value=sent.text;
          }
          if(valid()) feedback.textContent=error.message || '結果待確認，請重試原訊息。';
        } finally {busy=false;if(valid())controls();}
      }
      if (pending) {input.value=pending.text || '';feedback.textContent='上一則訊息結果待確認，請重試原訊息。';}
      composer.onsubmit=e=>{e.preventDefault();submit();}; retry.onclick=submit;
      input.oninput=controls;list.addEventListener('scroll',markVisible);window.addEventListener('focus',markVisible);document.addEventListener('visibilitychange',markVisible);
      state.changed=updateSegments; updateSegments();controls();
      visualViewport?.addEventListener('resize', viewportChanged);
      visualViewport?.addEventListener('scroll', viewportChanged);
      window.addEventListener('resize', viewportChanged);
      updateViewport();
      const readTimer=setInterval(markVisible,2000);
      pageCleanup=()=>{alive=false;state.changed=()=>{};segments.forEach(s=>{s.stopHeader();s.stopMessages?.();});clearInterval(readTimer);window.removeEventListener('focus',markVisible);document.removeEventListener('visibilitychange',markVisible);
        cancelAnimationFrame(viewportFrame);visualViewport?.removeEventListener('resize',viewportChanged);visualViewport?.removeEventListener('scroll',viewportChanged);window.removeEventListener('resize',viewportChanged);};
    }
    const observer=new MutationObserver(()=>{
      for(const [id,s] of watches){s.buttons.forEach(b=>{if(!b.isConnected)s.buttons.delete(b);});if(!s.buttons.size&&!page){s.stop();watches.delete(id);}}
    }); observer.observe(document.body,{childList:true,subtree:true});
    return {button,open,get currentOrderId(){return openedOrderId;},reset(){epoch++;close();watches.forEach(s=>s.stop());watches.clear();},close};
  }
  return {create,appendText};
})();
