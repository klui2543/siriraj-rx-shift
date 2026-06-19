// ════════════════════════════════════════════════════════════
//  Phase J-2 — Master Sweep Runner
//  Validate ทุกเดือนที่อยู่ใน Firebase /positionNotes
//  Build: vY3.34-stageJ2-sweep
// ════════════════════════════════════════════════════════════

const PHX_J_SWEEP_FB_PATH = 'positionNotes';

/**
 * Discover all months currently ingested in Firebase
 */
function _phxJSweepListMonths_() {
  try {
    var url = 'https://' + NOTE_FB_HOST_ + '/' + PHX_J_SWEEP_FB_PATH + '.json?shallow=true';
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) return [];
    var data = JSON.parse(resp.getContentText() || '{}');
    return Object.keys(data || {}).sort();
  } catch(e) { return []; }
}

/**
 * Parse 'm_<thaiMonth>_<yearBE>' → { yearBE, monthNum, pattern }
 */
function _phxJSweepParseLabel_(monthLabel) {
  var THAI = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
              'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  var m = String(monthLabel).match(/^m_(.+?)_(\d{4})$/);
  if (!m) return null;
  var idx = THAI.indexOf(m[1]);
  if (idx < 0) return null;
  var yearBE = parseInt(m[2], 10);
  var monthNum = idx + 1;
  var pattern = String(monthNum).padStart(2, '0') + '-' + String(yearBE).slice(-2);
  return { yearBE: yearBE, monthNum: monthNum, pattern: pattern };
}

/**
 * Find latest source Sheet for a month pattern
 */
function _phxJSweepFindLatestSheet_(pattern) {
  try {
    var folder = DriveApp.getFolderById(CLINIC_FOLDER_ID_);
    var query = 'title contains "เวรเภสัชกร" and title contains "' + pattern + '" ' +
                'and mimeType = "application/vnd.google-apps.spreadsheet"';
    var files = folder.searchFiles(query);
    var matched = [];
    while (files.hasNext()) {
      var f = files.next();
      matched.push({
        id: f.getId(),
        name: f.getName(),
        modified: f.getLastUpdated().getTime()
      });
    }
    if (matched.length === 0) return null;
    matched.sort(function(a, b) { return b.modified - a.modified; });
    return matched[0];
  } catch(e) { return null; }
}

/**
 * Main sweep — validates all ingested months
 */
function runMasterSweepAllMonths() {
  var startTime = Date.now();
  var months = _phxJSweepListMonths_();
  if (months.length === 0) {
    Logger.log('❌ No months found in Firebase /positionNotes');
    return { ok: false, error: 'no months in firebase' };
  }

  Logger.log('═══════════════════════════════════════════════');
  Logger.log('MASTER SWEEP — ' + months.length + ' เดือน');
  Logger.log('═══════════════════════════════════════════════');
  Logger.log('');

  var results = [];
  for (var i = 0; i < months.length; i++) {
    var monthLabel = months[i];
    Logger.log('━━━ ' + (i+1) + '/' + months.length + ' — ' + monthLabel + ' ━━━');

    var parsed = _phxJSweepParseLabel_(monthLabel);
    if (!parsed) {
      results.push({ monthLabel: monthLabel, status: 'PARSE_ERR' });
      continue;
    }

    var sheet = _phxJSweepFindLatestSheet_(parsed.pattern);
    if (!sheet) {
      results.push({ monthLabel: monthLabel, status: 'NO_SHEET', pattern: parsed.pattern });
      Logger.log('  ⚪ NO_SHEET (pattern: ' + parsed.pattern + ')');
      continue;
    }

    try {
      var v = runPositionNoteValidation(monthLabel, sheet.id);
      var status = !v.ok ? 'ERROR' : (v.approved ? (v.warnings && v.warnings.length ? 'PASS_WARN' : 'PASS') : 'FAIL');
      results.push({
        monthLabel: monthLabel,
        pattern: parsed.pattern,
        file: sheet.name,
        status: status,
        approved: v.approved,
        blockingReasons: v.blockingReasons || [],
        warnings: v.warnings || [],
        positionCount: v.checks && v.checks.schema ? v.checks.schema.positionCount : null
      });
      var icon = status === 'PASS' ? '✅' : (status === 'PASS_WARN' ? '🟡' : (status === 'FAIL' ? '❌' : '💥'));
      Logger.log('  ' + icon + ' ' + status + ' (pos=' + (v.checks && v.checks.schema ? v.checks.schema.positionCount : '?') + ')');
      if (v.blockingReasons && v.blockingReasons.length) Logger.log('     BLOCK: ' + v.blockingReasons.join(', '));
      if (v.warnings && v.warnings.length) Logger.log('     WARN:  ' + v.warnings.join(', '));
    } catch(e) {
      results.push({ monthLabel: monthLabel, status: 'EXCEPTION', error: String(e) });
      Logger.log('  💥 EXCEPTION: ' + e);
    }
  }

  var elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // Summary table
  Logger.log('');
  Logger.log('═══════════════════════════════════════════════');
  Logger.log('SUMMARY (' + elapsed + 's)');
  Logger.log('═══════════════════════════════════════════════');

  var counts = { PASS: 0, PASS_WARN: 0, FAIL: 0, ERROR: 0, EXCEPTION: 0, NO_SHEET: 0, PARSE_ERR: 0 };
  for (var i = 0; i < results.length; i++) {
    counts[results[i].status] = (counts[results[i].status] || 0) + 1;
  }

  Logger.log('');
  Logger.log('| เดือน                   | สถานะ          | pos | issues');
  Logger.log('|-------------------------|----------------|-----|----------------------------------');
  for (var i = 0; i < results.length; i++) {
    var r = results[i];
    var lbl = String(r.monthLabel).replace('m_', '').padEnd(24);
    var st = String(r.status).padEnd(14);
    var pos = (r.positionCount || '-').toString().padEnd(3);
    var issues = '';
    if (r.blockingReasons && r.blockingReasons.length) issues += 'BLOCK: ' + r.blockingReasons.join(',');
    if (r.warnings && r.warnings.length) issues += (issues ? ' | ' : '') + 'WARN: ' + r.warnings.join(',');
    if (r.error) issues += 'ERR: ' + r.error;
    Logger.log('| ' + lbl + '| ' + st + '| ' + pos + ' | ' + issues);
  }
  Logger.log('');
  Logger.log('TOTALS:');
  Logger.log('  ✅ PASS:       ' + (counts.PASS || 0));
  Logger.log('  🟡 PASS+WARN:  ' + (counts.PASS_WARN || 0));
  Logger.log('  ❌ FAIL:       ' + (counts.FAIL || 0));
  Logger.log('  💥 ERROR:      ' + ((counts.ERROR || 0) + (counts.EXCEPTION || 0)));
  Logger.log('  ⚪ NO_SHEET:   ' + (counts.NO_SHEET || 0));

  return {
    ok: true,
    elapsed: parseFloat(elapsed),
    total: results.length,
    counts: counts,
    results: results
  };
}

/**
 * Sanity check — list discrepancies between /schedules and /positionNotes
 */
function listSweepCandidates() {
  try {
    var urlS = 'https://' + NOTE_FB_HOST_ + '/schedules.json?shallow=true';
    var urlP = 'https://' + NOTE_FB_HOST_ + '/' + PHX_J_SWEEP_FB_PATH + '.json?shallow=true';
    var schedules = Object.keys(JSON.parse(UrlFetchApp.fetch(urlS, {muteHttpExceptions:true}).getContentText() || '{}'));
    var posNotes = Object.keys(JSON.parse(UrlFetchApp.fetch(urlP, {muteHttpExceptions:true}).getContentText() || '{}'));
    var inBoth = schedules.filter(function(k) { return posNotes.indexOf(k) >= 0; }).sort();
    var schedOnly = schedules.filter(function(k) { return posNotes.indexOf(k) < 0; }).sort();
    var posOnly = posNotes.filter(function(k) { return schedules.indexOf(k) < 0; }).sort();
    Logger.log('Schedule months: ' + schedules.length);
    Logger.log('PositionNote months: ' + posNotes.length);
    Logger.log('');
    Logger.log('In BOTH (validatable): ' + inBoth.length);
    inBoth.forEach(function(k) { Logger.log('  ✓ ' + k); });
    Logger.log('');
    if (schedOnly.length > 0) {
      Logger.log('Schedule ONLY (need ingest):');
      schedOnly.forEach(function(k) { Logger.log('  ⚠ ' + k); });
    }
    if (posOnly.length > 0) {
      Logger.log('PosNote ONLY (orphan):');
      posOnly.forEach(function(k) { Logger.log('  ⁉ ' + k); });
    }
  } catch(e) { Logger.log('Error: ' + e); }
}