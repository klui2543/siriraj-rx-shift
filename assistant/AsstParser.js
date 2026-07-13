// =================================================================
// 🧠 AsstParser.gs — parser ตารางเวรผู้ช่วย (หัวใจของระบบ)
// -----------------------------------------------------------------
// dispatch ตามชนิดชีท: clinic / ผู้ช่วยกลางคืน / ผช.กลางวัน OK / 30B
// หลักการ: row-position detection แบบ dynamic + forward-fill "จำค่า non-null ล่าสุด"
//          ไม่พึ่ง merged_cells เลย (ยืนยันจากข้อมูลจริง 5 เดือน)
// ตรวจสอบแล้วเทียบ Python reference: population reconciliation ตรง 100% ทุกเดือน
// record schema:
//   { source, personKey, group, subGroup, area, seq, duty, date, timestamp, timeSlot }
// =================================================================

const CLINIC_GROUP_WHITELIST = ['SM','PED','SKN','ENT','SRI','NM2','PRO','PRODUCTION','MS2','103 clinic','OP7','SCP'];
const DAYTIME_GROUP_WHITELIST = ['103','IPD','NM5'];

// ─── grid accessors (0-indexed) ─────────────────────────────────────
function _disp_(sheet, r, c) {
  if (!sheet || sheet.empty) return '';
  const a = sheet.display;
  if (r < 0 || r >= a.length || c < 0 || c >= (a[0] || []).length) return '';
  return a[r][c];
}
function _val_(sheet, r, c) {
  if (!sheet || sheet.empty) return null;
  const a = sheet.values;
  if (r < 0 || r >= a.length || c < 0 || c >= (a[0] || []).length) return null;
  return a[r][c];
}
function _isDate_(v) { return v instanceof Date && !isNaN(v.getTime()); }
function _isNum_(v) { return typeof v === 'number' && !isNaN(v); }

// หา row ที่มี Date เยอะสุด (date header) + คืน list ของ {c, date}
function _findDateHeader_(sheet, maxScan, minDates) {
  maxScan = maxScan || 15; minDates = minDates || 5;
  let bestR = -1, bestCnt = 0;
  const scan = Math.min(maxScan, sheet.lastRow);
  for (let r = 0; r < scan; r++) {
    let cnt = 0;
    for (let c = 0; c < sheet.lastCol; c++) if (_isDate_(_val_(sheet, r, c))) cnt++;
    if (cnt > bestCnt) { bestCnt = cnt; bestR = r; }
  }
  if (bestCnt < minDates) return { row: -1, cols: [] };
  const cols = [];
  for (let c = 0; c < sheet.lastCol; c++) {
    const v = _val_(sheet, bestR, c);
    if (_isDate_(v)) cols.push({ c: c, date: v });
  }
  return { row: bestR, cols: cols };
}

// ─── main entry ─────────────────────────────────────────────────────
function parseAssistantWorkbook_(blob) {
  const S = blob.sheets;
  const baseDate = _detectMonth_(blob);
  if (!baseDate) throw new Error("หาเดือนของไฟล์ไม่เจอ (ไม่มี Date ในชีท clinic/กลางคืน/กลางวัน)");
  const key = monthKeyFromDate_(baseDate);
  const label = thaiLabelFromDate_(baseDate);

  let records = [];
  const closed = {};
  const diag = { warnings: [], groupsClinic: [] };

  if (S['clinic']) {
    const r = _parseClinic_(S['clinic'], diag);
    records = records.concat(r.records);
    if (Object.keys(r.closed).length) closed['clinic'] = r.closed;
    diag.groupsClinic = r.groups;
  }
  if (S['ผู้ช่วยกลางคืน']) records = records.concat(_parseNight_(S['ผู้ช่วยกลางคืน'], diag));
  if (S['ผช.กลางวัน OK']) records = records.concat(_parseDaytime_(S['ผช.กลางวัน OK'], diag));
  if (S['30B']) records = records.concat(_parse30B_(S['30B'], baseDate, diag));

  // counts
  const counts = {};
  const names = {};
  records.forEach(rec => {
    counts[rec.source] = (counts[rec.source] || 0) + 1;
    names[rec.personKey] = 1;
  });

  return {
    key: key, label: label, records: records, closed: closed,
    dutyTemplates: {},   // duty ฝังอยู่ในแต่ละ record แล้ว (dutyTemplates สำรองไว้ต่อยอด)
    counts: counts, uniqueNames: Object.keys(names).length, diag: diag
  };
}

function _detectMonth_(blob) {
  const cand = ['clinic', 'ผู้ช่วยกลางคืน', 'ผช.กลางวัน OK'];
  for (let i = 0; i < cand.length; i++) {
    const sh = blob.sheets[cand[i]];
    if (!sh || sh.empty) continue;
    const h = _findDateHeader_(sh, 15, 2);
    if (h.cols.length) return h.cols[0].date;
  }
  return null;
}

// ─── CLINIC ─────────────────────────────────────────────────────────
function _parseClinic_(sheet, diag) {
  const records = [], closed = {};
  const h = _findDateHeader_(sheet, 15, 5);
  if (h.row === -1) { diag.warnings.push('clinic: no date header'); return { records, closed, groups: [] }; }

  // forward-fill col A → groups [{name, r0, r1}]
  const groups = [];
  let cur = null;
  for (let r = h.row + 1; r < sheet.lastRow; r++) {
    const a = normalizePos_(_disp_(sheet, r, 0));
    if (a && a !== 'วัน' && a !== 'วันที่') {
      cur = a; groups.push({ name: a, r0: r, r1: r });
    } else if (cur && groups.length) {
      groups[groups.length - 1].r1 = r;
    }
  }

  // หยุดคลินิก: scan ทั้งกลุ่มต่อ date-col
  groups.forEach(g => {
    h.cols.forEach(dc => {
      for (let r = g.r0; r <= g.r1; r++) {
        if (fullTrim_(_disp_(sheet, r, dc.c)).indexOf('หยุดคลินิก') !== -1) {
          (closed[g.name] = closed[g.name] || []).push(dc.date.getDate());
          break;
        }
      }
    });
  });

  // person records
  groups.forEach(g => {
    for (let r = g.r0; r <= g.r1; r++) {
      const seqV = _val_(sheet, r, 5);              // col F = ลำดับ
      const dutyMain = fullTrim_(_disp_(sheet, r, 6));   // col G = หน้าที่หลัก
      const dutyOther = fullTrim_(_disp_(sheet, r, 7));  // col H = หน้าที่อื่นๆ
      h.cols.forEach(dc => {
        const nm = normalizeName_(_disp_(sheet, r, dc.c));
        if (nm && nm.toLowerCase() !== 'x' && isValidPersonName_(nm)) {
          const pd = processDate_(dc.date);
          const duty = {};
          if (dutyMain) duty.main = dutyMain;
          if (dutyOther) duty.other = dutyOther;
          records.push({
            source: 'clinic', personKey: nm, group: g.name, subGroup: null, area: null,
            seq: _isNum_(seqV) ? Math.round(seqV) : null, duty: duty,
            date: pd.date, timestamp: pd.ts, timeSlot: null
          });
        }
      });
    }
  });

  return { records, closed, groups: groups.map(g => g.name) };
}

// ─── NIGHT (ผู้ช่วยกลางคืน) ───────────────────────────────────────────
function _parseNight_(sheet, diag) {
  const records = [];
  const h = _findDateHeader_(sheet, 15, 5);
  if (h.row === -1) { diag.warnings.push('night: no date header'); return records; }

  let curRound = null, curArea = null, curSub = null;
  for (let r = h.row + 1; r < sheet.lastRow; r++) {
    if (fullTrim_(_disp_(sheet, r, 5)) === 'หมายเหตุ') break;   // col F stop
    const a = fullTrim_(_disp_(sheet, r, 0));                   // col A รอบเวร
    if (a) curRound = a;
    const b = fullTrim_(_disp_(sheet, r, 1));                   // col B พื้นที่ (103/SUP/IPD/NM5)
    if (b) { curArea = b; }
    const seqV = _val_(sheet, r, 2);                            // col C ลำดับ
    const dcol = fullTrim_(_disp_(sheet, r, 3));                // col D ยา/อุปกรณ์ (IPD)
    if (dcol.indexOf('อุปกรณ์') !== -1) curSub = 'อุปกรณ์';
    else if (dcol.indexOf('ยา') !== -1) curSub = 'ยา';
    const dutyMain = fullTrim_(_disp_(sheet, r, 5));            // col F หน้าที่
    if (!curRound) continue;

    h.cols.forEach(dc => {
      const nm = normalizeName_(_disp_(sheet, r, dc.c));
      if (nm && nm.toLowerCase() !== 'x' && isValidPersonName_(nm)) {
        const pd = processDate_(dc.date);
        records.push({
          source: 'night', personKey: nm, group: curRound,
          area: curArea, subGroup: (curArea === 'IPD' ? curSub : null),
          seq: _isNum_(seqV) ? Math.round(seqV) : null,
          duty: dutyMain ? { main: dutyMain } : {},
          date: pd.date, timestamp: pd.ts, timeSlot: curRound
        });
      }
    });
  }
  return records;
}

// ─── DAYTIME OK (ผช.กลางวัน OK) ──────────────────────────────────────
function _parseDaytime_(sheet, diag) {
  const records = [];
  const h = _findDateHeader_(sheet, 15, 2);
  if (h.row === -1) { diag.warnings.push('daytimeOK: no date header'); return records; }

  let curGroup = null, curSub = null;
  for (let r = h.row + 1; r < sheet.lastRow; r++) {
    const bRaw = _val_(sheet, r, 1);                            // col B (seq / "หมายเหตุ")
    if (fullTrim_(_disp_(sheet, r, 1)) === 'หมายเหตุ') break;    // stop
    const a = fullTrim_(_disp_(sheet, r, 0));                   // col A group label
    if (a) {
      const ga = a.replace('.0', '');
      if (ga === '103' || ga === 'IPD' || ga === 'NM5') { curGroup = ga; curSub = null; }
    }
    const c3 = fullTrim_(_disp_(sheet, r, 2));                  // col C ยา/อุปกรณ์ (IPD)
    if (curGroup === 'IPD') {
      if (c3.indexOf('อุปกรณ์') !== -1) curSub = 'อุปกรณ์';
      else if (c3.indexOf('ยา') !== -1) curSub = 'ยา';
    }
    if (!_isNum_(bRaw)) continue;                               // data row = col B numeric
    const seq = Math.round(bRaw);
    let duty;
    if (curGroup === 'IPD' || curGroup === 'NM5') {
      duty = { morning: fullTrim_(_disp_(sheet, r, 4)), afternoon: fullTrim_(_disp_(sheet, r, 5)) };
    } else {
      duty = { main: fullTrim_(_disp_(sheet, r, 4)) };
    }
    h.cols.forEach(dc => {
      const nm = normalizeName_(_disp_(sheet, r, dc.c));
      if (nm && nm.toLowerCase() !== 'x' && isValidPersonName_(nm)) {
        const pd = processDate_(dc.date);
        records.push({
          source: 'daytimeOK', personKey: nm, group: curGroup,
          subGroup: (curGroup === 'IPD' ? curSub : null), area: null, seq: seq, duty: duty,
          date: pd.date, timestamp: pd.ts, timeSlot: 'กลางวัน'
        });
      }
    });
  }
  return records;
}

// ─── 30B ─────────────────────────────────────────────────────────────
function _parse30B_(sheet, baseDate, diag) {
  const records = [];
  // header row มี "วัน" ที่ col A
  let hr = -1;
  for (let r = 0; r < Math.min(12, sheet.lastRow); r++) {
    if (fullTrim_(_disp_(sheet, r, 0)) === 'วัน') { hr = r; break; }
  }
  if (hr === -1) { diag.warnings.push('30B: no header'); return records; }
  const slots = [
    { col: 2, label: (fullTrim_(_disp_(sheet, hr + 1, 2)) || '7.00-8.30') },
    { col: 3, label: (fullTrim_(_disp_(sheet, hr + 1, 3)) || '16.30-18.00') }
  ];
  const y = baseDate.getFullYear(), m = baseDate.getMonth();
  for (let r = hr + 2; r < sheet.lastRow; r++) {
    const dayV = _val_(sheet, r, 1);        // col B = วันที่ (เลขวัน)
    if (!_isNum_(dayV)) continue;
    const d = new Date(y, m, Math.round(dayV));
    const pd = processDate_(d);
    slots.forEach(s => {
      const nm = normalizeName_(_disp_(sheet, r, s.col));
      if (nm && nm.toLowerCase() !== 'x' && isValidPersonName_(nm)) {
        records.push({
          source: 'unit30B', personKey: nm, group: '30B', subGroup: null, area: null, seq: null,
          duty: {}, date: pd.date, timestamp: pd.ts,
          timeSlot: s.label.replace(/\s+/g, '').replace(/น\./g, '')
        });
      }
    });
  }
  return records;
}
