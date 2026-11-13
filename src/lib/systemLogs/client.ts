'use client';
import './browser-core';
import {onAuthStateChanged} from 'firebase/auth';
import { auth } from '../../firebase/config';
type Details = Record<string, unknown>;
type Logger = { bind(id:string, token:(()=>Promise<string>)|null):void; record(type:string,details?:Details,priority?:boolean):void; flush():Promise<void>; stop():void };
declare global { interface Window { LotusSystemLog?: {create(options:Record<string,unknown>):Logger} } }
let logger:Logger|undefined;
let screen='admin';
let stopAuth:(()=>void)|undefined;
export function startSystemLog() {
  if(typeof window==='undefined'||logger)return;
  try { logger=window.LotusSystemLog?.create({source:'webAdmin',version:'syslog-v3p1-20261113',batchSize:100,intervalMs:60000,
    endpoint:'https://asia-east1-axeflowlotus-6dc3b.cloudfunctions.net/uploadSystemLogs',screen:()=>screen});
  stopAuth=onAuthStateChanged(auth,user=>logger?.bind(user?.uid||'',user?()=>user.getIdToken():null));
  } catch { /* Storage/diagnostics failure leaves the product usable. */ }
}
export function stopSystemLog(){stopAuth?.();stopAuth=undefined;logger?.stop();logger=undefined;}
export function recordSystemLog(type:string,details:Details={},priority=false){try{logger?.record(type,{screen,...details},priority);}catch{/* Diagnostics never alter operations. */}}
export function logScreen(value:string){screen=value;recordSystemLog('SCREEN_ENTER',{screen:value});}
