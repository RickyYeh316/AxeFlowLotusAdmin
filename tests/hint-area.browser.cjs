// 真實Chrome執行HintAreaManager與adminApi；Firebase Auth與HTTP資料使用隔離fixture，不連正式站。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { webpack } = require('next/dist/compiled/webpack/webpack');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync('/private/tmp/lotus-ah-hint-browser-');
const write = (name, body) => { const file = path.join(temp, name); fs.writeFileSync(file, body); return file; };
const config = write('auth.js', `
const listeners = new Set();
export const auth = { currentUser: { uid: 'test-admin', getIdToken: async () => 'fixture-token' } };
export function onAuthStateChanged(_auth, callback) { listeners.add(callback); queueMicrotask(() => callback(auth.currentUser)); return () => listeners.delete(callback); }
window.changeUser = uid => { auth.currentUser = uid ? { uid, getIdToken: async () => 'fixture-token' } : null; listeners.forEach(fn => fn(auth.currentUser)); };
`);
const loader = write('loader.cjs', `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},fileName:this.resourcePath}).outputText}`);
const entry = write('entry.js', `import React from 'react'; import {createRoot} from 'react-dom/client'; import Manager from ${JSON.stringify(path.join(root,'src/components/HintAreaManager.tsx'))}; import {CommonToastProvider,useCommonToast} from ${JSON.stringify(path.join(root,'src/components/CommonToast.tsx'))}; function Probe(){window.testToast=useCommonToast();return null;} createRoot(document.getElementById('root')).render(React.createElement(CommonToastProvider,null,React.createElement(Probe),React.createElement(Manager)));`);
const fixture = `
window.calls=[];window.failAfterWrite=false;window.hold=false;window.rejectSave=false;
window.receipts=new Map(JSON.parse(sessionStorage.getItem('receipts')||'[]'));
window.result=JSON.parse(sessionStorage.getItem('hint')||'{"hint":null,"revision":null,"enabled":false}');
window.driverResult=JSON.parse(sessionStorage.getItem('driverHint')||'{"hint":null,"revision":null,"enabled":false}');
window.fetch=async(url,options)=>{
 if(url!=='https://asia-east1-axeflowlotus-6dc3b.cloudfunctions.net/webAdmin')throw Error('Unexpected network');
 const x=JSON.parse(options.body);calls.push(x);let response;let saved=x.audience==='DRIVER'?driverResult:result;
 if(x.action==='HINT_AREA_GET') {response=saved;if(hold)await new Promise(resolve=>window.release=resolve);}
 else if(['HINT_AREA_SAVE','HINT_AREA_SET_ENABLED'].includes(x.action)) {
  if(receipts.has(x.operationId))response=receipts.get(x.operationId);
  else {
   if(rejectSave||x.expectedRevision!==saved.revision)return new Response(JSON.stringify({error:'公告已由其他操作更新，請重新整理後再編輯'}),{status:409});
   saved=x.action==='HINT_AREA_SAVE'?{hint:x.hint,enabled:saved.enabled,revision:x.operationId}:{...saved,enabled:x.enabled,revision:x.operationId};if(x.audience==='DRIVER')driverResult=saved;else result=saved;response=saved;receipts.set(x.operationId,response);
   sessionStorage.setItem(x.audience==='DRIVER'?'driverHint':'hint',JSON.stringify(saved));sessionStorage.setItem('receipts',JSON.stringify([...receipts]));
   if(failAfterWrite){failAfterWrite=false;throw Error('Lost response');}
  }
 } else throw Error('Unexpected action');
 return new Response(JSON.stringify(response),{status:200,headers:{'Content-Type':'application/json'}});
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
    const click=label=>run(`[...document.querySelectorAll('button')].find(b=>b.checkVisibility() && b.textContent===${JSON.stringify(label)}).click()`);
    const category=value=>run(`document.querySelector('[data-syslog="settlement.filter.${value}"]').click()`);
    const fill=async(selector,value)=>{await run(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(el instanceof HTMLSelectElement?HTMLSelectElement.prototype:el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`);};
    await send('Runtime.enable');await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}`});

    await wait(`document.querySelector('.hint-status')?.textContent==='尚無公告'`);
    await fill('input[type=datetime-local]','2027-01-01T00:00');
    await fill('input[type=datetime-local]:last-of-type','2027-01-01T00:00');
    // 時間欄位各自位於 label，明確選第二欄。
    await fill('.hint-times label:nth-child(2) input','2027-01-02T00:00');
    await fill('input:not([type])','2027 活動 <img src=x>');
    await fill('textarea','完整說明\n第二行');
    await click('預覽');await wait(`document.querySelector('dialog').open`);
    assert.equal(await run(`document.querySelector('dialog p').textContent`),'完整說明\n第二行');
    assert.equal(await run(`document.querySelector('dialog img')===null`),true);await click('知道了');
    await click('儲存');await wait(`document.querySelector('.common-toast span')?.textContent==='乘客端公告已儲存。'`);
    assert.equal(await run('result.hint.start'),Date.parse('2027-01-01T00:00:00+08:00'));
    assert.equal(await run('result.hint.end'),Date.parse('2027-01-02T00:00:00+08:00'));
    assert.equal(await run(`document.querySelector('.hint-status').textContent`),'已停用');
    assert.deepEqual(await run(`[...document.querySelectorAll('[data-audience=PASSENGER] .hint-actions button')].map(b=>b.textContent)`),['儲存','預覽','啟用','停用']);
    await click('啟用');await wait(`document.querySelector('.common-toast span')?.textContent==='乘客端公告已啟用。'`);
    assert.equal(await run(`document.querySelector('.hint-status').textContent`),'已啟用・尚未開始');
    await fill('input:not([type])','尚未儲存的修改');
    await click('停用');await wait(`document.querySelector('.common-toast span')?.textContent==='乘客端公告已停用。'`);
    assert.equal(await run(`document.querySelector('input:not([type])').value`),'尚未儲存的修改');
    assert.equal(await run(`result.hint.title`),'2027 活動 <img src=x>');
    assert.equal(await run(`document.querySelector('[data-syslog="hint.enable"]').disabled`),true);
    await click('儲存');await wait(`document.querySelector('.common-toast span')?.textContent==='乘客端公告已儲存。'`);
    assert.equal(await run('result.enabled'),false);
    await click('啟用');await wait(`document.querySelector('.common-toast span')?.textContent==='乘客端公告已啟用。'`);
    const title='2027 行銷活動公告 '.repeat(8);
    await fill('input:not([type])',title);await fill('textarea','完整活動說明\n'.repeat(100));
    for(const width of [1440,390]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
      assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true);
      await send('Page.captureScreenshot',{format:'png'}).then(r=>fs.writeFileSync(`/private/tmp/lotus-hint-wa-${width}.png`,Buffer.from(r.data,'base64')));
    }
    await run('failAfterWrite=true');await click('儲存');await wait(`document.querySelector('.hint-feedback')?.textContent.includes('待確認')`);
    assert.equal(await run(`document.querySelector('button[type=submit]').disabled`),true);
    const original = await run(`calls.filter(c=>c.action==='HINT_AREA_SAVE').at(-1).operationId`);
    await send('Page.reload');await wait(`document.querySelector('.hint-feedback')?.textContent.includes('待確認')`);
    await click('重試原操作');await wait(`document.querySelector('.common-toast span')?.textContent==='乘客端公告已儲存。'`);
    assert.equal(await run(`calls.find(c=>c.action==='HINT_AREA_SAVE').operationId`),original);
    await run('rejectSave=true');await fill('input:not([type])','競爭更新');await click('儲存');
    await wait(`document.querySelector('.hint-feedback')?.textContent.includes('其他操作更新')`);
    assert.equal(await run(`document.querySelector('button[type=submit]').disabled`),true);
    await run('rejectSave=false');await click('重新整理');await wait(`!document.querySelector('button[type=submit]').disabled`);
    assert.equal(await run('result.enabled'),true);
    const kept = await run('result.hint');
    await run('failAfterWrite=true');await click('停用');await wait(`document.querySelector('.hint-feedback')?.textContent.includes('待確認')`);
    const toggleId=await run(`calls.filter(c=>c.action==='HINT_AREA_SET_ENABLED').at(-1).operationId`);
    await send('Page.reload');await wait(`document.querySelector('.hint-feedback')?.textContent.includes('待確認')`);
    await click('重試原操作');await wait(`document.querySelector('.hint-status').textContent==='已停用'`);
    assert.equal(await run(`calls.find(c=>c.action==='HINT_AREA_SET_ENABLED').operationId`),toggleId);
    assert.deepEqual(await run('result.hint'),kept);
    assert.equal(await run(`document.querySelector('input:not([type])').value`),kept.title);
    await click('啟用');await wait(`document.querySelector('.common-toast span')?.textContent==='乘客端公告已啟用。'`);
    for(const [delta,label] of [[-1000,'顯示中'],[1000,'已啟用・尚未開始']]) {
      await run(`result.hint.start=Date.now()+${delta};result.hint.end=Date.now()+60000`);
      await click('重新整理');await wait(`document.querySelector('.hint-status').textContent==='${label}'`);
    }
    await run('result.hint.end=Date.now()-1000;result.hint.start=Date.now()-60000');
    await click('重新整理');await wait(`document.querySelector('.hint-status').textContent==='已結束'`);
    await click('停用');await wait(`document.querySelector('.hint-status').textContent==='已停用'`);
    await run('hold=true');await click('重新整理');await wait('!!window.release');await run("changeUser(null);release()");
    assert.equal(await run(`document.querySelector('button[type=submit]').disabled`),true);
    assert.equal(await run(`document.querySelector('input:not([type])').value`),'');
    await run("hold=false;changeUser('test-admin')");await wait(`!document.querySelector('button[type=submit]').disabled`);
    const passengerBefore=await run('JSON.stringify(result)');
    await click('司機端公告');
    await fill('[data-audience=DRIVER] input[type=datetime-local]','2027-01-01T00:00');
    await fill('[data-audience=DRIVER] .hint-times label:nth-child(2) input','2027-01-02T00:00');
    await fill('[data-audience=DRIVER] input:not([type])','司機限定');await fill('[data-audience=DRIVER] textarea','司機內容');
    await click('儲存');await wait(`document.querySelector('.common-toast span')?.textContent==='司機端公告已儲存。'`);
    await click('啟用');await wait(`document.querySelector('.common-toast span')?.textContent==='司機端公告已啟用。'`);
    assert.equal(await run('JSON.stringify(result)'),passengerBefore);
    assert.equal(await run('driverResult.enabled'),true);
    await fill('[data-audience=DRIVER] input:not([type])','尚未儲存的司機草稿');
    await click('乘客端公告');await click('司機端公告');
    assert.equal(await run(`document.querySelector('[data-audience=DRIVER] input:not([type])').value`),'尚未儲存的司機草稿');
    assert.equal(await run(`new Set([...document.querySelectorAll('[id]')].map(x=>x.id)).size===document.querySelectorAll('[id]').length`),true);
    // Toast 不移動焦點；相同訊息會重啟三秒倒數，最新訊息取代舊訊息。
    await run(`document.querySelector('[data-audience=DRIVER] input:not([type])').focus();window.focusBefore=document.activeElement;testToast('重複提示')`);
    await wait(`document.querySelector('.common-toast span')?.textContent==='重複提示'`);
    await new Promise(r=>setTimeout(r,1700));await run(`testToast('重複提示')`);
    await new Promise(r=>setTimeout(r,1700));assert.equal(await run(`!!document.querySelector('.common-toast')`),true);
    assert.equal(await run('document.activeElement===focusBefore'),true);
    await wait(`!document.querySelector('.common-toast')`);
    await run(`testToast('舊提示');testToast('最新提示')`);await wait(`document.querySelector('.common-toast span')?.textContent==='最新提示'`);
    assert.equal(await run(`document.querySelectorAll('.common-toast').length`),1);
    await run(`changeUser(null)`);await wait(`!document.querySelector('.common-toast')`);
    assert.deepEqual(errors,[]);console.log('PASS wA hintArea: Taiwan time, save/read, safe preview, responsive, lost response/reload replay, stale edit, enable/disable, unsaved edits, toggle replay, display states, logout late response');
  } finally { ws?.close(); chrome.kill(); await new Promise(r=>server.close(r)); }
})().catch(error=>{console.error(error);process.exitCode=1});
