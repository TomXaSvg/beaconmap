/* =========================== env =================================== */
/* 動作環境の判定と警告文生成。 */
export const env = (() => {
  function check(){
    const secure = window.isSecureContext;
    const hasBluetooth = !!navigator.bluetooth;
    const hasLEScan = !!(navigator.bluetooth && navigator.bluetooth.requestLEScan);
    return { secure, hasBluetooth, hasLEScan, ok: secure && hasBluetooth && hasLEScan };
  }
  function warnings(){
    const c = check();
    const w = [];
    if(!c.secure)
      w.push('https（または localhost）で開く必要があります。位置情報も使えません。');
    if(!c.hasBluetooth)
      w.push('このブラウザは Web Bluetooth 非対応です（iOS は仕様上不可）。Chrome for Android を使ってください。');
    else if(!c.hasLEScan)
      w.push('chrome://flags/#enable-experimental-web-platform-features を Enabled にして再起動してください。');
    if(c.ok)
      w.push('Bluetooth と「位置情報サービス」を両方ONにしてください。' +
             '端末の位置情報がOFFだと、開始しても一件も受信できません（無症状の空振り。空振り時の第一被疑箇所）。');
    return w;
  }
  return { check, warnings };
})();
