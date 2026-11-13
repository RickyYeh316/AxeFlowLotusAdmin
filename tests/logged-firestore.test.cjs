const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
test('listener provenance separates initial snapshots, repeats and actual order transitions',()=>{
 const callbacks=[],logs=[],auth={currentUser:{uid:'admin'}};
 const fake={onSnapshot:(...args)=>{callbacks.push(args[1]);return()=>{}}};
 const module={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/loggedFirestore.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:module.exports,module,crypto:require('crypto'),require:name=>name==='firebase/firestore'?fake:name.includes('firebase/config')?{auth}:{recordSystemLog:(...a)=>logs.push(a)}});
 let deliveries=0;const api=module.exports;
 api.onSnapshot({},()=>deliveries++);api.onSnapshot({},()=>deliveries++);
 const snapshot=(status,eventId,type='modified')=>({size:1,metadata:{fromCache:false},docChanges:()=>[{type,doc:{id:'o1',ref:{path:'orders/o1',id:'o1'},data:()=>({status,readableId:'001234',eventHistory:[{eventId}]})}}]});
 callbacks[0](snapshot('MATCHING','e1','added'));callbacks[1](snapshot('MATCHING','e1','added'));
 const initial=logs.filter(e=>e[0]==='ENTITY_STATE');assert.equal(initial.length,2);assert.notEqual(initial[0][1].listenerId,initial[1][1].listenerId);
 assert.ok(initial.every(e=>e[1].initial&&e[1].eventId==='e1'));
 callbacks[0](snapshot('MATCHING','e1'));assert.equal(logs.filter(e=>e[0]==='ENTITY_STATE').length,2);
 callbacks[0](snapshot('ACCEPTED','e2'));const transition=logs.filter(e=>e[0]==='ENTITY_STATE').at(-1)[1];assert.equal(transition.initial,false);assert.equal(transition.eventId,'e2');assert.equal(deliveries,4);
 auth.currentUser={uid:'other'};callbacks[0](snapshot('ARRIVED','e3'));assert.equal(logs.filter(e=>e[0]==='ENTITY_STATE').length,3);assert.equal(deliveries,5);
});
