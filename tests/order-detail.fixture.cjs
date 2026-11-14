// v3 真實 iframe/shared UI 測試；僅替換 admin HTTP 與 Maps。
exports.api = `
window.adminReads=[];window.detailStatus='COMPLETED';window.detailDenied=false;window.holdDetail=false;
const originalFixtureFetch=window.fetch;
window.fetch=async(url,init)=>{
 if(!String(url).endsWith('/webAdmin'))return originalFixtureFetch(url,init);
 const p=JSON.parse(init.body);adminReads.push(p);
 if(window.listFailure===p.orderId)return {ok:false,status:503,json:async()=>({error:'快照讀取失敗'})};
 if(detailDenied)return {ok:false,status:403,json:async()=>({error:'此帳號沒有管理權限。'})};
 let body;
 if(p.action==='ORDER_DETAIL'){
   if(holdDetail)await new Promise(r=>window.releaseDetail=r);
   body={history:{incomplete:false,events:[{label:'乘客下單',occurredAt:{seconds:1794628000}},{label:'派送司機',carPlate:'AAA-1111',occurredAt:{seconds:1794628001}},{label:'司機拒絕',carPlate:'AAA-1111',occurredAt:{seconds:1794628005}},{label:'派送司機',carPlate:'BBB-2222',occurredAt:{seconds:1794628006}},{label:'行程完成',occurredAt:{seconds:1794628579}}]},card:{orderId:p.orderId,readableId:'123456',orderStatus:detailStatus,active:!['COMPLETED','CANCELLED_BY_USER'].includes(detailStatus),updatedAt:{seconds:1794628579},driver:{name:'快照司機',carPlate:'TEA-5596'},display:{passengerName:'測試乘客',startAddress:'花蓮市進豐街115號',endAddress:'新城鄉北埔路415-1號',pickupLocation:{lat:24,lng:121},destination:{lat:24.01,lng:121.01},couponSnapshot:{name:'新戶券',amount:100},isElderlyCare:true,note:'備註\\n第二行'}}};
   if(window.timelineFixture)body.history=window.timelineFixture;
   if(p.orderId.startsWith('order-private-')) {
     const raw=window.fixture.orders.find(o=>o.id===p.orderId)?.data;
     body.card.driver=p.orderId==='order-private-1'?{name:'歷史快照司機',carPlate:'HIS-0001'}:{name:raw?.driverName||'',carPlate:raw?.carPlate||''};
   }
 }else if(p.action==='ORDER_MAP')body={status:detailStatus,live:false,pickup:{lat:24,lng:121},destination:{lat:24.01,lng:121.01},cursor:null,more:false,batches:[{id:'a',points:[{lat:24,lng:121,time:1,segment:'a'},{lat:24.005,lng:121.005,time:2,segment:'a'}]},{id:'b',points:[{lat:24.006,lng:121.006,time:3,segment:'b'},{lat:24.01,lng:121.01,time:4,segment:'b'}]}]};
 else if(p.action==='ORDER_CHAT')body={segmentIds:['first','second']};
 else if(p.action==='ORDER_CHAT_SEGMENT')body={open:p.segmentId==='second',driverName:p.segmentId==='first'?'甲司機':'乙司機',carPlate:p.segmentId==='first'?'AAA-111':'BBB-222',startedAt:{seconds:p.segmentId==='first'?1:2}};
 else if(p.action==='ORDER_CHAT_MESSAGES'){
  const rows=Array.from({length:p.segmentId==='first'?55:1},(_,i)=>({id:String(i+1),sequence:i+1,text:i===0?'文字 <img src=x onerror=alert(1)> https://example.com/path':'訊息 '+(i+1),senderRole:i%2?'USER':'DRIVER',createdAt:{seconds:1794628579}})).reverse().filter(m=>!p.beforeSequence||m.sequence<p.beforeSequence).slice(0,50);
  body={messages:rows,beforeSequence:rows.length===50?rows.at(-1).sequence:null};
 }else throw Error('Unexpected admin write '+p.action);
 return {ok:true,status:200,json:async()=>body};
};`;
exports.maps=`
window.__mapLines=[];window.__mapMarkers=[];
window.google={maps:{event:{clearInstanceListeners(){}},importLibrary:async name=>name==='core'?{Point:class{},Size:class{}}:name==='marker'?{Marker:class{constructor(o){Object.assign(this,o);__mapMarkers.push(this)}setMap(m){this.map=m}setPosition(p){this.position=p}}}:{Map:class{constructor(el){el.textContent='隔離地圖';el.style.background='#eee'}moveCamera(){}},Polyline:class{constructor(o){Object.assign(this,o);__mapLines.push(this)}setMap(m){this.map=m}}}}};`;
