// 真實Chrome執行QueueAreaManager與adminApi；Firebase Auth與HTTP資料使用隔離fixture，不連正式站。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { webpack } = require('next/dist/compiled/webpack/webpack');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync('/private/tmp/lotus-ah-queue-browser-');
const write = (name, body) => { const file = path.join(temp, name); fs.writeFileSync(file, body); return file; };
const config = write('auth.js', `
const listeners = new Set();
export const auth = { currentUser: { uid: 'test-admin', getIdToken: async () => 'fixture-token' } };
export function onAuthStateChanged(_auth, callback) { listeners.add(callback); queueMicrotask(() => callback(auth.currentUser)); return () => listeners.delete(callback); }
window.changeUser = uid => { auth.currentUser = uid ? { uid, getIdToken: async () => 'fixture-token' } : null; listeners.forEach(fn => fn(auth.currentUser)); };
`);
const loader = write('loader.cjs', `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},fileName:this.resourcePath}).outputText}`);
const entry = write('entry.js', `import React from 'react'; import {createRoot} from 'react-dom/client'; import Manager from ${JSON.stringify(path.join(root,'src/components/QueueAreaManager.tsx'))}; import {CommonToastProvider,useCommonToast} from ${JSON.stringify(path.join(root,'src/components/CommonToast.tsx'))}; function Probe(){window.testToast=useCommonToast();return null;} createRoot(document.getElementById('root')).render(React.createElement(CommonToastProvider,null,React.createElement(Probe),React.createElement(Manager)));`);
const fixture = `
window.calls=[];window.failAfterWrite=false;window.rejectSave=false;window.polygons=[];window.cameras=[];
const region=[{lat:23.99,lng:121.60},{lat:24,lng:121.60},{lat:24,lng:121.61},{lat:23.99,lng:121.61}];
window.result=JSON.parse(sessionStorage.getItem('queue-result')||'null')||{areas:[{areaId:'A4',name:'排班熱區A4',sort:40,enabled:true,revision:'r4',polygon:region,pickupPolygon:region.map(p=>({lat:p.lat+.001,lng:p.lng+.001})),members:[{driverId:'driver',entryId:'entry',tripStatus:'IN_QUEUE',orderId:null,rank:1,name:'測試司機',carPlate:'ABC-1234',rb:2,joinedAt:1794870000000}],holds:[{driverId:'hold',entryId:'held',tripStatus:'EN_ROUTE',orderId:'service',rank:null,name:'承接司機',carPlate:'XYZ-4567',rb:1,joinedAt:null}]},{areaId:'A5',name:'排班熱區A5',sort:50,enabled:false,revision:'r5',polygon:region,pickupPolygon:region,members:[],holds:[]}]};
window.receipts=new Map(JSON.parse(sessionStorage.getItem('queue-receipts')||'[]'));
class MapFixture {constructor(el,o){this.el=el;el.style.background='#eee';el.dataset.theme=JSON.stringify(o.styles);}moveCamera(c){cameras.push(c)}}
class PolygonFixture {constructor(o){polygons.push(o);const el=document.createElement('div');el.style.cssText='position:absolute;inset:'+(o.zIndex===1?'25%':'40%')+';border:2px solid '+o.strokeColor+';background:'+o.fillColor+'33';o.map.el.append(el);this.el=el;}setMap(){this.el.remove()}}
window.google={maps:{importLibrary:async()=>({Map:MapFixture,Polygon:PolygonFixture,Polyline:class{},Marker:class{constructor(){throw Error('Queue must not draw driver marker')}},Point:class{},Size:class{}}),event:{clearInstanceListeners(){}}}};
window.fetch=async(url,options)=>{
 if(url!=='https://asia-east1-axeflowlotus-6dc3b.cloudfunctions.net/webAdmin')throw Error('Unexpected network');
 const x=JSON.parse(options.body);calls.push(x);let response;
 if(x.action==='QUEUE_MANAGEMENT_GET')response=result;
 else if(receipts.has(x.operationId))response=receipts.get(x.operationId);
 else {
  if(rejectSave){rejectSave=false;return new Response(JSON.stringify({error:'狀態已變更，請重新確認'}),{status:409})}
  const area=result.areas.find(a=>a.areaId===x.areaId);
  if(x.action==='QUEUE_AREA_NAME')area.name=x.name;
  else if(x.action==='QUEUE_AREA_ENABLED')area.enabled=x.enabled;
  else if(x.action==='QUEUE_AREA_SORT')result.areas=x.areas.map(a=>result.areas.find(b=>b.areaId===a.areaId));
  else if(x.action==='QUEUE_REMOVE'){area.members=area.members.filter(m=>m.driverId!==x.driverId);area.holds=area.holds.filter(m=>m.driverId!==x.driverId);}
  else throw Error('Unexpected action');
  response={saved:true};receipts.set(x.operationId,response);sessionStorage.setItem('queue-result',JSON.stringify(result));sessionStorage.setItem('queue-receipts',JSON.stringify([...receipts]));
  if(failAfterWrite){failAfterWrite=false;throw Error('Lost response')}
 }
 return new Response(JSON.stringify(response),{status:200});
};
`;
(async () => {
  await new Promise((resolve,reject)=>webpack({mode:'production',entry,plugins:[new webpack.DefinePlugin({'process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY':JSON.stringify('fixture-key')})],output:{path:temp,filename:'bundle.js'},
    resolve:{extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules'),'node_modules'],alias:{'../firebase/config':config,'../../firebase/config':config,'firebase/auth':config}},
    module:{rules:[{test:/\.tsx?$/,use:loader}]},optimization:{minimize:false}},(err,stats)=>err?reject(err):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
  const cssFiles = fs.readdirSync(path.join(root,'.next/static/chunks')).filter(f=>f.endsWith('.css'));
  const server = http.createServer((req,res)=>{
    if(req.url.startsWith('/passenger-order/shared/')){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(root,'public',req.url.split('?')[0])));}
    else if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(temp,'bundle.js')));}
    else if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');res.end(cssFiles.map(f=>fs.readFileSync(path.join(root,'.next/static/chunks',f),'utf8')).join('\n'));}
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
    const wait=async expression=>{for(let i=0;i<250;i++){if(await run(`!!(${expression})`))return;await new Promise(r=>setTimeout(r,30));}console.log(await run(`({text:document.body.innerText,polygons:polygons.length,cameras:cameras.length,rects:[...document.querySelectorAll('.order-map-canvas')].map(x=>[x.clientWidth,x.clientHeight]),errors:typeof google})`));assert.fail(expression);};
    const click=label=>run(`[...document.querySelectorAll('button')].find(b=>b.checkVisibility() && b.textContent===${JSON.stringify(label)}).click()`);
    const centered=async selector=>{
      const rect=await run(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,vw:innerWidth,vh:innerHeight};})()`);
      assert.ok(Math.abs(rect.x+rect.w/2-rect.vw/2)<2,JSON.stringify(rect));
      assert.ok(Math.abs(rect.y+rect.h/2-rect.vh/2)<2,JSON.stringify(rect));
      assert.ok(rect.x>=0 && rect.y>=0 && rect.x+rect.w<=rect.vw+1 && rect.y+rect.h<=rect.vh+1,JSON.stringify(rect));
    };
    const fill=async(selector,value)=>{await run(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(el instanceof HTMLSelectElement?HTMLSelectElement.prototype:el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`);};
    await send('Runtime.enable');await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}`});

    await wait(`document.querySelectorAll('.queue-area').length===2`);
    await wait(`polygons.length>=4 && cameras.length>=2`);
    assert.equal(await run(`document.querySelectorAll('.queue-area')[0].textContent.includes('保號 2 次')`),true);
    assert.equal(await run(`document.querySelector('.queue-holds').textContent.includes('領號時間：—')`),true);
    for(const width of [1440,390]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:1100,deviceScaleFactor:1,mobile:false});
      await new Promise(r=>setTimeout(r,150));
      assert.equal(await run(`document.documentElement.scrollWidth<=innerWidth`),true);
      const layout=await run(`(()=>{const area=document.querySelector('.queue-area');const rect=s=>{const r=area.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom}};return {map:rect('.queue-map'),holds:rect('.queue-holds'),waiting:rect('.queue-waiting'),caption:area.querySelector('.queue-hold-description').textContent};})()`);
      assert.ok(layout.holds.bottom<=layout.waiting.y,JSON.stringify(layout));
      if(width===1440)assert.ok(layout.map.right<=layout.holds.x,JSON.stringify(layout));
      else assert.ok(layout.map.bottom<=layout.holds.y,JSON.stringify(layout));
      assert.equal(layout.caption,'已承接訂單，乘客上車前保留回排資格。');
      const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(temp,'queue-'+width+'.png'),Buffer.from(shot.data,'base64'));
    }
    for(const width of [1440,390]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:1100,deviceScaleFactor:1,mobile:false});
      await run(`document.querySelector('.order-map-preview').click()`);await wait(`document.querySelector('.queue-map-dialog[open] h2')?.textContent==='排班熱區A4'`);
      await centered('.queue-map-dialog[open]');
      assert.equal(await run(`document.querySelector('.queue-map-dialog[open] .order-map-status').textContent`),'藍色：司機排班區　橘色：乘客上車區');
      const mapShot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(temp,'queue-map-'+width+'.png'),Buffer.from(mapShot.data,'base64'));
      await click('全貌');await click('返回');
      await run(`document.querySelector('[aria-label="編輯 排班熱區A4 名稱"]').click()`);await wait(`document.querySelector('.queue-confirm[open]')`);
      await centered('.queue-confirm[open]');await click('取消');
    }
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
    await run(`document.querySelector('[aria-label="編輯 排班熱區A4 名稱"]').click()`);await wait(`document.querySelector('.queue-confirm[open]')`);
    await fill('.queue-confirm input','改名 A4');await click('儲存');await wait(`document.querySelector('.queue-area h3')?.textContent==='改名 A4'`);
    await click('停用');await wait(`document.querySelector('.queue-confirm[open]')`);
    await centered('.queue-confirm[open]');
    const confirmShot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(temp,'queue-confirm-1440.png'),Buffer.from(confirmShot.data,'base64'));
    assert.equal(await run(`document.querySelector('.queue-confirm p').innerText`),'此區將停止領號與排班順序派單。\n已有排班與保號資格保留。');
    await run(`document.querySelector('.queue-confirm .btn-primary').click()`);await wait(`!document.querySelector('.queue-confirm')`);await wait(`!document.querySelector('.queue-toolbar button').disabled`);
    await click('調整排序');await run(`document.querySelector('[aria-label="下移 改名 A4"]').click()`);
    assert.equal(await run(`document.querySelector('.queue-area h3').textContent`),'排班熱區A5');
    await click('儲存排序');await wait(`!document.body.textContent.includes('儲存排序')`);
    await run(`window.failAfterWrite=true;document.querySelector('.queue-waiting .queue-remove').click()`);await wait(`document.querySelector('.queue-confirm[open]')`);
    await centered('.queue-confirm[open]');
    assert.equal(await run(`document.querySelector('.queue-confirm').textContent.includes('司機維持上線')`),true);
    await run(`document.querySelector('.queue-confirm .btn-primary').click()`);await wait(`document.body.textContent.includes('重試原操作')`);
    const op=await run(`calls.filter(c=>c.action==='QUEUE_REMOVE').at(-1).operationId`);
    await send('Page.reload');await wait(`document.body.textContent.includes('重試原操作')`);await click('重試原操作');await wait(`document.querySelectorAll('.queue-area').length===2`);
    assert.equal(await run(`calls.find(c=>c.action==='QUEUE_REMOVE').operationId`),op);
    assert.equal(await run(`document.querySelectorAll('.queue-member').length`),1);
    await click('移除排班');await wait(`document.querySelector('.queue-confirm[open]')`);
    assert.equal(await run(`document.querySelector('.queue-confirm').textContent.includes('目前接送繼續')`),true);
    await run(`window.rejectSave=true;document.querySelector('.queue-confirm .btn-primary').click()`);await wait(`document.body.textContent.includes('狀態已變更')`);
    assert.equal(await run(`document.body.textContent.includes('重試原操作')`),false);
    await run(`changeUser(null)`);await wait(`document.querySelectorAll('.queue-area').length===0`);
    assert.deepEqual(errors,[]);console.log('PASS queue UI: maps/padding/theme/no markers, desktop/mobile, rename, enable, batch sort, confirmation, lost response/reload replay, stale operation, logout');console.log(temp);
  } finally { ws?.close(); chrome.kill(); await new Promise(r=>server.close(r)); }
})().catch(error=>{console.error(error);process.exitCode=1});
