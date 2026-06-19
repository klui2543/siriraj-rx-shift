// =================================================================
// 🚀 FastFetch.gs — ดึงข้อมูลตารางเวร 4 ห้องยาด้วย Sheets API (< 2 วินาที)
// =================================================================

function hydrateBlobFast_(spreadsheetId) {
  const t0 = Date.now();

  // (1) ดึงโครงสร้าง Meta และจุดที่เป็นเซลล์ผสาน (Merges) มาก่อน
  const meta = Sheets.Spreadsheets.get(spreadsheetId, {
    fields: 'sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)),merges)'
  });
  const sheetMetas = meta.sheets || [];
  const sheetNames = sheetMetas.map(s => s.properties.title);
  const ranges = sheetNames.map(n => `'${n.replace(/'/g, "''")}'`);

  // (2) ดึงข้อมูลตัวหนังสือ (Display) และข้อมูลดิบ (Raw) มาพร้อมกันในรอบเดียว
  const dispResp = Sheets.Spreadsheets.Values.batchGet(spreadsheetId, {
    ranges, valueRenderOption: 'FORMATTED_VALUE', dateTimeRenderOption: 'FORMATTED_STRING'
  });
  const rawResp = Sheets.Spreadsheets.Values.batchGet(spreadsheetId, {
    ranges, valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER'
  });

  // (3) แพ็กข้อมูลให้อยู่ในรูปทรง Blob แบบที่ Validator V3.3 ตัวเดิมต้องการ
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

    // สร้างดัชนีเซฟพิกัดเซลล์ผสาน (Merge Index)
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

  Logger.log('[FastFetch] %s sheets hydrated in %sms', sheetNames.length, Date.now() - t0);
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

// 🎯 อัปเดตใหม่: ตรวจจับวันที่ทุกรูปแบบ (แก้บั๊กข้อมูล 0 Records)
function looksLikeDateDisplay_(disp, raw) {
  if (typeof raw !== 'number') return false;
  if (typeof disp !== 'string' || disp === '') return false;
  
  const t = disp.trim();
  const cleanNum = t.replace(/,/g, '');
  
  // 1. ดักจับตัวเลขล้วนก่อนเป็นอันดับแรก
  if (/^-?\d+(\.\d+)?$/.test(cleanNum)) {
    const numDisp = parseFloat(cleanNum);
    
    // 🎯 ปลดล็อก: ถ้าหน้าตาเป็นเลข 1 - 31 ให้ถือว่าเป็นวันที่ทันที! (รอดจากการถูกโยนทิ้งแล้ว)
    if (numDisp >= 1 && numDisp <= 31) return true;
    
    // ถ้าตัวเลขหน้าตาเหมือน Serial ดิบๆ เลย แปลว่าไม่ใช่การจัดฟอร์แมตวันที่
    if (numDisp === raw) return false;
  }

  // 2. ค่อยมากรอง Serial วันที่แปลกๆ ทิ้ง (ช่วงปี 1982 - 2119)
  if (raw < 30000 || raw > 80000) return false;
  
  // 3. ถ้าเป็นวันที่แบบผสมตัวอักษร (เช่น 16/05 หรือ 16 พ.ค.)
  return /\d/.test(t);
}

function serialToDate_(serial) {
  // วันที่ 0 ของ Excel คือ 30 Dec 1899 (ซึ่งต่างจาก JS 25569 วัน)
  return new Date(Math.round((serial - 25569) * 86400 * 1000));
}