/* =========================== util =================================
 * 複数モジュールが使う小さな共通ヘルパ。
 * esc は設計書では ui.js 配下だが、mapview/radar からも使うため
 * ここへ切り出す（ui へ依存させると mapview↔ui が循環するのを回避）。
 * ================================================================= */

// DOM取得の短縮
export const $ = (id) => document.getElementById(id);

// HTMLエスケープ（& < > "）。innerHTML へ流す全経路で通す
export function esc(s){
  return String(s)
    .replaceAll('&','&amp;').replaceAll('<','&lt;')
    .replaceAll('>','&gt;').replaceAll('"','&quot;');
}

// 座標を持つ（＝地図に置ける）ビーコンか。lat/lng が数値のときだけ true
export function hasCoords(b){ return Number.isFinite(b.lat) && Number.isFinite(b.lng); }
