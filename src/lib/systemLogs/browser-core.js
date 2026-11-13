/* Formal system logs. Canonical browser core; AH vendors this file byte-for-byte. */
(function(root) {
  const fields = new Set('orderId readableId operationId attemptId eventId offerEventId noticeId action orderAction queueAction screen control status orderStatus tripStatus code httpStatus durationMs enabled loading cached online visible count dropped duplicate endpoint reason authenticated reservationState gpsStatus presenceStatus windowStart windowEnd minDurationMs maxDurationMs errorKind quotaUsed quotaLimit pendingCount layer listenerId initial changeType oldestPendingAt flushReason retryAt failureCount stage sampleCount sampleFrom sampleTo subpage clientVersion'.split(' '));
  const safe = value => typeof value === 'string' && /^[A-Za-z0-9_:.@+-]{1,128}$/.test(value);
  function clean(input = {}) { return Object.fromEntries(Object.entries(input || {}).filter(([k,v]) => fields.has(k) && (safe(v) || typeof v === 'boolean' || typeof v === 'number' && Number.isFinite(v) && Math.abs(v)<=Number.MAX_SAFE_INTEGER)).slice(0,23)); }
  // Only allowlisted background reads are summarized. Transactions retain every attempt.
  function createRequestBuffer(emit, now=Date.now) {
    const reads=new Set(['ORDER_MAP','QUEUE_BOARD','RESERVATION_POOL','LOCATION_BATCH','NOTICE_PRESENCE']);
    const states=new Map(), samples=new Map(), failed=new Set();
    const flushKey=key=>{const s=samples.get(key);if(!s)return;samples.delete(key);emit('POLL_SUMMARY',{...s.details,count:s.count,windowStart:s.start,windowEnd:s.end,durationMs:s.total,minDurationMs:s.min,maxDurationMs:s.max},false);};
    return {clear(){states.clear();samples.clear();failed.clear();},flush(){[...samples.keys()].forEach(flushKey);},observe(type,details,priority){
      if(!reads.has(details.action)){emit(type,details,priority);return;}
      const key=[details.screen,details.endpoint,details.action,details.orderId].join(':');
      if(type==='REQUEST_SENT'){if(!states.has(key)){states.set(key,'PENDING');emit(type,details,false);}return;}
      if(type==='HTTP_RESPONSE'){if(details.httpStatus!==200)emit(type,details,true);return;}
      if(type==='REQUEST_FAILED'){flushKey(key);failed.add(key);emit(type,details,priority);return;}
      if(type!=='ACTION_RESULT'){emit(type,details,priority);return;}
      const state=details.status||'',recovered=failed.delete(key);
      if(states.get(key)!==state)flushKey(key);
      if(states.get(key)!==state||recovered)emit(recovered?'REQUEST_RECOVERED':'POLL_STATE',details,recovered);
      states.set(key,state);const at=now();
      let sample=samples.get(key);if(!sample){const {attemptId,durationMs,windowStart,...metadata}=details;sample={details:metadata,start:at,end:at,count:0,total:0,min:Infinity,max:0};samples.set(key,sample);}
      const duration=Number(details.durationMs)||0;sample.end=at;sample.count++;sample.total+=duration;sample.min=Math.min(sample.min,duration);sample.max=Math.max(sample.max,duration);
      if(at-sample.start>=60000)flushKey(key);
      if(states.size>128){const oldest=states.keys().next().value;flushKey(oldest);states.delete(oldest);failed.delete(oldest);}
    }};
  }
  function create(options) {
    const sessionId=crypto.randomUUID(), source=options.source, version=options.version;
    let sequence=0, owner='', tokenProvider=null, busy=false, nextTry=0, failures=0, stopped=false;
    const lost=new Map();
    let urgentTimer=null,urgentPending=false,urgentThrough=0,lastAttempt=0,writing=Promise.resolve();
    const requestBuffer=createRequestBuffer(persist);
    // Keep priority until its events are acknowledged, including while another batch is in flight.
    const scheduleUrgent=()=>{if(urgentPending&&!busy&&!stopped&&owner&&tokenProvider&&urgentTimer===null)
      urgentTimer=setTimeout(()=>{urgentTimer=null;void flush();},Math.max(options.priorityDelayMs??2000,(options.minUploadMs??15000)-(Date.now()-lastAttempt),nextTry-Date.now()));};
    const requestFlush=(through=sequence)=>{if(stopped||!owner)return;urgentPending=true;urgentThrough=Math.max(urgentThrough,through);scheduleUrgent();};
    const loss=(id,count=1)=>lost.set(id,(lost.get(id)||0)+count);
    const dbPromise=new Promise((resolve,reject)=>{
      const request=indexedDB.open('lotus-system-logs-v1',1);
      request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore('events',{keyPath:'id'}).createIndex('owner','owner');db.createObjectStore('batches',{keyPath:'batchId'}).createIndex('owner','owner');db.createObjectStore('meta');};
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('blocked'));
    });
    dbPromise.catch(()=>{});
    const transact=async(names,work)=>{const db=await dbPromise;return new Promise((resolve,reject)=>{const tx=db.transaction(names,'readwrite');let result;tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(tx.error);work(tx,value=>{result=value;});});};
    const readAll=(store,index,key)=>new Promise((resolve,reject)=>{const r=index?store.index(index).getAll(key):store.getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    function record(type,details={},priority=false) {
      try { if(!owner||stopped)return;requestBuffer.observe(type,clean({screen:options.screen?.()||'unknown',...details}),priority); } catch { if(owner)loss(owner); }
    }
    function persist(type,details={},priority=false) {
      try {
      const capturedOwner=owner;
      if(!capturedOwner||!safe(type)||type.length>64||stopped)return;
      const event={id:crypto.randomUUID(),sessionId,sequence:++sequence,at:Date.now(),type,details:clean({clientVersion:version,screen:options.screen?.()||'unknown',...details})};
      let threshold=false,missed=0;
      const write=transact(['events','meta'],tx=>{
        const store=tx.objectStore('events'),count=store.count();
        count.onsuccess=()=>{
          threshold=(count.result+1)%options.batchSize===0;
          if(count.result>=5000){const m=tx.objectStore('meta'),r=m.get('dropped:'+capturedOwner);r.onsuccess=()=>m.put((r.result||0)+1,'dropped:'+capturedOwner);return;}
          missed=lost.get(capturedOwner)||0;
          if(missed){event.details.dropped=missed;lost.delete(capturedOwner);}
          const m=tx.objectStore('meta'),r=m.get('dropped:'+capturedOwner);r.onsuccess=()=>{if(r.result){event.details.dropped=(event.details.dropped||0)+r.result;m.delete('dropped:'+capturedOwner);}store.add({id:event.id,owner:capturedOwner,event});};
        };
      }).then(()=>{if(priority&&capturedOwner===owner)requestFlush(event.sequence);}).catch(()=>loss(capturedOwner,missed+1));
      writing=Promise.all([writing,write]).then(()=>{});
      } catch { if(owner)loss(owner); }
    }
    async function seal(actor) {
      return transact(['events','batches','meta'],(tx,done)=>{
        const events=tx.objectStore('events'),batches=tx.objectStore('batches'),meta=tx.objectStore('meta');
        const request=batches.getAll(),cutoff=Date.now()-7*86400000;
        request.onsuccess=()=>{
          const expired=new Set(request.result.filter(b=>b.savedAt<cutoff).map(b=>b.batchId));
          const rows=events.getAll();
          rows.onsuccess=()=>{
            const dropped=new Map(),valid=[];
            // Expire all accounts, and always expire a sealed batch as a unit.
            for(const row of rows.result){
              if(expired.has(row.batchId)||(!row.batchId&&row.event.at<cutoff)){
                events.delete(row.id);dropped.set(row.owner,(dropped.get(row.owner)||0)+1);
              }else if(row.owner===actor&&!row.batchId)valid.push(row);
            }
            expired.forEach(id=>batches.delete(id));
            for(const [id,count]of dropped){const key='dropped:'+id,r=meta.get(key);r.onsuccess=()=>meta.put((r.result||0)+count,key);}
            const pending=request.result.find(b=>b.owner===actor&&!expired.has(b.batchId));
            if(pending){done(pending);return;}
            valid.sort((a,b)=>a.event.at-b.event.at||a.event.sequence-b.event.sequence);
            const batchId=crypto.randomUUID(),batch={schemaVersion:1,batchId,source,owner:actor,version,events:[],savedAt:Date.now()};
            let bytes=1024;const selected=[];
            for(const row of valid){
              const size=new TextEncoder().encode(JSON.stringify(row.event)).length+1;
              if(selected.length>=options.batchSize||bytes+size>100*1024)break;
              selected.push(row);batch.events.push(row.event);bytes+=size;
            }
            if(!selected.length){done(null);return;}
            batches.add(batch);selected.forEach(r=>events.put({...r,batchId}));done(batch);
          };
        };
      });
    }
    async function queueState(reason, extra={}) {
      const actor=owner;if(!actor)return;
      try { await writing; const db=await dbPromise;
        const rows=await readAll(db.transaction('events').objectStore('events'),'owner',actor);
        if(actor!==owner||stopped)return;
        record('UPLOAD_STATE',{reason,pendingCount:rows.length,oldestPendingAt:rows.length?Math.min(...rows.map(r=>r.event.at)):0,...extra});
      } catch { /* Keep upload diagnostics best effort and non-recursive. */ }
    }
    async function flush(priority=false) {
      if(stopped||!owner||!tokenProvider)return;
      if(priority){urgentPending=true;urgentThrough=Math.max(urgentThrough,sequence);}
      if(busy)return;
      if(Date.now()<nextTry){scheduleUrgent();return;}
      priority=urgentPending;
      busy=true;const actor=owner,provider=tokenProvider,through=urgentThrough;
      try {
        requestBuffer.flush();await writing;
        const db=await dbPromise;
        const quota=await new Promise(resolve=>{const r=db.transaction('meta').objectStore('meta').get('quota:'+actor);r.onsuccess=()=>resolve(r.result);r.onerror=()=>resolve(null);});
        const now=Date.now(),used=quota?.reset>now?quota.used:0;
        const interval=priority?(options.minUploadMs??15000):used>=1600?300000:(options.uploadIntervalMs??60000);
        if(used>=2000){if(actor===owner)nextTry=quota.reset;return;}
        if(now-lastAttempt<interval)return;
        const batch=await seal(actor);if(!batch){if(actor===owner&&urgentThrough===through)urgentPending=false;return;}
        const token=await provider();if(owner!==actor||provider!==tokenProvider||!token)return;
        const {savedAt,...payload}=batch,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
        let response;lastAttempt=Date.now();
        try {response=await fetch(options.endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(payload),signal:controller.signal,credentials:'omit',cache:'no-store'});}finally{clearTimeout(timer);}
        if(response.status===429){if(actor===owner){nextTry=quota?.reset>now?quota.reset:(Math.floor(now/86400000)+1)*86400000;await queueState('QUOTA_WAIT',{retryAt:nextTry});}return;}
        if(!response.ok)throw Error('upload');const ack=await response.json();
        if(ack.batchId!==batch.batchId||ack.accepted!==batch.events.length)throw Error('ack');
        await transact(['events','batches','meta'],tx=>{batch.events.forEach(e=>tx.objectStore('events').delete(e.id));tx.objectStore('batches').delete(batch.batchId);tx.objectStore('meta').put({used:ack.quotaUsed??used+1,reset:ack.quotaResetAt??(Math.floor(now/86400000)+1)*86400000},'quota:'+actor);});
        if(actor===owner&&Math.floor((ack.quotaUsed??used+1)/100)!==Math.floor(used/100)) persist('UPLOAD_STATE',{quotaUsed:ack.quotaUsed??used+1,quotaLimit:ack.quotaLimit??2000,reason:(ack.quotaUsed??used+1)>=1600?'THROTTLED':'NORMAL'},false);
        if(failures&&actor===owner)await queueState('UPLOAD_RECOVERED',{failureCount:failures,flushReason:priority?'PRIORITY':'TIMER'});
        if(actor===owner){
          if(batch.events.some(e=>e.sessionId===sessionId&&e.sequence>=urgentThrough))urgentPending=false;
          failures=0;nextTry=0;
        }
      }catch{if(actor===owner){failures++;nextTry=Date.now()+Math.min(300000,1000*2**Math.min(failures,8));
        if(failures===1)await queueState('UPLOAD_FAILED',{failureCount:failures,retryAt:nextTry,flushReason:priority?'PRIORITY':'TIMER'});}}
      finally{busy=false;scheduleUrgent();}
    }
    function bind(id,provider){if(id!==owner){clearTimeout(urgentTimer);urgentTimer=null;urgentPending=false;urgentThrough=0;requestBuffer.clear();owner=safe(id)?id:'';nextTry=0;failures=0;lastAttempt=0;}tokenProvider=provider;if(owner){record('AUTH_STATE',{authenticated:true});void flush(true);}}
    const onOnline=()=>{record('CONNECTIVITY',{online:true});requestFlush();};
    const onOffline=()=>record('CONNECTIVITY',{online:false},true);
    const visibility=e=>{const visible=e?.type!=='pagehide'&&document.visibilityState==='visible';record('VISIBILITY',{visible,reason:e?.type||'visibilitychange'},true);requestBuffer.flush();void queueState(visible?'FOREGROUND':'BACKGROUND',{visible});};
    const click=e=>{const target=e.target?.closest?.('button,[role=button],a,input[type=submit]');if(!target)return;
      const card=target.closest('[data-log-order]');
      const control=target.dataset.syslog || target.dataset.roleAction || (/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(target.id)?target.id:'unmapped.'+target.tagName.toLowerCase());
      record('UI_CLICK',{control,action:target.dataset.roleAction,orderId:card?.dataset.logOrder,eventId:card?.dataset.logEvent,enabled:!target.disabled,reason:control.startsWith('unmapped.')?'MISSING_CONTROL_ID':undefined,screen:options.screen?.()||'unknown'});};
    const runtime=()=>record('RUNTIME_ERROR',{code:'UNCAUGHT'},true);
    root.addEventListener?.('online',onOnline);root.addEventListener?.('offline',onOffline);root.addEventListener?.('pagehide',visibility);
    root.addEventListener?.('error',runtime);root.addEventListener?.('unhandledrejection',runtime);
    root.document?.addEventListener('visibilitychange',visibility);root.document?.addEventListener('click',click,true);
    const timer=setInterval(()=>void flush(),options.intervalMs);
    return {record,flush,bind,stop(){requestBuffer.flush();stopped=true;clearTimeout(urgentTimer);clearInterval(timer);root.removeEventListener?.('online',onOnline);root.removeEventListener?.('offline',onOffline);root.removeEventListener?.('pagehide',visibility);root.removeEventListener?.('error',runtime);root.removeEventListener?.('unhandledrejection',runtime);root.document?.removeEventListener('visibilitychange',visibility);root.document?.removeEventListener('click',click,true);},
      async pending(){const db=await dbPromise;const tx=db.transaction('events');return (await readAll(tx.objectStore('events'),'owner',owner)).length;}};
  }
  root.LotusSystemLog={create,clean,createRequestBuffer};
  if(typeof module!=='undefined')module.exports={create,clean,createRequestBuffer};
})(typeof window==='undefined'?globalThis:window);
