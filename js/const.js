/* =========================== const ================================= */
export const LS_KEY            = 'ble-beacon-map/v1'; // 構造変更時は末尾versionを上げる（=旧データ破棄扱い）
export const EXPIRE_MS         = 12000;  // 最終受信からロスト判定まで
export const RENDER_TICK_MS    = 600;    // 描画ループ間隔
export const DEFAULT_TX_POWER  = -59;    // TxPower未取得時の1m基準RSSI
export const PATH_LOSS_N       = 2;      // 伝搬損失係数（自由空間仮定）
export const MAX_CIRCLE_M      = 60;     // 電波強度円の最大半径(m)
export const MOCK_INTERVAL_MS  = 700;    // デモ疑似電波の間隔
export const MAP_CENTER        = [35.6812, 139.7671]; // ★展示地の座標に差し替える
export const MAP_ZOOM          = 17;
export const MAP_MAX_ZOOM      = 19;     // OSMタイル提供上限
export const COMPANY_ID_APPLE  = 0x004C; // iBeacon の Company ID
export const RADAR_MAX_M       = 30;     // レーダーの外周が表す距離(m)。これ以遠は外周に張り付く
export const RADAR_RINGS       = 3;      // 同心円の本数

// Leaflet はSVG属性へ直接色を書くため CSS変数が効かない。トークンと同値のhexを持つ
export const COLOR = { ok:'#35c98a', accent:'#3ea6ff', warn:'#f5a524', bad:'#ff5c5c', idle:'#4a5160' };
