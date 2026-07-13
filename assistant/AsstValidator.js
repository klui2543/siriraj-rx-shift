// =================================================================
// 🔍 AsstValidator.gs — reconciliation validator (★ จุดสำคัญ)
// -----------------------------------------------------------------
// พอร์ตแนวคิดจาก Validator_L3_Reconciliation.gs ของระบบเภสัช
// หัวใจ: ตรวจ "อิสระจาก parser" — re-index ชีทด้วยอัลกอริทึมคนละชุด (Date TYPE)
//        แล้ว cross-check → จับ parser ดริฟต์เงียบจาก hardcoded row/forward-fill
//
// 3 ชั้น:
//   1) STRUCTURAL  — group labels ตรง whitelist ไหม, stop-row "หมายเหตุ" อยู่ไหม   → error
//   2) POPULATION  — นับชื่อในกริดแบบอิสระ เทียบจำนวน record ที่ parse ได้          → error
//   3) COORDINATE  — สุ่มพิสูจน์ว่า personKey อยู่ในกลุ่ม+วันที่ที่อ้างจริง          → warning (sample ≤30)
//   + เช็คเฉพาะผู้ช่วย: IPD seq 1..24 ต่อเนื่อง, duty object ถูกชนิดตามกลุ่ม        → warning
//
// return { errors:[{code,...}], warnings:[{code,...}], stats:{} }
// =================================================================

function validateAssistant_(blob, parsed) {
  const errors = [], warnings = [], stats = {};
  const S = blob.sheets;
  const recs = parsed.records;

  // ── นับ record ที่ parse ได้ แยก source ─────────────────────────
  const parserCount = {};
  recs.forEach(r => { parserCount[r.source] = (parserCount[r.source] || 0) + 1; });

  // ── (1) STRUCTURAL ──────────────────────────────────────────────
  // clinic groups ต้องอยู่ใน whitelist
  (parsed.diag.groupsClinic || []).forEach(g => {
    if (CLINIC_GROUP_WHITELIST.indexOf(g) === -1) {
      errors.push({ code: 'STRUCT_DRIFT', sheet: 'clinic', detail: 'unknown group "' + g + '"' });
    }
  });
  const nClin = (parsed.diag.groupsClinic || []).length;
  if (S['clinic'] && nClin !== 11) {
    warnings.push({ code: 'STRUCT_GROUP_COUNT', sheet: 'clinic', found: nClin, expected: 11 });
  }
  // night: ต้องมี stop-row "หมายเหตุ" (กัน scan เลยไปโดนโน้ต)
  if (S['ผู้ช่วยกลางคืน'] && !_hasNoteStop_(S['ผู้ช่วยกลางคืน'], 5)) {
    warnings.push({ code: 'STRUCT_NO_NOTE_STOP', sheet: 'ผู้ช่วยกลางคืน', col: 'F' });
  }
  if (S['ผช.กลางวัน OK'] && !_hasNoteStop_(S['ผช.กลางวัน OK'], 1)) {
    warnings.push({ code: 'STRUCT_NO_NOTE_STOP', sheet: 'ผช.กลางวัน OK', col: 'B' });
  }

  // ── (2) POPULATION reconciliation ───────────────────────────────
  const pop = {};
  if (S['clinic'])       pop['clinic']    = _independentCount_(S['clinic'], -1);
  if (S['ผู้ช่วยกลางคืน']) pop['night']     = _independentCount_(S['ผู้ช่วยกลางคืน'], 5);
  if (S['ผช.กลางวัน OK']) pop['daytimeOK'] = _independentCount_(S['ผช.กลางวัน OK'], 1);
  Object.keys(pop).forEach(src => {
    const grid = pop[src], parsedN = parserCount[src] || 0;
    stats['pop_' + src] = { grid: grid, parser: parsedN, diff: parsedN - grid };
    if (grid !== parsedN) {
      errors.push({ code: 'POP_MISMATCH', source: src, gridCount: grid, parserCount: parsedN, diff: parsedN - grid });
    }
  });

  // ── (3) COORDINATE reconciliation (sample) ──────────────────────
  const coord = _coordinateCheck_(blob, recs, 30);
  stats.coordinate = coord.stats;
  coord.mismatches.forEach(m => warnings.push(Object.assign({ code: 'NAME_MISMATCH' }, m)));

  // ── เช็คเฉพาะผู้ช่วย ──────────────────────────────────────────────
  // IPD daytime seq 1..24 ต่อเนื่อง
  const ipdSeq = {};
  recs.forEach(r => { if (r.source === 'daytimeOK' && r.group === 'IPD' && r.seq) ipdSeq[r.seq] = 1; });
  const seqList = Object.keys(ipdSeq).map(Number).sort((a, b) => a - b);
  if (seqList.length) {
    const contiguous = seqList[0] === 1 && seqList[seqList.length - 1] === seqList.length;
    stats.ipdSeq = { min: seqList[0], max: seqList[seqList.length - 1], count: seqList.length, contiguous: contiguous };
    if (!contiguous) warnings.push({ code: 'IPD_SEQ_GAP', seqs: seqList });
  }
  // duty shape ถูกชนิดตามกลุ่ม
  let dutyBad = 0;
  recs.forEach(r => {
    if (r.source === 'daytimeOK') {
      const hasMA = r.duty && ('morning' in r.duty || 'afternoon' in r.duty);
      if ((r.group === 'IPD' || r.group === 'NM5') && !hasMA && r.duty && 'main' in r.duty) dutyBad++;
      if (r.group === '103' && hasMA) dutyBad++;
    }
  });
  if (dutyBad) warnings.push({ code: 'DUTY_SHAPE', count: dutyBad });

  stats.parserCount = parserCount;
  stats.uniqueNames = parsed.uniqueNames;
  return { errors: errors, warnings: warnings, stats: stats };
}

// ── independent name count in all date-columns (Date TYPE detection) ──
function _independentCount_(sheet, noteStopCol) {
  const h = _findDateHeader_(sheet, 15, 2);
  if (h.row === -1) return 0;
  let n = 0;
  for (let r = h.row + 1; r < sheet.lastRow; r++) {
    if (noteStopCol >= 0 && fullTrim_(_disp_(sheet, r, noteStopCol)) === 'หมายเหตุ') break;
    for (let i = 0; i < h.cols.length; i++) {
      const nm = normalizeName_(_disp_(sheet, r, h.cols[i].c));
      if (nm && nm.toLowerCase() !== 'x' && isValidPersonName_(nm)) n++;
    }
  }
  return n;
}

function _hasNoteStop_(sheet, col) {
  for (let r = 0; r < sheet.lastRow; r++) {
    if (fullTrim_(_disp_(sheet, r, col)) === 'หมายเหตุ') return true;
  }
  return false;
}

// ── coordinate: สุ่ม record มาพิสูจน์ว่าชื่ออยู่ในกริดตาม (source, group/area, date) ──
// สร้าง index อิสระ: date→cols ต่อชีท ; แล้วเช็คว่า personKey โผล่ใน date-col นั้นจริง
function _coordinateCheck_(blob, recs, sampleLimit) {
  const S = blob.sheets;
  const idxCache = {};
  function idxFor(sheetName) {
    if (idxCache[sheetName]) return idxCache[sheetName];
    const sh = S[sheetName];
    if (!sh) return null;
    const h = _findDateHeader_(sh, 15, 2);
    const tsToCol = {};
    h.cols.forEach(dc => { tsToCol[processDate_(dc.date).ts] = dc.c; });
    return (idxCache[sheetName] = { sheet: sh, tsToCol: tsToCol });
  }
  const SRC_SHEET = { clinic: 'clinic', night: 'ผู้ช่วยกลางคืน', daytimeOK: 'ผช.กลางวัน OK' };
  let resolved = 0, mismatched = 0, checked = 0;
  const mismatches = [];
  // สุ่มแบบ deterministic: ไล่ทีละ step ให้กระจายทุก source
  const step = Math.max(1, Math.floor(recs.length / 400));
  for (let i = 0; i < recs.length; i += step) {
    const rec = recs[i];
    if (rec.source === 'unit30B') continue;          // 30B ไม่มี date-col grid (day number)
    const idx = idxFor(SRC_SHEET[rec.source]);
    if (!idx) continue;
    const col = idx.tsToCol[rec.timestamp];
    if (col === undefined) { mismatched++; checked++; if (mismatches.length < sampleLimit) mismatches.push({ reason: 'DATE_NOT_FOUND', rec: _slim_(rec) }); continue; }
    // เช็คว่าชื่อโผล่ที่ date-col นี้ในแถวใดแถวหนึ่ง (set-match แบบ validator เดิม)
    checked++;
    let found = false;
    for (let r = 0; r < idx.sheet.lastRow; r++) {
      if (normalizeName_(_disp_(idx.sheet, r, col)) === rec.personKey) { found = true; break; }
    }
    if (found) resolved++;
    else { mismatched++; if (mismatches.length < sampleLimit) mismatches.push({ reason: 'NAME_NOT_AT_DATE', rec: _slim_(rec) }); }
  }
  return { stats: { checked: checked, resolved: resolved, mismatched: mismatched, sampled: mismatches.length }, mismatches: mismatches };
}
function _slim_(r) { return { source: r.source, personKey: r.personKey, group: r.group, date: r.date }; }
