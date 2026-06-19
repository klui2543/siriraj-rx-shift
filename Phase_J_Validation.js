/**
 * ============================================================
 *  Phase J Validation Layer (J-2)
 * ============================================================
 *  5 checks on /positionNotes/{monthLabel}:
 *    1. Schema integrity         [BLOCK]
 *    2. Round-trip hash equality [BLOCK]
 *    3. Source-text preservation [BLOCK]
 *    4. Position coverage        [WARN]
 *    5. Cross-ref schedule data  [WARN]
 *
 *  Writes /positionNotesValidation/{monthLabel}
 *  Frontend phxGetPositionNotes gates on `approved` flag.
 *
 *  Build: vY3.34-stageJ2v1
 * ============================================================
 */

var PHX_J_VALIDATION_PATH = 'positionNotesValidation';
var PHX_J_VALIDATOR_VERSION = 'J-2.v1';

// ⚠️ TODO: Klui will provide exact expected lists later — using best guess for now
var PHX_J_EXPECTED_IPD_RANGE = { min: 1, max: 22 };       // I-1 to I-22
var PHX_J_EXPECTED_NM5_RANGE = { min: 1, max: 24 };       // NM5-1 to NM5-24
var PHX_J_EXPECTED_103_HAS_DATA = ['O1','O2','O3','O7','O8'];
var PHX_J_103_NO_DATA_ALLOWLIST = ['O4','O5','O6','O9','O10','O11','เสริม'];
var PHX_J_CROSSREF_SKIP_PREFIXES = ['SM'];  // clinic codes — different sheet


// ─── Check 1: Schema integrity (BLOCK) ──────────────────────

function _phxJV_Check1Schema_(positions) {
  var errors = [];
  var sideOK = { 'IPD': 1, 'NM5': 1, '103': 1 };
  var codeRe = {
    'IPD': /^I-\d+$/,
    'NM5': /^NM5-\d+$/,
    '103': /^(O\d+|เสริม)$/
  };
  if (!positions || typeof positions !== 'object') {
    return { passed: false, errors: ['positions_not_object'] };
  }
  Object.keys(positions).forEach(function(code) {
    var p = positions[code];
    if (!p || typeof p !== 'object') { errors.push('not_object:' + code); return; }
    if (typeof p.side !== 'string' || !sideOK[p.side]) {
      errors.push('invalid_side:' + code + '=' + JSON.stringify(p.side)); return;
    }
    if (typeof p.code !== 'string' || !p.code) { errors.push('missing_code:' + code); return; }
    if (p.code !== code) errors.push('code_key_mismatch:' + code + '!==' + p.code);
    var re = codeRe[p.side];
    if (re && !re.test(p.code)) {
      errors.push('code_format_invalid:' + code + ' (side=' + p.side + ')');
    }
    if (p.break !== undefined && typeof p.break !== 'string') errors.push('break_not_string:' + code);
    if (p.duties !== undefined && typeof p.duties !== 'string') errors.push('duties_not_string:' + code);
  });
  return { passed: errors.length === 0, errors: errors };
}


// ─── Check 2: Round-trip hash equality (BLOCK) ──────────────

function _phxJV_Check2RoundTrip_(positions, expectedHash) {
  if (!expectedHash) return { passed: false, errors: ['no_expected_hash'] };
  var computed = _sha256Hex_(_phxJStableStringify_(positions));
  return {
    passed: computed === expectedHash,
    expectedHash: expectedHash,
    computedHash: computed,
    errors: computed === expectedHash ? [] : ['hash_drift']
  };
}


// ─── Check 3: Source-text preservation (BLOCK) ──────────────
// Verify duties + break text from positions appears verbatim in source Excel sheets

function _phxJV_Check3SourceText_(positions, ss) {
  var errors = [];
  if (!ss) return { passed: false, errors: ['no_source_spreadsheet'] };

  function gatherSheetText(sheetName) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return null;
    var values = sheet.getDataRange().getValues();
    var parts = [];
    for (var r = 0; r < values.length; r++) {
      for (var c = 0; c < values[r].length; c++) {
        var v = values[r][c];
        if (v !== null && v !== undefined && v !== '') parts.push(String(v));
      }
    }
    return parts.join('\n');
  }
  function normalize(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

  var ipdNm5Raw = gatherSheetText(PHX_J_SHEET_NAME);  // 'หน้าที่ NM5-IPD up 4-67'
  var raw103 = gatherSheetText('103');
  var src = {
    'IPD': normalize(ipdNm5Raw),
    'NM5': normalize(ipdNm5Raw),
    '103': normalize(raw103)
  };

  Object.keys(positions).forEach(function(code) {
    var p = positions[code];
    if (!p || !p.side || !src[p.side]) {
      errors.push('source_missing:' + code + ' (side=' + (p && p.side) + ')');
      return;
    }
    if (p.break && p.break.trim()) {
      var nb = normalize(p.break);
      if (src[p.side].indexOf(nb) < 0) {
        errors.push('break_drift:' + code + ' "' + p.break.substring(0, 30) + '"');
      }
    }
    if (p.duties && p.duties.trim()) {
      var lines = p.duties.split('\n').map(function(l) { return l.trim(); })
                                       .filter(function(l) { return l.length > 3; });
      lines.forEach(function(line) {
        var nl = normalize(line);
        if (src[p.side].indexOf(nl) < 0) {
          errors.push('duties_drift:' + code + ' "' + line.substring(0, 40) + '..."');
        }
      });
    }
  });
  return { passed: errors.length === 0, errors: errors };
}


// ─── Check 4: Position coverage (WARN) ──────────────────────

function _phxJV_Check4Coverage_(positions) {
  var warns = [];
  var present = { 'IPD': {}, 'NM5': {}, '103': {} };
  Object.keys(positions).forEach(function(code) {
    var p = positions[code];
    if (p && present[p.side]) present[p.side][code] = true;
  });
  for (var i = PHX_J_EXPECTED_IPD_RANGE.min; i <= PHX_J_EXPECTED_IPD_RANGE.max; i++) {
    var ci = 'I-' + i;
    if (!present.IPD[ci]) warns.push('missing:IPD:' + ci);
  }
  for (var j = PHX_J_EXPECTED_NM5_RANGE.min; j <= PHX_J_EXPECTED_NM5_RANGE.max; j++) {
    var cj = 'NM5-' + j;
    if (!present.NM5[cj]) warns.push('missing:NM5:' + cj);
  }
  PHX_J_EXPECTED_103_HAS_DATA.forEach(function(c) {
    if (!present['103'][c]) warns.push('missing:103:' + c);
  });
  return { passed: warns.length === 0, warns: warns };
}


// ─── Check 5: Cross-ref with schedule (WARN) ────────────────

function _phxJV_Check5CrossRef_(positions, monthLabel) {
  var warns = [];
  var url = 'https://' + NOTE_FB_HOST_ + '/schedules/' + encodeURIComponent(monthLabel) + '.json';
  var resp;
  try { resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true }); }
  catch (e) { return { passed: true, warns: ['fetch_error'], skipped: true }; }
  if (resp.getResponseCode() !== 200) {
    return { passed: true, warns: ['schedule_unavailable'], skipped: true };
  }
  var body = resp.getContentText();
  if (!body || body === 'null') return { passed: true, warns: ['schedule_empty'], skipped: true };
  var schedData;
  try { schedData = JSON.parse(body); }
  catch (e) { return { passed: true, warns: ['schedule_parse_error'], skipped: true }; }
  var items = (schedData && schedData.data) || [];
  if (!items.length) return { passed: true, warns: [], skipped: true };

  var allow = {};
  PHX_J_103_NO_DATA_ALLOWLIST.forEach(function(c) { allow[c] = true; });

  var orphans = {};
  items.forEach(function(it) {
    if (!it || !it.pos) return;
    if (it.room === 'clinic') return;
    var clean = String(it.pos)
      .replace(/\s*\([^)]+\)\s*$/, '')   // strip " (room)" suffix
      .replace(/[\*\$L]+$/, '')          // strip markers (*, $, L)
      .trim();
    if (!clean) return;
    for (var sp = 0; sp < PHX_J_CROSSREF_SKIP_PREFIXES.length; sp++) {
      if (clean.indexOf(PHX_J_CROSSREF_SKIP_PREFIXES[sp]) === 0) return;
    }
    if (positions[clean]) return;
    if (allow[clean]) return;
    orphans[clean] = (orphans[clean] || 0) + 1;
  });
  var orphanList = Object.keys(orphans);
  orphanList.forEach(function(c) { warns.push('orphan:' + c + ' (×' + orphans[c] + ')'); });
  return { passed: orphanList.length === 0, warns: warns, orphans: orphanList };
}


// ─── Master validator ──────────────────────────────────────

function runPositionNoteValidation(monthLabel, spreadsheetId) {
  if (!monthLabel) return { ok: false, error: 'missing_monthLabel' };

  var pnUrl = 'https://' + NOTE_FB_HOST_ + '/' + PHX_J_FB_PATH + '/' + encodeURIComponent(monthLabel) + '.json';
  var pnResp = UrlFetchApp.fetch(pnUrl, { muteHttpExceptions: true });
  if (pnResp.getResponseCode() !== 200) return { ok: false, error: 'pn_fetch_failed' };
  var pnBody = pnResp.getContentText();
  if (!pnBody || pnBody === 'null') return { ok: false, error: 'pn_not_found' };
  var pnData;
  try { pnData = JSON.parse(pnBody); }
  catch (e) { return { ok: false, error: 'pn_parse_failed' }; }
  var positions = pnData.positions || {};
  var expectedHash = pnData.hash;

  var ss = null;
  if (spreadsheetId) {
    try { ss = SpreadsheetApp.openById(spreadsheetId); }
    catch (e) { /* Check 3 records no_source */ }
  }

  var c1 = _phxJV_Check1Schema_(positions);
  var c2 = _phxJV_Check2RoundTrip_(positions, expectedHash);
  var c3 = _phxJV_Check3SourceText_(positions, ss);
  var c4 = _phxJV_Check4Coverage_(positions);
  var c5 = _phxJV_Check5CrossRef_(positions, monthLabel);

  var blockingReasons = [];
  if (!c1.passed) blockingReasons.push('check1_schema');
  if (!c2.passed) blockingReasons.push('check2_roundtrip');
  if (!c3.passed) blockingReasons.push('check3_source_text');
  var warnings = [];
  if (!c4.passed) warnings.push('check4_coverage');
  if (!c5.passed) warnings.push('check5_crossref');
  var approved = blockingReasons.length === 0;

  var result = {
    validatorVersion: PHX_J_VALIDATOR_VERSION,
    monthLabel: monthLabel,
    validatedAt: new Date().toISOString(),
    blobHash: expectedHash,
    approved: approved,
    blockingReasons: blockingReasons,
    warnings: warnings,
    checks: {
      schema: c1, roundtripHash: c2, sourceText: c3, coverage: c4, crossRef: c5
    }
  };

  var wUrl = 'https://' + NOTE_FB_HOST_ + '/' + PHX_J_VALIDATION_PATH + '/' + encodeURIComponent(monthLabel) + '.json';
  var wResp = UrlFetchApp.fetch(wUrl, {
    method: 'put', contentType: 'application/json',
    payload: JSON.stringify(result), muteHttpExceptions: true
  });
  if (wResp.getResponseCode() < 200 || wResp.getResponseCode() >= 300) {
    return { ok: false, error: 'validation_write_failed', status: wResp.getResponseCode() };
  }
  return { ok: true, approved: approved, blockingReasons: blockingReasons, warnings: warnings };
}


// ─── Bridge: source Excel download ─────────────────────────

function phxGetSourceExcelUrl(monthLabel, token) {
  try { guardCheck_(token); } catch (e) { return { ok: false, error: 'auth_failed' }; }
  if (!monthLabel) return { ok: false, error: 'invalid_monthLabel' };

  var THAI_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                     'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  var m = String(monthLabel).match(/^m_(.+?)_(\d{4})$/);
  if (!m) return { ok: false, error: 'monthLabel_parse_failed' };
  var monthIdx = THAI_MONTHS.indexOf(m[1]);
  if (monthIdx < 0) return { ok: false, error: 'unknown_month_name' };
  var yearBE = parseInt(m[2], 10);
  var pattern = String(monthIdx + 1).padStart(2, '0') + '-' + String(yearBE).slice(-2);  // '06-69'

  try {
    var folder = DriveApp.getFolderById(CLINIC_FOLDER_ID_);
    // Match: name contains "เวรเภสัชกร" AND contains "MM-YY", mimeType = spreadsheet
    var query = 'title contains "เวรเภสัชกร" and title contains "' + pattern + '" ' +
                'and mimeType = "application/vnd.google-apps.spreadsheet"';
    var files = folder.searchFiles(query);
    var matched = [];
    while (files.hasNext()) {
      var f = files.next();
      matched.push({
        id: f.getId(),
        name: f.getName(),
        modified: f.getLastUpdated().toISOString()
      });
    }
    if (matched.length === 0) return { ok: false, error: 'file_not_found', pattern: pattern };
    matched.sort(function(a, b) { return b.modified.localeCompare(a.modified); });  // latest first
    var pick = matched[0];
    var fileId = pick.id;
    return {
      ok: true,
      monthLabel: monthLabel,
      fileId: fileId,
      fileName: pick.name,
      modifiedAt: pick.modified,
      viewUrl:     'https://docs.google.com/spreadsheets/d/' + fileId + '/view',
      downloadUrl: 'https://docs.google.com/spreadsheets/d/' + fileId + '/export?format=xlsx',
      totalVersions: matched.length
    };
  } catch (e) {
    return { ok: false, error: 'drive_error', detail: String(e) };
  }
}

// ─── Manual test ───────────────────────────────────────────

function testValidatePhaseJ() {
  var monthLabel = 'm_มิถุนายน_2569';
  var folderResolve = _resolveLatestClinicFile_(CLINIC_FOLDER_ID_);
  if (!folderResolve.ok) { Logger.log('❌ resolve: ' + folderResolve.error); return; }
  var opened = _openAsSpreadsheet_(folderResolve.file);
  if (!opened.ok) { Logger.log('❌ open: ' + opened.error); return; }
  var ssId = opened.tempId || folderResolve.id;

  try {
    var r = runPositionNoteValidation(monthLabel, ssId);
    Logger.log('=== Phase J Validation FULL RESULT ===');
    Logger.log(JSON.stringify(r, null, 2));
  } finally { opened.cleanup(); }
}

function testCheck5Detail() {
  var monthLabel = 'm_มิถุนายน_2569';
  var url = 'https://' + NOTE_FB_HOST_ + '/' + PHX_J_FB_PATH + '/' + encodeURIComponent(monthLabel) + '.json';
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  var data = JSON.parse(resp.getContentText());
  var c5 = _phxJV_Check5CrossRef_(data.positions || {}, monthLabel);
  Logger.log('=== Check 5 CrossRef detail ===');
  Logger.log(JSON.stringify(c5, null, 2));
}

function testGetSourceExcelUrl() {
  var r = phxGetSourceExcelUrl('m_มิถุนายน_2569', 'INTERNAL_BOT_AUTO_SYNC');
  Logger.log('=== phxGetSourceExcelUrl result ===');
  Logger.log(JSON.stringify(r, null, 2));
}

function testListSourceFolder() {
  var folder = DriveApp.getFolderById(CLINIC_FOLDER_ID_);
  var files = folder.getFiles();
  Logger.log('=== Files in CLINIC_FOLDER (' + CLINIC_FOLDER_ID_ + ') ===');
  var count = 0;
  while (files.hasNext() && count < 30) {
    var f = files.next();
    Logger.log((count+1) + '. ' + f.getName() + '  (mimeType: ' + f.getMimeType() + ', modified: ' + f.getLastUpdated().toISOString() + ')');
    count++;
  }
  Logger.log('Total scanned: ' + count);
}

function testForceValidationFail() {
  var monthLabel = 'm_มิถุนายน_2569';
  var url = 'https://' + NOTE_FB_HOST_ + '/' + PHX_J_VALIDATION_PATH + '/' + encodeURIComponent(monthLabel) + '.json';
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  var data = JSON.parse(resp.getContentText());
  data.approved = false;
  data.blockingReasons = ['check1_schema', 'check3_source_text'];
  UrlFetchApp.fetch(url, {
    method: 'put', contentType: 'application/json',
    payload: JSON.stringify(data), muteHttpExceptions: true
  });
  Logger.log('✅ Forced approved=false for testing');
}

function testRestoreValidation() {
  var folderResolve = _resolveLatestClinicFile_(CLINIC_FOLDER_ID_);
  if (!folderResolve.ok) { Logger.log('❌'); return; }
  var opened = _openAsSpreadsheet_(folderResolve.file);
  if (!opened.ok) { Logger.log('❌'); return; }
  try {
    var r = runPositionNoteValidation('m_มิถุนายน_2569', opened.tempId || folderResolve.id);
    Logger.log('✅ Restored, approved=' + r.approved);
  } finally { opened.cleanup(); }
}