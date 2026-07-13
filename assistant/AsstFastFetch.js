// =================================================================
// 🚀 AsstFastFetch.gs — hydrate ทุกชีทของ workbook ผู้ช่วยด้วย Sheets API
// -----------------------------------------------------------------
// พอร์ตตรงจาก FastFetch.js ของระบบเภสัช (โครง blob เหมือนกันทุกบิต)
// blob = { sheetOrder:[names], sheets:{ name → {values, display, mergeIdx, lastRow, lastCol, empty} } }
//   - display : ค่าที่ formatted แล้ว (string)
//   - values  : ค่าดิบ + reconstruct Date จาก serial (openpyxl data_only เทียบเท่า)
//   - mergeIdx : Map ของเซลล์ผสาน → key ต้นทาง (r*100000+c) ; ใช้เฉพาะใน readCell_ ของ validator
// =================================================================

function hydrateBlobFast_(spreadsheetId) {
  const t0 = Date.now();

  const meta = Sheets.Spreadsheets.get(spreadsheetId, {
    fields: 'sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)),merges)'
  });
  const sheetMetas = meta.sheets || [];
  const sheetNames = sheetMetas.map(s => s.properties.title);
  const ranges = sheetNames.map(n => `'${n.replace(/'/g, "''")}'`);

  const dispResp = Sheets.Spreadsheets.Values.batchGet(spreadsheetId, {
    ranges, valueRenderOption: 'FORMATTED_VALUE', dateTimeRenderOption: 'FORMATTED_STRING'
  });
  const rawResp = Sheets.Spreadsheets.Values.batchGet(spreadsheetId, {
    ranges, valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER'
  });

  const blob = { sheetOrder: sheetNames, sheets: {} };

  sheetMetas.forEach((sMeta, idx) => {
    const name = sMeta.properties.title;
    const dispRows = (dispResp.valueRanges[idx] && dispResp.valueRanges[idx].values) || [];
    const rawRows  = (rawResp.valueRanges[idx]  && rawResp.valueRanges[idx].values)  || [];
    const merges   = sMeta.merges || [];

    const lastRow = Math.max(dispRows.length, rawRows.length);
    let lastCol = 0;
    dispRows.forEach(r => { if (r.length > lastCol) lastCol = r.length; });
    rawRows .forEach(r => { if (r.length > lastCol) lastCol = r.length; });

    const display = padGrid_(dispRows, lastRow, lastCol, '');
    const values  = reconstructTypedValues_(rawRows, dispRows, lastRow, lastCol);

    const mergeIdx = new Map();
    merges.forEach(m => {
      const sr = m.startRowIndex, sc = m.startColumnIndex;
      const er = m.endRowIndex,   ec = m.endColumnIndex;
      const srcKey = sr * 100000 + sc;
      for (let r = sr; r < er; r++) {
        for (let c = sc; c < ec; c++) {
          if (r === sr && c === sc) continue;
          mergeIdx.set(r * 100000 + c, srcKey);
        }
      }
    });

    blob.sheets[name] = {
      name, empty: lastRow === 0 || lastCol === 0,
      values, display, mergeIdx, lastRow, lastCol
    };
  });

  Logger.log('[AsstFastFetch] %s sheets hydrated in %sms', sheetNames.length, Date.now() - t0);
  return blob;
}

function padGrid_(rows, R, C, fill) {
  const out = new Array(R);
  for (let r = 0; r < R; r++) {
    const src = rows[r] || [];
    const row = new Array(C);
    for (let c = 0; c < C; c++) row[c] = (c < src.length) ? src[c] : fill;
    out[r] = row;
  }
  return out;
}

function reconstructTypedValues_(rawRows, dispRows, R, C) {
  const out = new Array(R);
  for (let r = 0; r < R; r++) {
    const rs = rawRows[r] || [], ds = dispRows[r] || [];
    const row = new Array(C);
    for (let c = 0; c < C; c++) {
      const raw  = (c < rs.length) ? rs[c] : '';
      const disp = (c < ds.length) ? ds[c] : '';
      row[c] = looksLikeDateDisplay_(disp, raw) ? serialToDate_(raw) : raw;
    }
    out[r] = row;
  }
  return out;
}

function looksLikeDateDisplay_(disp, raw) {
  if (typeof raw !== 'number') return false;
  if (typeof disp !== 'string' || disp === '') return false;
  const t = disp.trim();
  const cleanNum = t.replace(/,/g, '');
  if (/^-?\d+(\.\d+)?$/.test(cleanNum)) {
    const numDisp = parseFloat(cleanNum);
    if (numDisp >= 1 && numDisp <= 31) return true;
    if (numDisp === raw) return false;
  }
  if (raw < 30000 || raw > 80000) return false;
  return /\d/.test(t);
}

function serialToDate_(serial) {
  return new Date(Math.round((serial - 25569) * 86400 * 1000));
}
