/* =========================== mapview =============================== */
/* Leaflet 描画。描画は「状態からの全再構築」（原則2）
 * L は Leaflet 本体（CDNのクラシックscript）が定義するグローバル。 */
import { COLOR, MAP_CENTER, MAP_ZOOM, MAP_MAX_ZOOM, MAX_CIRCLE_M } from './const.js';
import { esc, hasCoords } from './util.js';
import { estimateDistance } from './ibeacon.js';

/* global L */
export const mapview = (() => {
  let map = null, layer = null, pickHandler = null;

  function init(elId){
    map = L.map(elId, { zoomControl:true }).setView(MAP_CENTER, MAP_ZOOM);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: MAP_MAX_ZOOM,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    layer = L.layerGroup().addTo(map);
  }

  function redraw(beacons, dets, best){
    layer.clearLayers(); // 全消去→全描画
    const detByKey = new Map(dets.map(d => [d.key, d]));

    beacons.forEach(b => {
      if(!hasCoords(b)) return; // 座標なし（レーダー専用）は地図に置けない
      const det = detByKey.get(b.key);
      const receiving = !!det;

      // 電波強度円（受信中のみ）
      if(receiving){
        const dist = estimateDistance(det.rssi, det.txPower);
        L.circle([b.lat, b.lng], {
          radius: Math.min(dist, MAX_CIRCLE_M),
          color: COLOR.ok, weight:1, fillColor:COLOR.ok, fillOpacity:0.08
        }).addTo(layer);
      }

      // 位置マーカー（全登録ビーコン）
      const color = receiving ? COLOR.ok : COLOR.idle;
      const dist = receiving ? estimateDistance(det.rssi, det.txPower).toFixed(1) + ' m' : '—';
      const rssi = receiving ? det.rssi + ' dBm' : '未受信';
      // name はユーザー入力＝ポップアップも esc 必須
      const html =
        `<b>${esc(b.name)}</b><br>` +
        `Major/Minor: ${esc(String(b.major))}/${esc(String(b.minor))}<br>` +
        `RSSI: ${esc(rssi)}<br>推定距離: ${esc(dist)}`;
      L.circleMarker([b.lat, b.lng], {
        radius:7, color, weight:2, fillColor:color, fillOpacity:1
      }).bindPopup(html).addTo(layer);
    });

    // 推定現在地リング
    if(best){
      L.circleMarker([best.beacon.lat, best.beacon.lng], {
        radius:16, color:COLOR.accent, weight:3, fill:false
      }).addTo(layer);
    }
  }

  function fitAll(beacons){
    const withCoords = beacons.filter(hasCoords);
    if(!withCoords.length) return;
    const bounds = L.latLngBounds(withCoords.map(b => [b.lat, b.lng]));
    map.fitBounds(bounds.pad(0.3));
  }
  function focus(beacon){ map.setView([beacon.lat, beacon.lng], 19); }

  // 座標指定モード。1回クリックで自動解除する
  function onPick(cb){
    if(pickHandler) map.off('click', pickHandler);
    pickHandler = (e) => {
      map.off('click', pickHandler); pickHandler = null;
      cb(e.latlng.lat, e.latlng.lng);
    };
    map.on('click', pickHandler);
  }

  return { init, redraw, fitAll, focus, onPick };
})();
