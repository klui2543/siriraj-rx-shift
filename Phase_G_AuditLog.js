// Phase_G_AuditLog.gs — Stage G1 (v1.0)
// Hospital safety audit log for Siriraj Rx Shift
// Schema: timestamp | userName | action | target | before | after | source | sessionId
//
// Auth: phxLogAudit verifies name+hash against User_Auth sheet
// Rotation: handled by G3 (separate function)

// ============================================================
// CONFIG — adjust if User_Auth column order differs
// ============================================================
const SPREADSHEET_ID = '1V1Fo4rEadSYfqLDc1sZEE-fRtZ4Je5_30_EAclO3KHM';
const AUDIT_SHEET_NAME = 'PHX_AuditLog';
const AUDIT_HEADERS = ['timestamp', 'userName', 'action', 'target', 'before', 'after', 'source', 'sessionId'];
const AUDIT_MAX_PAYLOAD = 10000;  // chars per before/after (clip runaway JSON)

// Auth sheet config (verified via phxFindAuthSheet diagnostic)
const AUDIT_AUTH_SHEET_NAME = 'PHX_Pharmacists';  // contains name + passwordHash
const AUDIT_AUTH_NAME_COL = 1;  // col A = name
const AUDIT_AUTH_HASH_COL = 2;  // col B = passwordHash

// ============================================================
// SHEET MANAGEMENT
// ============================================================
function _phxGetAuditSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = ss.getSheetByName(AUDIT_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(AUDIT_SHEET_NAME);
    sh.appendRow(AUDIT_HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, AUDIT_HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#f1f5f9');
    sh.setColumnWidth(1, 160);  // timestamp
    sh.setColumnWidth(2, 200);  // userName
    sh.setColumnWidth(3, 100);  // action
    sh.setColumnWidth(4, 220);  // target
    sh.setColumnWidth(5, 300);  // before
    sh.setColumnWidth(6, 300);  // after
    sh.setColumnWidth(7, 80);   // source
    sh.setColumnWidth(8, 180);  // sessionId
  }
  return sh;
}

// ============================================================
// HELPERS
// ============================================================
function _phxClipPayload(s) {
  if (s == null) return '';
  const str = (typeof s === 'object') ? JSON.stringify(s) : String(s);
  if (str.length <= AUDIT_MAX_PAYLOAD) return str;
  return str.substring(0, AUDIT_MAX_PAYLOAD) + '...[clip@' + AUDIT_MAX_PAYLOAD + ']';
}

function _phxVerifyAuditCaller_(name, hash) {
  if (!name || !hash) return false;
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sh = ss.getSheetByName(AUDIT_AUTH_SHEET_NAME);
    if (!sh) {
      console.warn('[Audit] auth sheet "' + AUDIT_AUTH_SHEET_NAME + '" not found');
      return false;
    }
    const data = sh.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {  // skip header
      const rowName = String(data[i][AUDIT_AUTH_NAME_COL - 1] || '').trim();
      const rowHash = String(data[i][AUDIT_AUTH_HASH_COL - 1] || '').trim();
      if (rowName === String(name).trim() && rowHash === String(hash).trim()) {
        return true;
      }
    }
    return false;
  } catch (e) {
    console.error('[Audit] verify error:', e);
    return false;
  }
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Log a user-attributed audit event. Verifies caller name+hash.
 *
 * @param {string} name        User name (must match User_Auth)
 * @param {string} hash        Password hash (must match User_Auth)
 * @param {string} action      swap|give|add|delete|login|logout|...
 * @param {string} target      Identifier (shift_key, broadcast_id, etc)
 * @param {*}      before      State before (object → JSON; string → as-is)
 * @param {*}      after       State after
 * @param {string} source      web|admin|system
 * @param {string} sessionId   Client session UUID
 * @returns {{ok: boolean, error?: string}}
 */
function phxLogAudit(name, hash, action, target, before, after, source, sessionId) {
  try {
    if (!_phxVerifyAuditCaller_(name, hash)) {
      return { ok: false, error: 'invalid auth' };
    }
    if (!action) return { ok: false, error: 'missing action' };

    const sh = _phxGetAuditSheet();
    sh.appendRow([
      new Date().toISOString(),
      String(name).substring(0, 200),
      String(action).substring(0, 50),
      _phxClipPayload(target),
      _phxClipPayload(before),
      _phxClipPayload(after),
      String(source || 'web').substring(0, 20),
      String(sessionId || '').substring(0, 100)
    ]);
    return { ok: true };
  } catch (e) {
    console.error('phxLogAudit error:', e);
    return { ok: false, error: String(e.message || e) };
  }
}

/**
 * Log a system-attributed event (triggers, cron, automated jobs).
 * Use sparingly — most logs should attribute to a real user.
 */
function phxLogAuditSystem(action, target, before, after) {
  try {
    if (!action) return { ok: false, error: 'missing action' };
    const sh = _phxGetAuditSheet();
    sh.appendRow([
      new Date().toISOString(),
      '(system)',
      String(action).substring(0, 50),
      _phxClipPayload(target),
      _phxClipPayload(before),
      _phxClipPayload(after),
      'system',
      ''
    ]);
    return { ok: true };
  } catch (e) {
    console.error('phxLogAuditSystem error:', e);
    return { ok: false, error: String(e.message || e) };
  }
}

// ============================================================
// MANUAL TESTS (run from GAS editor)
// ============================================================

/**
 * Verify User_Auth column assumption. Logs headers + sample row (hash masked).
 * Adjust AUDIT_AUTH_NAME_COL / AUDIT_AUTH_HASH_COL if columns differ.
 */
function phxDebugUserAuth() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = ss.getSheetByName(AUDIT_AUTH_SHEET_NAME);
  if (!sh) {
    Logger.log('❌ "' + AUDIT_AUTH_SHEET_NAME + '" sheet NOT FOUND');
    return { ok: false };
  }
  const data = sh.getDataRange().getValues();
  Logger.log('"' + AUDIT_AUTH_SHEET_NAME + '" rows: ' + data.length);
  if (data.length > 0) {
    Logger.log('Headers (row 1): ' + JSON.stringify(data[0]));
  }
  if (data.length > 1) {
    const sample = data[1].map(function(v, i) {
      return i === AUDIT_AUTH_HASH_COL - 1 ? '***masked***' : v;
    });
    Logger.log('Sample (row 2): ' + JSON.stringify(sample));
  }
  Logger.log('Assumed: name @ col ' + AUDIT_AUTH_NAME_COL + ', hash @ col ' + AUDIT_AUTH_HASH_COL);
  return { ok: true, headers: data[0], rowCount: data.length };
}

/**
 * Create the audit sheet + write a test row.
 */
function phxTestAuditLog() {
  const sh = _phxGetAuditSheet();
  const before = sh.getLastRow();
  Logger.log('Sheet: ' + sh.getName() + ' | rows before: ' + before);

  const r = phxLogAuditSystem('test', 'manual-test-target', { hello: 'before' }, { hello: 'after' });
  Logger.log('Write result: ' + JSON.stringify(r));
  Logger.log('Rows after: ' + sh.getLastRow());

  return { ok: true, rowsBefore: before, rowsAfter: sh.getLastRow(), writeResult: r };
}

function phxFindAuthSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheets = ss.getSheets();
  Logger.log('Total: ' + sheets.length + ' sheets in spreadsheet');
  Logger.log('─────────────────────────────────────');
  sheets.forEach(function(sh, i) {
    const name = sh.getName();
    const lastCol = sh.getLastColumn();
    const lastRow = sh.getLastRow();
    let headerStr = '(empty)';
    let flag = '';
    if (lastCol > 0 && lastRow > 0) {
      const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
      headerStr = JSON.stringify(headers);
      const lower = headers.join(' | ').toLowerCase();
      if (/password|passwordhash|emailhash|hash/.test(lower)) flag = '  ← AUTH-LIKE';
      else if (/role/.test(lower) && /name/.test(lower)) flag = '  ← AUTH-LIKE';
    }
    Logger.log((i + 1) + '. "' + name + '" (' + lastRow + ' rows × ' + lastCol + ' cols)' + flag);
    Logger.log('    headers: ' + headerStr);
  });
}

// ============================================================
// G3 — CONFIG (additions)
// ============================================================
const AUDIT_RETENTION_DAYS = 90;
const AUDIT_ADMIN_MASTER_SHEET = 'PHX_Pharmacists_Master';
const AUDIT_ADMIN_NAME_COL = 1;  // col A
const AUDIT_ADMIN_ROLE_COL = 5;  // col E

// ============================================================
// G3 — ADMIN VERIFICATION
// ============================================================
function _phxVerifyAdminCaller_(name, hash) {
  if (!_phxVerifyAuditCaller_(name, hash)) return false;
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sh = ss.getSheetByName(AUDIT_ADMIN_MASTER_SHEET);
    if (!sh) {
      console.warn('[Audit] admin master sheet "' + AUDIT_ADMIN_MASTER_SHEET + '" not found');
      return false;
    }
    const data = sh.getDataRange().getValues();
    const cleanName = String(name).trim();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][AUDIT_ADMIN_NAME_COL - 1] || '').trim() === cleanName) {
        const role = String(data[i][AUDIT_ADMIN_ROLE_COL - 1] || '').trim().toLowerCase();
        return role === 'admin';
      }
    }
    return false;
  } catch (e) {
    console.error('[Audit] admin verify error:', e);
    return false;
  }
}

// ============================================================
// G3 — ROTATION (90-day cleanup)
// ============================================================
/**
 * Delete audit rows older than AUDIT_RETENTION_DAYS.
 * Assumes rows are chronological (appendRow guarantees this).
 * Designed for daily trigger; safe to call manually too.
 */
function phxAuditCleanup90Days() {
  try {
    const sh = _phxGetAuditSheet();
    const lastRow = sh.getLastRow();
    if (lastRow <= 1) {
      Logger.log('[Cleanup] no data rows — nothing to do');
      return { ok: true, deleted: 0, kept: 0 };
    }
    const cutoff = Date.now() - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const cutoffISO = new Date(cutoff).toISOString();
    const tsData = sh.getRange(2, 1, lastRow - 1, 1).getValues();

    // Find first FRESH row — everything before it gets deleted
    let firstFreshRowIdx = -1;
    for (let i = 0; i < tsData.length; i++) {
      const ts = tsData[i][0];
      const tsMs = (ts instanceof Date) ? ts.getTime() : Date.parse(String(ts));
      if (isNaN(tsMs)) {
        Logger.log('[Cleanup] skipping malformed timestamp at sheet row ' + (i + 2) + ': ' + ts);
        continue;
      }
      if (tsMs >= cutoff) { firstFreshRowIdx = i; break; }
    }

    const deleteCount = (firstFreshRowIdx === -1) ? (lastRow - 1) : firstFreshRowIdx;
    if (deleteCount > 0) sh.deleteRows(2, deleteCount);
    const kept = (lastRow - 1) - deleteCount;

    // Self-audit the rotation (forensic trail)
    try {
      phxLogAuditSystem('rotation', 'PHX_AuditLog',
        { totalBefore: lastRow - 1, cutoff: cutoffISO },
        { deleted: deleteCount, kept: kept });
    } catch (e) { Logger.log('[Cleanup] failed to log rotation: ' + e); }

    Logger.log('[Cleanup] deleted=' + deleteCount + ' kept=' + kept + ' cutoff=' + cutoffISO);
    return { ok: true, deleted: deleteCount, kept: kept, cutoff: cutoffISO };
  } catch (e) {
    console.error('phxAuditCleanup90Days error:', e);
    Logger.log('[Cleanup] ERROR: ' + e.message);
    return { ok: false, error: String(e.message || e) };
  }
}

/** Preview what cleanup WOULD do — does NOT delete. Safe anytime. */
function phxAuditCleanupDryRun() {
  const sh = _phxGetAuditSheet();
  const lastRow = sh.getLastRow();
  if (lastRow <= 1) {
    Logger.log('No data rows — nothing to preview');
    return { staleCount: 0, keptCount: 0 };
  }
  const cutoff = Date.now() - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const tsData = sh.getRange(2, 1, lastRow - 1, 1).getValues();

  let firstFreshRowIdx = -1, newestStale = null, oldestKept = null;
  for (let i = 0; i < tsData.length; i++) {
    const ts = tsData[i][0];
    const tsMs = (ts instanceof Date) ? ts.getTime() : Date.parse(String(ts));
    if (isNaN(tsMs)) continue;
    if (tsMs >= cutoff) { firstFreshRowIdx = i; oldestKept = ts; break; }
    newestStale = ts;
  }

  const staleCount = (firstFreshRowIdx === -1) ? (lastRow - 1) : firstFreshRowIdx;
  const keptCount = (lastRow - 1) - staleCount;

  Logger.log('==================== DRY RUN ====================');
  Logger.log('Retention:  ' + AUDIT_RETENTION_DAYS + ' days');
  Logger.log('Cutoff:     ' + new Date(cutoff).toISOString());
  Logger.log('Total rows: ' + (lastRow - 1));
  Logger.log('Would DELETE: ' + staleCount);
  Logger.log('Would KEEP:   ' + keptCount);
  if (newestStale) Logger.log('Newest stale: ' + newestStale);
  if (oldestKept) Logger.log('Oldest kept:  ' + oldestKept);
  Logger.log('=================================================');
  return { staleCount: staleCount, keptCount: keptCount };
}

/** Install daily trigger at 3am. Idempotent — won't dup. */
function phxAuditInstallDailyTrigger() {
  const handler = 'phxAuditCleanup90Days';
  const existing = ScriptApp.getProjectTriggers().filter(function(t) {
    return t.getHandlerFunction() === handler;
  });
  if (existing.length > 0) {
    Logger.log('Trigger already exists — uniqueId=' + existing[0].getUniqueId());
    return { ok: true, status: 'already-exists', uniqueId: existing[0].getUniqueId() };
  }
  const trigger = ScriptApp.newTrigger(handler).timeBased().everyDays(1).atHour(3).create();
  Logger.log('✅ Trigger installed: ' + handler + ' daily @ 3am | uniqueId=' + trigger.getUniqueId());
  return { ok: true, status: 'installed', uniqueId: trigger.getUniqueId() };
}

/** Remove all daily triggers for phxAuditCleanup90Days. */
function phxAuditUninstallDailyTrigger() {
  const handler = 'phxAuditCleanup90Days';
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === handler) {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });
  Logger.log('Triggers removed: ' + removed);
  return { ok: true, removed: removed };
}

// ============================================================
// G3 — READ API (admin only — for G4 UI)
// ============================================================
/**
 * Query audit log. Admin only.
 *
 * @param {string} name        Admin name
 * @param {string} hash        Admin password hash
 * @param {string} filtersJson JSON: { userName?, action?, dateFrom?, dateTo?, limit?, offset? }
 *                             dateFrom/dateTo: ISO strings. limit default 100, max 500.
 * @returns {{ok:boolean, rows?, total?, error?}}
 */
function phxAuditQuery(name, hash, filtersJson) {
  try {
    if (!_phxVerifyAdminCaller_(name, hash)) {
      return { ok: false, error: 'not admin or invalid auth' };
    }
    let filters = {};
    try { filters = filtersJson ? JSON.parse(filtersJson) : {}; }
    catch (e) { return { ok: false, error: 'invalid filters json' }; }

    const userName = filters.userName ? String(filters.userName).trim() : '';
    const actionType = filters.action ? String(filters.action).trim() : '';
    const dateFrom = filters.dateFrom ? Date.parse(filters.dateFrom) : 0;
    const dateTo = filters.dateTo ? Date.parse(filters.dateTo) : Date.now();
    const limit = Math.min(filters.limit || 100, 500);
    const offset = filters.offset || 0;

    const sh = _phxGetAuditSheet();
    const lastRow = sh.getLastRow();
    if (lastRow <= 1) return { ok: true, rows: [], total: 0, offset: offset, limit: limit };

    const data = sh.getRange(2, 1, lastRow - 1, AUDIT_HEADERS.length).getValues();

    // Iterate newest → oldest, apply filters
    const matched = [];
    for (let i = data.length - 1; i >= 0; i--) {
      const row = data[i];
      const ts = row[0];
      const tsMs = (ts instanceof Date) ? ts.getTime() : Date.parse(String(ts));
      if (isNaN(tsMs)) continue;
      if (dateFrom && tsMs < dateFrom) continue;
      if (tsMs > dateTo) continue;
      if (userName && String(row[1] || '').trim() !== userName) continue;
      if (actionType && String(row[2] || '').trim() !== actionType) continue;

      matched.push({
        timestamp: String(row[0] instanceof Date ? row[0].toISOString() : row[0]),
        userName: String(row[1] || ''),
        action: String(row[2] || ''),
        target: String(row[3] || ''),
        before: String(row[4] || ''),
        after: String(row[5] || ''),
        source: String(row[6] || ''),
        sessionId: String(row[7] || '')
      });
    }

    const total = matched.length;
    const paged = matched.slice(offset, offset + limit);
    return { ok: true, rows: paged, total: total, offset: offset, limit: limit };
  } catch (e) {
    console.error('phxAuditQuery error:', e);
    return { ok: false, error: String(e.message || e) };
  }
}