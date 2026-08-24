/* =========================== store ================================= */
/* ビーコンマスタの CRUD と永続化 */
import { LS_KEY } from './const.js';

export const store = (() => {
  let cache = [];

  function keyOf(uuid, major, minor){
    return `ibeacon:${String(uuid).toLowerCase()}:${major}:${minor}`;
  }
  function save(){
    // localStorage 上限超過などは呼び出し側へ通知（設計 8節 #9）
    localStorage.setItem(LS_KEY, JSON.stringify(cache));
  }
  function load(){
    try{
      const raw = localStorage.getItem(LS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      if(!Array.isArray(arr)){
        console.warn('[store] 保存データが配列でない。空で開始します。');
        cache = []; return cache;
      }
      cache = arr; return cache;
    }catch(e){
      // 破損時は黙って[]にせず warn を残す（設計 5-1）
      console.warn('[store] 読み込み失敗。空で開始します:', e);
      cache = []; return cache;
    }
  }
  function all(){ return cache; }
  function get(key){ return cache.find(b => b.key === key); }
  function upsert(rec){
    const i = cache.findIndex(b => b.key === rec.key);
    if(i >= 0) cache[i] = rec;      // キー一致は上書き（新規追加しない）
    else cache.push(rec);
    save();
    return rec;
  }
  function remove(key){
    const i = cache.findIndex(b => b.key === key);
    if(i < 0) return false;
    cache.splice(i, 1); save();
    return true;
  }
  function toJSON(){ return JSON.stringify(cache, null, 2); }

  // インポートは任意文字列が入り得るため各件を検証。不正な件のみスキップ（設計 5-1）
  function importJSON(text){
    let arr;
    try{ arr = JSON.parse(text); }
    catch(e){ return { ok:0, err:'JSONの解析に失敗しました：' + e.message }; }
    if(!Array.isArray(arr)) return { ok:0, err:'配列形式ではありません。' };
    let ok = 0;
    for(const item of arr){
      const rec = normalizeBeacon(item);
      if(rec){ upsert(rec); ok++; }
    }
    return { ok, err:null };
  }

  return { keyOf, load, all, get, upsert, remove, toJSON, importJSON };
})();

// フォーム由来／インポート由来の生データを検証して正規化。不正なら null
export function normalizeBeacon(o){
  if(!o || typeof o !== 'object') return null;
  const name = String(o.name ?? '').trim();
  const uuid = String(o.uuid ?? '').trim().toLowerCase();
  const major = Number(o.major);
  const minor = Number(o.minor);
  if(name.length < 1) return null;
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(uuid)) return null;
  if(!Number.isInteger(major) || major < 0 || major > 65535) return null;
  if(!Number.isInteger(minor) || minor < 0 || minor > 65535) return null;
  // 緯度経度は任意（レーダー専用なら座標なしで可）。両方空＝座標なし、片方だけ＝不正
  const hasLat = o.lat !== null && o.lat !== undefined && o.lat !== '';
  const hasLng = o.lng !== null && o.lng !== undefined && o.lng !== '';
  let lat = null, lng = null;
  if(hasLat || hasLng){
    if(!hasLat || !hasLng) return null; // 片方だけは不正（空欄で0扱いになる事故を防ぐ）
    lat = Number(o.lat); lng = Number(o.lng);
    if(!Number.isFinite(lat) || lat < -90 || lat > 90) return null;
    if(!Number.isFinite(lng) || lng < -180 || lng > 180) return null;
  }
  return { key: store.keyOf(uuid, major, minor), name, uuid, major, minor, lat, lng };
}
