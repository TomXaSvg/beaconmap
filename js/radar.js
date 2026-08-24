/* =========================== radar ================================
 * 距離レーダー（座標不要）。登録済みかつ受信中のビーコンを、
 * 中心=自分 / 半径=推定距離 で光点表示。方向は電波では出せないため
 * 角度はキーから固定割当し、半径（距離）だけが動く。
 * ================================================================= */
import { COLOR, RADAR_MAX_M, RADAR_RINGS } from './const.js';
import { esc } from './util.js';
import { estimateDistance } from './ibeacon.js';

export const radar = (() => {
  const CX = 100, CY = 100, R = 88;

  // キーから安定した角度(度)を得る。受信のたびに光点が飛ばないよう固定
  function angleFor(key){
    let h = 0;
    for(const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return (h % 360) * Math.PI / 180;
  }
  const pct = (rssi) => Math.max(0, Math.min(100, Math.round((rssi + 95) / 55 * 100)));

  function redraw(beacons, dets){
    const svg = document.getElementById('radarSvg');
    if(!svg) return;
    const detByKey = new Map(dets.map(d => [d.key, d]));

    // 登録済みかつ受信中のビーコンを近い順に
    const blips = beacons
      .map(b => {
        const d = detByKey.get(b.key);
        return d ? { b, dist: estimateDistance(d.rssi, d.txPower), rssi: d.rssi } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.dist - b.dist);

    let s = '';
    // 同心円＋距離ラベル
    for(let i = 1; i <= RADAR_RINGS; i++){
      const rr = R * i / RADAR_RINGS;
      s += `<circle cx="${CX}" cy="${CY}" r="${rr.toFixed(1)}" fill="none" stroke="#2c3444" stroke-width="0.6"/>`;
      s += `<text x="${CX + 1.5}" y="${(CY - rr + 6).toFixed(1)}" fill="#5b6472" font-size="6">${Math.round(RADAR_MAX_M * i / RADAR_RINGS)}m</text>`;
    }
    // 十字＋中心（あなた）
    s += `<line x1="${CX}" y1="${CY-R}" x2="${CX}" y2="${CY+R}" stroke="#2c3444" stroke-width="0.4"/>`;
    s += `<line x1="${CX-R}" y1="${CY}" x2="${CX+R}" y2="${CY}" stroke="#2c3444" stroke-width="0.4"/>`;
    // 中心＝自分。十字の交点で自明なのでラベルは置かず、点のみ（原点が分かる程度に外周リングを添える）
    s += `<circle cx="${CX}" cy="${CY}" r="6" fill="none" stroke="${COLOR.accent}" stroke-width="0.8" stroke-opacity="0.5"/>`;
    s += `<circle cx="${CX}" cy="${CY}" r="3" fill="${COLOR.accent}"/>`;

    // 光点
    blips.forEach((bl, idx) => {
      const a = angleFor(bl.b.key);
      const rr = R * Math.min(bl.dist, RADAR_MAX_M) / RADAR_MAX_M;
      const x = CX + rr * Math.cos(a), y = CY + rr * Math.sin(a);
      const closest = idx === 0;
      const col = closest ? COLOR.accent : COLOR.ok;
      s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${closest ? 5 : 4}" fill="${col}" fill-opacity="0.9">`;
      if(closest) s += `<animate attributeName="r" values="5;7.5;5" dur="1.2s" repeatCount="indefinite"/>`;
      s += `</circle>`;
      s += `<text x="${x.toFixed(1)}" y="${(y-7).toFixed(1)}" fill="#e7ecf3" font-size="6" text-anchor="middle">${esc(bl.b.name)}</text>`;
      s += `<text x="${x.toFixed(1)}" y="${(y+11).toFixed(1)}" fill="#9aa6b8" font-size="5.5" text-anchor="middle">約${bl.dist.toFixed(1)}m</text>`;
    });
    svg.innerHTML = s;

    // 近い順リスト
    const box = document.getElementById('radarList');
    if(!blips.length){
      box.innerHTML = '<div class="empty">登録ビーコンを探索中…<br>「スキャン開始」を押してください</div>';
      return;
    }
    box.innerHTML = blips.map((bl, i) => `<div class="card">
      <div class="top">
        <span class="dot" style="background:${i===0?COLOR.accent:COLOR.ok}"></span>
        <span class="name">${esc(bl.b.name)}</span>
        ${i===0 ? '<span class="tag" style="background:var(--accent);color:#04121f">最も近い</span>' : ''}
      </div>
      <div class="sub">約${esc(bl.dist.toFixed(1))}m ／ RSSI ${esc(String(bl.rssi))}dBm</div>
      <div class="bar"><i style="width:${pct(bl.rssi)}%"></i></div>
    </div>`).join('');
  }

  return { redraw };
})();
