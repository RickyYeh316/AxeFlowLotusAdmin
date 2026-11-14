// 真實Chrome執行UserManager與adminApi；Firebase Auth與HTTP資料使用隔離fixture，不連正式站。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { webpack } = require('next/dist/compiled/webpack/webpack');
const root = path.resolve(__dirname, '..');
const detailFixture=require('./order-detail.fixture.cjs');
const temp = fs.mkdtempSync('/private/tmp/lotus-ah-passenger-number-');
const write = (name, body) => { const file = path.join(temp, name); fs.writeFileSync(file, body); return file; };
const config = write('auth.js', `
const listeners = new Set();
export const db = {};
export const auth = { currentUser: { uid: 'test-admin', getIdToken: async () => 'fixture-token' } };
export function onAuthStateChanged(_auth, callback) { listeners.add(callback); queueMicrotask(() => callback(auth.currentUser)); return () => listeners.delete(callback); }
window.changeUser = uid => { auth.currentUser = uid ? { uid, getIdToken: async () => 'fixture-token' } : null; listeners.forEach(fn => fn(auth.currentUser)); };
`);
const loader = write('loader.cjs', `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},fileName:this.resourcePath}).outputText}`);
const entry = write('entry.js', `import {startSystemLog,logScreen} from ${JSON.stringify(path.join(root,'src/lib/systemLogs/client.ts'))}; import React from 'react'; import {createRoot} from 'react-dom/client'; import Manager from ${JSON.stringify(path.join(root,'src/components/UserManager.tsx'))}; import Orders from ${JSON.stringify(path.join(root,'src/components/OrderManager.tsx'))}; const view=createRoot(document.getElementById('root')); const createLog=window.LotusSystemLog.create; window.LotusSystemLog.create=o=>createLog({...o,intervalMs:20,uploadIntervalMs:0,minUploadMs:0,priorityDelayMs:0});startSystemLog();window.showView=which=>{logScreen(which);view.render(React.createElement(which==='orders'?Orders:Manager))}; window.showView('users');`);
const store = write('firestore.js', `
export const collection=(_db,name)=>({name});
export const onSnapshot=(ref,callback)=>{let active=true;queueMicrotask(()=>{if(active)callback({forEach:fn=>(window.fixture[ref.name]||[]).forEach(d=>fn({id:d.id,data:()=>d.data}))})});return()=>{active=false}};
export const Timestamp={now:()=>({toDate:()=>new Date()}),fromDate:v=>v};
export const addDoc=()=>{throw Error('Unexpected write')};export const updateDoc=addDoc;export const deleteDoc=addDoc;
export const doc=(_db,...parts)=>parts.join('/');export const serverTimestamp=()=>null;
`);
const fixture = `
window.confirm=()=>false;window.uploadedLogs=[];window.fetch=async(url,init)=>{if(String(url).endsWith('/uploadSystemLogs')){const b=JSON.parse(init.body);window.uploadedLogs.push(b);return {ok:true,json:async()=>({batchId:b.batchId,accepted:b.events.length})}}throw Error('Unexpected network')};
const numbers=['000123','123456','0123456','00001234',null];
window.fixture={users:numbers.map((number,i)=>({id:'MEMBER-private-'+i,data:{name:'乘客'+i,displayName:'乘客'+i,passengerNumber:number,tripStatus:'IDLE',accountStatus:'ACTIVE',phoneNumber:'',createdAt:{toDate:()=>new Date('2026-11-13T00:00:00Z')},updatedAt:{toDate:()=>new Date('2026-11-13T00:00:00Z')}}})),drivers:[],orders:numbers.map((_,i)=>({id:'order-private-'+i,data:{userId:'MEMBER-private-'+i,passengerId:'MEMBER-private-'+i,passengerName:'乘客'+i,readableId:'8'+String(i).padStart(5,'0'),status:'COMPLETED',isScheduled:i===1,isElderlyCare:i===1,couponId:i===1?'coupon-1':'',pickupLocation:i===0?{lat:23.991,lng:121.601}:undefined,destination:i===1?{lat:24.01,lng:121.62}:i===2?{lat:91,lng:121}:i===3?{lat:24,lng:'121'}:undefined,driverName:i===0?'測試司機':'',carPlate:i===0?'TEA-5596':'',startAddress:i===0?'花蓮縣花蓮市富裕二街30-1號':'花蓮',endAddress:i===0?'':'花蓮縣新城鄉北埔路415-1號',createdAt:{toDate:()=>new Date('2026-11-13T00:00:00Z')},updatedAt:{toDate:()=>new Date('2026-11-13T00:00:00Z')}}}))};
`;
(async () => {
  await new Promise((resolve,reject)=>webpack({mode:'production',plugins:[new webpack.DefinePlugin({'process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY':JSON.stringify('fixture-maps-key')})],entry,output:{path:temp,filename:'bundle.js'},
    resolve:{extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules'),'node_modules'],alias:{'../firebase/config':config,'../../firebase/config':config,'firebase/auth':config,'firebase/firestore':store}},
    module:{rules:[{test:/\.tsx?$/,use:loader}]},optimization:{minimize:false}},(err,stats)=>err?reject(err):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
  const cssFile = fs.readdirSync(path.join(root,'.next/static/chunks')).find(f=>f.endsWith('.css'));
  const server = http.createServer((req,res)=>{
    if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(temp,'bundle.js')));}
    else if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');res.end(fs.readFileSync(path.join(root,'.next/static/chunks',cssFile)));}
    else if(req.url.startsWith('/passenger-order/')){
      const name=req.url.split('?')[0],file=path.join(root,'public',name);
      if(!file.startsWith(path.join(root,'public/passenger-order/'))||!fs.existsSync(file)){res.statusCode=404;res.end();return;}
      res.setHeader('Content-Type',name.endsWith('.css')?'text/css':name.endsWith('.js')?'text/javascript':'text/html');
      res.end(name.endsWith('/google-maps.js')?detailFixture.maps:fs.readFileSync(file));
    }
    else {res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/style.css"><div id="root" style="padding:24px"></div><script>'+fixture+detailFixture.api+'</script><script src="/bundle.js"></script>');}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const profile=path.join(temp,'chrome');fs.mkdirSync(profile);
  const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
  let ws;
  try {
    const portFile=path.join(profile,'DevToolsActivePort');
    for(let i=0;i<100&&!fs.existsSync(portFile);i++)await new Promise(r=>setTimeout(r,100));
    const port=fs.readFileSync(portFile,'utf8').split('\n')[0];
    const tabs=await(await fetch(`http://127.0.0.1:${port}/json`)).json();
    ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
    let serial=0;const waiting=new Map(),errors=[];
    ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=waiting.get(m.id);waiting.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);};
    const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;waiting.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
    const run=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert.equal(r.exceptionDetails,undefined,JSON.stringify(r.exceptionDetails));return r.result.value;};
    const wait=async expression=>{for(let i=0;i<250;i++){if(await run(expression))return;await new Promise(r=>setTimeout(r,30));}console.error('fixture runtime errors',errors);console.error('fixture diagnostics',await run(`({errors:document.body.innerText,frame:document.querySelector('iframe')?.contentDocument?.body.innerText,reads:window.adminReads})`));assert.fail(expression);};
    const click=label=>run(`[...document.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(label)}).click()`);
    const fill=async(selector,value)=>{await run(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(el instanceof HTMLSelectElement?HTMLSelectElement.prototype:el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`);};
    await send('Runtime.enable');await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}`});
    await wait(`document.querySelectorAll('tbody tr').length===5`);
    assert.equal(await run(`document.querySelector('tbody').textContent.includes('MEMBER-private')`),false);
    assert.equal(await run(`document.querySelector('tbody').textContent.includes('000123')`),true);
    assert.equal(await run(`document.querySelector('tbody').textContent.includes('—')`),true);
    for(const number of ['000123','123456','0123456','00001234']) {
      await fill('input.search-input',number);await wait(`document.querySelectorAll('tbody tr').length===1`);
      assert.equal(await run(`document.querySelector('tbody tr td:nth-child(2)').textContent.trim()`),number);
    }
    await fill('input.search-input','MEMBER-private');await wait(`document.querySelectorAll('tbody tr').length===0`);
    await fill('input.search-input','');await wait(`document.querySelectorAll('tbody tr').length===5`);
    await run(`document.getAnimations().forEach(a=>a.finish())`);
    fs.writeFileSync(path.join(temp,'users.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
    await run(`showView('orders')`);await wait(`document.querySelectorAll('tbody tr').length===5`);
    assert.equal(await run(`document.querySelector('tbody').textContent.includes('MEMBER-private')`),false);
    await fill('input.search-input','123456');await wait(`document.querySelectorAll('tbody tr').length===1`);
    assert.equal(await run(`document.querySelector('tbody').textContent.includes('123456')`),true);
    await fill('input.search-input','000123');await wait(`document.querySelector('tbody').textContent.includes('000123')`);
    await fill('input.search-input','');await wait(`document.querySelectorAll('tbody tr').length===5`);
    await run(`document.getAnimations().forEach(a=>a.finish())`);
    fs.writeFileSync(path.join(temp,'orders.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
    assert.equal(await run(`document.querySelectorAll('thead th').length`),5);
    assert.equal(await run(`['乘客編號：','車號司機：','上車地：','目的地：'].some(t=>document.querySelector('tbody').innerText.includes(t))`),false);
    assert.deepEqual(await run(`[...document.querySelectorAll('tbody a.order-map-link')].map(a=>({href:a.href,target:a.target,rel:a.rel}))`),[
      {href:'https://www.google.com/maps/search/?api=1&query=23.991%2C121.601',target:'_blank',rel:'noopener noreferrer'},
      {href:'https://www.google.com/maps/search/?api=1&query=24.01%2C121.62',target:'_blank',rel:'noopener noreferrer'}
    ]);
    assert.equal(await run(`document.querySelector('[data-log-order="order-private-0"] .order-recorded-at .order-tags').innerText`),'即時');
    assert.equal(await run(`document.querySelector('[data-log-order="order-private-1"] .order-recorded-at .order-tags').innerText.replaceAll('\\n',' ')`),'預約 優惠券 敬老服務');
    assert.equal(await run(`document.querySelectorAll('tbody td:nth-child(2) .order-tags').length`),0);
    // 攔截導頁，只驗證真實連結點擊的 sysLog，不開外部地圖。
    await run(`document.querySelector('a.order-map-link').addEventListener('click',e=>e.preventDefault());document.querySelector('a.order-map-link').click()`);

    assert.equal(await run(`document.body.innerText.includes('手動派遣叫車') || document.body.innerText.includes('車資費用') || document.body.innerText.includes('派遣時間')`),false);
    assert.equal(await run(`document.querySelector('tbody').innerText.includes('2026/11/13 08:00:00')`),true);
    await fill('input.search-input','TEA-5596');await wait(`document.querySelectorAll('tbody tr').length===1`);
    assert.equal(await run(`document.querySelector('tbody').innerText.includes('測試司機') && document.querySelector('tbody').innerText.includes('未輸入')`),true);
    await fill('input.search-input','#800000');await wait(`document.querySelectorAll('tbody tr').length===1`);
    await fill('input.search-input','');await wait(`document.querySelectorAll('tbody tr').length===5`);
    // 不同瀏覽器時區仍顯示 Asia/Taipei；updatedAt 決定預設順序，獨立於 createdAt。
    await send('Emulation.setTimezoneOverride',{timezoneId:'America/Los_Angeles'});
    await run(`fixture.orders[0].data.updatedAt={toDate:()=>new Date('2026-11-14T02:00:00Z')};fixture.orders[1].data.updatedAt={toDate:()=>new Date('2026-11-14T03:00:00Z')};showView('users')`);
    await wait(`document.body.innerText.includes('乘客管理')`);
    await run(`showView('orders')`);await wait(`document.querySelectorAll('tbody tr').length===5`);
    assert.equal(await run(`document.querySelector('tbody tr').getAttribute('data-log-order')`),'order-private-1');
    assert.equal(await run(`document.querySelector('tbody tr').innerText.includes('2026/11/14 11:00:00')`),true);
    await run(`document.getAnimations().forEach(a=>a.finish())`);
    fs.writeFileSync(path.join(temp,'orders-desktop.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
    await send('Emulation.setDeviceMetricsOverride',{width:1100,height:900,deviceScaleFactor:1,mobile:false});
    fs.writeFileSync(path.join(temp,'orders-1100.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));

    // 分頁與預約狀態篩選仍可用；只有當頁呈現資料列。
    await run(`fixture.orders=Array.from({length:12},(_,i)=>({id:'page-'+i,data:{...fixture.orders[0].data,readableId:String(900000+i),status:i===0?'SCHEDULED':'COMPLETED'}}));showView('users')`);
    await wait(`document.body.innerText.includes('乘客管理')`);
    await run(`showView('orders')`);await wait(`document.querySelectorAll('tbody tr').length===10`);
    await click('下一頁');await wait(`document.querySelectorAll('tbody tr').length===2`);
    await click('進行中');await wait(`document.querySelectorAll('tbody tr').length===1`);
    assert.equal(await run(`document.querySelector('tbody').innerText.includes('預約中')`),true);
    assert.equal(await run(`document.body.innerText.includes('MEMBER-private')`),false);
    await wait(`window.uploadedLogs.some(b=>b.events.some(e=>e.type==='STREAM_STATE'))`);
    await wait(`window.uploadedLogs.some(b=>b.events.some(e=>e.type==='UI_CLICK'&&e.details.control==='order.pickup_map'&&e.details.orderId==='order-private-0'))`);
    assert.equal(await run(`uploadedLogs.every(b=>b.source==='webAdmin'&&b.owner==='test-admin')`),true);
    assert.equal(await run(`JSON.stringify(uploadedLogs).includes('fixture-token')`),false);

    // v3：真實 OrderDetail + iframe + 共用乘客卡／地圖／對話，HTTP/Maps 使用隔離資料。
    await click('全部訂單');await wait(`document.querySelectorAll('tbody tr').length===10`);
    await click('下一頁');await wait(`document.querySelectorAll('tbody tr').length===2`);
    assert.equal(await run(`document.querySelector('[data-syslog="order.delete"]')===null`),true);
    await run(`document.querySelector('[data-syslog="order.detail_open"]').click()`);
    await wait(`document.querySelector('iframe')?.contentDocument?.querySelector('.order-card')`);
    const fr=expr=>run(`(()=>{const w=document.querySelector('iframe').contentWindow,d=w.document;return (${expr});})()`);
    assert.equal(await fr(`d.querySelector('.rebook-button').disabled`),true);
    assert.equal(await fr(`d.querySelector('.rebook-button').textContent`),'重新叫車');
    assert.equal(await fr(`w.getComputedStyle(d.querySelector('.order-card')).borderRightColor`),'rgb(196, 123, 139)');
    assert.equal(await fr(`d.body.innerText.includes('快照司機')&&d.body.innerText.includes('新戶券 · 100 元')`),true);
    await wait(`document.querySelector('iframe').contentDocument.querySelector('.order-map-canvas')`);
    await fr(`d.querySelector('.order-map-preview').click()`);
    await wait(`document.querySelector('iframe').contentDocument.querySelector('dialog[open] .order-map-canvas')`);
    assert.equal(await fr(`d.querySelector('dialog h2').textContent`),'行程軌跡');
    assert.equal(await fr(`w.__mapLines.filter(l=>l.map&&l.strokeWeight===4).every(l=>l.path.length===2)`),true);
    await fr(`d.querySelector('dialog [data-close]').click()`);
    await wait(`!document.querySelector('iframe').contentDocument.querySelector('dialog[open]')`);
    await fr(`(w.scrollTo(0,140),w.savedScroll=w.scrollY,d.querySelector('.chat-entry').click())`);
    await wait(`document.querySelector('iframe').contentDocument.querySelectorAll('.chat-bubble').length===51`);
    assert.equal(await fr(`d.querySelector('.chat-composer').hidden`),true);
    assert.equal(await fr(`d.querySelectorAll('.chat-segment').length`),2);
    await fr(`d.querySelector('.chat-segment button').click()`);
    await wait(`document.querySelector('iframe').contentDocument.querySelectorAll('.chat-bubble').length===56`);
    assert.equal(await fr(`d.querySelectorAll('.chat-bubble img').length`),0);
    assert.equal(await fr(`d.querySelector('.chat-bubble a').rel`),'noopener noreferrer');
    await send('Page.captureScreenshot',{format:'png'}).then(r=>fs.writeFileSync(path.join(temp,'detail-chat.png'),Buffer.from(r.data,'base64')));
    await fr(`d.querySelector('.order-chat header button').click()`);
    assert.equal(await fr(`w.scrollY===w.savedScroll`),true);
    await send('Page.captureScreenshot',{format:'png'}).then(r=>fs.writeFileSync(path.join(temp,'detail-card.png'),Buffer.from(r.data,'base64')));
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
    await send('Page.captureScreenshot',{format:'png'}).then(r=>fs.writeFileSync(path.join(temp,'detail-390.png'),Buffer.from(r.data,'base64')));
    assert.equal(await fr(`d.documentElement.scrollWidth<=w.innerWidth`),true);
    await click('關閉');await wait(`!document.querySelector('dialog[open]')`);
    assert.equal(await run(`document.querySelectorAll('tbody tr').length`),2);
    await run(`window.detailDenied=true;document.querySelector('[data-syslog="order.detail_open"]').click()`);
    await wait(`document.querySelector('iframe')?.contentDocument?.querySelector('[role="alert"]')`);
    assert.equal(await fr(`d.querySelector('.order-card')===null`),true);
    await run(`window.detailDenied=false`);await fr(`d.querySelector('#detail>button').click()`);
    await wait(`document.querySelector('iframe').contentDocument.querySelector('.order-card')`);
    await click('關閉');await wait(`!document.querySelector('iframe')`);
    await run(`window.holdDetail=true;document.querySelector('[data-syslog="order.detail_open"]').click()`);
    await wait(`typeof releaseDetail==='function'`);
    await run(`changeUser('different-admin');releaseDetail()`);
    await wait(`!document.querySelector('iframe')`);
    assert.equal(await run(`adminReads.every(p=>['ORDER_DETAIL','ORDER_MAP','ORDER_CHAT','ORDER_CHAT_SEGMENT','ORDER_CHAT_MESSAGES'].includes(p.action))`),true);
    console.log('PASS: v3 snapshot card, disabled rebook, map segments, 2 chat segments/earlier pages/XSS, read-only, back/close/page preservation, 390px, permission failure/retry and late response identity isolation.');
    assert.deepEqual(errors,[]);
    console.log('PASS: 訂單v2精簡標籤、時間下方特性、地圖URL／新分頁設定、無效座標隱藏與點擊sysLog；既有搜尋／排序／時區／分頁／預約回歸通過。');
    console.log('sysLog auth/stream upload fixture PASS. Screenshots: '+temp);
  } finally {ws?.close();chrome.kill('SIGTERM');await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
