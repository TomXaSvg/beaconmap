/* =========================== ui ==================================== */
/* DOM操作・タブ・フォーム・一覧描画。 */
import { $, esc, hasCoords } from './util.js';
import { COLOR } from './const.js';
import { store } from './store.js';
import { state } from './state.js';
import { mapview } from './mapview.js';
import { estimateDistance } from './ibeacon.js';

export const ui = (() => {
  function showTab(name){
    for(const t of ['Scan','Radar','Reg']){
      const on = name === t.toLowerCase();
      $('tab'+t).classList.toggle('active', on);
      $('pane'+t).classList.toggle('active', on);
    }
  }

  // 受信一覧
  function renderDetList(dets){
    const box = $('detList');
    if(!dets.length){
      box.innerHTML = '<div class="empty">受信中のビーコンはありません</div>';
      return;
    }
    box.innerHTML = dets.map(d => {
      const beacon = store.get(d.key);
      const registered = !!beacon;
      const name = registered ? beacon.name : '（未登録ビーコン）';
      const dist = estimateDistance(d.rssi, d.txPower).toFixed(1);
      const pct = Math.max(0, Math.min(100, Math.round((d.rssi + 95) / 55 * 100))); // -95..-40 → 0..100
      const tag = registered ? '' : '<span class="tag warn">未登録</span>';
      const btn = registered ? '' :
        `<button class="btn" data-act="toReg" data-key="${esc(d.key)}">この値を登録画面へ</button>`;
      return `<div class="card">
        <div class="top"><span class="dot" style="background:${registered?COLOR.ok:COLOR.warn}"></span>
          <span class="name">${esc(name)}</span> ${tag}</div>
        <div class="sub">UUID:${esc(d.uuid)}<br>Major/Minor:${esc(String(d.major))}/${esc(String(d.minor))}
          ／ RSSI ${esc(String(d.rssi))}dBm ／ 約${esc(dist)}m</div>
        <div class="bar"><i style="width:${pct}%"></i></div>
        ${btn ? `<div class="actions">${btn}</div>` : ''}
      </div>`;
    }).join('');

    // イベントは生成後に付与
    box.querySelectorAll('[data-act="toReg"]').forEach(b => {
      b.addEventListener('click', () => {
        const d = state.active().find(x => x.key === b.dataset.key);
        if(!d) return;
        fillForm({ name:'', uuid:d.uuid, major:d.major, minor:d.minor, lat:'', lng:'' });
        showTab('reg');
        $('fName').focus();
      });
    });
  }

  // 登録一覧
  function renderRegList(beacons){
    const box = $('regList');
    if(!beacons.length){
      box.innerHTML = '<div class="empty">登録済みビーコンはありません</div>';
      return;
    }
    box.innerHTML = beacons.map(b => `<div class="card">
      <div class="top"><span class="dot" style="background:${COLOR.idle}"></span>
        <span class="name">${esc(b.name)}</span>
        ${hasCoords(b) ? '' : '<span class="tag">座標なし（レーダーのみ）</span>'}</div>
      <div class="sub">UUID:${esc(b.uuid)}<br>Major/Minor:${esc(String(b.major))}/${esc(String(b.minor))}
        ／ ${hasCoords(b) ? '緯度経度 '+esc(String(b.lat))+', '+esc(String(b.lng)) : '地図に置くには座標を登録'}</div>
      <div class="actions">
        <button class="btn" data-act="edit" data-key="${esc(b.key)}">編集</button>
        ${hasCoords(b) ? `<button class="btn" data-act="focus" data-key="${esc(b.key)}">地図で見る</button>` : ''}
        <button class="btn ghost" data-act="del" data-key="${esc(b.key)}">削除</button>
      </div>
    </div>`).join('');

    box.querySelectorAll('[data-act]').forEach(el => {
      el.addEventListener('click', () => {
        const b = store.get(el.dataset.key);
        if(!b) return;
        const act = el.dataset.act;
        if(act === 'edit'){ fillForm(b); showTab('reg'); $('fName').focus(); }
        else if(act === 'focus'){ mapview.focus(b); }
        else if(act === 'del'){
          // 削除後は登録一覧を即再描画。地図は描画ループ(tick)で自動更新される
          if(confirm(`「${b.name}」を削除しますか？`)){ store.remove(b.key); renderRegList(store.all()); }
        }
      });
    });
  }

  // フォーム値を読み、検証して返す（検証はここに集約。保存側では再検証しない）
  function readForm(){
    const name = $('fName').value.trim();
    const uuid = $('fUuid').value.trim().toLowerCase();
    const major = parseInt($('fMajor').value, 10);
    const minor = parseInt($('fMinor').value, 10);
    const latRaw = $('fLat').value.trim();
    const lngRaw = $('fLng').value.trim();

    if(name.length < 1) return { ok:false, msg:'名称を入力してください。' };
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(uuid))
      return { ok:false, msg:'UUIDの形式が正しくありません（8-4-4-4-12）。' };
    if(!Number.isInteger(major) || major < 0 || major > 65535)
      return { ok:false, msg:'Major は 0〜65535 の整数で入力してください。' };
    if(!Number.isInteger(minor) || minor < 0 || minor > 65535)
      return { ok:false, msg:'Minor は 0〜65535 の整数で入力してください。' };

    // 緯度経度は任意。両方空ならレーダー専用（座標なし）として保存
    let lat = null, lng = null;
    if(latRaw !== '' || lngRaw !== ''){
      if(latRaw === '' || lngRaw === '')
        return { ok:false, msg:'緯度と経度は両方入力するか、両方空にしてください（地図なしのレーダー専用は両方空）。' };
      lat = parseFloat(latRaw); lng = parseFloat(lngRaw);
      if(!Number.isFinite(lat) || lat < -90 || lat > 90)
        return { ok:false, msg:'緯度は -90〜90 の範囲で入力してください。' };
      if(!Number.isFinite(lng) || lng < -180 || lng > 180)
        return { ok:false, msg:'経度は -180〜180 の範囲で入力してください。' };
    }

    return { ok:true, rec:{ key:store.keyOf(uuid,major,minor), name, uuid, major, minor, lat, lng } };
  }

  function fillForm(o){
    $('fName').value  = o.name ?? '';
    $('fUuid').value  = o.uuid ?? '';
    $('fMajor').value = (o.major ?? '') === '' ? '' : o.major;
    $('fMinor').value = (o.minor ?? '') === '' ? '' : o.minor;
    $('fLat').value   = o.lat ?? '';
    $('fLng').value   = o.lng ?? '';
  }
  function clearForm(){ fillForm({ name:'',uuid:'',major:'',minor:'',lat:'',lng:'' }); }

  // ボタン文言・バッジ状態
  function setScanUI(on, label){
    const badge = $('scanBadge');
    // スキャン/レーダー両paneの開始ボタンを同期
    [['btnScan','btnMock'], ['btnScanR','btnMockR']].forEach(([scanId, mockId]) => {
      const scan = $(scanId), mock = $(mockId);
      if(!scan) return;
      if(on){
        scan.textContent = 'スキャン停止';
        scan.classList.remove('primary'); scan.classList.add('bad');
        if(mock) mock.disabled = true;
      }else{
        scan.textContent = 'スキャン開始';
        scan.classList.add('primary'); scan.classList.remove('bad');
        if(mock) mock.disabled = false;
      }
    });
    if(on){
      badge.textContent = label || '受信中';
      badge.className = 'badge ' + (label === 'デモモード' ? 'warn' : 'ok');
    }else{
      badge.textContent = '停止中';
      badge.className = 'badge';
    }
  }

  function setHint(best){
    const el = $('hint');
    if(best){
      el.classList.add('show');
      $('hintName').textContent = best.beacon.name;
      $('hintSub').textContent  = `推定現在地 ／ RSSI ${best.detection.rssi}dBm`;
    }else{
      el.classList.remove('show');
    }
  }

  return { showTab, renderDetList, renderRegList, readForm, fillForm, clearForm, setScanUI, setHint };
})();
