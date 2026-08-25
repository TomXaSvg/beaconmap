/* =========================== main ================================== */
/* 初期化と描画ループ。全モジュールを束ねるエントリポイント。 */
import { RENDER_TICK_MS } from './const.js';
import { $, esc, hasCoords } from './util.js';
import { store } from './store.js';
import { state } from './state.js';
import { mapview } from './mapview.js';
import { radar } from './radar.js';
import { ui } from './ui.js';
import { env } from './env.js';
import { getRealSource, MockSource } from './sources/index.js';
import { csvToBeacons, decodeText } from './csv.js';
import { parseIBeacon } from './ibeacon.js';

let currentSource = null; // 実機とデモは排他。同時稼働させない

// 地図の推定現在地は「登録済み＋座標あり＋最強」。座標なしは地図に置けないので除外
function bestForMap(dets){
  for(const d of dets){
    const b = store.get(d.key);
    if(b && hasCoords(b)) return { beacon:b, detection:d };
  }
  return null;
}

function refreshLists(){
  ui.renderRegList(store.all());
  mapview.redraw(store.all(), state.active(), bestForMap(state.active()));
}

// 同梱の beacons.csv があれば読み込んで登録（CSVがマスター＝キー一致は上書き）。
// 無ければ何もしない。文字コードは UTF-8／Shift_JIS を自動判定。
async function loadDefaultCsv(){
  try{
    const res = await fetch('beacons.csv', { cache:'no-store' });
    if(!res.ok) return; // 404 等＝存在しない → 読み込まない（設計どおり）
    const text = decodeText(await res.arrayBuffer());
    const { recs, skipped } = csvToBeacons(text);
    recs.forEach(r => store.upsert(r)); // キー一致は上書き＝リロード時にCSVの名称へ戻る
    console.info(`[csv] beacons.csv 読み込み: ${recs.length}件登録 / ${skipped}行スキップ`);
  }catch(e){
    console.warn('[csv] beacons.csv 読み込み失敗:', e);
  }
}

function tick(){
  state.sweep(Date.now());
  const dets = state.active();
  const beacons = store.all();
  const mapBest = bestForMap(dets);
  mapview.redraw(beacons, dets, mapBest);
  radar.redraw(beacons, dets);
  ui.renderDetList(dets);
  ui.setHint(mapBest);
}

async function startScan(source, label){
  if(currentSource) return; // 二重起動防止
  if(!source.isAvailable()){
    alert('この環境では利用できません。\n\n' + env.warnings().join('\n\n') + '\n\n（デモモードで動作確認できます）');
    return;
  }
  try{
    currentSource = source;
    await source.start(state.onEvent);
    ui.setScanUI(true, label);
    mapview.startWatch(); // 捜索中は現在地を追従（座標なしビーコンの「現在地中心の円」用）
  }catch(e){
    // BT OFF / 権限拒否 / http 等（設計 8節 #4）
    currentSource = null;
    ui.setScanUI(false);
    alert('開始できませんでした：' + (e && e.message ? e.message : e) +
      '\n\n考えられる原因：\n・Bluetooth が OFF\n・位置情報サービスが OFF\n・http で開いている');
  }
}

function stopScan(){
  if(currentSource){ currentSource.stop(); currentSource = null; }
  mapview.stopWatch();
  state.clear();
  ui.setScanUI(false);
  tick();
}

/* ---- 診断スキャン：形式を問わず受信した全BLE機器を生表示 ---- */
let diagScan = null, diagListener = null;
const diagSeen = new Map();

// ハイフン/スペース/コロンを無視した小文字化（検索の正規化）
function normSearch(s){ return String(s).toLowerCase().replace(/[\s\-:]/g, ''); }

function renderDiag(){
  const el = $('diagLog');
  el.style.display = 'block';
  const all = [...diagSeen.values()].sort((a, b) => b.rssi - a.rssi);
  if(!all.length){ el.textContent = '(まだ受信なし… ビーコンを近づけてください)'; return; }

  const q = normSearch(($('diagFilter') && $('diagFilter').value) || '');
  const block = (r) => {
    let s = `${r.name}  RSSI ${r.rssi}dBm`;
    for(const m of r.mfg) s += `\n  会社ID ${m.id}: ${m.hex}`; // 生バイト列（HEX）
    if(r.uuids.length) s += `\n  serviceUUID: ${r.uuids.join(', ')}`;
    if(r.svc.length) s += `\n  serviceData: ${r.svc.join(', ')}`;
    if(r.ibeacon) s += `\n  ★iBeacon UUID: ${r.ibeacon.uuid} / ${r.ibeacon.major}/${r.ibeacon.minor}`;
    return s;
  };
  // 絞り込みは各機器のブロック全文（名称/HEX/UUID等）に対して正規化部分一致
  const rows = q ? all.filter(r => normSearch(block(r)).includes(q)) : all;
  const head = q ? `該当 ${rows.length} / 受信 ${all.length} 台（絞り込み中）` : `受信 ${all.length} 台`;
  el.textContent = head + '\n--------\n' + (rows.length ? rows.map(block).join('\n\n') : '(該当なし。空欄にすると全件表示)');
}

function stopDiag(){
  if(!diagScan && !diagListener) return;
  if(diagListener){ navigator.bluetooth.removeEventListener('advertisementreceived', diagListener); diagListener = null; }
  if(diagScan){ try{ diagScan.stop(); }catch(e){ /* 停止済み */ } diagScan = null; }
  $('btnDiag').textContent = '診断スキャン開始（生データ表示）';
}

async function toggleDiag(){
  if(diagScan){ stopDiag(); return; }
  if(!(window.isSecureContext && navigator.bluetooth && navigator.bluetooth.requestLEScan)){
    alert('診断できません。\n\n' + env.warnings().join('\n\n'));
    return;
  }
  if(currentSource) stopScan(); // 通常スキャンと排他
  diagSeen.clear(); renderDiag();
  diagListener = (e) => {
    const mfg = [];
    if(e.manufacturerData) for(const [k, dv] of e.manufacturerData){
      let hex = '';
      for(let i = 0; i < dv.byteLength; i++) hex += (i ? ' ' : '') + dv.getUint8(i).toString(16).padStart(2,'0');
      mfg.push({ id: '0x' + k.toString(16).padStart(4,'0').toUpperCase(), hex });
    }
    const svc = [];
    if(e.serviceData) for(const k of e.serviceData.keys()) svc.push(k);
    const ib = parseIBeacon(e.manufacturerData);
    const key = (e.device && e.device.id) || (e.device && e.device.name) || 'anon';
    diagSeen.set(key, {
      name: (e.device && e.device.name) ? e.device.name : '(名前なし)',
      rssi: e.rssi, mfg, svc, uuids: e.uuids || [], ibeacon: ib
    });
    renderDiag();
  };
  navigator.bluetooth.addEventListener('advertisementreceived', diagListener);
  try{
    diagScan = await navigator.bluetooth.requestLEScan({ acceptAllAdvertisements:true, keepRepeatedDevices:true });
    $('btnDiag').textContent = '診断スキャン停止';
  }catch(err){
    navigator.bluetooth.removeEventListener('advertisementreceived', diagListener); diagListener = null;
    alert('診断スキャン開始に失敗：' + (err && err.message ? err.message : err) +
      '\n\n原因候補：Bluetooth OFF／位置情報OFF／権限拒否');
  }
}

function bind(){
  // タブ
  $('tabScan').addEventListener('click', () => ui.showTab('scan'));
  $('tabRadar').addEventListener('click', () => ui.showTab('radar'));
  $('tabReg').addEventListener('click', () => ui.showTab('reg'));
  $('tabDiag').addEventListener('click', () => ui.showTab('diag'));

  // スキャン操作（start はユーザー操作のコールスタック内で呼ぶ）
  const onScanClick = () => {
    if(currentSource) stopScan();
    else { stopDiag(); startScan(getRealSource(), '受信中'); } // 診断中なら止めてから
  };
  const onMockClick = () => {
    if(currentSource) return;
    if(store.all().length === 0){ alert('先にビーコンを登録してください。'); ui.showTab('reg'); return; }
    startScan(MockSource, 'デモモード');
  };
  // スキャンpane / レーダーpane 両方の開始・デモボタンを同じ処理に接続
  $('btnScan').addEventListener('click', onScanClick);
  $('btnMock').addEventListener('click', onMockClick);
  $('btnScanR').addEventListener('click', onScanClick);
  $('btnMockR').addEventListener('click', onMockClick);
  $('btnFit').addEventListener('click', () => {
    if(!store.all().some(hasCoords)){
      alert('座標付きの登録ビーコンがありません。\n地図に表示するには「ビーコン登録」で緯度経度を入力してください。\n（レーダーで探すだけなら座標は不要です）');
      return;
    }
    mapview.fitAll(store.all());
  });
  $('btnDiag').addEventListener('click', toggleDiag);
  $('diagFilter').addEventListener('input', () => { if(diagSeen.size) renderDiag(); }); // 入力で即絞り込み

  // 登録操作
  $('btnSave').addEventListener('click', () => {
    const r = ui.readForm();
    if(!r.ok){ alert(r.msg); return; }
    store.upsert(r.rec);
    ui.clearForm();
    refreshLists();
    alert('保存しました。');
  });
  $('btnGeo').addEventListener('click', () => {
    if(!navigator.geolocation){ alert('この環境では位置情報を取得できません。手入力／地図クリックで指定してください。'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { $('fLat').value = pos.coords.latitude.toFixed(6); $('fLng').value = pos.coords.longitude.toFixed(6); },
      (err) => { alert('現在地の取得に失敗しました：' + err.message + '\n手入力／地図クリックで代替できます。'); },
      { enableHighAccuracy:true, timeout:10000 }
    );
  });
  $('btnPick').addEventListener('click', () => {
    alert('地図上をタップして座標を指定してください（1回で解除）。');
    mapview.onPick((lat, lng) => { $('fLat').value = lat.toFixed(6); $('fLng').value = lng.toFixed(6); });
  });
  $('btnClear').addEventListener('click', () => ui.clearForm());

  // 入出力
  $('btnExport').addEventListener('click', () => {
    const blob = new Blob([store.toJSON()], { type:'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'beacons.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $('btnImport').addEventListener('click', () => $('fileImport').click());
  $('fileImport').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const res = store.importJSON(String(reader.result)); // 失敗しても既存データは変更しない
      if(res.err) alert('読み込みに失敗しました：' + res.err);
      else{ refreshLists(); alert(`${res.ok}件を読み込みました。`); }
    };
    reader.onerror = () => alert('ファイルの読み込みに失敗しました。');
    reader.readAsText(file);
    e.target.value = ''; // 同じファイルを連続選択できるように
  });

  // 手動CSV読み込み（端末内のCSVをその場で取り込む。文字コード自動判定）
  $('btnImportCsv').addEventListener('click', () => $('fileImportCsv').click());
  $('fileImportCsv').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const { recs, skipped } = csvToBeacons(decodeText(reader.result));
      recs.forEach(r => store.upsert(r));
      refreshLists();
      alert(`${recs.length}件を読み込みました。${skipped ? `（${skipped}行はヘッダ／不正でスキップ）` : ''}`);
    };
    reader.onerror = () => alert('ファイルの読み込みに失敗しました。');
    reader.readAsArrayBuffer(file); // 文字コード判定のため ArrayBuffer で読む
    e.target.value = '';
  });

  setupMapResizer();

  // 画面離脱時はスキャンを止める（設計 6-4）
  window.addEventListener('pagehide', () => { if(currentSource) currentSource.stop(); });
}

// 地図の高さをドラッグで可変に。最小＝既定(42dvh)の1/3(=14dvh)、最大＝既定(42dvh)
function setupMapResizer(){
  const resizer = $('mapResizer'), mapWrap = $('mapWrap');
  if(!resizer || !mapWrap) return;
  let startY = 0, startH = 0, dragging = false;
  const vh = (p) => window.innerHeight * p / 100;

  const onMove = (e) => {
    if(!dragging) return;
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    let h = startH + (y - startY);              // 下ドラッグで拡大／上ドラッグで縮小
    h = Math.max(vh(14), Math.min(vh(42), h));  // 1/3〜既定の範囲にクランプ
    mapWrap.style.height = h + 'px';
    mapview.invalidateSize();
  };
  const onUp = (e) => {
    if(!dragging) return;
    dragging = false;
    resizer.classList.remove('dragging');
    try{ resizer.releasePointerCapture(e.pointerId); }catch(_){}
    mapview.invalidateSize();
  };
  resizer.addEventListener('pointerdown', (e) => {
    dragging = true;
    startY = e.clientY;
    startH = mapWrap.offsetHeight;
    resizer.classList.add('dragging');
    try{ resizer.setPointerCapture(e.pointerId); }catch(_){}
    e.preventDefault();
  });
  resizer.addEventListener('pointermove', onMove);
  resizer.addEventListener('pointerup', onUp);
  resizer.addEventListener('pointercancel', onUp);
}

/* --- 初期化 --- */
async function boot(){
  store.load();
  mapview.init('map');
  bind();

  // 環境判定 → 警告表示
  const c = env.check();
  const badge = $('envBadge');
  badge.textContent = c.ok ? 'BLEスキャン利用可' : 'BLE利用不可（デモ可）';
  badge.className = 'badge ' + (c.ok ? 'ok' : 'warn');
  if(!c.ok) $('btnScan').disabled = false; // 押下時に原因を案内する方針（無効化はしない）
  const w = env.warnings();
  const note = $('envNote');
  if(w.length){
    note.classList.remove('hidden');
    note.innerHTML = '<b>環境メモ</b><ul>' + w.map(t => `<li>${esc(t)}</li>`).join('') + '</ul>';
  }

  refreshLists();               // まず localStorage の分を即表示
  mapview.fitAll(store.all());
  await loadDefaultCsv();        // beacons.csv があればCSVをマスターとして反映
  refreshLists();
  mapview.fitAll(store.all());
  setInterval(tick, RENDER_TICK_MS);

  // カーナビ風：起動時に端末の現在地へ寄せる。取得はプロンプト待ちで初期化を
  // ブロックしないよう非同期のまま（許可待ちが長くても描画ループは動く）
  mapview.locate(true);
}

boot();
