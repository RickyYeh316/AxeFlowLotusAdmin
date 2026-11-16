// 真實Chrome執行公告與維護區及adminApi；Firebase Auth與HTTP資料使用隔離fixture，不連正式站。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { webpack } = require('next/dist/compiled/webpack/webpack');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync('/private/tmp/lotus-ah-maintenance-browser-');
const write = (name, body) => { const file = path.join(temp, name); fs.writeFileSync(file, body); return file; };
const config = write('auth.js', `
const listeners = new Set();
export const auth = { currentUser: { uid: 'test-admin', getIdToken: async () => 'fixture-token' } };
export function onAuthStateChanged(_auth, callback) { listeners.add(callback); queueMicrotask(() => callback(auth.currentUser)); return () => listeners.delete(callback); }
window.changeUser = uid => { auth.currentUser = uid ? { uid, getIdToken: async () => 'fixture-token' } : null; listeners.forEach(fn => fn(auth.currentUser)); };
`);
const loader = write('loader.cjs', `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},fileName:this.resourcePath}).outputText}`);
const entry = write('entry.js', `import React from 'react'; import {createRoot} from 'react-dom/client'; import Manager from ${JSON.stringify(path.join(root,'src/components/HintAreaManager.tsx'))}; import Maintenance from ${JSON.stringify(path.join(root,'src/components/MaintenanceManager.tsx'))}; createRoot(document.getElementById('root')).render(React.createElement(React.Fragment,null,React.createElement(Manager),React.createElement(Maintenance)));`);
const fixture = `
window.calls=[];window.hold=false;window.fail=false;window.empty=false;window.logs=[];
window.fetch=async(url,options)=>{
 if(url!=='https://asia-east1-axeflowlotus-6dc3b.cloudfunctions.net/webAdmin')throw Error('Unexpected network');
 const x=JSON.parse(options.body);calls.push(x);
 if(x.action==='HINT_AREA_GET')return new Response(JSON.stringify({hint:{start:1,end:2,title:'獨立公告',detail:'公告內容'},enabled:false,revision:'test'}));
 if(x.action!=='MAINTENANCE_PREVIEW')throw Error('Unexpected mutation');
 if(hold)await new Promise(resolve=>window.release=resolve);
 if(fail)return new Response(JSON.stringify({error:'預計維護開始時間已到，請調整後重新預覽'}),{status:400});
 const nowMs=Date.parse('2026-11-16T01:30:00+08:00');
 const items=empty?[]:Array.from({length:13},(_,i)=>({id:'order-'+i,readableId:'00000'+i,status:x.phase==='PRE'?'SCHEDULED':'IN_PROGRESS',reservationState:'CONFIRMED',isScheduled:true,passengerName:'測試乘客 <img src=x>',passengerNumber:'001234',driverName:'預約司機',carPlate:'ABC-1234',startAddress:'花蓮縣花蓮市國興一街85號'.repeat(3),endAddress:'',updatedAtMs:nowMs,scheduledTimeMs:nowMs+1800000,t30Ms:nowMs,reason:x.phase==='PRE'?'已進入預約 T30、尚未開始行程，預計系統取消':'剩餘實際行程，正式維護時系統取消'}));
 return new Response(JSON.stringify({...x,nowMs,untilMs:x.phase==='PRE'?x.plannedStartMs:x.plannedEndMs,total:items.length,servingCount:x.phase==='PRE'?0:items.length,items}));
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
    const category=value=>run(`document.querySelector('[data-syslog="settlement.filter.${value}"]').click()`);
    const fill=async(selector,value)=>{await run(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(el instanceof HTMLSelectElement?HTMLSelectElement.prototype:el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`);};
    await send('Runtime.enable');await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}`});

    await wait(`document.querySelector('.hint-status')?.textContent==='已停用'`);
    assert.deepEqual(await run(`[...document.querySelectorAll('.maintenance-actions button')].map(b=>b.disabled)`),[false,true,false,true,true]);
    await click('收合');assert.equal(await run(`document.querySelector('#hint-editor').hidden`),true);
    assert.equal(await run(`document.querySelector('.hint-manager').textContent.includes('獨立公告')`),true);
    await click('展開');assert.equal(await run(`document.querySelector('#hint-editor').hidden`),false);
    await click('維護半開始（預覽）');assert.equal(await run(`calls.filter(x=>x.action==='MAINTENANCE_PREVIEW').length`),0);
    await fill('.maintenance-times label:nth-child(1) input','2027-01-01T02:00');
    await fill('.maintenance-times label:nth-child(2) input','2027-01-01T04:00');
    await click('維護半開始（預覽）');await wait(`document.querySelector('.maintenance-result h3')?.textContent.includes('13 筆')`);
    assert.equal(await run(`calls.at(-1).plannedStartMs`),Date.parse('2027-01-01T02:00:00+08:00'));
    assert.equal(await run(`calls.at(-1).nowMs`),undefined);
    assert.equal(await run(`document.querySelectorAll('.maintenance-table tbody tr').length`),10);
    assert.equal(await run(`document.querySelectorAll('.maintenance-result img').length`),0);
    assert.equal(await run(`document.querySelector('.maintenance-result').textContent.includes('2026/11/16 01:30:00')`),true);
    await click('下一頁');assert.equal(await run(`document.querySelectorAll('.maintenance-table tbody tr').length`),3);
    await fill('.maintenance-times label:nth-child(1) input','2027-01-01T03:00');
    await wait(`document.querySelector('.maintenance-stale')?.textContent.includes('請重新預覽')`);
    await click('維護開始（預覽）');await wait(`document.querySelector('.maintenance-result h3')?.textContent.startsWith('維護開始')`);
    assert.equal(await run(`document.querySelectorAll('.maintenance-table tbody tr').length`),10);
    assert.equal(await run(`!!document.querySelector('.maintenance-stale')`),false);
    await click('收合');
    for(const width of [1440,390]){
      await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
      assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true);
      await send('Page.captureScreenshot',{format:'png'}).then(r=>fs.writeFileSync(`/private/tmp/lotus-maintenance-wa-${width}.png`,Buffer.from(r.data,'base64')));
    }
    await run('hold=true');await click('維護半開始（預覽）');await wait('!!window.release');
    assert.equal(await run(`document.querySelectorAll('.maintenance-result').length`),0);
    await fill('.maintenance-times label:nth-child(2) input','2027-01-01T05:00');await run('release();hold=false');
    await wait(`!!document.querySelector('.maintenance-result')`);assert.equal(await run(`!!document.querySelector('.maintenance-stale')`),true);
    await run('fail=true');await click('維護半開始（預覽）');await wait(`document.querySelector('.maintenance-manager .hint-feedback')?.textContent.includes('預覽未完成')`);
    assert.equal(await run(`document.querySelectorAll('.maintenance-result').length`),0);
    await run('fail=false;empty=true');await click('維護開始（預覽）');await wait(`!!document.querySelector('.maintenance-empty')`);
    assert.equal(await run(`document.querySelectorAll('.list-pagination').length`),0);
    await run('empty=false;hold=true;window.release=null');await click('維護開始（預覽）');await wait('!!window.release');
    await run('changeUser(null);release()');await wait(`document.querySelector('.maintenance-actions button').disabled`);
    assert.equal(await run(`document.querySelectorAll('.maintenance-result').length`),0);
    assert.equal(await run(`document.querySelector('.maintenance-times input').value`),'');
    assert.equal(await run(`calls.every(x=>['HINT_AREA_GET','MAINTENANCE_PREVIEW'].includes(x.action))`),true);
    assert.deepEqual(errors,[]);console.log('PASS maintenance UI: collapse, independent pickers, server clock, two previews, disabled actions, paging, stale edits, failure/empty, logout, safe text, responsive');
  } finally { ws?.close(); chrome.kill(); await new Promise(r=>server.close(r)); }
})().catch(error=>{console.error(error);process.exitCode=1});
