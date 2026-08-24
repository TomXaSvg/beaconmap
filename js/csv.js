/* =========================== csv ==================================
 * CSV → ビーコン変換。列順は 名称,UUID,Major,Minor,lat,lng（後2つは任意）。
 * ヘッダ行・空行・#コメント行は自動スキップ（UUID列がUUID形式でない行は無視）。
 * 検証は store.normalizeBeacon に集約（JSON読み込みと同じ規則）。
 * ================================================================= */
import { normalizeBeacon } from './store.js';

// RFC4180 相当の最小CSVパーサ。ダブルクォート内のカンマ・改行・"" を扱う
export function parseCSV(text){
  text = text.replace(/^﻿/, ''); // 先頭BOM除去
  const rows = [];
  let field = '', row = [], inQuotes = false;
  for(let i = 0; i < text.length; i++){
    const c = text[i];
    if(inQuotes){
      if(c === '"'){
        if(text[i+1] === '"'){ field += '"'; i++; } // "" → " (エスケープ)
        else inQuotes = false;
      } else field += c;
    }else{
      if(c === '"') inQuotes = true;
      else if(c === ',') { row.push(field); field = ''; }
      else if(c === '\n'){ row.push(field); rows.push(row); row = []; field = ''; }
      else if(c === '\r') { /* CR は無視（CRLF対応） */ }
      else field += c;
    }
  }
  if(field.length > 0 || row.length > 0){ row.push(field); rows.push(row); }
  return rows;
}

// CSVテキスト → { recs: Beacon[], loaded, skipped }
export function csvToBeacons(text){
  const rows = parseCSV(text);
  const recs = [];
  let skipped = 0;
  for(const cols of rows){
    const first = (cols[0] ?? '').trim();
    if(first === '') continue;              // 空行
    if(first.startsWith('#')) continue;     // コメント行
    const rec = normalizeBeacon({
      name:  cols[0],
      uuid:  cols[1],
      major: (cols[2] ?? '').trim(),
      minor: (cols[3] ?? '').trim(),
      lat:   (cols[4] ?? '').trim(),
      lng:   (cols[5] ?? '').trim()
    });
    if(rec) recs.push(rec);
    else skipped++;                         // ヘッダ行や不正行はここに含まれる
  }
  return { recs, loaded: recs.length, skipped };
}

// ArrayBuffer を UTF-8 で解釈し、化けたら Shift_JIS で再デコード（Excel保存対策）
export function decodeText(buf){
  const utf8 = new TextDecoder('utf-8').decode(buf);
  if(utf8.includes('�')){
    try{ return new TextDecoder('shift_jis').decode(buf); }
    catch(e){ return utf8; }
  }
  return utf8;
}
