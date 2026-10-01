export const STORAGE_KEY='estrategia-quiz-v3';
export const LEGACY_KEY='estrategia-quiz-v1';
const empty=()=>({available:true,value:null,corrupt:false,migrated:false});
let memoryOnly=false,localQueue=Promise.resolve(),databasePromise;

export function readSave(){
  if(memoryOnly)return {...empty(),available:false};
  let raw,legacy=false;
  try{raw=localStorage.getItem(STORAGE_KEY);if(raw===null){raw=localStorage.getItem(LEGACY_KEY);legacy=raw!==null;}}
  catch{return {...empty(),available:false};}
  if(raw===null)return empty();
  try{const value=JSON.parse(raw);if(value?.version!==(legacy?1:2)||!Array.isArray(value.seen))return {...empty(),corrupt:true};return {available:true,value,corrupt:false,migrated:legacy};}
  catch{return {...empty(),corrupt:true};}
}
export function writeSave(value){if(memoryOnly)return false;try{localStorage.setItem(STORAGE_KEY,JSON.stringify({...value,version:2}));return true;}catch{return false;}}
// Keep the current record until its empty replacement has been written and verified.
// The replacement also prevents an older tab's legacy save from being imported again.
export function clearSave(value){
  if(memoryOnly)return false;
  try{
    if(!writeSave(value))return false;
    const saved=readSave().value;
    if(saved?.changeId!==value.changeId||saved.game!==null||saved.seen.length!==0||saved.stats?.plays!==0||saved.stats?.best!==0)return false;
    localStorage.removeItem(LEGACY_KEY);
    return localStorage.getItem(LEGACY_KEY)===null;
  }catch{return false;}
}

// IndexedDB contains no game data. A readwrite transaction on an empty store is
// a cross-tab mutex in browsers that do not expose the Web Locks API.
function openMutexDatabase(){
  if(databasePromise)return databasePromise;
  databasePromise=new Promise((resolve,reject)=>{
    if(!globalThis.indexedDB){reject(new Error('No hay un bloqueo compartido disponible.'));return;}
    let settled=false,request;
    const fail=error=>{if(settled)return;settled=true;clearTimeout(timer);reject(error);};
    const timer=setTimeout(()=>fail(new Error('El bloqueo compartido no responde.')),2000);
    try{request=indexedDB.open(`${STORAGE_KEY}-mutex`,1);}catch(error){fail(error);return;}
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('mutex'))request.result.createObjectStore('mutex');};
    request.onerror=()=>fail(request.error||new Error('No se puede abrir el bloqueo compartido.'));
    request.onsuccess=()=>{
      const db=request.result;
      if(settled){db.close();return;}
      settled=true;clearTimeout(timer);
      db.onversionchange=()=>{db.close();databasePromise=undefined;};
      resolve(db);
    };
  });
  return databasePromise;
}

async function withDatabaseLock(action){
  let entered=false;
  try{
    const db=await openMutexDatabase();
    return await new Promise((resolve,reject)=>{
      let transaction,store,done=false,transactionDone=false,result,actionFailed=false,actionError,lockError;
      const finish=()=>{
        if(!transactionDone||entered&&!done)return;
        if(lockError)reject(lockError);else if(actionFailed)reject(actionError);else resolve(result);
      };
      const failLock=error=>{
        if(transactionDone)return;
        transactionDone=true;lockError=error||new Error('Se ha perdido el bloqueo compartido.');
        // An async continuation must never write after its transaction has died.
        memoryOnly=true;finish();
      };
      try{transaction=db.transaction('mutex','readwrite');store=transaction.objectStore('mutex');}
      catch(error){reject(error);return;}
      transaction.onabort=()=>failLock(transaction.error||new Error('El bloqueo compartido se ha cancelado.'));
      transaction.onerror=()=>failLock(transaction.error||new Error('El bloqueo compartido ha fallado.'));
      transaction.oncomplete=()=>{
        if(transactionDone)return;
        if(!done){failLock(new Error('El bloqueo terminó antes que la acción.'));return;}
        transactionDone=true;finish();
      };
      function keepAlive(){
        if(done||transactionDone)return;
        let request;
        try{request=store.get(0);}catch(error){failLock(error);try{transaction.abort();}catch{}return;}
        request.onsuccess=()=>{
          if(transactionDone)return;
          // Queue the next request before action() can yield to another task.
          keepAlive();
          if(!entered){
            entered=true;
            Promise.resolve().then(action).then(value=>{result=value;done=true;},error=>{actionFailed=true;actionError=error;done=true;}).then(finish);
          }
        };
      }
      keepAlive();
    });
  }catch(error){
    if(entered)throw error;
    memoryOnly=true;
    return action();
  }
}

export async function withSaveLock(action){
  const fallback=()=>{
    const result=localQueue.then(()=>memoryOnly?action():withDatabaseLock(action));
    localQueue=result.catch(()=>{});return result;
  };
  if(memoryOnly||!globalThis.navigator?.locks?.request)return fallback();
  let entered=false;
  try{return await navigator.locks.request(STORAGE_KEY,()=>{entered=true;return action();});}
  catch(error){
    if(entered)throw error;
    // A different tab may still hold the native lock. Do not switch this tab to
    // an unrelated IndexedDB mutex and risk racing that native lock holder.
    memoryOnly=true;return fallback();
  }
}
