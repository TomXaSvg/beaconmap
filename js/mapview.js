/* =========================== mapview =============================== */
/* Leaflet 描画。描画は「状態からの全再構築」（原則2）
 * L は Leaflet 本体（CDNのクラシックscript）が定義するグローバル。 */
import { COLOR, MAP_CENTER, MAP_ZOOM, MAP_MAX_ZOOM, MAX_CIRCLE_M } from './const.js';
import { esc, hasCoords } from './util.js';
import { estimateDistance } from './ibeacon.js';

/* global L */
export const mapview = (() => {
  let map = null, layer = null, meLayer = null, pickHandler = null, lastFix = null;

  function init(elId){
    map = L.map(elId, { zoomControl:true }).setView(MAP_CENTER, MAP_ZOOM);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: MAP_MAX_ZOOM,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    layer = L.layerGroup().addTo(map);
    meLayer = L.layerGroup().addTo(map); // 現在地は redraw で消えない専用レイヤ
    addLocateControl();
  }

  // 端末の現在地(GPS)を青ドット＋精度円で表示。ビーコン用 layer とは別レイヤ
  function showMyLocation(lat, lng, acc, recenter){
    meLayer.clearLayers();
    if(Number.isFinite(acc) && acc > 0){
      L.circle([lat, lng], {
        radius: acc, color: COLOR.me, weight: 1, fillColor: COLOR.me, fillOpacity: 0.12
      }).addTo(meLayer);
    }
    L.circleMarker([lat, lng], {
      radius: 7, color: '#ffffff', weight: 2, fillColor: COLOR.me, fillOpacity: 1
    }).bindPopup('現在地（GPS）').addTo(meLayer);
    lastFix = { lat, lng };
    if(recenter) map.setView([lat, lng], Math.max(map.getZoom(), 17));
  }

  // 現在地を取得して表示。成功で {lat,lng}、失敗で null（呼び出し側でメッセージ）
  function locate(recenter){
    return new Promise((resolve) => {
      if(!navigator.geolocation){ resolve(null); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          showMyLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, recenter);
          resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
      );
    });
  }

  // 地図右上に「現在地」ボタン（カーナビの現在地ボタン相当。押すたび読み直し）
  function addLocateControl(){
    const Ctrl = L.Control.extend({
      options: { position: 'topright' },
      onAdd(){
        const btn = L.DomUtil.create('button', 'locate-btn');
        btn.type = 'button';
        btn.title = '現在地に移動';
        btn.textContent = '◎ 現在地';
        L.DomEvent.disableClickPropagation(btn);
        L.DomEvent.on(btn, 'click', async () => {
          btn.disabled = true;
          const fix = await locate(true);
          btn.disabled = false;
          if(!fix) alert('現在地を取得できませんでした。\n・位置情報サービスがON\n・Chromeアプリに「位置情報」権限が許可されているか\nを確認してください。');
        });
        return btn;
      }
    });
    map.addControl(new Ctrl());
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

  return { init, redraw, fitAll, focus, onPick, locate, showMyLocation };
})();
