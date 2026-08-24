/* =========================== sources / mock =======================
 * デモ用の疑似電波実装。登録済みビーコンに対し疑似RSSIを生成。
 * ================================================================= */
import { store } from '../store.js';
import { DEFAULT_TX_POWER, MOCK_INTERVAL_MS } from '../const.js';

export const MockSource = {
  name: 'デモモード',
  _timer: null,
  _t: 0,
  isAvailable(){ return true; },
  async start(onEvent){
    this._t = 0;
    this._timer = setInterval(() => {
      this._t += MOCK_INTERVAL_MS / 1000;
      store.all().forEach((b, i) => {
        const rssi = Math.round(-62 + 22 * Math.sin(this._t + i * 2.1) - Math.random() * 4);
        if(rssi > -95){ // 近接／離脱を再現
          onEvent({ uuid:b.uuid, major:b.major, minor:b.minor, txPower:DEFAULT_TX_POWER, rssi });
        }
      });
    }, MOCK_INTERVAL_MS);
  },
  stop(){
    if(this._timer){ clearInterval(this._timer); this._timer = null; }
  }
};
