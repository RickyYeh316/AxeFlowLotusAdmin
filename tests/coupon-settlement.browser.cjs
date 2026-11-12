// 真實Chrome執行CouponSettlementManager與adminApi；Firebase Auth與HTTP資料使用隔離fixture，不連正式站。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { webpack } = require('next/dist/compiled/webpack/webpack');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync('/private/tmp/lotus-ah-checkout-browser-');
const write = (name, body) => { const file = path.join(temp, name); fs.writeFileSync(file, body); return file; };
const config = write('auth.js', `
const listeners = new Set();
export const auth = { currentUser: { uid: 'test-admin', getIdToken: async () => 'fixture-token' } };
export function onAuthStateChanged(_auth, callback) { listeners.add(callback); queueMicrotask(() => callback(auth.currentUser)); return () => listeners.delete(callback); }
window.changeUser = uid => { auth.currentUser = uid ? { uid, getIdToken: async () => 'fixture-token' } : null; listeners.forEach(fn => fn(auth.currentUser)); };
`);
const loader = write('loader.cjs', `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},fileName:this.resourcePath}).outputText}`);
const entry = write('entry.js', `import React from 'react'; import {createRoot} from 'react-dom/client'; import Manager from ${JSON.stringify(path.join(root,'src/components/CouponSettlementManager.tsx'))}; createRoot(document.getElementById('root')).render(React.createElement(Manager));`);
const fixture = `
window.calls=[];window.failAfterWrite=false;window.hold=false;window.previewDelta=0;window.rejectCheckout=false;
window.receipts=new Map(JSON.parse(sessionStorage.getItem('receipts')||'[]'));
window.drivers=[{id:'one',name:'同名司機',carPlate:'TEA-5596'},{id:'two',name:'同名司機',carPlate:'XYZ-123'}];
const saved=sessionStorage.getItem('rows');
window.rows=saved?JSON.parse(saved):Array.from({length:13},(_,i)=>({id:'row'+i,orderId:'order'+i,readableId:String(478072+i),name:'2027來花蓮跨年V1',amount:50,redeemedAt:1794473647000+i,driverId:i===12?'two':'one',driverName:'同名司機',carPlate:i===12?'XYZ-123':'TEA-5596',passengerId:'p'+i,passengerNumber:String(i+123).padStart(6,'0'),passengerName:i%2?'Jessica':'Bruce',settledAt:null,batchId:'1'}));
window.fetch=async(url,options)=>{
 if(url!=='https://asia-east1-axeflowlotus-6dc3b.cloudfunctions.net/webAdmin')throw Error('Unexpected network');
 const x=JSON.parse(options.body);calls.push(x);let result;
 if(x.action==='COUPON_LEDGER') {
   const index=x.after?1:0,driver=drivers[index];result={items:rows.filter(r=>r.driverId===driver.id),driver,after:index===0?{driverId:'two'}:null};
   if(hold)await new Promise(resolve=>window.release=resolve);
 } else if(x.action==='COUPON_CHECKOUT_PREVIEW') {
   const driver=drivers.find(d=>d.id===x.driverId),items=rows.filter(r=>r.driverId===x.driverId&&r.settledAt===null);
   result={driverId:driver.id,driverName:driver.name,carPlate:driver.carPlate,review:{batchId:'1',totalAmount:items.length*50+previewDelta,count:items.length,version:{seconds:1,nanoseconds:0}}};
 } else if(x.action==='COUPON_CHECKOUT') {
   if(rejectCheckout)return new Response(JSON.stringify({error:'待結帳資料已更新，請重新整理後核對金額。'}),{status:409});
   if(receipts.has(x.operationId))result=receipts.get(x.operationId);
   else {const items=rows.filter(r=>r.driverId===x.driverId&&r.settledAt===null);result={totalAmount:items.length*50,count:items.length,settledAtMillis:1794477000000};items.forEach(r=>r.settledAt=result.settledAtMillis);receipts.set(x.operationId,result);
     sessionStorage.setItem('receipts',JSON.stringify([...receipts]));sessionStorage.setItem('rows',JSON.stringify(rows));
     if(failAfterWrite){failAfterWrite=false;throw Error('lost response');}
   }
 } else throw Error('Unexpected action');
 return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
};
`;
(async () => {
  await new Promise((resolve,reject)=>webpack({mode:'production',entry,output:{path:temp,filename:'bundle.js'},
    resolve:{extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules'),'node_modules'],alias:{'../firebase/config':config,'firebase/auth':config}},
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

    await wait(`document.querySelectorAll('tbody tr').length===10`);
    const enabled = () => run(`[...document.querySelectorAll('button')].find(b=>b.textContent==='結帳').disabled===false`);
    assert.equal(await enabled(),false);
    assert.equal(await run(`document.querySelectorAll('th').length`),7);
    assert.equal(await run(`document.querySelector('.checkout-summary').textContent.includes('650 元')`),true);
    assert.equal(await run(`document.querySelector('[aria-pressed=true]').textContent`),'未結帳');
    await click('下一頁');assert.equal(await run(`document.querySelectorAll('tbody tr').length`),3);
    await fill('[aria-label="搜尋欄位"]','passenger');await fill('[aria-label="搜尋內容"]','jess');
    await wait(`document.querySelectorAll('tbody tr').length===6`);assert.equal(await enabled(),false);
    assert.equal(await run(`document.querySelector('.checkout-summary').textContent.includes('查詢合計：300')`),true);
    await fill('[aria-label="搜尋內容"]','000123');await wait(`document.querySelectorAll('tbody tr').length===1`);
    assert.equal(await run(`document.querySelector('tbody').textContent.includes('乘客編號：000123')`),true);assert.equal(await enabled(),false);
    await fill('[aria-label="搜尋欄位"]','order');await fill('[aria-label="搜尋內容"]','#478072');
    await wait(`document.querySelectorAll('tbody tr').length===1`);assert.equal(await enabled(),false);
    await fill('[aria-label="搜尋欄位"]','driver');await fill('[aria-label="搜尋內容"]','同名');
    await wait(`document.querySelectorAll('.checkout-candidates button').length===2`);assert.equal(await enabled(),false);
    await click('同名司機 · TEA-5596');await wait(`document.querySelector('.checkout-selected')!==null`);assert.equal(await enabled(),true);
    await click('全部');assert.equal(await enabled(),false);await click('已結帳');assert.equal(await enabled(),false);
    await click('未結帳');assert.equal(await enabled(),true);
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    fs.writeFileSync(path.join(temp,'desktop.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
    await run('previewDelta=50');await click('結帳');await wait(`document.body.textContent.includes('待結帳資料已更新')`);
    assert.equal(await run(`!!document.querySelector('[role=dialog]')`),false);
    await run('previewDelta=0');await click('結帳');await wait(`!!document.querySelector('[role=dialog]')`);
    assert.equal(await run(`document.querySelector('[role=dialog]').textContent.includes('600 元')`),true);
    assert.equal(await run(`document.querySelector('[role=dialog]').textContent.includes('共 12 張')`),true);
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await wait(`(()=>{const r=document.querySelector('[role=dialog]').getBoundingClientRect();return r.left>=0&&r.right<=390&&r.height<=844})()`);
    fs.writeFileSync(path.join(temp,'mobile-confirm.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
    await run('failAfterWrite=true');await click('已付現，確認結帳');await wait(`document.body.textContent.includes('重試原操作（不重複結帳）')`);
    assert.equal(await run(`document.querySelector('button[aria-label=關閉]').disabled`),true);
    const operationId=await run(`calls.find(c=>c.action==='COUPON_CHECKOUT').operationId`);
    await send('Page.reload');await wait(`document.body.textContent.includes('重試原操作（不重複結帳）')`);
    assert.equal(await run(`calls.some(c=>c.action==='COUPON_CHECKOUT')`),false);
    await click('重試原操作（不重複結帳）');await wait(`!document.querySelector('[role=dialog]')&&document.body.textContent.includes('已結帳 600 元')`);
    assert.equal(await run(`calls.find(c=>c.action==='COUPON_CHECKOUT').operationId`),operationId);
    assert.equal(await run(`rows.filter(r=>r.settledAt===null).length`),1);
    await click('已結帳');await wait(`document.querySelectorAll('tbody tr').length===10`);
    assert.equal(await run(`document.querySelector('tbody').textContent.includes('2026/11/12 17:50:00')`),true);
    assert.equal(await enabled(),false);
    await click('未結帳');await fill('[aria-label="搜尋內容"]','XYZ');await click('同名司機 · XYZ-123');
    await click('結帳');await wait(`!!document.querySelector('[role=dialog]')`);
    await run('rejectCheckout=true');await click('已付現，確認結帳');await wait(`!document.querySelector('[role=dialog]')&&!!document.querySelector('[role=alert]')`);
    assert.equal(await enabled(),false);assert.equal(await run(`sessionStorage.getItem('lotus-coupon-checkout:test-admin')`),null);
    await run('rejectCheckout=false');await click('重新整理');await wait(`!document.querySelector('[role=alert]')`);
    await run(`hold=true;[...document.querySelectorAll('button')].find(b=>b.textContent==='重新整理').click()`);await wait('!!window.release');
    await run(`changeUser(null);hold=false;release()`);await wait(`document.body.textContent.includes('請先使用管理員')`);
    assert.equal(await run(`document.querySelector('tbody')===null`),true);assert.equal(await enabled(),false);
    assert.equal(await run(`document.body.textContent.includes('結清')`),false);
    assert.deepEqual(errors,[]);
    console.log('PASS: 七欄／預設未結帳／完整合計／分頁／乘客與訂單搜尋唯讀／同名司機明確選定／分類資格／預覽金額變動／回應遺失重載後原操作回放／409拒絕／台灣時間／登出晚回覆隔離／390px確認視窗。');
    console.log('Screenshots: '+temp);
  } finally {ws?.close();chrome.kill('SIGTERM');await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
