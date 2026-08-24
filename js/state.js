/* =========================== state ================================= */
/* 受信状態の保持。履歴は持たず、同一キーは上書き */
import { EXPIRE_MS } from './const.js';
import { store } from './store.js';

export const state = (() => {
  const dets = new Map(); // key -> Detection

  function onEvent(ev){
    const key = store.keyOf(ev.uuid, ev.major, ev.minor);
    dets.set(key, {
      key, uuid:ev.uuid, major:ev.major, minor:ev.minor,
      txPower:ev.txPower, rssi:ev.rssi, lastSeen:Date.now()
    });
  }
  function sweep(now){
    let removed = 0;
    for(const [k,d] of dets){
      if(now - d.lastSeen > EXPIRE_MS){ dets.delete(k); removed++; }
    }
    return removed;
  }
  function active(){
    return [...dets.values()].sort((a,b) => b.rssi - a.rssi); // RSSI降順
  }
  // マスタに登録済みかつRSSI最強＝推定現在地。未登録は座標が無いので候補外
  function best(){
    for(const d of active()){
      const beacon = store.get(d.key);
      if(beacon) return { beacon, detection:d };
    }
    return null;
  }
  function clear(){ dets.clear(); }

  return { onEvent, sweep, active, best, clear };
})();
