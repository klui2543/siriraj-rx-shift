// =================================================================
// 🔍 Validator_L3_Reconciliation.gs — V3.3 (Self-contained)
// Universal: Vertical (103/NM5/IPD) + Horizontal (clinic)
// Includes readCell_ to avoid dependency issues
// =================================================================

// ─── readCell_ (canonical, integer mergeIdx key) ─────────────────
// Included here defensively so file is self-contained
function readCell_(sheet, r, c, useDisplay) {
  if (sheet.empty) return '';
  const arr = (useDisplay !== false) ? sheet.display : sheet.values;
  if (r < 0 || r >= arr.length || c < 0 || c >= (arr[0] || []).length) return '';
  const native = arr[r][c];
  if (native !== '' && native != null) return native;
  // Merge resolution: integer key = r*100000+c (must match buildMergeIndex_ in Hydration)
  const srcKey = sheet.mergeIdx.get(r * 100000 + c);
  if (srcKey != null) {
    const sr = Math.floor(srcKey / 100000);
    const sc = srcKey % 100000;
    return arr[sr][sc];
  }
  return native;
}

// ─── Constants ──────────────────────────────────────────────────
const VERTICAL_SHEETS = ['103', 'NM5', 'IPD'];
const CLINIC_KEYWORDS = ['clinic', 'คลินิก', 'คลีนิค'];
const L3_BLACKLIST = [/summary/i, /ตั้งค่า/i, /^name$/i, /ไม่\s*ok/i, /สำรอง/i, /เก่า/i];

const POS_PATTERNS_V3 = {
  '103': /^(O\d{1,2}|เสริม)$/i,
  'NM5': /^NM5-\d{1,2}$/i,
  'IPD': /^I-\d{1,2}$/i
};

// ─── Sheet classifier ─────────────────────────────────────────────
function classifySheet_(name) {
  const t = fullTrim_(name);
  if (L3_BLACKLIST.some(p => p.test(t))) return 'BLACKLIST';
  if (/^(103|NM5|IPD)\s*$/i.test(t)) return 'VERTICAL';
  if (CLINIC_KEYWORDS.some(s => t.toLowerCase() === s.toLowerCase())) return 'CLINIC';
  return 'OTHER';
}

// ─── Main entry ───────────────────────────────────────────────────
function audit03_Reconciliation(blob, extracted) {
  const r = {
    layer: 3, passed: true, errors: [], warnings: [],
    population: {}, coordinate: { mismatches: [], stats: {} }
  };

  // Build per-sheet indices
  const sheetIdx = {};
  blob.sheetOrder.forEach(name => {
    const cls = classifySheet_(name);
    const sheet = blob.sheets[name];
    if (!sheet || sheet.empty) return;
    if (cls === 'VERTICAL') sheetIdx[name] = Object.assign({ type: 'VERTICAL' }, buildVerticalIndex_(sheet));
    else if (cls === 'CLINIC') sheetIdx[name] = Object.assign({ type: 'HORIZONTAL' }, buildHorizontalIndex_(sheet));
  });

  if (Object.keys(sheetIdx).length === 0) {
    r.warnings.push({ code: 'NO_AUDITABLE_SHEETS' });
    return r;
  }

  // Split records into auditable vs orphan
  const auditableRooms = new Set(Object.keys(sheetIdx));
  const auditableRecords = [];
  const orphanRooms = new Set();
  extracted.forEach(rec => {
    if (rec.room && auditableRooms.has(rec.room)) auditableRecords.push(rec);
    else orphanRooms.add(rec.room || '(no room)');
  });
  if (orphanRooms.size > 0) {
    r.warnings.push({ code: 'ORPHAN_RECORDS_SKIPPED', rooms: Array.from(orphanRooms) });
  }

  reconcilePopulation_(blob, sheetIdx, auditableRecords, r);
  reconcileCoordinates_(blob, sheetIdx, auditableRecords, r);
  if (r.errors.length > 0 || r.coordinate.mismatches.length > 0) r.passed = false;
  return r;
}

// ─── Vertical index (103, NM5, IPD) ──────────────────────────────
// Detect date rows by Date TYPE in col B (not by "วันที่" keyword)
// Detect positions by per-sheet pattern (validated against real data)
function buildVerticalIndex_(sheet) {
  const dateToRow = new Map();
  let dataStartRow = -1, dataEndRow = -1;

  for (let r = 0; r < sheet.lastRow; r++) {
    const v = sheet.values[r][1];
    if (v instanceof Date && !isNaN(v.getTime())) {
      if (dataStartRow === -1) dataStartRow = r;
      dataEndRow = r;
      dateToRow.set(parseInt(Utilities.formatDate(v, 'GMT+7', 'yyyyMMdd'), 10), r);
    }
  }

  const posToColSlots = new Map();
  if (dataStartRow === -1) return { dateToRow, posToColSlots, dataStartRow, dataEndRow };

  const lower = sheet.name.toLowerCase();
  const pat = lower.includes('103') ? POS_PATTERNS_V3['103']
            : lower.includes('nm5') ? POS_PATTERNS_V3['NM5']
            : lower.includes('ipd') ? POS_PATTERNS_V3['IPD'] : null;
  if (!pat) return { dateToRow, posToColSlots, dataStartRow, dataEndRow };

  for (let r = 0; r < dataStartRow; r++) {
    for (let c = 2; c < sheet.lastCol; c++) {
      const norm = normalizePos_(readCell_(sheet, r, c));
      if (!norm || !pat.test(norm)) continue;
      if (!posToColSlots.has(norm)) posToColSlots.set(norm, []);
      const list = posToColSlots.get(norm);
      if (!list.some(item => item.col === c)) list.push({ col: c, headerRow: r });
    }
  }
  posToColSlots.forEach(list => list.sort((a, b) => a.col - b.col));
  return { dateToRow, posToColSlots, dataStartRow, dataEndRow };
}

// ─── Horizontal index (clinic) ───────────────────────────────────
// Detect date row by Date TYPE density (not keyword) — independent algorithm
// Detect position rows by col A structural scan (no regex)
function buildHorizontalIndex_(sheet) {
  const dateToCol = new Map();
  const posToRow = new Map();
  let dateRowIdx = -1, maxDates = 0;

  for (let r = 0; r < Math.min(20, sheet.lastRow); r++) {
    let cnt = 0;
    for (let c = 0; c < sheet.lastCol; c++) {
      const v = sheet.values[r][c];
      if (v instanceof Date && !isNaN(v.getTime())) cnt++;
    }
    if (cnt > maxDates) { maxDates = cnt; dateRowIdx = r; }
  }

  if (dateRowIdx === -1 || maxDates < 5) return { dateToCol, posToRow, dateRowIdx };

  sheet.values[dateRowIdx].forEach((v, c) => {
    if (v instanceof Date && !isNaN(v.getTime())) {
      dateToCol.set(parseInt(Utilities.formatDate(v, 'GMT+7', 'yyyyMMdd'), 10), c);
    }
  });

  for (let r = dateRowIdx + 1; r < sheet.lastRow; r++) {
    const norm = normalizePos_(readCell_(sheet, r, 0));
    if (!norm || norm === 'วัน' || norm === 'วันที่') continue;
    if (!posToRow.has(norm)) posToRow.set(norm, r);
  }

  return { dateToCol, posToRow, dateRowIdx };
}

// ─── Population reconciliation ───────────────────────────────────
function reconcilePopulation_(blob, sheetIdx, auditableRecords, r) {
  Object.keys(sheetIdx).forEach(sheetName => {
    const idx = sheetIdx[sheetName];
    const sheet = blob.sheets[sheetName];
    const cnt = (idx.type === 'VERTICAL')
      ? countVerticalNames_(sheet, idx)
      : countHorizontalNames_(sheet, idx);
    const jsonCnt = auditableRecords.filter(rec => rec.room === sheetName).length;
    r.population[sheetName] = { type: idx.type, gridCount: cnt, jsonCount: jsonCnt, diff: cnt - jsonCnt };
    if (cnt !== jsonCnt) {
      r.errors.push({ code: 'POP_MISMATCH', sheet: sheetName, gridCount: cnt, jsonCount: jsonCnt, diff: cnt - jsonCnt });
    }
  });
}

function countVerticalNames_(sheet, idx) {
  if (idx.dataStartRow < 0) return 0;
  let count = 0;
  const cols = new Set();
  idx.posToColSlots.forEach(list => list.forEach(s => cols.add(s.col)));
  cols.forEach(c => {
    idx.dateToRow.forEach(row => {
      const name = normalizeName_(readCell_(sheet, row, c));
      if (name && name.toLowerCase() !== 'x' && isValidPersonName_(name)) count++;
    });
  });
  return count;
}

function countHorizontalNames_(sheet, idx) {
  if (idx.dateRowIdx < 0) return 0;
  let count = 0;
  idx.posToRow.forEach(row => {
    idx.dateToCol.forEach(col => {
      const name = normalizeName_(readCell_(sheet, row, col));
      if (name && name.toLowerCase() !== 'x' && isValidPersonName_(name)) count++;
    });
  });
  return count;
}

// ─── Coordinate reconciliation ───────────────────────────────────
function reconcileCoordinates_(blob, sheetIdx, auditableRecords, r) {
  let resolved = 0, mismatched = 0, notFound = 0;
  const SAMPLE_LIMIT = 30;
  auditableRecords.forEach(rec => {
    const res = proveRecord_(rec, sheetIdx, blob);
    if (res.status === 'OK') resolved++;
    else if (res.status === 'NAME_MISMATCH') mismatched++;
    else notFound++;
    if (res.status !== 'OK' && r.coordinate.mismatches.length < SAMPLE_LIMIT) {
      r.coordinate.mismatches.push(Object.assign({ rec }, res));
    }
  });
  r.coordinate.stats = {
    total: auditableRecords.length,
    resolved, mismatched, notFound,
    sampledMismatches: r.coordinate.mismatches.length
  };
}

function proveRecord_(rec, sheetIdx, blob) {
  const idx = sheetIdx[rec.room];
  if (!idx) return { status: 'NAME_MISMATCH', reason: 'NO_INDEX_FOR_ROOM', room: rec.room };

  let cleanPos = rec.pos.replace(/_\(slot\d+\)$/, '');
  if (/^เสริม\s*\(/.test(cleanPos)) cleanPos = 'เสริม';

  if (idx.type === 'VERTICAL') return proveVertical_(rec, cleanPos, idx, blob.sheets[rec.room]);
  return proveHorizontal_(rec, cleanPos, idx, blob.sheets[rec.room]);
}

function proveVertical_(rec, cleanPos, idx, sheet) {
  const slotMatch = rec.pos.match(/_\(slot(\d+)\)$/);
  const explicitSlot = slotMatch ? parseInt(slotMatch[1], 10) - 1 : null;
  const cols = idx.posToColSlots.get(cleanPos);
  if (!cols) return { status: 'NAME_MISMATCH', reason: 'POS_NOT_FOUND', searchedPos: cleanPos };
  const dateRow = idx.dateToRow.get(rec.timestamp);
  if (dateRow === undefined) return { status: 'NAME_MISMATCH', reason: 'DATE_NOT_FOUND', ts: rec.timestamp };

  if (explicitSlot !== null) {
    const slot = cols[explicitSlot];
    if (!slot) return { status: 'NAME_MISMATCH', reason: 'SLOT_OUT_OF_RANGE' };
    const cellName = normalizeName_(readCell_(sheet, dateRow, slot.col));
    return cellName === rec.name
      ? { status: 'OK', at: { row: dateRow, col: slot.col } }
      : { status: 'NAME_MISMATCH', foundCellName: cellName, at: { row: dateRow, col: slot.col } };
  }

  // Set-match: name in ANY slot of this pos counts (handles merged header like I3:J3)
  const seen = [];
  for (const slot of cols) {
    const cellName = normalizeName_(readCell_(sheet, dateRow, slot.col));
    seen.push({ col: slot.col, name: cellName });
    if (cellName === rec.name) return { status: 'OK', at: { row: dateRow, col: slot.col } };
  }
  return {
    status: 'NAME_MISMATCH',
    foundCellName: seen.map(s => s.name || '(empty)').join(' / '),
    at: { row: dateRow, cols: cols.map(c => c.col) }
  };
}

function proveHorizontal_(rec, cleanPos, idx, sheet) {
  const row = idx.posToRow.get(cleanPos);
  if (row === undefined) return { status: 'NAME_MISMATCH', reason: 'POS_NOT_FOUND_IN_COL_A', searchedPos: cleanPos };
  const col = idx.dateToCol.get(rec.timestamp);
  if (col === undefined) return { status: 'NAME_MISMATCH', reason: 'DATE_NOT_FOUND_IN_HEADER', ts: rec.timestamp };
  const cellName = normalizeName_(readCell_(sheet, row, col));
  return cellName === rec.name
    ? { status: 'OK', at: { row, col } }
    : { status: 'NAME_MISMATCH', foundCellName: cellName, at: { row, col } };
}