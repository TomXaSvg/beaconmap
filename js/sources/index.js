/* =========================== sources / index ======================
 * BeaconSource の集約と選択。Phase2 は capacitor.js を作って
 * ここへ import + getRealSource の分岐を1行足すだけ（他は無変更）。
 * ================================================================= */
import { WebBluetoothSource } from './webbt.js';
import { MockSource } from './mock.js';

export { WebBluetoothSource, MockSource };

// 実機ソースを返す（Phase2で Capacitor をここで返すよう分岐）
export function getRealSource(){ return WebBluetoothSource; }
