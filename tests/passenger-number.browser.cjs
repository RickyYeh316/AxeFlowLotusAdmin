// 真實Chrome執行UserManager與adminApi；Firebase Auth與HTTP資料使用隔離fixture，不連正式站。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { webpack } = require('next/dist/compiled/webpack/webpack');
const root = path.resolve(__dirname, '..');
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
const entry = write('entry.js', `import React from 'react'; import {createRoot} from 'react-dom/client'; import Manager from ${JSON.stringify(path.join(root,'src/components/UserManager.tsx'))}; import Orders from ${JSON.stringify(path.join(root,'src/components/OrderManager.tsx'))}; const view=createRoot(document.getElementById('root')); window.showView=which=>view.render(React.createElement(which==='orders'?Orders:Manager)); window.showView('users');`);
const store = write('firestore.js', `
export const collection=(_db,name)=>({name});
export const onSnapshot=(ref,callback)=>{let active=true;queueMicrotask(()=>{if(active)callback({forEach:fn=>(window.fixture[ref.name]||[]).forEach(d=>fn({id:d.id,data:()=>d.data}))})});return()=>{active=false}};
export const Timestamp={now:()=>({toDate:()=>new Date()}),fromDate:v=>v};
export const addDoc=()=>{throw Error('Unexpected write')};export const updateDoc=addDoc;export const deleteDoc=addDoc;
export const doc=(_db,...parts)=>parts.join('/');export const serverTimestamp=()=>null;
`);
const fixture = `
window.confirm=()=>false;window.fetch=()=>{throw Error('Unexpected network')};
const numbers=['000123','123456','0123456','00001234',null];
window.fixture={users:numbers.map((number,i)=>({id:'MEMBER-private-'+i,data:{name:'乘客'+i,displayName:'乘客'+i,passengerNumber:number,tripStatus:'IDLE',accountStatus:'ACTIVE',phoneNumber:'',createdAt:{toDate:()=>new Date('2026-11-13T00:00:00Z')},updatedAt:{toDate:()=>new Date('2026-11-13T00:00:00Z')}}})),drivers:[],orders:numbers.map((_,i)=>({id:'order-private-'+i,data:{userId:'MEMBER-private-'+i,passengerId:'MEMBER-private-'+i,passengerName:'乘客'+i,readableId:'8'+String(i).padStart(5,'0'),status:'COMPLETED',startAddress:'花蓮',endAddress:'吉安',createdAt:{toDate:()=>new Date('2026-11-13T00:00:00Z')},updatedAt:{toDate:()=>new Date('2026-11-13T00:00:00Z')}}}))};
`;
(async () => {
  await new Promise((resolve,reject)=>webpack({mode:'production',entry,output:{path:temp,filename:'bundle.js'},
    resolve:{extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules'),'node_modules'],alias:{'../firebase/config':config,'firebase/auth':config,'firebase/firestore':store}},
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
    assert.equal(await run(`document.querySelector('tbody').textContent.includes('乘客編號：123456')`),true);
    await fill('input.search-input','000123');await wait(`document.querySelector('tbody').textContent.includes('乘客編號：000123')`);
    await fill('input.search-input','');await wait(`document.querySelectorAll('tbody tr').length===5`);
    await run(`document.getAnimations().forEach(a=>a.finish())`);
    fs.writeFileSync(path.join(temp,'orders.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
    await run(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('手動派遣叫車')).click()`);
    await wait(`!!document.querySelector('option[value="MEMBER-private-0"]')`);
    assert.equal(await run(`document.querySelector('option[value="MEMBER-private-0"]').textContent`),'乘客0 · 000123');
    assert.equal(await run(`document.body.innerText.includes('MEMBER-private')`),false);
    assert.deepEqual(errors,[]);
    console.log('PASS: 乘客列表／訂單／叫車選單外顯號、缺號破折號、前導零及六七八碼精確搜尋；選取值保持內碼。');
    console.log('Screenshots: '+temp);
  } finally {ws?.close();chrome.kill('SIGTERM');await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
