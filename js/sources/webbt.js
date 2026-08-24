/* =========================== sources / webbt ======================
 * ★差し替え境界。実装はダックタイピング：
 *   { name, isAvailable(), async start(onEvent), stop() }
 * Web Bluetooth 実装。
 * ================================================================= */
import { parseIBeacon } from '../ibeacon.js';

export const WebBluetoothSource = {
  name: 'BLEスキャン',
  _scan: null,
  _listener: null,
  isAvailable(){
    return window.isSecureContext && !!(navigator.bluetooth && navigator.bluetooth.requestLEScan);
  },
  async start(onEvent){
    // リスナは start ごとに追加し、stop で必ず removeEventListener（多重登録防止）
    this._listener = (event) => {
      const parsed = parseIBeacon(event.manufacturerData);
      if(!parsed) return; // iBeacon以外は破棄
      onEvent({ ...parsed, rssi: event.rssi });
    };
    navigator.bluetooth.addEventListener('advertisementreceived', this._listener);
    // requestLEScan はユーザー操作のコールスタック内から呼ぶ必要がある（呼び出し側で担保）
    this._scan = await navigator.bluetooth.requestLEScan({
      acceptAllAdvertisements: true, keepRepeatedDevices: true
    });
  },
  stop(){
    if(this._listener){
      navigator.bluetooth.removeEventListener('advertisementreceived', this._listener);
      this._listener = null;
    }
    if(this._scan){
      try{ this._scan.stop(); }catch(e){ /* 既に停止済み */ }
      this._scan = null;
    }
  }
};
