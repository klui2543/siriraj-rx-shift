/**
 * ============================================================
 *  Phase J — Per-Position Notes (Hospital Duty Reference)
 * ============================================================
 *  Single-tier ingest from "หน้าที่ NM5-IPD up 4-67" sheet.
 *  Maps pos code → { side, break, duties } for popup display.
 *
 *  Firebase path: /positionNotes/{monthLabel}
 *  Build: vY3.34-stageJ1v1
 * ============================================================
 */

var PHX_J_SHEET_NAME = 'หน้าที่ NM5-IPD up 4-67';
var PHX_J_FB_PATH = 'positionNotes';
var PHX_J_PARSER_VERSION = 'J-1.v1';

// Whitelist of expected sheet names (for J-2 unusual sheet detection)
var PHX_J_CORE_SHEETS = [
  'clinic', 'IPD', 'NM5', '103',
  'หน้าที่ NM5-IPD up 4-67',
  'หน้าที่เวร รพ. up 19.8.64เก่า',
  'clinic -ไม่OK',
  'หน้าที่เภสัชใหม่ up 14.8.63'
];


// ─── Pos code extractor ─────────────────────────────────────

function _phxJExtractPosCode_(raw) {
  if (!raw) return null;
  // Match I-N or NM5-N at start (handles "I-1 / (กลางวัน)", "I-10ย้ายไป / NM5 / ทั้งวัน")
  var m = String(raw).match(/^(I-\d+|NM5-\d+)/);
  return m ? m[1] : null;
}


// ─── Parser ─────────────────────────────────────────────────

function _phxJParsePositionRows_(rows) {
  var positions = {};
  var curIpd = null;
  var curNm5 = null;

  // Skip first 2 rows (title + column headers)
  for (var r = 2; r < rows.length; r++) {
    var row = rows[r] || [];

    // IPD side (cols 0, 1, 2)
    var ipdRaw = String(row[0] || '').trim();
    var ipdCode = _phxJExtractPosCode_(ipdRaw);
    var ipdDuty = String(row[2] || '').trim();

    if (ipdCode) {
      curIpd = ipdCode;
      positions[ipdCode] = {
        side: 'IPD',
        code: ipdCode,
        rawHeader: ipdRaw,
        break: String(row[1] || '').trim(),
        duties: ipdDuty
      };
    } else if (curIpd && ipdDuty) {
      var cur = positions[curIpd];
      if (cur) cur.duties = cur.duties ? cur.duties + '\n' + ipdDuty : ipdDuty;
    }

    // NM5 side (cols 3, 4, 5)
    var nm5Raw = String(row[3] || '').trim();
    var nm5Code = _phxJExtractPosCode_(nm5Raw);
    var nm5Duty = String(row[5] || '').trim();

    if (nm5Code) {
      curNm5 = nm5Code;
      positions[nm5Code] = {
        side: 'NM5',
        code: nm5Code,
        rawHeader: nm5Raw,
        break: String(row[4] || '').trim(),
        duties: nm5Duty
      };
    } else if (curNm5 && nm5Duty) {
      var cur2 = positions[curNm5];
      if (cur2) cur2.duties = cur2.duties ? cur2.duties + '\n' + nm5Duty : nm5Duty;
    }
  }

  return positions;
}


// ─── Extract from spreadsheet ───────────────────────────────

function _phxJExtractFromSpreadsheet_(ss) {
  var sheet = ss.getSheetByName(PHX_J_SHEET_NAME);
  if (!sheet) return { ok: false, error: 'sheet_not_found', sheetName: PHX_J_SHEET_NAME };

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 3 || lastCol < 6) {
    return { ok: false, error: 'sheet_too_small', rows: lastRow, cols: lastCol };
  }

  var values = sheet.getRange(1, 1, lastRow, Math.min(lastCol, 6)).getValues();
  var positions = _phxJParsePositionRows_(values);
  var ipdNm5Count = Object.keys(positions).length;

  // 🆕 Phase J B1: Also ingest 103 sheet (merge into same positions dict)
  var meta103 = { found: false, added: 0 };
  try {
    var sh103 = ss.getSheetByName('103');
    if (sh103) {
      meta103.found = true;
      var lastRow103 = sh103.getLastRow();
      var lastCol103 = sh103.getLastColumn();
      if (lastRow103 > 0 && lastCol103 >= 5) {
        var values103 = sh103.getRange(1, 1, lastRow103, Math.min(lastCol103, 5)).getValues();
        var pos103 = _phxJParse103Sheet_(values103);
        Object.keys(pos103).forEach(function(k) {
          positions[k] = pos103[k];
          meta103.added++;
        });
      }
    }
    console.log('[Phase J/103] ' + (meta103.found ? meta103.added + ' positions added' : 'sheet "103" not found'));
  } catch(_e103) {
    console.warn('[Phase J/103] parse error (non-fatal): ' + _e103.message);
    meta103.error = _e103.message;
  }

  return {
    ok: true,
    positions: positions,
    meta: {
      sheetName: PHX_J_SHEET_NAME,
      lastRow: lastRow,
      lastCol: lastCol,
      positionCount: Object.keys(positions).length,
      ipdNm5Count: ipdNm5Count,
      meta103: meta103
    }
  };
}


// ─── Firebase write ─────────────────────────────────────────

function _phxJWriteToFirebase_(monthLabel, payload) {
  var url = 'https://' + NOTE_FB_HOST_ + '/' + PHX_J_FB_PATH + '/' + encodeURIComponent(monthLabel) + '.json';
  var resp = UrlFetchApp.fetch(url, {
    method: 'put',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var code = resp.getResponseCode();
  return {
    ok: code >= 200 && code < 300,
    status: code,
    body: resp.getContentText().slice(0, 300)
  };
}

// ─── 103 Sheet Parser ──────────────────────────────────────
// Parses note table at "103" sheet row ~35+:
//   col3='ตำแหน่ง' | col4='เวลาพัก' | col5='หน้าที่'
//
// Normalizations:
//   - Pos codes "O-1".."O-8" → "O1".."O8" (strip dash)
//   - Continuation row starting with " - " → strip prefix, append to O1's duties
//   - Skip rows containing "เภสัชกรผลัดกันพักกลางวัน"

function _phxJParse103Sheet_(rows) {
  var positions = {};
  var headerIdx = -1;

  // Find header row (col3='ตำแหน่ง', col4 contains 'เวลาพัก', col5 contains 'หน้าที่')
  for (var r = 0; r < rows.length; r++) {
    var h3 = String(rows[r][2] || '').trim();
    var h4 = String(rows[r][3] || '').trim();
    var h5 = String(rows[r][4] || '').trim();
    if (h3 === 'ตำแหน่ง' && h4.indexOf('เวลาพัก') >= 0 && h5.indexOf('หน้าที่') >= 0) {
      headerIdx = r;
      break;
    }
  }
  if (headerIdx < 0) {
    console.warn('[Phase J/103] header row not found — skip');
    return positions;
  }

  var IGNORE_KEYWORDS = ['เภสัชกรผลัดกันพักกลางวัน'];
  var DASH_PREFIX_RE = /^\s*-\s+/;
  var POS_CODE_RE = /^O-?(\d+)$/;

  for (var r2 = headerIdx + 1; r2 < rows.length; r2++) {
    var c3 = String(rows[r2][2] || '').trim();
    var c4 = String(rows[r2][3] || '').trim();
    var c5 = String(rows[r2][4] || '').trim();

    // Blank row → end of table
    if (!c3 && !c4 && !c5) break;

    // Case 1: pos code (O-N or ON) → new entry
    var posMatch = c3.match(POS_CODE_RE);
    if (posMatch) {
      var code = 'O' + posMatch[1];  // normalize → no dash
      positions[code] = {
        side: '103',
        code: code,
        rawHeader: c3,
        break: c4,
        duties: c5
      };
      continue;
    }

    // Case 2: dash-prefixed continuation → strip & assign to O1
    if (DASH_PREFIX_RE.test(c3)) {
      var stripped = c3.replace(DASH_PREFIX_RE, '').trim();
      if (positions['O1']) {
        positions['O1'].duties = positions['O1'].duties
          ? positions['O1'].duties + '\n' + stripped
          : stripped;
      } else {
        console.warn('[Phase J/103] dash row but no O1 yet: ' + stripped.substring(0, 50));
      }
      continue;
    }

    // Case 3: ignored keywords
    var ignored = false;
    for (var k = 0; k < IGNORE_KEYWORDS.length; k++) {
      if (c3.indexOf(IGNORE_KEYWORDS[k]) >= 0) { ignored = true; break; }
    }
    if (ignored) continue;

    // Case 4: unknown row — log but don't merge (safer than absorbing random text)
    console.warn('[Phase J/103] unhandled row at idx ' + r2 + ': ' + c3.substring(0, 80));
  }

  return positions;
}


// ─── Stable JSON serialization (for hash integrity across Firebase round-trip) ───
// Firebase RTDB reorders object keys alphabetically on return → use deterministic
// sort-then-serialize on both write and read so hashes match regardless of key order

function _phxJStableStringify_(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return '[' + obj.map(_phxJStableStringify_).join(',') + ']';
  }
  var keys = Object.keys(obj).sort();
  return '{' + keys.map(function(k) {
    return JSON.stringify(k) + ':' + _phxJStableStringify_(obj[k]);
  }).join(',') + '}';
}


// ─── Ingest pipeline ────────────────────────────────────────

function ingestPositionNotes(spreadsheetId, monthLabel) {
  if (!spreadsheetId) return { ok: false, stage: 'input', error: 'missing_spreadsheetId' };
  if (!monthLabel) return { ok: false, stage: 'input', error: 'missing_monthLabel' };

  var ss;
  try { ss = SpreadsheetApp.openById(spreadsheetId); }
  catch (e) { return { ok: false, stage: 'open', error: 'open_failed', detail: String(e) }; }

  var extracted = _phxJExtractFromSpreadsheet_(ss);
  if (!extracted.ok) {
    return { ok: false, stage: 'extract', error: extracted.error, meta: extracted };
  }

  var positionsJson = _phxJStableStringify_(extracted.positions);
  var hash = _sha256Hex_(positionsJson);

  var payload = {
    positions: extracted.positions,
    hash: hash,
    monthLabel: monthLabel,
    parserVersion: PHX_J_PARSER_VERSION,
    capturedAt: new Date().toISOString(),
    capturedBy: (Session.getActiveUser().getEmail() || 'system'),
    meta: extracted.meta
  };

  var write = _phxJWriteToFirebase_(monthLabel, payload);
  if (!write.ok) {
    return { ok: false, stage: 'write', error: 'firebase_write_failed', detail: write };
  }

  return {
    ok: true,
    monthLabel: monthLabel,
    positionCount: extracted.meta.positionCount,
    hash: hash,
    capturedAt: payload.capturedAt
  };
}


// ─── Unusual sheet detection ────────────────────────────────

function detectUnusualSheets_(spreadsheetId) {
  var ss;
  try { ss = SpreadsheetApp.openById(spreadsheetId); }
  catch (e) { return { ok: false, error: 'open_failed', detail: String(e) }; }

  var allSheets = ss.getSheets().map(function(s) { return s.getName(); });
  var coreSet = {};
  PHX_J_CORE_SHEETS.forEach(function(n) { coreSet[n] = true; });

  var unusual = allSheets.filter(function(n) { return !coreSet[n]; });

  return {
    ok: true,
    allSheets: allSheets,
    unusualSheets: unusual,
    hasUnusual: unusual.length > 0
  };
}


// ─── Pipeline orchestrator (called from uploadLocalFile) ───

function runPositionNoteIngestPipeline(spreadsheetId, monthLabel) {
  var t0 = Date.now();
  var stages = {};

  // J-1: Per-position notes ingest
  var notes = ingestPositionNotes(spreadsheetId, monthLabel);
  stages.positionNotes = {
    ok: notes.ok,
    error: notes.error || null,
    positionCount: notes.positionCount || 0
  };

  // 🆕 Patch ZZ6: structure change alert (LINE) — non-blocking
  if (notes.ok && notes.positionCount > 0) {
    try {
      stages.structureAlert = _phxJCheckStructureChange_(monthLabel, notes.positionCount);
    } catch(eZZ6) {
      stages.structureAlert = { ok: false, error: 'exception: ' + String(eZZ6) };
    }
  }

  // J-2: Auto-validation (block if checks 1+2+3 fail)
  var validation = null;
  if (notes.ok) {
    try { validation = runPositionNoteValidation(monthLabel, spreadsheetId); }
    catch(eV) { validation = { ok: false, error: 'exception:' + String(eV) }; }
  }
  stages.validation = {
    ok: !!(validation && validation.ok),
    approved: !!(validation && validation.approved),
    blockingReasons: (validation && validation.blockingReasons) || [],
    warnings: (validation && validation.warnings) || []
  };

  // J-3: Unusual sheet detection
  var unusual = detectUnusualSheets_(spreadsheetId);
  stages.unusualSheets = {
    ok: unusual.ok,
    sheets: unusual.unusualSheets || [],
    hasUnusual: !!unusual.hasUnusual
  };

  return {
    ok: stages.positionNotes.ok,
    stages: stages,
    durationMs: Date.now() - t0
  };
}


// ─── Bridge API for frontend ────────────────────────────────

function phxGetPositionNotes(monthLabel, token) {
  try { guardCheck_(token); } catch (e) {
    return { ok: false, error: 'auth_failed', detail: String(e) };
  }
  if (!monthLabel) return { ok: false, error: 'invalid_monthLabel' };

  // J-2: Check validation gate
  var validation = null;
  try {
    var vUrl = 'https://' + NOTE_FB_HOST_ + '/' + PHX_J_VALIDATION_PATH + '/' + encodeURIComponent(monthLabel) + '.json';
    var vResp = UrlFetchApp.fetch(vUrl, { muteHttpExceptions: true });
    if (vResp.getResponseCode() === 200) {
      var vBody = vResp.getContentText();
      if (vBody && vBody !== 'null') validation = JSON.parse(vBody);
    }
  } catch(eV) { /* no validation data → fall through (legacy data) */ }

  if (validation && validation.approved === false) {
    return {
      ok: false, error: 'validation_failed',
      blockingReasons: validation.blockingReasons || [],
      warnings: validation.warnings || [],
      validatedAt: validation.validatedAt
    };
  }

  var url = 'https://' + NOTE_FB_HOST_ + '/' + PHX_J_FB_PATH + '/' + encodeURIComponent(monthLabel) + '.json';
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) {
    return { ok: false, error: 'fetch_failed', status: resp.getResponseCode() };
  }
  var body = resp.getContentText();
  if (!body || body === 'null') return { ok: false, error: 'not_found', monthLabel: monthLabel };

  var data;
  try { data = JSON.parse(body); }
  catch (e) { return { ok: false, error: 'invalid_json' }; }

  // Verify integrity — use stable serializer (Firebase reorders keys on return)
  var computed = _sha256Hex_(_phxJStableStringify_(data.positions || {}));
  if (computed !== data.hash) {
    return { ok: false, error: 'hash_mismatch', storedHash: data.hash, computedHash: computed };
  }

  return {
    ok: true,
    monthLabel: data.monthLabel,
    positions: data.positions,
    positionCount: Object.keys(data.positions || {}).length,
    capturedAt: data.capturedAt,
    parserVersion: data.parserVersion
  };
}

// ─── Patch ZZ6: Structure change alert (positionCount > 10% MoM) ───

var PHX_J_ALERT_THRESHOLD_PCT = 10;
var THAI_MONTHS_J6 = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                      'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

function _phxJPrevMonthLabel_(currentLabel) {
  var m = String(currentLabel || '').match(/^m_(.+?)_(\d{4})$/);
  if (!m) return null;
  var idx = THAI_MONTHS_J6.indexOf(m[1]);
  var beYear = parseInt(m[2], 10);
  if (idx < 0 || isNaN(beYear)) return null;
  var prevIdx = idx === 0 ? 11 : idx - 1;
  var prevYear = idx === 0 ? beYear - 1 : beYear;
  return 'm_' + THAI_MONTHS_J6[prevIdx] + '_' + prevYear;
}

function _phxJGetPrevMonthCount_(currentLabel) {
  var prevLabel = _phxJPrevMonthLabel_(currentLabel);
  if (!prevLabel) return null;
  try {
    var url = 'https://' + NOTE_FB_HOST_ + '/' + PHX_J_FB_PATH + '/' + encodeURIComponent(prevLabel) + '.json';
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) return null;
    var body = resp.getContentText();
    if (!body || body === 'null') return null;
    var data = JSON.parse(body);
    var positions = data.positions || {};
    return { count: Object.keys(positions).length, label: prevLabel };
  } catch(e) {
    Logger.log('[Phase J/ZZ6] prev fetch failed: ' + e);
    return null;
  }
}

function _phxJSendStructureAlert_(monthLabel, prevCount, curCount, diffPct, prevLabel) {
  var displayCur = String(monthLabel || '').replace(/^m_/, '').replace(/_/g, ' ');
  var displayPrev = String(prevLabel || '').replace(/^m_/, '').replace(/_/g, ' ');
  var changeNum = curCount - prevCount;
  var sign = changeNum >= 0 ? '+' : '';
  var title = '⚠️ Phase J Structure Alert';
  var body =
    'เดือน: ' + displayCur + '\n' +
    'จำนวนตำแหน่ง: ' + curCount + ' (เดือนก่อน ' + displayPrev + ' = ' + prevCount + ')\n' +
    'เปลี่ยน: ' + sign + changeNum + ' (' + sign + diffPct + '%)\n\n' +
    'เกินเกณฑ์ ' + PHX_J_ALERT_THRESHOLD_PCT + '% — โปรดตรวจสอบ source sheet:\n' +
    '• อาจมี pos code ใหม่ที่ parser ยังไม่รู้จัก (เช่น J-N, P-N)\n' +
    '• หรือมีการเปลี่ยนโครงสร้าง column';
  try {
    if (typeof phxLineSendBroadcastToGroups !== 'function') {
      Logger.log('[Phase J/ZZ6] LINE helper missing — alert not sent');
      return { ok: false, error: 'line_helper_missing' };
    }
    var result = phxLineSendBroadcastToGroups(title, body);
    Logger.log('[Phase J/ZZ6] LINE alert sent: ' + result.sent + '/' + result.total);
    return { ok: true, sent: result.sent, total: result.total };
  } catch(e) {
    Logger.log('[Phase J/ZZ6] alert send failed: ' + e);
    return { ok: false, error: String(e) };
  }
}

function _phxJCheckStructureChange_(monthLabel, curCount) {
  if (!curCount || curCount <= 0) return { skipped: true, reason: 'no_current_count' };
  var prev = _phxJGetPrevMonthCount_(monthLabel);
  if (!prev || prev.count <= 0) {
    Logger.log('[Phase J/ZZ6] no prev count — skip alert (first month?)');
    return { skipped: true, reason: 'no_prev_count' };
  }
  var diff = Math.abs(curCount - prev.count);
  var diffPct = (diff / prev.count) * 100;
  if (diffPct <= PHX_J_ALERT_THRESHOLD_PCT) {
    Logger.log('[Phase J/ZZ6] within range: ' + diffPct.toFixed(1) + '% (cur=' + curCount + ', prev=' + prev.count + ')');
    return { triggered: false, prevCount: prev.count, curCount: curCount, diffPct: diffPct };
  }
  Logger.log('[Phase J/ZZ6] ⚠️ threshold exceeded: ' + diffPct.toFixed(1) + '%');
  var alertResult = _phxJSendStructureAlert_(monthLabel, prev.count, curCount, diffPct.toFixed(1), prev.label);
  return { triggered: true, prevCount: prev.count, curCount: curCount, diffPct: diffPct, alert: alertResult };
}

function testStructureAlert() {
  var result = _phxJCheckStructureChange_('m_มิถุนายน_2569', 60);
  Logger.log(JSON.stringify(result, null, 2));
}

// ─── Manual tests ───────────────────────────────────────────

function testIngestPositionNotes() {
  var folderResolve = _resolveLatestClinicFile_(CLINIC_FOLDER_ID_);
  if (!folderResolve.ok) { Logger.log('❌ resolve: ' + folderResolve.error); return; }

  var opened = _openAsSpreadsheet_(folderResolve.file);
  if (!opened.ok) { Logger.log('❌ open: ' + opened.error); return; }
  var ssId = opened.tempId || folderResolve.id;

  try {
    var result = ingestPositionNotes(ssId, 'm_มิถุนายน_2569');
    Logger.log('=== ingest result ===');
    Logger.log(JSON.stringify(result, null, 2));
  } finally { opened.cleanup(); }
}

function testReadPositionNotes() {
  var result = phxGetPositionNotes('m_มิถุนายน_2569', 'INTERNAL_BOT_AUTO_SYNC');
  Logger.log('=== read ===');
  Logger.log('ok: ' + result.ok);
  if (!result.ok) { Logger.log('error: ' + result.error); return; }
  Logger.log('positionCount: ' + result.positionCount);
  Logger.log('--- 5 positions แรก ---');
  var codes = Object.keys(result.positions).slice(0, 5);
  codes.forEach(function(c) {
    var p = result.positions[c];
    Logger.log(c + ' (' + p.side + ')');
    Logger.log('  break: ' + p.break);
    Logger.log('  duties: ' + (p.duties || '').substring(0, 100));
  });
}

// ─── J-2: Push broadcast when unusual sheets detected ──────

function _phxJPushUnusualBroadcast_(monthLabel, unusualSheets) {
  if (!unusualSheets || unusualSheets.length === 0) return { ok: false, error: 'no_unusual' };

  try {
    // Schedule sheet ID — same as main system (per userMemories)
    var SCHEDULE_SS_ID = '1V1Fo4rEadSYfqLDc1sZEE-fRtZ4Je5_30_EAclO3KHM';
    var ss = SpreadsheetApp.openById(SCHEDULE_SS_ID);
    var sh = ss.getSheetByName('PHX_Broadcasts');
    if (!sh) return { ok: false, error: 'broadcasts_sheet_missing' };

    var id = 'bcast_unusual_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    var now = new Date().toISOString();
    var expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    var title = '📋 พบ sheet พิเศษในไฟล์เดือน ' + monthLabel;
    var body = 'มี sheet: ' + unusualSheets.join(', ') +
               '\n\nกรุณาตรวจสอบไฟล์ต้นฉบับเพื่อความถูกต้อง';

    // PHX_Broadcasts 12 cols: id/title/body/createdAt/createdBy/expiresAt/
    //                         emailSent/emailSentCount/readBy/status/lineSent/lineSentCount
    sh.appendRow([
      id, title, body, now, 'system',
      expiresAt, false, 0, '', 'active', false, 0
    ]);
    Logger.log('[Phase J] Broadcast pushed: ' + id);
    return { ok: true, id: id };
  } catch (e) {
    Logger.log('[Phase J] Broadcast push failed: ' + e);
    return { ok: false, error: String(e) };
  }
}


// ─── Manual test broadcast ──────────────────────────────────

function testPushUnusualBroadcast() {
  var result = _phxJPushUnusualBroadcast_(
    'm_เมษายน_2569',
    ['เปลี่ยนเวลาวันหยุดพิเศษ']
  );
  Logger.log(JSON.stringify(result, null, 2));
}

function testDetectUnusualSheets() {
  var folderResolve = _resolveLatestClinicFile_(CLINIC_FOLDER_ID_);
  if (!folderResolve.ok) { Logger.log('❌ resolve fail'); return; }

  var opened = _openAsSpreadsheet_(folderResolve.file);
  if (!opened.ok) { Logger.log('❌ open fail'); return; }
  var ssId = opened.tempId || folderResolve.id;

  try {
    var result = detectUnusualSheets_(ssId);
    Logger.log('=== unusual sheets ===');
    Logger.log('all: ' + result.allSheets.join(', '));
    Logger.log('unusual: ' + (result.unusualSheets.length === 0 ? '(none)' : result.unusualSheets.join(', ')));
  } finally { opened.cleanup(); }
}

function testRead103Only() {
  var result = phxGetPositionNotes('m_มิถุนายน_2569', 'INTERNAL_BOT_AUTO_SYNC');
  if (!result.ok) { Logger.log('err: ' + result.error); return; }
  Logger.log('=== 103 positions only ===');
  ['O1','O2','O3','O7','O8'].forEach(function(c) {
    var p = result.positions[c];
    if (!p) { Logger.log(c + ': NOT FOUND ❌'); return; }
    Logger.log('--- ' + c + ' (side=' + p.side + ') ---');
    Logger.log('  rawHeader: ' + p.rawHeader);
    Logger.log('  break: "' + (p.break || '(empty)') + '"');
    Logger.log('  duties: "' + (p.duties || '(empty)') + '"');
  });
}