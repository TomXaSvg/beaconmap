/* =========================== ibeacon =============================== */
/* アドバタイズのパースと距離推定 */
import { COMPANY_ID_APPLE, DEFAULT_TX_POWER, PATH_LOSS_N } from './const.js';

// 8-4-4-4-12 のハイフン整形
export function formatUuid(bytes){
  const hex = bytes.map(b => b.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

// manufacturerData は Map<companyId, DataView>。
// 【重要】Web Bluetooth は Company ID を「キー」として渡すため、DataView に
// Company IDの2バイトは含まれない。ネイティブAPIで生バイトを扱う場合はオフセットが2ずれる（Phase2の事故点）
export function parseIBeacon(manufacturerData){
  if(!manufacturerData) return null;
  const dv = manufacturerData.get(COMPANY_ID_APPLE);
  if(!dv) return null;
  if(dv.byteLength < 23) return null;      // 異常系
  if(dv.getUint8(0) !== 0x02) return null; // Type
  if(dv.getUint8(1) !== 0x15) return null; // Length(21)
  const uuidBytes = [];
  for(let i = 2; i <= 17; i++) uuidBytes.push(dv.getUint8(i));
  return {
    uuid: formatUuid(uuidBytes),
    major: dv.getUint16(18, false),  // ビッグエンディアン
    minor: dv.getUint16(20, false),
    txPower: dv.getInt8(22)          // 符号付き
  };
}

// 距離推定。txPower が 0 のとき falsy で既定値に落ちないよう ?? を使う（|| は不可）
export function estimateDistance(rssi, txPower){
  const tx = (txPower ?? DEFAULT_TX_POWER);
  return Math.pow(10, (tx - rssi) / (10 * PATH_LOSS_N));
}
