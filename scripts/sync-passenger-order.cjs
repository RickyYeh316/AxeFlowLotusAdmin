// 乘客端為唯一來源；明確傳入 FBase Lotus 路徑，將共用呈現資產逐字同步到 AH。
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const source=process.argv[2];
if(!source)throw Error('Usage: node scripts/sync-passenger-order.cjs <FBase Lotus path>');
const dest=path.resolve(__dirname,'../public/passenger-order/shared');fs.mkdirSync(dest,{recursive:true});
const names=['shared/presentation.js','shared/order-card.js','shared/order-map.js','shared/order-chat.js','shared/google-maps.js','shared/role-preview.css','shared/order-map.css','shared/order-chat.css','passenger/mobile-ui.css'];
const manifest={};
for(const name of names){const content=fs.readFileSync(path.join(source,'public',name));fs.writeFileSync(path.join(dest,path.basename(name)),content);manifest[name]=crypto.createHash('sha256').update(content).digest('hex');}
fs.writeFileSync(path.join(dest,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Synced passenger order assets:',names.length);
