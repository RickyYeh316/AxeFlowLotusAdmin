// 真實Chrome執行MarketingManager與adminApi；Firebase Auth與HTTP資料使用隔離fixture，不連正式站。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { webpack } = require('next/dist/compiled/webpack/webpack');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync('/private/tmp/lotus-ah-coupon-browser-');
const write = (name, body) => { const file = path.join(temp, name); fs.writeFileSync(file, body); return file; };
const config = write('auth.js', `
const listeners = new Set();
export const auth = { currentUser: { uid: 'test-admin', getIdToken: async () => 'fixture-token' } };
export function onAuthStateChanged(_auth, callback) { listeners.add(callback); queueMicrotask(() => callback(auth.currentUser)); return () => listeners.delete(callback); }
window.changeUser = uid => { auth.currentUser = uid ? { uid, getIdToken: async () => 'fixture-token' } : null; listeners.forEach(fn => fn(auth.currentUser)); };
`);
const loader = write('loader.cjs', `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},fileName:this.resourcePath}).outputText}`);
const entry = write('entry.js', `import React from 'react'; import {createRoot} from 'react-dom/client'; import Manager from ${JSON.stringify(path.join(root,'src/components/MarketingManager.tsx'))}; createRoot(document.getElementById('root')).render(React.createElement(Manager));`);
const fixture = `
window.calls=[]; window.receipts=new Map();window.counter=0;window.failAfterWrite=false;window.hold=false;
window.confirm=()=>true;
const stored=sessionStorage.getItem('fixture-rows');
window.rows=stored?JSON.parse(stored):[
{id:'WELCOME100',type:1,title:'新戶優惠券',description:'',discountAmount:100,status:'active',startDate:'',endDate:'2039-12-31',expiresAtMillis:2208960000000,version:{seconds:1,nanoseconds:0}},
{id:'old',type:3,title:'過期補償券',description:'',discountAmount:80,status:'published',startDate:'2020-07-01',endDate:'2020-08-31',expiresAtMillis:1598889600000,version:{seconds:1,nanoseconds:0}}
];
window.fetch=async(url,options)=>{
 if(url!=='https://asia-east1-axeflowlotus-6dc3b.cloudfunctions.net/webAdmin')throw Error('Unexpected network');
 if(options.headers.Authorization!=='Bearer fixture-token')throw Error('Missing token');
 const x=JSON.parse(options.body);calls.push(x);let result;
 if(x.action==='COUPONS')result={items:rows.map(r=>({...r,notificationPreview:'您收到一張優惠券！\\n\\n'+r.title+' · 折抵'+r.discountAmount+'元\\n使用期間：'+r.startDate+'～'+r.endDate+'\\n\\n查看我的優惠券\\nhttps://liff.line.me/2012269566-puD0ISKR?tab=other&view=coupons'})),after:null};
 else if(x.action==='USERS')result={items:[{id:'MEMBER-test',passengerNumber:'000123',name:'Jessica 測試乘客',phoneNumber:'0900000000',isNPC:false,accountStatus:'ACTIVE',lineUid:'U'+'a'.repeat(32)}],after:null};
 else if(receipts.has(x.operationId))result=receipts.get(x.operationId);
 else {
  if(x.action==='COUPON_CREATE') { result={id:'new'+(++counter)};rows.push({...x,id:result.id,status:'draft',version:{seconds:2,nanoseconds:0},expiresAtMillis:2208960000000}); }
  else if(x.action==='COUPON_ISSUE') {const row=rows.find(r=>r.id===x.id); row.status='published';row.version.seconds++; result={id:x.id,couponId:'grant'+(++counter)};}
  else if(x.action==='COUPON_PUBLISH') {const row=rows.find(r=>r.id===x.id);row.status='published';row.version.seconds++;row.distribution={state:'PENDING',issuedCount:0,skippedCount:0,lastError:''};result={id:x.id,distributionState:'PENDING'};}
  else if(x.action==='COUPON_RETRY') {const row=rows.find(r=>r.id===x.id);row.distribution.state='PENDING';row.distribution.lastError='';row.version.seconds++;result={id:x.id,distributionState:'PENDING'};}
  else if(x.action==='COUPON_UPDATE') {Object.assign(rows.find(r=>r.id===x.id),x);result={id:x.id};}
  else if(x.action==='COUPON_DELETE') {rows=rows.filter(r=>r.id!==x.id);result={id:x.id};}
  else if(x.action==='COUPON_TOGGLE') {rows.find(r=>r.id===x.id).status=x.enabled?'active':'inactive';result={id:x.id};}
  else throw Error('Unexpected action');
  receipts.set(x.operationId,result);sessionStorage.setItem('fixture-rows',JSON.stringify(rows));
  if(failAfterWrite){failAfterWrite=false;throw Error('lost response');}
 }
 if(hold&&x.action==='COUPONS') await new Promise(resolve=>window.release=resolve);
 return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
};
`;
(async () => {
  await new Promise((resolve,reject)=>webpack({mode:'production',entry,output:{path:temp,filename:'bundle.js'},
    resolve:{extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules'),'node_modules'],alias:{'../firebase/config':config,'../../firebase/config':config,'firebase/auth':config}},
    module:{rules:[{test:/\.tsx?$/,use:loader}]},optimization:{minimize:false}},(err,stats)=>err?reject(err):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
  const cssFile = fs.readdirSync(path.join(root,'.next/static/chunks')).find(f=>f.endsWith('.css'));
  const server = http.createServer((req,res)=>{
    if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(temp,'bundle.js')));}
    else if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');res.end(fs.readFileSync(path.join(root,'.next/static/chunks',cssFile)));}
    else {res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/style.css"><div id="root" style="padding:24px"></div><script>'+fixture+'</script><script src="/bundle.js"></script>');}
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
    const wait=async expression=>{for(let i=0;i<250;i++){if(await run(expression))return;await new Promise(r=>setTimeout(r,30));}assert.fail(expression);};
    const click=label=>run(`[...document.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(label)}).click()`);
    const fill=async(selector,value)=>{await run(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(el instanceof HTMLSelectElement?HTMLSelectElement.prototype:el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`);};
    await send('Runtime.enable');await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}`});
    await wait(`document.querySelector('tbody')?.textContent.includes('新戶優惠券')`);
    assert.equal(await run(`new Set([...document.querySelectorAll('.coupon-toolbar > button')].map(b=>b.getBoundingClientRect().height)).size`),1);
    assert.equal(await run(`(()=>{const b=document.querySelector('.coupon-toolbar > button:last-child');const icon=b.querySelector('svg').getBoundingClientRect();const r=new Range();r.selectNode(b.lastChild);const text=r.getBoundingClientRect();return Math.abs((icon.top+icon.bottom-text.top-text.bottom)/2)<2})()`),true);
    assert.equal(await run(`document.querySelector('tbody').textContent.includes('刪除')`),false);
    await click('歷史優惠券');await wait(`document.querySelector('tbody')?.textContent.includes('過期補償券')`);
    await click('目前優惠券');await click('新增優惠券草稿');await wait(`!!document.querySelector('[role=dialog]')`);
    assert.equal(await run(`document.querySelector('[role=dialog]').textContent.includes('最低消費')`),false);
    await fill('input[maxlength="256"]','2027來花蓮跨年・這是一個測試長名稱與各端視覺呈現的補償優惠券');
    await fill('input[type=number]','80');
    await fill('input[type=date]','2027-07-01');
    await run(`(()=>{const e=document.querySelectorAll('input[type=date]')[1];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'2039-08-31');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await click('儲存草稿');await wait(`!document.querySelector('[role=dialog]')`);
    assert.equal(await run(`calls.filter(c=>c.action==='COUPON_CREATE').length`),1);
    assert.equal(await run(`calls.find(c=>c.action==='COUPON_CREATE').type`),3);
    await click('發券');await wait(`document.querySelector('option[value="MEMBER-test"]')!==null`);
    assert.equal(await run(`document.querySelector('.coupon-notify input').checked`),true);
    assert.equal(await run(`document.querySelector('.coupon-preview-text').textContent.includes('view=coupons')`),true);
    await run(`document.querySelector('.coupon-notify input').click()`);await wait(`!document.querySelector('.coupon-preview')`);
    assert.equal(await run(`document.querySelector('option[value="MEMBER-test"]').textContent.includes('000123')`),true);
    assert.equal(await run(`document.querySelector('[role=dialog]').textContent.includes('MEMBER-test')`),false);
    await fill('input[placeholder="姓名、電話或乘客編號"]','000123');
    await wait(`document.querySelector('option[value="MEMBER-test"]')!==null`);
    await fill('select','MEMBER-test');
    await run('failAfterWrite=true');await click('確認發券');await wait(`document.body.textContent.includes('重試原操作（不重複發券）')`);
    assert.equal(await run(`document.querySelector('button[aria-label="關閉"]').disabled`),true);
    await click('重試原操作（不重複發券）');await wait(`!document.querySelector('[role=dialog]')`);
    assert.equal(await run(`new Set(calls.filter(c=>c.action==='COUPON_ISSUE').map(c=>c.operationId)).size`),1);
    assert.equal(await run(`calls.filter(c=>c.action==='COUPON_ISSUE').every(c=>c.notifyPassenger===false && c.userId==='MEMBER-test')`),true);
    await click('發券');await wait(`document.querySelector('option[value="MEMBER-test"]')!==null`);await fill('select','MEMBER-test');await click('確認發券');await wait(`!document.querySelector('[role=dialog]')`);
    assert.equal(await run(`new Set(calls.filter(c=>c.action==='COUPON_ISSUE').map(c=>c.operationId)).size`),2);
    assert.equal(await run(`calls.filter(c=>c.action==='COUPON_ISSUE').at(-1).notifyPassenger`),true);
    assert.equal(await run(`[...document.querySelectorAll('tbody tr')].find(r=>r.textContent.includes('2027來花蓮跨年')).textContent.includes('編輯')`),false);
    await click('新增優惠券草稿');await wait(`!!document.querySelector('[role=dialog]')`);
    await fill('select','2');await fill('input[maxlength="256"]','全體活動150');await fill('input[type=number]','150');await fill('input[type=date]','2026-01-01');
    await run(`(()=>{const e=document.querySelectorAll('input[type=date]')[1];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'2039-08-31');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await click('儲存草稿');await wait(`!document.querySelector('[role=dialog]')`);
    await run(`[...document.querySelectorAll('tbody tr')].find(r=>r.textContent.includes('全體活動150')).querySelector('.btn-primary').click()`);
    await wait(`document.querySelector('[role=dialog]')?.textContent.includes('發券給全體乘客')`);
    assert.equal(await run(`!!document.querySelector('[role=dialog] select')`),false);
    assert.equal(await run(`document.querySelector('.coupon-notify input').checked`),true);
    assert.equal(await run(`document.querySelector('.coupon-preview-text').textContent`),'您收到一張優惠券！\n\n全體活動150 · 折抵150元\n使用期間：2026-01-01～2039-08-31\n\n查看我的優惠券\nhttps://liff.line.me/2012269566-puD0ISKR?tab=other&view=coupons');
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await wait(`(()=>{const r=document.querySelector('[role=dialog]').getBoundingClientRect();return r.left>=0&&r.right<=390&&r.top>=0&&r.bottom<=844})()`);
    await run(`new Promise(r=>setTimeout(r,500))`);
    assert.equal(await run(`document.querySelector('[role=dialog]').scrollWidth<=document.querySelector('[role=dialog]').clientWidth`),true);
    assert.equal(await run(`document.querySelector('.coupon-notify input').getBoundingClientRect().width`),20);
    fs.writeFileSync(path.join(temp,'notification-mobile.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await run(`new Promise(r=>setTimeout(r,500))`);
    fs.writeFileSync(path.join(temp,'notification-desktop.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
    assert.equal(await run(`document.querySelector('[role=dialog]').textContent.includes('開始發券後的新戶不補發')`),true);
    await run('failAfterWrite=true');await click('確認發券');await wait(`document.body.textContent.includes('重試原操作（不重複發券）')`);
    await click('重試原操作（不重複發券）');await wait(`!document.querySelector('[role=dialog]')`);
    assert.equal(await run(`new Set(calls.filter(c=>c.action==='COUPON_PUBLISH').map(c=>c.operationId)).size`),1);
    assert.equal(await run(`calls.filter(c=>c.action==='COUPON_PUBLISH').every(c=>c.notifyPassenger===true)`),true);
    await run(`rows.find(r=>r.title==='全體活動150').distribution={state:'FAILED',issuedCount:1,skippedCount:2,lastError:'發券暫時中斷'}`);
    await wait(`document.body.textContent.includes('重試發券')`); // 由輪詢取得背景進度，不手動重整。
    await click('重試發券');await wait(`calls.some(c=>c.action==='COUPON_RETRY')&&!document.body.textContent.includes('重試發券')`);
    await run(`rows.find(r=>r.title==='全體活動150').distribution={state:'COMPLETED',issuedCount:2,skippedCount:2,lastError:''}`);
    await click('重新整理');await wait(`document.body.textContent.includes('已發 2 張')`);
    assert.equal(await run(`[...document.querySelectorAll('tbody tr')].find(r=>r.textContent.includes('全體活動150')).querySelectorAll('button').length`),0);
    await click('新增優惠券草稿');await wait(`!!document.querySelector('[role=dialog]')`);
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await wait(`(()=>{const r=document.querySelector('[role=dialog]').getBoundingClientRect();return r.left>=0&&r.right<=390&&r.height<=844})()`);
    fs.writeFileSync(path.join(temp,'mobile.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await wait(`!document.querySelector('[role=dialog]')`);
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    fs.writeFileSync(path.join(temp,'desktop.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
    await run(`hold=true;[...document.querySelectorAll('button')].find(b=>b.textContent==='重新整理').click()`);await wait('!!window.release');
    await run(`changeUser(null);hold=false;release()`);await wait(`document.body.textContent.includes('請先使用管理員')`);
    assert.equal(await run(`document.querySelector('tbody')===null`),true);
    assert.deepEqual(errors,[]);
    console.log('PASS: 草稿、Type1保護、Type3連發、Type2全體確認／回應遺失防重／背景輪詢／失敗重試／完成鎖定、目前/歷史、真實圖示等高、長名稱、登出隔離、390px dialog與Escape。');
    console.log('Screenshots: '+temp);
  } finally {ws?.close();chrome.kill('SIGTERM');await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
