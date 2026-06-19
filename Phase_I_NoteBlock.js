/**
 * ============================================================
 *  Phase I — Clinic Note Block System (merged file)
 * ============================================================
 *  Single file containing Tier 0 (BLOB) + Tier 1 (HYDRATED).
 *  Tier 2 (Validator) coming in Phase I-3.
 *
 *  Sections:
 *    1. Tier 0 BLOB         — extract from Drive → Firebase /scheduleNotes/
 *    2. Tier 1 HYDRATED     — parse blob → Firebase /scheduleNotesParsed/
 *
 *  Prerequisite — Firebase Rules:
 *    {
 *      "rules": {
 *        "schedules":            { ".read": true, ".write": true },
 *        "scheduleNotes":        { ".read": true, ".write": true },
 *        "scheduleNotesParsed":  { ".read": true, ".write": true }
 *      }
 *    }
 *
 *  Prerequisite — Drive API service enabled (already on per Code.gs use).
 *
 *  Build: vY3.34-stageI1v3 + I2v1
 * ============================================================
 */
// ─── Constants ───────────────────────────────────────────────

var CLINIC_FOLDER_ID_ = '1zTvCcqGLOfF_DnhLX7kTyl6E24WgIoNz';

var NOTE_ANCHORS_ = [
  'ห้องยาเปิดทำการ',
  'เวลาเริ่มปฏิบัติงาน',
  'ตำแหน่งที่มี **'
];
var NOTE_SHEET_CANDIDATES_ = ['clinic', 'Clinic', 'CLINIC'];
var NOTE_BLOCK_MAX_GAP_ = 1;

var NOTE_FB_HOST_ = 'siriraj-rx-shift-default-rtdb.asia-southeast1.firebasedatabase.app';
var NOTE_FB_PATH_ = 'scheduleNotes';
var NOTE_PARSER_VERSION_ = 'I-1.v2';


// ─── Drive resolver ──────────────────────────────────────────

/**
 * Find the latest (by lastUpdated) xlsx or Sheet in the folder.
 */
function _resolveLatestClinicFile_(folderId) {
  folderId = folderId || CLINIC_FOLDER_ID_;
  var folder;
  try {
    folder = DriveApp.getFolderById(folderId);
  } catch (e) {
    return { ok: false, error: 'folder_open_failed', detail: String(e) };
  }

  var files = folder.getFiles();
  var latest = null;
  var scanned = 0;
  while (files.hasNext()) {
    var f = files.next();
    var mime = f.getMimeType();
    if (mime !== MimeType.MICROSOFT_EXCEL &&
        mime !== MimeType.GOOGLE_SHEETS) continue;
    scanned++;
    if (!latest || f.getLastUpdated().getTime() > latest.getLastUpdated().getTime()) {
      latest = f;
    }
  }

  if (!latest) {
    return { ok: false, error: 'no_files_in_folder', filesScanned: scanned };
  }

  return {
    ok: true,
    file: latest,
    name: latest.getName(),
    id: latest.getId(),
    mime: latest.getMimeType(),
    lastUpdated: latest.getLastUpdated().toISOString()
  };
}

/**
 * Open a Drive file as a Spreadsheet. If it's .xlsx, convert
 * to a temp Google Sheet, hand back a cleanup() callback.
 */
function _openAsSpreadsheet_(file) {
  var mime = file.getMimeType();

  if (mime === MimeType.GOOGLE_SHEETS) {
    return {
      ok: true,
      ss: SpreadsheetApp.openById(file.getId()),
      tempId: null,
      cleanup: function() {}
    };
  }

  if (mime !== MimeType.MICROSOFT_EXCEL) {
    return { ok: false, error: 'unsupported_mime', mime: mime };
  }

  // xlsx → need Drive Advanced Service
  if (typeof Drive === 'undefined' || !Drive.Files) {
    return {
      ok: false,
      error: 'drive_advanced_service_not_enabled',
      hint: 'In Apps Script editor: Services → + Add a service → Drive API'
    };
  }

  var tempName = 'phx_note_extract_' + Date.now();
  var converted = null;
  var lastErr = null;

  // Try v3 syntax first (current default)
  try {
    converted = Drive.Files.create(
      { name: tempName, mimeType: MimeType.GOOGLE_SHEETS },
      file.getBlob()
    );
  } catch (e3) {
    lastErr = e3;
    // Try v2 syntax (legacy)
    try {
      converted = Drive.Files.insert(
        { title: tempName, mimeType: MimeType.GOOGLE_SHEETS },
        file.getBlob()
      );
    } catch (e2) {
      return {
        ok: false,
        error: 'xlsx_conversion_failed',
        detail: 'v3: ' + String(e3) + ' | v2: ' + String(e2)
      };
    }
  }

  var convertedId = converted.id;
  var ss;
  try {
    ss = SpreadsheetApp.openById(convertedId);
  } catch (eOpen) {
    try { DriveApp.getFileById(convertedId).setTrashed(true); } catch (_) {}
    return { ok: false, error: 'open_after_convert_failed', detail: String(eOpen) };
  }

  return {
    ok: true,
    ss: ss,
    tempId: convertedId,
    cleanup: function() {
      try { DriveApp.getFileById(convertedId).setTrashed(true); } catch (_) {}
    }
  };
}


// ─── Tier 0 core extraction (from open Spreadsheet) ──────────

function _extractFromSpreadsheet_(ss) {
  var sheet = _findClinicSheet_(ss);
  if (!sheet) return { ok: false, error: 'no_clinic_sheet' };

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) {
    return { ok: false, error: 'sheet_empty', sheetName: sheet.getName() };
  }

  var all = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var anchor = _locateAnchor_(all);
  if (!anchor) {
    return {
      ok: false,
      error: 'no_anchor_found',
      sheetName: sheet.getName(),
      anchorsTried: NOTE_ANCHORS_.slice()
    };
  }

  var lines = [];
  var consecutiveEmpty = 0;
  var endRow = anchor.row;
  for (var r = anchor.row; r < all.length; r++) {
    var v = all[r][anchor.col];
    var s = (v === null || v === undefined) ? '' : String(v);
    if (s.trim() === '') {
      consecutiveEmpty++;
      if (consecutiveEmpty > NOTE_BLOCK_MAX_GAP_) break;
      lines.push('');
    } else {
      consecutiveEmpty = 0;
      lines.push(s);
      endRow = r;
    }
  }

  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }

  if (lines.length === 0) {
    return { ok: false, error: 'empty_block_after_anchor' };
  }

  var rawText = lines.join('\n');
  return {
    ok: true,
    rawText: rawText,
    sourceMeta: {
      sheetName: sheet.getName(),
      column: anchor.col + 1,
      columnLetter: _colToLetter_(anchor.col + 1),
      startRow: anchor.row + 1,
      endRow: endRow + 1,
      anchorKeyword: anchor.keyword,
      lineCount: lines.length,
      byteLength: Utilities.newBlob(rawText).getBytes().length
    }
  };
}

function _findClinicSheet_(ss) {
  for (var i = 0; i < NOTE_SHEET_CANDIDATES_.length; i++) {
    var s = ss.getSheetByName(NOTE_SHEET_CANDIDATES_[i]);
    if (s) return s;
  }
  // Fallback: scan all sheets, top 10 rows × all cols for anchor
  var sheets = ss.getSheets();
  for (var j = 0; j < sheets.length; j++) {
    var sh = sheets[j];
    var maxR = Math.min(10, sh.getLastRow());
    var maxC = sh.getLastColumn();
    if (maxR < 1 || maxC < 1) continue;
    var range = sh.getRange(1, 1, maxR, maxC).getValues();
    for (var r = 0; r < range.length; r++) {
      for (var c = 0; c < range[r].length; c++) {
        var v = range[r][c];
        if (typeof v !== 'string' || !v) continue;
        for (var a = 0; a < NOTE_ANCHORS_.length; a++) {
          if (v.indexOf(NOTE_ANCHORS_[a]) !== -1) return sh;
        }
      }
    }
  }
  return null;
}

function _locateAnchor_(all) {
  for (var r = 0; r < all.length; r++) {
    for (var c = 0; c < all[r].length; c++) {
      var v = all[r][c];
      if (typeof v !== 'string' || !v) continue;
      for (var i = 0; i < NOTE_ANCHORS_.length; i++) {
        if (v.indexOf(NOTE_ANCHORS_[i]) !== -1) {
          return { row: r, col: c, keyword: NOTE_ANCHORS_[i] };
        }
      }
    }
  }
  return null;
}

function _colToLetter_(col) {
  var letter = '';
  while (col > 0) {
    var mod = (col - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    col = Math.floor((col - 1) / 26);
  }
  return letter;
}


// ─── Tier 0 orchestrator ─────────────────────────────────────

/**
 * Full extraction: folder → latest file → open (convert if xlsx)
 * → extract block → cleanup temp.
 */
function extractClinicNoteBlock_(folderId) {
  var res = _resolveLatestClinicFile_(folderId);
  if (!res.ok) return res;

  var opened = _openAsSpreadsheet_(res.file);
  if (!opened.ok) return opened;

  try {
    var result = _extractFromSpreadsheet_(opened.ss);
    if (result.ok) {
      result.sourceMeta.sourceFile = {
        id: res.id,
        name: res.name,
        mime: res.mime,
        lastUpdated: res.lastUpdated
      };
    }
    return result;
  } finally {
    opened.cleanup();
  }
}


// ─── Hash ────────────────────────────────────────────────────

function _sha256Hex_(str) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    str,
    Utilities.Charset.UTF_8
  );
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
    hex += (b < 16 ? '0' : '') + b.toString(16);
  }
  return hex;
}


// ─── Firebase write ──────────────────────────────────────────

function _writeNoteBlobToFirebase_(monthLabel, payload) {
  // Match existing pushToFirebase_ pattern in Code.gs — no auth, direct PUT
  var FIREBASE_DB_URL = 'https://' + NOTE_FB_HOST_;
  var url = FIREBASE_DB_URL + '/' + NOTE_FB_PATH_ + '/' + encodeURIComponent(monthLabel) + '.json';

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
    body: resp.getContentText().slice(0, 300),
    url: url
  };
}


// ─── Pipeline entry ──────────────────────────────────────────

function ingestNoteBlock(folderId, monthLabel) {
  if (!monthLabel) return { ok: false, stage: 'input', error: 'missing_monthLabel' };

  var extracted = extractClinicNoteBlock_(folderId);
  if (!extracted.ok) {
    return { ok: false, stage: 'extract', error: extracted.error, meta: extracted };
  }

  var hash = _sha256Hex_(extracted.rawText);

  var payload = {
    rawText: extracted.rawText,
    hash: hash,
    source: extracted.sourceMeta,
    capturedAt: new Date().toISOString(),
    capturedBy: (Session.getActiveUser().getEmail() || 'system'),
    monthLabel: monthLabel,
    parserVersion: NOTE_PARSER_VERSION_
  };

  var write = _writeNoteBlobToFirebase_(monthLabel, payload);
  if (!write.ok) {
    return { ok: false, stage: 'write', error: 'firebase_write_failed', detail: write };
  }

  return {
    ok: true,
    monthLabel: monthLabel,
    hash: hash,
    lineCount: extracted.sourceMeta.lineCount,
    byteLength: extracted.sourceMeta.byteLength,
    source: extracted.sourceMeta,
    capturedAt: payload.capturedAt
  };
}


// ─── Public read API ─────────────────────────────────────────

function phxGetNoteBlob(monthLabel, token) {
  try { guardCheck_(token); } catch (e) {
    return { ok: false, error: 'auth_failed', detail: String(e) };
  }

  if (!monthLabel || typeof monthLabel !== 'string') {
    return { ok: false, error: 'invalid_monthLabel' };
  }

  var safeLabel = encodeURIComponent(monthLabel);
  var url = 'https://' + NOTE_FB_HOST_ + '/' + NOTE_FB_PATH_ + '/' + safeLabel + '.json';

  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) {
    return { ok: false, error: 'fetch_failed', status: resp.getResponseCode() };
  }

  var body = resp.getContentText();
  if (!body || body === 'null') {
    return { ok: false, error: 'not_found', monthLabel: monthLabel };
  }

  var data;
  try { data = JSON.parse(body); } catch (e) {
    return { ok: false, error: 'invalid_json' };
  }

  var computed = _sha256Hex_(data.rawText || '');
  if (computed !== data.hash) {
    return {
      ok: false,
      error: 'hash_mismatch',
      storedHash: data.hash,
      computedHash: computed
    };
  }

  return {
    ok: true,
    rawText: data.rawText,
    hash: data.hash,
    source: data.source,
    capturedAt: data.capturedAt,
    monthLabel: data.monthLabel,
    parserVersion: data.parserVersion
  };
}


// ─── Diagnostic & manual tests ───────────────────────────────

/**
 * Diagnostic — list all .xlsx/Sheet files in the folder.
 * Confirms the folder is reachable and shows what's there.
 */
function diagListFilesInFolder() {
  Logger.log('=== Files in folder ' + CLINIC_FOLDER_ID_ + ' ===');
  try {
    var folder = DriveApp.getFolderById(CLINIC_FOLDER_ID_);
    var files = folder.getFiles();
    var i = 0;
    while (files.hasNext()) {
      i++;
      var f = files.next();
      Logger.log(i + '. "' + f.getName() + '"');
      Logger.log('   mime: ' + f.getMimeType());
      Logger.log('   updated: ' + f.getLastUpdated().toISOString());
      Logger.log('   id: ' + f.getId());
    }
    Logger.log('=== ' + i + ' total files ===');
  } catch (e) {
    Logger.log('ERROR: ' + e);
  }
}

function testExtractCurrentMonth() {
  var result = extractClinicNoteBlock_(CLINIC_FOLDER_ID_);
  Logger.log('=== extraction result ===');
  Logger.log('ok: ' + result.ok);
  if (!result.ok) {
    Logger.log('error: ' + result.error);
    if (result.hint) Logger.log('hint: ' + result.hint);
    if (result.detail) Logger.log('detail: ' + result.detail);
    return result;
  }
  Logger.log('source: ' + JSON.stringify(result.sourceMeta, null, 2));
  Logger.log('--- rawText (first 500 chars) ---');
  Logger.log(result.rawText.substring(0, 500));
  Logger.log('--- total: ' + result.rawText.length + ' chars, ' + result.sourceMeta.lineCount + ' lines ---');
  return result;
}

function testIngestCurrentMonth() {
  var MONTH_LABEL = 'm_มิถุนายน_2569';   // adjust per current month
  var result = ingestNoteBlock(CLINIC_FOLDER_ID_, MONTH_LABEL);
  Logger.log('=== ingest result ===');
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function testReadBackCurrentMonth() {
  var MONTH_LABEL = 'm_มิถุนายน_2569';
  var TOKEN       = 'INTERNAL_BOT_AUTO_SYNC';

  var result = phxGetNoteBlob(MONTH_LABEL, TOKEN);
  Logger.log('=== read-back result ===');
  Logger.log('ok: ' + result.ok);
  if (!result.ok) {
    Logger.log('error: ' + result.error);
    return result;
  }
  Logger.log('hash: ' + result.hash);
  Logger.log('source: ' + JSON.stringify(result.source));
  Logger.log('lineCount: ' + result.rawText.split('\n').length);
  Logger.log('--- first 300 chars ---');
  Logger.log(result.rawText.substring(0, 300));
  return result;
}


// ════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════
//   PHASE I-2 — Tier 1 HYDRATED PARSER
// ════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════

// ─── Constants ───────────────────────────────────────────────

var NOTE_FB_PARSED_PATH_ = 'scheduleNotesParsed';
var NOTE_HYDRATED_VERSION_ = 'I-2.v1';

// H1 anchors with category mapping for popup tabs
// category: 'weekday' | 'weekend' | 'misc'
var NOTE_H1_PATTERNS_ = [
  { regex: /^วันจันทร์\s*ถึง\s*ศุกร์/,         category: 'weekday' },
  { regex: /^วันเสาร์และอาทิตย์/,              category: 'weekend' },
  { regex: /^เวลาปฏิบัติงานอื่นๆ\s*$/,         category: 'misc'    },
  { regex: /^ช่วยห้องยาอื่น/,                  category: 'misc'    },
  { regex: /^อื่น\s*ๆ\s*$/,                    category: 'misc'    },
  { regex: /^เพิ่มเติมหน้าที่หัวหน้าเวร/,       category: 'misc'    }
];

// H2 sub-section anchors (within H1)
var NOTE_H2_PATTERNS_ = [
  /^เวลาเริ่มปฏิบัติงาน/,
  /^เวลาเลิกปฏิบัติงาน/
];


// ─── Tier 1 parser ───────────────────────────────────────────

/**
 * Parse raw block text into flat items array.
 * Order is preserved — frontend renders items in array order.
 *
 * Item shape:
 *   { id, type, text, level, category, number? }
 *
 * type values:
 *   'h1'        — section heading (วันจันทร์ ถึง ศุกร์ ...)
 *   'h2'        — sub-section heading (เวลาเริ่มปฏิบัติงาน ...)
 *   'bullet'    — è-marker line (turned into ●)
 *   'numbered'  — "1.  ตำแหน่ง..." (carries 'number' field)
 *   'dash'      — " - ตำแหน่ง..."
 *   'text'      — plain paragraph / mini-heading
 *   'blank'     — preserved blank line (rare, for round-trip)
 */
function parseNoteStructure_(rawText) {
  if (!rawText || typeof rawText !== 'string') return [];

  var lines = rawText.split('\n');
  var items = [];
  var idCounter = 0;
  var currentCategory = null;

  function nextId() { return ++idCounter; }

  for (var i = 0; i < lines.length; i++) {
    var raw = lines[i];
    var trimmed = raw.trim();

    if (!trimmed) {
      items.push({ id: nextId(), type: 'blank', text: '', level: 0, category: currentCategory });
      continue;
    }

    // H1 detection (sets currentCategory for subsequent items)
    var h1Hit = null;
    for (var j = 0; j < NOTE_H1_PATTERNS_.length; j++) {
      if (NOTE_H1_PATTERNS_[j].regex.test(trimmed)) {
        h1Hit = NOTE_H1_PATTERNS_[j];
        break;
      }
    }
    if (h1Hit) {
      currentCategory = h1Hit.category;
      items.push({
        id: nextId(), type: 'h1', text: trimmed,
        level: 0, category: currentCategory
      });
      continue;
    }

    // H2 detection
    var isH2 = false;
    for (var k = 0; k < NOTE_H2_PATTERNS_.length; k++) {
      if (NOTE_H2_PATTERNS_[k].test(trimmed)) { isH2 = true; break; }
    }
    if (isH2) {
      items.push({
        id: nextId(), type: 'h2', text: trimmed,
        level: 1, category: currentCategory
      });
      continue;
    }

    // Bullet `è`
    var bulletMatch = trimmed.match(/^è\s*(.+)/);
    if (bulletMatch) {
      items.push({
        id: nextId(), type: 'bullet', text: bulletMatch[1].trim(),
        level: 2, category: currentCategory
      });
      continue;
    }

    // Numbered list "1.  text"
    var numMatch = trimmed.match(/^(\d+)\.\s*(.+)/);
    if (numMatch) {
      items.push({
        id: nextId(), type: 'numbered',
        number: parseInt(numMatch[1], 10),
        text: numMatch[2].trim(),
        level: 3, category: currentCategory
      });
      continue;
    }

    // Dash bullet " - text" or " – text"
    var dashMatch = trimmed.match(/^[-–]\s*(.+)/);
    if (dashMatch) {
      items.push({
        id: nextId(), type: 'dash', text: dashMatch[1].trim(),
        level: 2, category: currentCategory
      });
      continue;
    }

    // Plain text — heuristic: if previous item is a list item (numbered/dash/bullet),
    // this is a CONTINUATION line that wraps in source. Merge into previous item.
    //
    // EXCEPT: mini-headings like "ปฏิบัติงานเวลา HH.MM - HH.MM น." that introduce
    // a new group of dash bullets below. These look like text but are structural —
    // they must stay standalone to preserve source layout.
    var miniHeadingPatterns = [
      /^ปฏิบัติงานเวลา\s+\d/   // e.g. "ปฏิบัติงานเวลา 17.00 - 20.00 น."
    ];
    var isMiniHeading = miniHeadingPatterns.some(function(p) { return p.test(trimmed); });

    var prev = items.length > 0 ? items[items.length - 1] : null;
    if (!isMiniHeading && prev && (prev.type === 'numbered' || prev.type === 'dash' || prev.type === 'bullet')) {
      prev.text = prev.text + ' ' + trimmed;
      // mark that this item absorbed a continuation (for round-trip in I-3)
      if (!prev._absorbed) prev._absorbed = [];
      prev._absorbed.push(trimmed);
      continue;
    }

    // Standalone text — mini-heading or paragraph
    items.push({
      id: nextId(), type: 'text', text: trimmed,
      level: 2, category: currentCategory
    });
  }

  return items;
}


// ─── Stats helper ────────────────────────────────────────────

function _computeNoteStats_(items) {
  var counts = { h1: 0, h2: 0, bullet: 0, numbered: 0, dash: 0, text: 0, blank: 0 };
  var byCategory = { weekday: 0, weekend: 0, misc: 0, null: 0 };
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (counts[it.type] !== undefined) counts[it.type]++;
    var cat = it.category || 'null';
    if (byCategory[cat] !== undefined) byCategory[cat]++;
  }
  return {
    totalItems: items.length,
    byType: counts,
    byCategory: byCategory
  };
}


// ─── Firebase I/O ────────────────────────────────────────────

function _fetchNoteBlobRaw_(monthLabel) {
  // Read raw blob from Tier 0 (without auth check — internal use)
  var url = 'https://' + NOTE_FB_HOST_ + '/' + NOTE_FB_PATH_ + '/' + encodeURIComponent(monthLabel) + '.json';
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) {
    return { ok: false, error: 'fetch_failed', status: resp.getResponseCode() };
  }
  var body = resp.getContentText();
  if (!body || body === 'null') return { ok: false, error: 'blob_not_found' };

  var blob;
  try { blob = JSON.parse(body); } catch (e) {
    return { ok: false, error: 'invalid_json' };
  }
  if (!blob || !blob.rawText || !blob.hash) {
    return { ok: false, error: 'blob_malformed' };
  }
  return { ok: true, blob: blob };
}

function _writeNoteParsedToFirebase_(monthLabel, payload) {
  var url = 'https://' + NOTE_FB_HOST_ + '/' + NOTE_FB_PARSED_PATH_ + '/' + encodeURIComponent(monthLabel) + '.json';
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
    body: resp.getContentText().slice(0, 300),
    url: url
  };
}


// ─── Pipeline entry ──────────────────────────────────────────

/**
 * Read blob (Tier 0) → parse → write hydrated (Tier 1).
 * Verifies blob integrity before parsing (hash check).
 */
function hydrateNoteBlock(monthLabel) {
  if (!monthLabel) return { ok: false, stage: 'input', error: 'missing_monthLabel' };

  // Stage 1: fetch blob
  var fetched = _fetchNoteBlobRaw_(monthLabel);
  if (!fetched.ok) {
    return { ok: false, stage: 'fetch_blob', error: fetched.error, status: fetched.status };
  }
  var blob = fetched.blob;

  // Stage 2: verify blob integrity (re-hash + compare)
  var computedHash = _sha256Hex_(blob.rawText);
  if (computedHash !== blob.hash) {
    return {
      ok: false, stage: 'integrity',
      error: 'blob_hash_mismatch',
      storedHash: blob.hash,
      computedHash: computedHash
    };
  }

  // Stage 3: parse
  var items;
  try {
    items = parseNoteStructure_(blob.rawText);
  } catch (e) {
    return { ok: false, stage: 'parse', error: 'parser_exception', detail: String(e) };
  }

  // Stage 4: assemble payload — link to blob via hash
  var payload = {
    blobHash: blob.hash,
    monthLabel: monthLabel,
    parserVersion: NOTE_HYDRATED_VERSION_,
    parsedAt: new Date().toISOString(),
    items: items,
    stats: _computeNoteStats_(items),
    sourceBlobCapturedAt: blob.capturedAt || null
  };

  // Stage 5: write
  var write = _writeNoteParsedToFirebase_(monthLabel, payload);
  if (!write.ok) {
    return { ok: false, stage: 'write', error: 'firebase_write_failed', detail: write };
  }

  return {
    ok: true,
    monthLabel: monthLabel,
    blobHash: blob.hash,
    stats: payload.stats,
    parserVersion: payload.parserVersion,
    parsedAt: payload.parsedAt
  };
}


// ─── Public read API ─────────────────────────────────────────

/**
 * Fetch parsed structure + verify still in sync with current blob.
 * If blob has changed since this hydration (hash mismatch),
 * caller should treat result as stale and trigger re-hydrate.
 */
function phxGetNoteParsed(monthLabel, token) {
  try { guardCheck_(token); } catch (e) {
    return { ok: false, error: 'auth_failed', detail: String(e) };
  }

  if (!monthLabel || typeof monthLabel !== 'string') {
    return { ok: false, error: 'invalid_monthLabel' };
  }

  // Fetch parsed
  var safeLabel = encodeURIComponent(monthLabel);
  var url = 'https://' + NOTE_FB_HOST_ + '/' + NOTE_FB_PARSED_PATH_ + '/' + safeLabel + '.json';
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) {
    return { ok: false, error: 'fetch_failed', status: resp.getResponseCode() };
  }
  var body = resp.getContentText();
  if (!body || body === 'null') {
    return { ok: false, error: 'not_found', monthLabel: monthLabel };
  }

  var parsed;
  try { parsed = JSON.parse(body); } catch (e) {
    return { ok: false, error: 'invalid_json' };
  }

  // Cross-verify with current blob (detects sync lag)
  var blobFetched = _fetchNoteBlobRaw_(monthLabel);
  if (!blobFetched.ok) {
    return {
      ok: false,
      error: 'blob_missing',
      hint: 'Parsed exists but no blob to verify against — system inconsistent'
    };
  }
  var staleness = (parsed.blobHash === blobFetched.blob.hash) ? 'fresh' : 'stale';

  return {
    ok: true,
    monthLabel: parsed.monthLabel,
    parserVersion: parsed.parserVersion,
    parsedAt: parsed.parsedAt,
    blobHash: parsed.blobHash,
    currentBlobHash: blobFetched.blob.hash,
    staleness: staleness,
    items: parsed.items,
    stats: parsed.stats
  };
}


// ─── Manual tests ────────────────────────────────────────────

/**
 * Test the parser in isolation without Firebase.
 * Uses extractClinicNoteBlock_ to grab raw → parse → log structure.
 */
function testParseLocal() {
  var extracted = extractClinicNoteBlock_(CLINIC_FOLDER_ID_);
  if (!extracted.ok) {
    Logger.log('❌ extract failed: ' + extracted.error);
    return extracted;
  }
  var items = parseNoteStructure_(extracted.rawText);
  var stats = _computeNoteStats_(items);

  Logger.log('=== parser test (local — no Firebase) ===');
  Logger.log('Source: ' + extracted.sourceMeta.sourceFile.name);
  Logger.log('Lines:  ' + extracted.sourceMeta.lineCount);
  Logger.log('Stats:  ' + JSON.stringify(stats, null, 2));
  Logger.log('');
  Logger.log('=== first 30 items ===');
  for (var i = 0; i < Math.min(30, items.length); i++) {
    var it = items[i];
    var indent = '  '.repeat(it.level || 0);
    var label = '[' + it.type + (it.number ? ' #' + it.number : '') + ']';
    var cat = it.category ? ' (' + it.category + ')' : '';
    Logger.log(indent + label + cat + ' ' + (it.text || '').substring(0, 80));
  }
  Logger.log('... (' + items.length + ' items total)');
  return { items: items, stats: stats };
}

/**
 * Full pipeline: read blob from Firebase → parse → write parsed.
 */
function testHydrateCurrentMonth() {
  var MONTH_LABEL = 'm_มิถุนายน_2569';   // adjust per test month
  var result = hydrateNoteBlock(MONTH_LABEL);
  Logger.log('=== hydrate result ===');
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/**
 * Read back parsed structure from Firebase + verify staleness.
 */
function testReadParsedCurrentMonth() {
  var MONTH_LABEL = 'm_มิถุนายน_2569';
  var TOKEN       = 'INTERNAL_BOT_AUTO_SYNC';
  var result = phxGetNoteParsed(MONTH_LABEL, TOKEN);
  Logger.log('=== read parsed ===');
  Logger.log('ok: ' + result.ok);
  if (!result.ok) {
    Logger.log('error: ' + result.error);
    return result;
  }
  Logger.log('staleness:     ' + result.staleness);
  Logger.log('blobHash:      ' + result.blobHash);
  Logger.log('currentBlob:   ' + result.currentBlobHash);
  Logger.log('parserVersion: ' + result.parserVersion);
  Logger.log('stats:         ' + JSON.stringify(result.stats));
  Logger.log('');
  Logger.log('--- first 10 items ---');
  for (var i = 0; i < Math.min(10, result.items.length); i++) {
    var it = result.items[i];
    Logger.log('[' + it.type + '] (' + (it.category || '-') + ') ' + (it.text || '').substring(0, 80));
  }
  return result;
}


// ════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════
//   PHASE I-3 — Tier 2 VALIDATOR (round-trip + token checks)
// ════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════
//
//  Prerequisite — Firebase Rules:
//    "scheduleNotesValidation": { ".read": true, ".write": true }
//
//  Reads:  /scheduleNotes/{label}        (Tier 0 BLOB)
//          /scheduleNotesParsed/{label}  (Tier 1 HYDRATED)
//  Writes: /scheduleNotesValidation/{label}
//
//  Build: vY3.34-stageI3v1
// ════════════════════════════════════════════════════════════

var NOTE_FB_VALIDATION_PATH_ = 'scheduleNotesValidation';
var NOTE_VALIDATOR_VERSION_ = 'I-3.v2';   // v2: Layer 1 structural anchor check


// ─── Reverse function: items → text ─────────────────────────

/**
 * Reconstruct text from parsed items. Reverse of parseNoteStructure_.
 * Preserves continuation lines (from _absorbed) as separate lines.
 *
 * Output is "canonical" — may not byte-equal original raw, but will
 * normalize-equal it (whitespace tolerance applied during compare).
 */
function serializeNoteItems_(items) {
  if (!Array.isArray(items)) return '';
  var lines = [];

  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var text = it.text || '';

    // If this item absorbed continuation lines, peel them off the merged text first
    // so we can emit the bullet on one line + each absorbed line below.
    // IMPORTANT: strip in REVERSE order — the last absorbed line sits at the tail
    // of merged text, so it must come off first.
    var absorbed = it._absorbed || [];
    var headText = text;
    for (var j = absorbed.length - 1; j >= 0; j--) {
      // Strip " " + absorbedLine from the END of merged text
      var suffix = ' ' + absorbed[j];
      if (headText.endsWith(suffix)) {
        headText = headText.substring(0, headText.length - suffix.length);
      }
    }

    // Emit head line according to type
    switch (it.type) {
      case 'h1':
      case 'h2':
      case 'text':
        lines.push(headText);
        break;
      case 'bullet':
        lines.push('è ' + headText);
        break;
      case 'numbered':
        lines.push((it.number || '?') + '. ' + headText);
        break;
      case 'dash':
        lines.push(' - ' + headText);
        break;
      case 'blank':
        lines.push('');
        break;
      default:
        lines.push(headText);
    }

    // Emit absorbed continuation lines unchanged (in original order)
    for (var k = 0; k < absorbed.length; k++) {
      lines.push(absorbed[k]);
    }
  }

  return lines.join('\n');
}


// ─── Token extractors ───────────────────────────────────────

/**
 * Extract all time tokens (HH.MM or HH:MM, with optional leading zero).
 * Returns sorted array for stable comparison.
 */
function _extractTimes_(text) {
  var matches = String(text || '').match(/\d{1,2}[\.:]\d{2}/g) || [];
  return matches.slice().sort();
}

/**
 * Extract position codes like SCP2, MS2(7), NM2(8), 103(4), OP72, etc.
 */
function _extractPositions_(text) {
  // Pattern: uppercase letters or 103 + digits + optional (n)
  var matches = String(text || '').match(/(?:[A-Z]{2,}\d+|103)(?:\([^)]+\))?/g) || [];
  return matches.slice().sort();
}

/**
 * Extract symbol clusters: *, **, ***, ****, $, L, #
 * Treats consecutive stars as one cluster.
 */
function _extractSymbols_(text) {
  var matches = String(text || '').match(/\*+|\$|\bL\b|#/g) || [];
  return matches.slice().sort();
}

/**
 * Extract Thai day names (both full and short forms).
 */
function _extractDays_(text) {
  var DAY_PATTERN = /จันทร์|อังคาร|พุธ|พฤหัสบดี|พฤ\.|ศุกร์|เสาร์|อาทิตย์|จ\.|อ\.|พ\.|ศ\.|ส\./g;
  var matches = String(text || '').match(DAY_PATTERN) || [];
  return matches.slice().sort();
}


// ─── Compare helpers ────────────────────────────────────────

function _normalizeForRoundTrip_(text) {
  return String(text || '')
    .replace(/\u00A0/g, ' ')      // non-breaking space
    .replace(/[ \t]+/g, ' ')       // collapse spaces/tabs
    .split('\n')
    .map(function(l) { return l.trim(); })
    .filter(function(l) { return l.length > 0; })  // drop empty lines
    .join('\n');
}

function _multisetEqual_(a, b) {
  if (a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function _multisetDiff_(a, b) {
  // Returns elements in `a` not matched by elements in `b` (count-aware)
  var bCopy = b.slice();
  var missing = [];
  for (var i = 0; i < a.length; i++) {
    var idx = bCopy.indexOf(a[i]);
    if (idx === -1) missing.push(a[i]);
    else bCopy.splice(idx, 1);
  }
  return missing;
}

function _diffLines_(blobText, reconText) {
  var blobLines = blobText.split('\n');
  var reconLines = reconText.split('\n');
  var diffs = [];
  var max = Math.max(blobLines.length, reconLines.length);
  for (var i = 0; i < max; i++) {
    var bl = blobLines[i];
    var rl = reconLines[i];
    if (bl !== rl) {
      diffs.push({
        lineNo: i + 1,
        blob: (bl === undefined) ? '(missing)' : bl,
        recon: (rl === undefined) ? '(missing)' : rl
      });
      if (diffs.length >= 20) break;  // cap diff size
    }
  }
  return diffs;
}


// ─── Validation pipeline ────────────────────────────────────

function _runValidationChecks_(blobRawText, items) {
  var reconstructed = serializeNoteItems_(items);

  // Layer 1: Structural anchor check — hydrated MUST contain ≥1 weekday H1 and ≥1 weekend H1
  // Missing = parser hallucinated / source structure broken → reject as raw-only
  var hasWeekdayH1 = items.some(function(it) {
    return it.type === 'h1' && it.category === 'weekday';
  });
  var hasWeekendH1 = items.some(function(it) {
    return it.type === 'h1' && it.category === 'weekend';
  });
  var structuralAnchorsPass = hasWeekdayH1 && hasWeekendH1;

  var blobNorm = _normalizeForRoundTrip_(blobRawText);
  var reconNorm = _normalizeForRoundTrip_(reconstructed);
  var roundTripPass = (blobNorm === reconNorm);

  // Token preservation: every token in blob must appear in reconstructed (count-aware)
  var bTimes = _extractTimes_(blobRawText);
  var rTimes = _extractTimes_(reconstructed);
  var timesMissing = _multisetDiff_(bTimes, rTimes);
  var timesExtra = _multisetDiff_(rTimes, bTimes);

  var bPos = _extractPositions_(blobRawText);
  var rPos = _extractPositions_(reconstructed);
  var posMissing = _multisetDiff_(bPos, rPos);
  var posExtra = _multisetDiff_(rPos, bPos);

  var bSym = _extractSymbols_(blobRawText);
  var rSym = _extractSymbols_(reconstructed);
  var symMissing = _multisetDiff_(bSym, rSym);
  var symExtra = _multisetDiff_(rSym, bSym);

  var bDays = _extractDays_(blobRawText);
  var rDays = _extractDays_(reconstructed);
  var daysMissing = _multisetDiff_(bDays, rDays);
  var daysExtra = _multisetDiff_(rDays, bDays);

  var checks = {
    structuralAnchors: structuralAnchorsPass,
    roundTrip: roundTripPass,
    times: timesMissing.length === 0,
    positions: posMissing.length === 0,
    symbols: symMissing.length === 0,
    days: daysMissing.length === 0
  };

  var approved = Object.keys(checks).every(function(k) { return checks[k] === true; });

  var structuralDetail = {
    hasWeekdayH1: hasWeekdayH1,
    hasWeekendH1: hasWeekendH1,
    missing: []
  };
  if (!hasWeekdayH1) structuralDetail.missing.push('weekday_h1');
  if (!hasWeekendH1) structuralDetail.missing.push('weekend_h1');

  var tokenCounts = {
    times:     { blob: bTimes.length,   parsed: rTimes.length,   missing: timesMissing, extra: timesExtra },
    positions: { blob: bPos.length,     parsed: rPos.length,     missing: posMissing,   extra: posExtra   },
    symbols:   { blob: bSym.length,     parsed: rSym.length,     missing: symMissing,   extra: symExtra   },
    days:      { blob: bDays.length,    parsed: rDays.length,    missing: daysMissing,  extra: daysExtra  }
  };

  return {
    approved: approved,
    checks: checks,
    structuralDetail: structuralDetail,
    tokenCounts: tokenCounts,
    diff: roundTripPass ? null : _diffLines_(blobNorm, reconNorm),
    reconstructedSample: reconstructed.substring(0, 500)
  };
}


// ─── Firebase write ─────────────────────────────────────────

function _writeNoteValidationToFirebase_(monthLabel, payload) {
  var url = 'https://' + NOTE_FB_HOST_ + '/' + NOTE_FB_VALIDATION_PATH_ + '/' + encodeURIComponent(monthLabel) + '.json';
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


// ─── Pipeline entry ─────────────────────────────────────────

/**
 * Read BLOB + HYDRATED → run validator → write VALIDATION.
 * Verifies blob.hash and parsed.blobHash agree before validating.
 */
function validateNoteBlock(monthLabel) {
  if (!monthLabel) return { ok: false, stage: 'input', error: 'missing_monthLabel' };

  // Fetch blob
  var fetched = _fetchNoteBlobRaw_(monthLabel);
  if (!fetched.ok) {
    return { ok: false, stage: 'fetch_blob', error: fetched.error };
  }
  var blob = fetched.blob;

  // Fetch parsed
  var parsedUrl = 'https://' + NOTE_FB_HOST_ + '/' + NOTE_FB_PARSED_PATH_ + '/' + encodeURIComponent(monthLabel) + '.json';
  var pResp = UrlFetchApp.fetch(parsedUrl, { muteHttpExceptions: true });
  if (pResp.getResponseCode() !== 200) {
    return { ok: false, stage: 'fetch_parsed', error: 'parsed_fetch_failed', status: pResp.getResponseCode() };
  }
  var pBody = pResp.getContentText();
  if (!pBody || pBody === 'null') {
    return { ok: false, stage: 'fetch_parsed', error: 'parsed_not_found', hint: 'run testHydrateCurrentMonth first' };
  }
  var parsed;
  try { parsed = JSON.parse(pBody); } catch (e) {
    return { ok: false, stage: 'fetch_parsed', error: 'parsed_invalid_json' };
  }

  // Cross-link integrity: parsed.blobHash must match blob.hash
  if (parsed.blobHash !== blob.hash) {
    return {
      ok: false, stage: 'link',
      error: 'blob_hash_mismatch',
      hint: 'Parsed is stale — re-run testHydrateCurrentMonth',
      blobHash: blob.hash,
      parsedBlobHash: parsed.blobHash
    };
  }

  // Run checks
  var result = _runValidationChecks_(blob.rawText, parsed.items);

  // Assemble payload
  var payload = {
    blobHash: blob.hash,
    monthLabel: monthLabel,
    validatorVersion: NOTE_VALIDATOR_VERSION_,
    validatedAt: new Date().toISOString(),
    approved: result.approved,
    checks: result.checks,
    structuralDetail: result.structuralDetail,
    tokenCounts: result.tokenCounts,
    diff: result.diff,
    reconstructedSample: result.reconstructedSample
  };

  // Write
  var write = _writeNoteValidationToFirebase_(monthLabel, payload);
  if (!write.ok) {
    return { ok: false, stage: 'write', error: 'firebase_write_failed', detail: write };
  }

  return {
    ok: true,
    monthLabel: monthLabel,
    approved: result.approved,
    checks: result.checks,
    tokenCounts: result.tokenCounts,
    diff: result.diff,
    diffCount: result.diff ? result.diff.length : 0
  };
}


// ─── Public read API ────────────────────────────────────────

function phxGetNoteValidation(monthLabel, token) {
  try { guardCheck_(token); } catch (e) {
    return { ok: false, error: 'auth_failed', detail: String(e) };
  }
  if (!monthLabel) return { ok: false, error: 'invalid_monthLabel' };

  var url = 'https://' + NOTE_FB_HOST_ + '/' + NOTE_FB_VALIDATION_PATH_ + '/' + encodeURIComponent(monthLabel) + '.json';
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) {
    return { ok: false, error: 'fetch_failed', status: resp.getResponseCode() };
  }
  var body = resp.getContentText();
  if (!body || body === 'null') return { ok: false, error: 'not_found' };

  try {
    var data = JSON.parse(body);
    return {
      ok: true,
      monthLabel: data.monthLabel,
      approved: data.approved,
      checks: data.checks,
      tokenCounts: data.tokenCounts,
      diff: data.diff,
      validatedAt: data.validatedAt,
      validatorVersion: data.validatorVersion,
      blobHash: data.blobHash
    };
  } catch (e) {
    return { ok: false, error: 'invalid_json' };
  }
}


// ─── Manual tests ───────────────────────────────────────────

function testValidateCurrentMonth() {
  var MONTH_LABEL = 'm_มิถุนายน_2569';
  var result = validateNoteBlock(MONTH_LABEL);

  Logger.log('=== validate result ===');
  Logger.log('ok:       ' + result.ok);
  if (!result.ok) {
    Logger.log('stage:    ' + result.stage);
    Logger.log('error:    ' + result.error);
    if (result.hint) Logger.log('hint:     ' + result.hint);
    return result;
  }
  Logger.log('approved: ' + result.approved + (result.approved ? ' ✓' : ' ✗'));
  Logger.log('');
  Logger.log('--- checks ---');
  Object.keys(result.checks).forEach(function(k) {
    Logger.log('  ' + (result.checks[k] ? '✓' : '✗') + '  ' + k);
  });
  Logger.log('');
  Logger.log('--- token counts ---');
  Object.keys(result.tokenCounts).forEach(function(k) {
    var c = result.tokenCounts[k];
    var status = (c.missing.length === 0 && c.extra.length === 0) ? '✓' : '✗';
    Logger.log('  ' + status + '  ' + k + ': blob=' + c.blob + ' parsed=' + c.parsed +
               (c.missing.length ? ' missing=' + JSON.stringify(c.missing) : '') +
               (c.extra.length   ? ' extra='   + JSON.stringify(c.extra)   : ''));
  });
  if (result.diffCount > 0 && result.diff) {
    Logger.log('');
    Logger.log('--- round-trip diff (first ' + Math.min(5, result.diffCount) + ' lines) ---');
    for (var i = 0; i < Math.min(5, result.diff.length); i++) {
      var d = result.diff[i];
      Logger.log('  Line ' + d.lineNo + ':');
      Logger.log('    BLOB:  "' + d.blob + '"');
      Logger.log('    RECON: "' + d.recon + '"');
    }
  }
  return result;
}

function testReadValidationCurrentMonth() {
  var MONTH_LABEL = 'm_มิถุนายน_2569';
  var TOKEN = 'INTERNAL_BOT_AUTO_SYNC';
  var result = phxGetNoteValidation(MONTH_LABEL, TOKEN);
  Logger.log('=== read validation ===');
  Logger.log('ok:       ' + result.ok);
  if (!result.ok) { Logger.log('error: ' + result.error); return result; }
  Logger.log('approved: ' + result.approved);
  Logger.log('checks:   ' + JSON.stringify(result.checks));
  Logger.log('validatedAt: ' + result.validatedAt);
  return result;
}


// ════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════
//   PHASE I-4a — Upload chain integration helpers
// ════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════
//
//  Purpose: Direct extraction by spreadsheetId (no folder resolver)
//  for use from uploadLocalFile where conv.id is known exactly.
//
//  Build: vY3.34-stageI4v1
// ════════════════════════════════════════════════════════════

/**
 * Extract from a known spreadsheet ID (skips folder resolver).
 * Used by upload chain where Google Sheet ID is already known.
 */
function extractClinicNoteBlockFromSheetId_(spreadsheetId) {
  var ss;
  try {
    ss = SpreadsheetApp.openById(spreadsheetId);
  } catch (e) {
    return { ok: false, error: 'open_failed', detail: String(e) };
  }

  var result = _extractFromSpreadsheet_(ss);
  if (result.ok) {
    result.sourceMeta.sourceFile = {
      id: spreadsheetId,
      name: ss.getName(),
      mime: MimeType.GOOGLE_SHEETS,
      lastUpdated: new Date().toISOString()
    };
  }
  return result;
}

/**
 * Direct ingest from spreadsheet ID (Phase I-4 integration).
 * Same as ingestNoteBlock but skips folder/resolver step.
 */
function ingestNoteBlockFromSpreadsheet(spreadsheetId, monthLabel) {
  if (!spreadsheetId) return { ok: false, stage: 'input', error: 'missing_spreadsheetId' };
  if (!monthLabel)    return { ok: false, stage: 'input', error: 'missing_monthLabel' };

  var extracted = extractClinicNoteBlockFromSheetId_(spreadsheetId);
  if (!extracted.ok) {
    return { ok: false, stage: 'extract', error: extracted.error, meta: extracted };
  }

  var hash = _sha256Hex_(extracted.rawText);

  var payload = {
    rawText: extracted.rawText,
    hash: hash,
    source: extracted.sourceMeta,
    capturedAt: new Date().toISOString(),
    capturedBy: (Session.getActiveUser().getEmail() || 'system'),
    monthLabel: monthLabel,
    parserVersion: NOTE_PARSER_VERSION_
  };

  var write = _writeNoteBlobToFirebase_(monthLabel, payload);
  if (!write.ok) {
    return { ok: false, stage: 'write', error: 'firebase_write_failed', detail: write };
  }

  return {
    ok: true,
    monthLabel: monthLabel,
    hash: hash,
    lineCount: extracted.sourceMeta.lineCount,
    byteLength: extracted.sourceMeta.byteLength,
    source: extracted.sourceMeta,
    capturedAt: payload.capturedAt
  };
}

/**
 * Full Phase I pipeline — run all 3 tiers in sequence.
 * Designed to be called from uploadLocalFile after schedule push.
 * Returns granular stage status for diagnostic logging.
 *
 * Failure modes are NON-FATAL — caller should wrap in try/catch
 * and not block the upload flow on Phase I errors.
 */
function runNoteIngestPipeline(spreadsheetId, monthLabel) {
  var t0 = Date.now();
  var stages = {};

  // Tier 0
  var blob = ingestNoteBlockFromSpreadsheet(spreadsheetId, monthLabel);
  stages.blob = {
    ok: blob.ok,
    error: blob.error || null,
    lineCount: blob.lineCount || 0,
    hash: blob.hash || null
  };
  if (!blob.ok) {
    return { ok: false, approved: false, stages: stages, durationMs: Date.now() - t0 };
  }

  // Tier 1
  var hyd = hydrateNoteBlock(monthLabel);
  stages.hydrate = {
    ok: hyd.ok,
    error: hyd.error || null,
    itemCount: hyd.stats ? hyd.stats.totalItems : 0
  };
  if (!hyd.ok) {
    return { ok: false, approved: false, stages: stages, durationMs: Date.now() - t0 };
  }

  // Tier 2
  var val = validateNoteBlock(monthLabel);
  stages.validate = {
    ok: val.ok,
    approved: !!val.approved,
    error: val.error || null,
    diffCount: val.diffCount || 0
  };

  return {
    ok: stages.blob.ok && stages.hydrate.ok && stages.validate.ok,
    approved: !!val.approved,
    stages: stages,
    blobHash: blob.hash,
    durationMs: Date.now() - t0
  };
}


// ════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════
//   PHASE I-4b — Frontend bridge API
// ════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════
//
//  Single round-trip call from Index.html — returns everything
//  needed to render the popup:
//    - blob.rawText (fallback render)
//    - items (structured render — only used if approved)
//    - displayMode: 'structured' | 'raw'
//    - approved + checks (transparency)
//
//  Frontend logic:
//    if (result.displayMode === 'structured') {
//      renderStructured(result.items);
//    } else {
//      renderRaw(result.blob.rawText, { reason: result.stalenessReason });
//    }
// ════════════════════════════════════════════════════════════

function phxGetNoteForDisplay(monthLabel, token) {
  try { guardCheck_(token); } catch (e) {
    return { ok: false, error: 'auth_failed', detail: String(e) };
  }
  if (!monthLabel || typeof monthLabel !== 'string') {
    return { ok: false, error: 'invalid_monthLabel' };
  }

  // Fetch all 3 tiers in parallel via fetchAll
  var safeLabel = encodeURIComponent(monthLabel);
  var urls = [
    'https://' + NOTE_FB_HOST_ + '/' + NOTE_FB_PATH_            + '/' + safeLabel + '.json',
    'https://' + NOTE_FB_HOST_ + '/' + NOTE_FB_PARSED_PATH_     + '/' + safeLabel + '.json',
    'https://' + NOTE_FB_HOST_ + '/' + NOTE_FB_VALIDATION_PATH_ + '/' + safeLabel + '.json'
  ];
  var responses;
  try {
    responses = UrlFetchApp.fetchAll(urls.map(function(u) {
      return { url: u, muteHttpExceptions: true };
    }));
  } catch (e) {
    return { ok: false, error: 'fetch_failed', detail: String(e) };
  }

  // Tier 0 BLOB — required
  if (responses[0].getResponseCode() !== 200) {
    return { ok: false, error: 'blob_fetch_failed', status: responses[0].getResponseCode() };
  }
  var blobBody = responses[0].getContentText();
  if (!blobBody || blobBody === 'null') {
    return { ok: false, error: 'blob_not_found', monthLabel: monthLabel };
  }
  var blob;
  try { blob = JSON.parse(blobBody); } catch (e) {
    return { ok: false, error: 'blob_invalid_json' };
  }

  // Defense in depth: verify blob hash at read time
  var computedHash = _sha256Hex_(blob.rawText || '');
  if (computedHash !== blob.hash) {
    return {
      ok: false,
      error: 'blob_hash_mismatch',
      hint: 'Stored blob is corrupted — admin should re-upload',
      storedHash: blob.hash,
      computedHash: computedHash
    };
  }

  // Tier 1 PARSED — optional
  var parsed = null;
  if (responses[1].getResponseCode() === 200) {
    var pBody = responses[1].getContentText();
    if (pBody && pBody !== 'null') {
      try { parsed = JSON.parse(pBody); } catch (e) { parsed = null; }
    }
  }

  // Tier 2 VALIDATION — optional
  var validation = null;
  if (responses[2].getResponseCode() === 200) {
    var vBody = responses[2].getContentText();
    if (vBody && vBody !== 'null') {
      try { validation = JSON.parse(vBody); } catch (e) { validation = null; }
    }
  }

  // Decide display mode
  // Safe default: raw. Only switch to structured if all 3 tiers
  // align AND validation approved.
  var displayMode = 'raw';
  var stalenessReason = null;

  if (!parsed) {
    stalenessReason = 'parsed_missing';
  } else if (!validation) {
    stalenessReason = 'validation_missing';
  } else if (parsed.blobHash !== blob.hash) {
    stalenessReason = 'parsed_stale';
  } else if (validation.blobHash !== blob.hash) {
    stalenessReason = 'validation_stale';
  } else if (!validation.approved) {
    // Layer 1: differentiate structural anchor failure from generic validation
    // Use === false (not !checks.x) to handle backwards-compat with old validations
    // that don't have the structuralAnchors key
    if (validation.checks && validation.checks.structuralAnchors === false) {
      stalenessReason = 'structural_anchor_missing';
    } else {
      stalenessReason = 'validation_failed';
    }
  } else {
    displayMode = 'structured';
  }

  return {
    ok: true,
    monthLabel: monthLabel,
    displayMode: displayMode,
    stalenessReason: stalenessReason,
    blob: {
      rawText: blob.rawText,
      hash: blob.hash,
      capturedAt: blob.capturedAt,
      source: blob.source
    },
    items: parsed ? parsed.items : null,
    stats: parsed ? parsed.stats : null,
    parserVersion: parsed ? parsed.parserVersion : null,
    approved: validation ? validation.approved : false,
    checks: validation ? validation.checks : null,
    validatedAt: validation ? validation.validatedAt : null
  };
}


// ─── Phase I-4 manual test ───────────────────────────────────

function testFullPipelineCurrentMonth() {
  var MONTH_LABEL = 'm_มิถุนายน_2569';
  // Use the same spreadsheet that ingestNoteBlock resolved last time
  // For real upload chain this will come from conv.id
  var folderResolve = _resolveLatestClinicFile_(CLINIC_FOLDER_ID_);
  if (!folderResolve.ok) {
    Logger.log('❌ folder resolve failed: ' + folderResolve.error);
    return folderResolve;
  }
  var SPREADSHEET_ID = folderResolve.id;

  Logger.log('=== Phase I full pipeline ===');
  Logger.log('Source: ' + folderResolve.name);
  Logger.log('ID:     ' + SPREADSHEET_ID);
  Logger.log('Label:  ' + MONTH_LABEL);
  Logger.log('');

  var result = runNoteIngestPipeline(SPREADSHEET_ID, MONTH_LABEL);
  Logger.log('Pipeline result:');
  Logger.log('  ok:       ' + result.ok);
  Logger.log('  approved: ' + (result.approved ? '✓' : '✗'));
  Logger.log('  duration: ' + result.durationMs + 'ms');
  Logger.log('  stages:');
  Object.keys(result.stages).forEach(function(k) {
    Logger.log('    ' + k + ': ' + JSON.stringify(result.stages[k]));
  });
  return result;
}

function testGetNoteForDisplay() {
  var MONTH_LABEL = 'm_มิถุนายน_2569';
  var TOKEN = 'INTERNAL_BOT_AUTO_SYNC';
  var result = phxGetNoteForDisplay(MONTH_LABEL, TOKEN);
  Logger.log('=== display API ===');
  Logger.log('ok:              ' + result.ok);
  if (!result.ok) { Logger.log('error: ' + result.error); return result; }
  Logger.log('displayMode:     ' + result.displayMode);
  Logger.log('stalenessReason: ' + result.stalenessReason);
  Logger.log('approved:        ' + result.approved);
  Logger.log('items count:     ' + (result.items ? result.items.length : 0));
  Logger.log('rawText length:  ' + (result.blob.rawText ? result.blob.rawText.length : 0));
  return result;
}