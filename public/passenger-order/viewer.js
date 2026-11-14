/* 同源隔離呈現容器；Firebase token 留在 AH parent，僅透過白名單唯讀 bridge。 */
(() => {
  const channel='lotus-order-viewer-v3', pending=new Map();let sequence=0, initialized=false, chats=null;
  const send=message=>parent.postMessage({channel,...message},location.origin);
  function request(input){return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('讀取逾時，請重試。'));},40000);pending.set(id,{resolve,reject,timer});send({type:'request',id,input});});}
  function revive(value){
    if(Array.isArray(value))return value.map(revive);
    if(value&&typeof value==='object'){
      if(Number.isFinite(value.seconds))return {...value,toMillis:()=>value.seconds*1000+(value.nanoseconds||0)/1e6,toDate:()=>new Date(value.seconds*1000+(value.nanoseconds||0)/1e6)};
      return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,revive(v)]));
    }return value;
  }
  function chatDb(){
    function reference(path,limit=50){
      return {orderBy:()=>reference(path,limit),limit:n=>reference(path,n),onSnapshot(next,error){
        let alive=true,timer;
        const parts=path.split('/'), segmentId=parts[3], messages=parts[4]==='messages';
        async function poll(){
          if(!alive)return;
          if(document.hidden){timer=setTimeout(poll,5000);return;}
          try{
            if(parts[2]==='chatViews'){
              const data=await request({action:'ORDER_CHAT'});if(alive)next({data:()=>data});
            }else if(messages){
              const rows=[];let beforeSequence;
              do{
                const page=await request({action:'ORDER_CHAT_MESSAGES',segmentId,...(beforeSequence?{beforeSequence}:{})});
                if(!alive)return;rows.push(...page.messages);beforeSequence=page.beforeSequence;
              }while(beforeSequence&&rows.length<limit);
              if(alive)next({size:rows.length,docs:rows.map(m=>({id:m.id,data:()=>revive(m)}))});
            }else{
              const data=revive(await request({action:'ORDER_CHAT_SEGMENT',segmentId}));if(alive)next({data:()=>data});
            }
          }catch(e){if(alive)error(e);}finally{if(alive)timer=setTimeout(poll,5000);}
        }
        poll();return()=>{alive=false;clearTimeout(timer);};
      }};
    }
    return {doc:reference,collection:reference};
  }
  async function start(config){
    window.LotusMapsConfig={key:config.mapsKey,v:'weekly',language:'zh-TW',region:'TW'};
    if(!window.google?.maps?.importLibrary)await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='shared/google-maps.js';s.onload=resolve;s.onerror=reject;document.head.append(s);});
    window.LotusClientLog={record:(type,details)=>send({type:'log',event:type,details})};
    const maps=window.LotusOrderMap.create(input=>request({action:'ORDER_MAP',cursor:input.cursor}));
    chats=window.LotusOrderChat.create({readOnly:true,personId:'admin-view',chatDb,request:()=>Promise.reject(Error('管理員唯讀'))});
    const renderer=window.LotusOrderCard.create({orderMaps:maps,orderChats:chats,readOnly:true});
    const root=document.getElementById('detail');
    let chatOpen=false, previousFocus=null;
    new MutationObserver(()=>{
      const page=document.querySelector('.order-chat');
      if(!!page===chatOpen)return;
      chatOpen=!!page;
      if(chatOpen){previousFocus=document.activeElement;root.inert=true;page.querySelector('header button')?.focus({preventScroll:true});}
      else{root.inert=false;previousFocus?.focus({preventScroll:true});}
    }).observe(document.body,{childList:true});
    async function load(){
      root.replaceChildren(Object.assign(document.createElement('p'),{textContent:'載入訂單中…'}));
      try{
        const {card,history}=await request({action:'ORDER_DETAIL'});
        const historical=card.active===false;
        const article=renderer.card(card,'USER',historical);
        // 紀錄頁沿用再次叫車的顯示條件；管理端永遠停用。
        const again=article.querySelector('.rebook-button');if(again)again.textContent='重新叫車';
        // 只替換卡片最後的乘客口吻摘要，保留優惠券等其他 outcome 說明。
        const outcome=article.lastElementChild;
        if(outcome?.classList.contains('outcome')&&card.orderStatus!=='SCHEDULED')outcome.remove();
        const timeline=document.createElement('section');timeline.className='order-timeline';
        const title=document.createElement('h4');title.textContent='訂單歷程';timeline.append(title);
        if(!history||history.incomplete){const note=document.createElement('p');note.className='note';note.textContent='歷程資料不完整，以下顯示已保存的紀錄。';timeline.append(note);}
        const list=document.createElement('ol');
        for(const event of history?.events||[]){
          const row=document.createElement('li'),time=document.createElement('time'),label=document.createElement('span');
          time.textContent=event.occurredAt?renderer.taiwanTime(event.occurredAt):'時間未記錄';
          label.textContent=event.label;row.append(time,label);list.append(row);
        }
        timeline.append(list);
        if(!history?.events?.length){const empty=document.createElement('p');empty.className='note';empty.textContent='尚無可顯示的歷程。';timeline.append(empty);}
        article.append(timeline);
        root.replaceChildren(article);
        send({type:'loaded'});
      }catch(e){
        const message=document.createElement('p');message.className='read-error';message.setAttribute('role','alert');message.textContent=e.message;
        const retry=document.createElement('button');retry.type='button';retry.textContent='重新載入';retry.onclick=load;root.replaceChildren(message,retry);
      }
    }
    load();
  }
  window.addEventListener('message',event=>{
    if(event.source!==parent||event.origin!==location.origin||event.data?.channel!==channel)return;
    const data=event.data;
    if(data.type==='response'){
      const task=pending.get(data.id);if(!task)return;pending.delete(data.id);clearTimeout(task.timer);data.error?task.reject(Error(data.error)):task.resolve(data.result);
    }else if(data.type==='init'&&!initialized){initialized=true;start(data).catch(()=>{document.getElementById('detail').textContent='介面載入失敗，請關閉後重試。';});}
  });
  document.addEventListener('click',event=>{const target=event.target.closest('[data-syslog]');if(target)send({type:'log',event:'UI_CLICK',details:{control:target.dataset.syslog}});},true);
  document.addEventListener('keydown',event=>{
    if(event.key!=='Escape'||document.querySelector('dialog[open]'))return;
    event.preventDefault();if(chats?.currentOrderId)chats.close();else send({type:'close'});
  });
  send({type:'ready'});
})();
