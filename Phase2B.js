/**
 * Phase 2B — User Auth, Name Binding, Overlay Backup
 * ===================================================
 *
 * Sheet Schema:
 *
 *   In Master_Data spreadsheet (1bxlaH1J...):
 *     Tab: People (single source of truth for name registry + binding)
 *     ┌──────┬───────┬─────────────────┬────────┬──────────────┬─────────────┬──────────────┐
 *     │ Name │ Email │ Real Full Name  │ Source │ Backup Email │ Notify Pref │ Last Updated │
 *     └──────┴───────┴─────────────────┴────────┴──────────────┴─────────────┴──────────────┘
 *     - Column A (Name) = primary key, used for filter & overlay viewer_name
 *     - Column B (Email) = bound email (Firebase Auth identity)
 *     - Column G (Last Updated) = timestamp of last binding change (audit; Google Sheets
 *       also has revision history for full audit trail)
 *
 *   In Data_Log spreadsheet (1V1Fo4rE...):
 *     Tab: User_Overlays
 *     ┌───────┬───────────┬──────────┬─────────────┬───────────┬──────────────┬────────────┬─────────────┬────────┐
 *     │ email │ action_id │ month_id │ action_type │ shift_key │ payload_json │ created_at │ viewer_name │ status │
 *     └───────┴───────────┴──────────┴─────────────┴───────────┴──────────────┴────────────┴─────────────┴────────┘
 *     - status = 'active' or 'deleted' (soft delete for audit trail)
 *
 * Firebase Realtime DB paths:
 *   /pharmacist_names                                         (fast frontend read of names)
 *   /user_bindings/{emailKey}        → { boundName, lastUpdated }
 *
 * NOTE: Overlays are NOT mirrored to Firebase — User_Overlays sheet is the
 * sole source of truth. Cross-device sync works via GAS poll on data load
 * + periodic 30s safety net.
 *
 * Where emailKey = email.replace('.', ',').replace('@', '-at-')
 * (Firebase keys can't contain . or @)
 *
 * NOTE: All public functions take `email` as 1st arg from frontend.
 * Backend validates domain (@mahidol.ac.th) but trusts the email value
 * (frontend has already verified via Firebase Auth).
 */

const P2B_DATA_LOG_ID = '1V1Fo4rEadSYfqLDc1sZEE-fRtZ4Je5_30_EAclO3KHM';
const P2B_MASTER_DATA_ID = '1bxlaH1JAQ3RZtJsBVEqdMn4-dIjxX236wNOsTRRmijc';
const P2B_PEOPLE_TAB = 'People';
const P2B_OVERLAYS_TAB = 'User_Overlays';
const P2B_FB_BINDINGS = 'user_bindings';
const P2B_FB_OVERLAYS = 'user_overlays';
const P2B_FB_NAMES = 'pharmacist_names';
const P2B_CACHE_KEY_NAMES = 'p2b_pharmacist_names_v1';
const P2B_CACHE_KEY_OVERLAY_PREFIX = 'p2b_overlay_v1_';      // + emailKey + '_' + monthId
const P2B_CACHE_KEY_FB_FAILED = 'p2b_fb_failed_v1';          // queue of failed firebase syncs
const P2B_CACHE_TTL_SEC = 21600;                             // 6 hours (names)
const P2B_CACHE_TTL_OVERLAY_SEC = 600;                       // 10 min (overlays — short to catch cross-device)
const P2B_LOCK_TIMEOUT_MS = 5000;                            // wait up to 5s for lock
const P2B_ALLOWED_DOMAIN = '@mahidol.ac.th';
const P2B_PEOPLE_COL_LASTUPDATED = 7;                        // Column G

// ============================================================
// VALIDATION HELPERS
// ============================================================

function _p2b_validateEmail(email) {
  if (!email) return { ok: false, error: 'no_email', message: 'ไม่มี email' };
  if (!String(email).toLowerCase().endsWith(P2B_ALLOWED_DOMAIN)) {
    return { ok: false, error: 'domain', message: 'อนุญาตเฉพาะ ' + P2B_ALLOWED_DOMAIN };
  }
  return { ok: true };
}

function _p2b_emailKey(email) {
  return String(email).replace(/\./g, ',').replace(/@/g, '-at-');
}

// ============================================================
// SHEET ACCESSORS (auto-create if not exist)
// ============================================================

function _p2b_getOverlaysSheet() {
  const ss = SpreadsheetApp.openById(P2B_DATA_LOG_ID);
  let sh = ss.getSheetByName(P2B_OVERLAYS_TAB);
  if (!sh) {
    sh = ss.insertSheet(P2B_OVERLAYS_TAB);
    const headers = ['email', 'action_id', 'month_id', 'action_type', 'shift_key', 'payload_json', 'created_at', 'viewer_name', 'status'];
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#1e40af')
      .setFontColor('white')
      .setFontFamily('Kanit');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 220);
    sh.setColumnWidth(2, 180);
    sh.setColumnWidth(3, 170);
    sh.setColumnWidth(4, 100);
    sh.setColumnWidth(5, 280);
    sh.setColumnWidth(6, 280);
    sh.setColumnWidth(7, 170);
    sh.setColumnWidth(8, 130);
    sh.setColumnWidth(9, 80);
  }
  return sh;
}

// ============================================================
// USER BINDINGS API
// ============================================================

/**
 * Get the bound pharmacist name for a given email.
 *
 * SOURCE OF TRUTH: People sheet column B (in Master_Data spreadsheet).
 * If admin clears the email in People sheet → user is treated as unbound,
 * which triggers the binding modal again on next login.
 *
 * Google Sheets revision history provides full audit trail of changes.
 *
 * @return { ok, boundName?, lastUpdated? }
 */
function getUserBinding(email) {
  const v = _p2b_validateEmail(email);
  if (!v.ok) return v;
  try {
    const peopleSh = _p2b_getPeopleSheet();
    const lastRow = peopleSh.getLastRow();
    if (lastRow < 2) return { ok: true, boundName: null };

    const lastCol = Math.max(2, P2B_PEOPLE_COL_LASTUPDATED);
    const data = peopleSh.getRange(2, 1, lastRow - 1, lastCol).getValues();
    for (let i = 0; i < data.length; i++) {
      const rowEmail = data[i][1] ? String(data[i][1]).trim() : '';
      if (rowEmail === email) {
        const boundName = data[i][0] ? String(data[i][0]).trim() : '';
        if (!boundName) return { ok: true, boundName: null };
        const lu = data[i][P2B_PEOPLE_COL_LASTUPDATED - 1];
        return {
          ok: true,
          email: email,
          boundName: boundName,
          lastUpdated: lu ? (lu instanceof Date ? lu.toISOString() : String(lu)) : null
        };
      }
    }
    return { ok: true, boundName: null };
  } catch (e) {
    return { ok: false, error: 'read_failed', message: e.message };
  }
}

/**
 * Set or update binding. Writes to People sheet only (single source of truth).
 *
 * Will REJECT if the target name is already bound to a different email
 * (prevent duplicate bindings — only admin can override via direct sheet edit).
 */
function setUserBinding(email, boundName) {
  const v = _p2b_validateEmail(email);
  if (!v.ok) return v;
  if (!boundName || !String(boundName).trim()) {
    return { ok: false, error: 'empty_name', message: 'ชื่อว่างเปล่า' };
  }
  boundName = String(boundName).trim();

  const avail = _p2b_isNameAvailable(email, boundName);
  if (!avail.ok) return avail;
  if (!avail.available) {
    return {
      ok: false,
      error: 'name_taken',
      message: 'ชื่อ "' + boundName + '" ถูกผูกกับ user อื่นแล้ว',
      owner: avail.owner
    };
  }

  try {
    const result = _p2b_bindEmailToNameInPeople(email, boundName);
    // Sync to Firebase for fast frontend read
    _p2b_syncBindingToFirebase(email, {
      boundName: boundName,
      lastUpdated: new Date().toISOString()
    });
    return {
      ok: true,
      boundName: boundName,
      action: result.action,
      peopleSheet: result
    };
  } catch (e) {
    return { ok: false, error: 'write_failed', message: e.message };
  }
}

function _p2b_syncBindingToFirebase(email, binding) {
  try {
    const url = FIREBASE_DB_URL + '/' + P2B_FB_BINDINGS + '/' + _p2b_emailKey(email) + '.json';
    const r = UrlFetchApp.fetch(url, {
      method: 'put',
      contentType: 'application/json',
      payload: JSON.stringify(binding),
      muteHttpExceptions: true
    });
    return r.getResponseCode() === 200;
  } catch (e) {
    console.warn('[P2B] Firebase binding sync failed:', e.message);
    return false;
  }
}

// ============================================================
// OVERLAY ACTIONS API
// ============================================================

/**
 * Overlay Concurrency Model
 * ==========================
 *
 * SOURCE OF TRUTH: User_Overlays sheet (in Data_Log spreadsheet)
 *
 * Save path:
 *   1. LockService.acquire (max 5s wait) — prevents race when many users save concurrently
 *   2. Sheet write (single setValues call — batched even for single action)
 *   3. CacheService update (per-user-per-month overlay cache, 10 min TTL)
 *   4. Best-effort Firebase mirror (write to /user_overlays/{emailKey}/{monthId})
 *      — If fails, queued in CacheService for retry on next save
 *   5. LockService.release
 *
 * Load path:
 *   1. Try CacheService (fast, 10 min TTL)
 *   2. Cache miss → read Sheet → store in cache
 *   (Firebase is NOT read by backend — frontend can read it directly for instant updates,
 *    but Sheet remains the authoritative source.)
 *
 * Delete path: same as save but flips `status` column to 'deleted' (soft delete for audit).
 */

function _p2b_overlayCacheKey(email, monthId) {
  return P2B_CACHE_KEY_OVERLAY_PREFIX + _p2b_emailKey(email) + '_' + monthId;
}

function _p2b_invalidateOverlayCache(email, monthId) {
  try { CacheService.getScriptCache().remove(_p2b_overlayCacheKey(email, monthId)); }
  catch (e) { console.warn('[P2B] overlay cache invalidate:', e.message); }
}

function _p2b_acquireLock() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(P2B_LOCK_TIMEOUT_MS);
    return lock;
  } catch (e) {
    console.warn('[P2B] lock acquire failed:', e.message);
    return null;
  }
}

/**
 * Convert an action object to a sheet row.
 */
function _p2b_actionToRow(email, action) {
  return [
    email,
    action.id,
    action.monthId,
    action.action,
    action.shiftKey || '',
    JSON.stringify({
      partnerShiftKey: action.partnerShiftKey || '',
      partnerName: action.partnerName || '',
      originalOwner: action.originalOwner || ''
    }),
    action.createdAt || new Date().toISOString(),
    action.viewerName || '',
    'active'
  ];
}

/**
 * Convert a sheet row to an action object.
 */
function _p2b_rowToAction(row) {
  let payload = {};
  try { payload = row[5] ? JSON.parse(row[5]) : {}; } catch (e) {}
  return {
    id: row[1],
    monthId: row[2],
    action: row[3],
    shiftKey: row[4],
    partnerShiftKey: payload.partnerShiftKey || '',
    partnerName: payload.partnerName || '',
    originalOwner: payload.originalOwner || '',
    createdAt: row[6] ? (row[6] instanceof Date ? row[6].toISOString() : String(row[6])) : '',
    viewerName: row[7] || '',
    status: row[8] || 'active'
  };
}

/**
 * Save a single overlay action.
 * Same as saveOverlayActionsBatch with single-item array.
 */
function saveOverlayAction(email, action) {
  return saveOverlayActionsBatch(email, [action]);
}

/**
 * Atomic batch save with LockService — safe for concurrent multi-user writes.
 *
 * @return { ok, saved, firebaseSync }
 */
function saveOverlayActionsBatch(email, actions) {
  const v = _p2b_validateEmail(email);
  if (!v.ok) return v;
  if (!actions || !Array.isArray(actions) || actions.length === 0) {
    return { ok: true, saved: 0 };
  }
  // Validate each action has required fields
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    if (!a || !a.id || !a.monthId) {
      return { ok: false, error: 'invalid_action', message: 'action #' + i + ' missing id/monthId' };
    }
  }

  const lock = _p2b_acquireLock();
  if (!lock) {
    return { ok: false, error: 'lock_timeout', message: 'ระบบ busy — กรุณารอสักครู่' };
  }

  try {
    const sh = _p2b_getOverlaysSheet();
    const rows = actions.map(a => _p2b_actionToRow(email, a));
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, 9).setValues(rows);

    // Invalidate cache for each affected month
    const affectedMonths = {};
    actions.forEach(a => { affectedMonths[a.monthId] = true; });
    Object.keys(affectedMonths).forEach(m => _p2b_invalidateOverlayCache(email, m));

    // Best-effort Firebase mirror
    let fbOk = 0, fbFail = 0;
    actions.forEach(a => {
      if (_p2b_syncOverlayToFirebase(email, a)) fbOk++;
      else fbFail++;
    });
    if (fbFail > 0) _p2b_queueFailedFirebaseSync(email, actions);

    return { ok: true, saved: actions.length, firebaseOk: fbOk, firebaseFail: fbFail };
  } catch (e) {
    return { ok: false, error: 'batch_failed', message: e.message };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/**
 * Load all active overlays for a user + month.
 * Cache hit → ~10ms. Cache miss → ~500ms (sheet read).
 */
function loadUserOverlays(email, monthId) {
  const v = _p2b_validateEmail(email);
  if (!v.ok) return v;
  if (!monthId) return { ok: false, error: 'no_month' };

  // Try cache
  try {
    const cache = CacheService.getScriptCache();
    const raw = cache.get(_p2b_overlayCacheKey(email, monthId));
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ok: true, actions: parsed.actions || [], source: 'cache', cachedAt: parsed.cachedAt };
    }
  } catch (e) { console.warn('[P2B] overlay cache read:', e.message); }

  // Cache miss → read sheet
  try {
    const sh = _p2b_getOverlaysSheet();
    const lastRow = sh.getLastRow();
    if (lastRow < 2) {
      _p2b_setOverlayCache(email, monthId, []);
      return { ok: true, actions: [], source: 'sheet' };
    }
    const data = sh.getRange(2, 1, lastRow - 1, 9).getValues();
    const actions = [];
    for (let i = 0; i < data.length; i++) {
      if (data[i][0] === email && data[i][2] === monthId && data[i][8] === 'active') {
        actions.push(_p2b_rowToAction(data[i]));
      }
    }
    _p2b_setOverlayCache(email, monthId, actions);
    return { ok: true, actions: actions, source: 'sheet' };
  } catch (e) {
    return { ok: false, error: 'read_failed', message: e.message };
  }
}

function _p2b_setOverlayCache(email, monthId, actions) {
  try {
    const cache = CacheService.getScriptCache();
    cache.put(_p2b_overlayCacheKey(email, monthId), JSON.stringify({
      actions: actions,
      cachedAt: new Date().toISOString(),
      count: actions.length
    }), P2B_CACHE_TTL_OVERLAY_SEC);
  } catch (e) { console.warn('[P2B] overlay cache write:', e.message); }
}

/**
 * Cross-user read-only view (Phase 2B v29):
 * Returns all active overlays where the given name is involved either as
 * viewer (creator) OR as partner. Used by "ดูตารางจริงของ X" feature.
 *
 * Caches by viewedName + monthId (10 min TTL).
 *
 * @param {string} viewedName  pharmacist name to look up
 * @param {string} monthId
 * @return { ok, actions: [...], source: 'cache'|'sheet' }
 */
function loadOverlaysAffectingName(viewedName, monthId) {
  if (!viewedName) return { ok: false, error: 'no_name' };
  if (!monthId) return { ok: false, error: 'no_month' };

  const cacheKey = 'p2b_overlay_byname_v1_' + Utilities.base64EncodeWebSafe(String(viewedName)).substring(0, 40) + '_' + monthId;

  // Try cache
  try {
    const cache = CacheService.getScriptCache();
    const raw = cache.get(cacheKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ok: true, actions: parsed.actions || [], source: 'cache', viewedName: viewedName };
    }
  } catch (e) { console.warn('[P2B] byname cache read:', e.message); }

  try {
    const sh = _p2b_getOverlaysSheet();
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return { ok: true, actions: [], source: 'sheet', viewedName: viewedName };

    const data = sh.getRange(2, 1, lastRow - 1, 9).getValues();
    const actions = [];
    for (let i = 0; i < data.length; i++) {
      if (data[i][2] !== monthId) continue;
      if (data[i][8] === 'deleted') continue;
      // Parse the action to check viewerName + partnerName
      const act = _p2b_rowToAction(data[i]);
      const involved = act.viewerName === viewedName || act.partnerName === viewedName;
      if (involved) actions.push(act);
    }
    // Cache
    try {
      CacheService.getScriptCache().put(cacheKey, JSON.stringify({
        actions: actions, cachedAt: new Date().toISOString()
      }), P2B_CACHE_TTL_OVERLAY_SEC);
    } catch (e) {}
    return { ok: true, actions: actions, source: 'sheet', viewedName: viewedName };
  } catch (e) {
    return { ok: false, error: 'read_failed', message: e.message };
  }
}

/**
 * Soft-delete an overlay action (set status='deleted').
 * Atomic via LockService.
 */
function deleteOverlayAction(email, actionId) {
  const v = _p2b_validateEmail(email);
  if (!v.ok) return v;
  if (!actionId) return { ok: false, error: 'no_action_id' };

  const lock = _p2b_acquireLock();
  if (!lock) {
    return { ok: false, error: 'lock_timeout', message: 'ระบบ busy — กรุณารอสักครู่' };
  }

  try {
    const sh = _p2b_getOverlaysSheet();
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return { ok: false, error: 'not_found' };
    const data = sh.getRange(2, 1, lastRow - 1, 9).getValues();
    for (let i = 0; i < data.length; i++) {
      if (data[i][0] === email && data[i][1] === actionId) {
        sh.getRange(i + 2, 9).setValue('deleted');
        const monthId = data[i][2];
        _p2b_invalidateOverlayCache(email, monthId);
        _p2b_markDeletedInFirebase(email, monthId, actionId);
        return { ok: true };
      }
    }
    return { ok: false, error: 'not_found' };
  } catch (e) {
    return { ok: false, error: 'delete_failed', message: e.message };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// ============================================================
// FIREBASE MIRROR (best-effort, async-like — never blocks sheet save)
// ============================================================

function _p2b_syncOverlayToFirebase(email, action) {
  try {
    const path = P2B_FB_OVERLAYS + '/' + _p2b_emailKey(email) + '/' + action.monthId + '/' + action.id;
    const url = FIREBASE_DB_URL + '/' + path + '.json';
    const r = UrlFetchApp.fetch(url, {
      method: 'put',
      contentType: 'application/json',
      payload: JSON.stringify(Object.assign({}, action, { status: 'active' })),
      muteHttpExceptions: true
    });
    return r.getResponseCode() === 200;
  } catch (e) {
    console.warn('[P2B] Firebase overlay sync failed:', e.message);
    return false;
  }
}

function _p2b_markDeletedInFirebase(email, monthId, actionId) {
  try {
    const path = P2B_FB_OVERLAYS + '/' + _p2b_emailKey(email) + '/' + monthId + '/' + actionId + '/status';
    const url = FIREBASE_DB_URL + '/' + path + '.json';
    const r = UrlFetchApp.fetch(url, {
      method: 'put',
      contentType: 'application/json',
      payload: '"deleted"',
      muteHttpExceptions: true
    });
    return r.getResponseCode() === 200;
  } catch (e) {
    console.warn('[P2B] Firebase mark deleted failed:', e.message);
    return false;
  }
}

/**
 * Queue actions whose Firebase sync failed. Retry on next save batch.
 */
function _p2b_queueFailedFirebaseSync(email, actions) {
  try {
    const cache = CacheService.getScriptCache();
    let queue = [];
    const raw = cache.get(P2B_CACHE_KEY_FB_FAILED);
    if (raw) {
      try { queue = JSON.parse(raw); } catch (e) {}
    }
    actions.forEach(a => queue.push({ email: email, action: a, queuedAt: new Date().toISOString() }));
    // Cap at 100 to prevent unbounded growth
    if (queue.length > 100) queue = queue.slice(-100);
    cache.put(P2B_CACHE_KEY_FB_FAILED, JSON.stringify(queue), P2B_CACHE_TTL_SEC);
  } catch (e) { console.warn('[P2B] queue failed fb sync:', e.message); }
}

/**
 * Retry queued Firebase syncs. Call from a time-based trigger (e.g. every 5 min)
 * or manually from Apps Script editor.
 */
function p2bRetryFailedFirebaseSyncs() {
  try {
    const cache = CacheService.getScriptCache();
    const raw = cache.get(P2B_CACHE_KEY_FB_FAILED);
    if (!raw) {
      Logger.log('No failed syncs to retry');
      return { ok: true, retried: 0 };
    }
    const queue = JSON.parse(raw);
    let success = 0, fail = 0;
    const remaining = [];
    queue.forEach(item => {
      if (_p2b_syncOverlayToFirebase(item.email, item.action)) {
        success++;
      } else {
        fail++;
        remaining.push(item);
      }
    });
    if (remaining.length > 0) {
      cache.put(P2B_CACHE_KEY_FB_FAILED, JSON.stringify(remaining), P2B_CACHE_TTL_SEC);
    } else {
      cache.remove(P2B_CACHE_KEY_FB_FAILED);
    }
    const result = { ok: true, retried: queue.length, success: success, fail: fail };
    Logger.log('=== retryFailedFirebaseSyncs ===');
    Logger.log(JSON.stringify(result, null, 2));
    return result;
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ============================================================
// PHARMACIST NAMES & CHANGE DETECTION
// ============================================================

// ============================================================
// PEOPLE SHEET (master name registry)
// ============================================================
// People sheet schema (in Master_Data spreadsheet):
//   A: Name (Thai short name, primary key for filtering)
//   B: Email (Firebase Auth identity, populated when user binds)
//   C: Real Full Name (optional, for HR/admin reference)
//   D: Source (where name was added from: "schedule_<value>", "binding_custom", or manual)
//   E: Backup Email (optional)
//   F: Notify Pref (optional, for future)
//
// READ HIERARCHY (fastest first):
//   1. Apps Script CacheService (~10ms, 6h TTL) — JSON-like cache
//   2. People sheet read (~500ms) — source of truth
//   3. Firebase /pharmacist_names — for frontend direct read (no GAS roundtrip)

function _p2b_getCachedNames() {
  try {
    const cache = CacheService.getScriptCache();
    const raw = cache.get(P2B_CACHE_KEY_NAMES);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[P2B] Cache read failed:', e.message);
    return null;
  }
}

function _p2b_setCachedNames(names) {
  try {
    const cache = CacheService.getScriptCache();
    cache.put(P2B_CACHE_KEY_NAMES, JSON.stringify({
      names: names,
      cachedAt: new Date().toISOString(),
      count: names.length
    }), P2B_CACHE_TTL_SEC);
    return true;
  } catch (e) {
    console.warn('[P2B] Cache write failed:', e.message);
    return false;
  }
}

function _p2b_invalidateNamesCache() {
  try { CacheService.getScriptCache().remove(P2B_CACHE_KEY_NAMES); }
  catch (e) { console.warn('[P2B] Cache invalidate failed:', e.message); }
}

function _p2b_getPeopleSheet() {
  const ss = SpreadsheetApp.openById(P2B_MASTER_DATA_ID);
  let sh = ss.getSheetByName(P2B_PEOPLE_TAB);
  if (!sh) {
    throw new Error('Tab "' + P2B_PEOPLE_TAB + '" ไม่พบใน Master_Data sheet — กรุณาสร้าง tab พร้อม headers: Name | Email | Real Full Name | Source | Backup Email | Notify Pref');
  }
  return sh;
}

/**
 * Read all names from People sheet (Column A).
 * Uses CacheService for fast subsequent reads (6h TTL).
 *
 * @param {boolean} [forceRefresh] skip cache, read fresh from sheet
 */
function getAllNamesFromPeople(forceRefresh) {
  // Cache hit
  if (!forceRefresh) {
    const cached = _p2b_getCachedNames();
    if (cached && cached.names) {
      return { ok: true, names: cached.names, source: 'cache', cachedAt: cached.cachedAt };
    }
  }
  // Cache miss → read sheet
  try {
    const sh = _p2b_getPeopleSheet();
    const lastRow = sh.getLastRow();
    if (lastRow < 2) {
      _p2b_setCachedNames([]);
      return { ok: true, names: [], source: 'sheet' };
    }
    const data = sh.getRange(2, 1, lastRow - 1, 1).getValues();
    const names = [];
    const seen = {};
    data.forEach(row => {
      const n = row[0] ? String(row[0]).trim() : '';
      if (n && !seen[n]) {
        seen[n] = true;
        names.push(n);
      }
    });
    names.sort((a, b) => a.localeCompare(b, 'th'));
    _p2b_setCachedNames(names);
    return { ok: true, names, source: 'sheet' };
  } catch (e) {
    return { ok: false, error: 'read_failed', message: e.message };
  }
}

/**
 * Read name → email map from People sheet.
 */
function getPeopleBindings() {
  try {
    const sh = _p2b_getPeopleSheet();
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return { ok: true, bindings: {} };
    const data = sh.getRange(2, 1, lastRow - 1, 2).getValues();
    const bindings = {};
    data.forEach(row => {
      const name = row[0] ? String(row[0]).trim() : '';
      const email = row[1] ? String(row[1]).trim() : '';
      if (name && email) bindings[name] = email;
    });
    return { ok: true, bindings };
  } catch (e) {
    return { ok: false, error: 'read_failed', message: e.message };
  }
}

/**
 * Combined API for frontend binding modal:
 * returns names + which are taken (by anyone) + which is yours.
 *
 * @param {string} email  caller's email — used to identify "myName"
 */
function getNamesWithBindingStatus(email) {
  try {
    const namesRes = getAllNamesFromPeople();
    const bindingsRes = getPeopleBindings();
    if (!namesRes.ok) return namesRes;

    const taken = {};
    let myName = null;
    if (bindingsRes.ok) {
      Object.keys(bindingsRes.bindings).forEach(function(name) {
        const e = bindingsRes.bindings[name];
        if (e) {
          taken[name] = true;
          if (e === email) myName = name;
        }
      });
    }
    return { ok: true, names: namesRes.names, taken: taken, myName: myName };
  } catch (e) {
    return { ok: false, error: 'fetch_failed', message: e.message };
  }
}

/**
 * Check if a name can be bound by this email.
 * Returns { ok, available, owner? } — owner is the masked email of the existing binder.
 */
function _p2b_isNameAvailable(email, name) {
  try {
    const sh = _p2b_getPeopleSheet();
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return { ok: true, available: true };
    const data = sh.getRange(2, 1, lastRow - 1, 2).getValues();
    for (let i = 0; i < data.length; i++) {
      const rowName = data[i][0] ? String(data[i][0]).trim() : '';
      const rowEmail = data[i][1] ? String(data[i][1]).trim() : '';
      if (rowName === name) {
        if (!rowEmail || rowEmail === email) return { ok: true, available: true };
        // Mask email for privacy: "norapol.utt@mahidol.ac.th" → "nor***@mahidol.ac.th"
        const masked = rowEmail.replace(/^(.{3}).*?(@.*)$/, '$1***$2');
        return { ok: true, available: false, owner: masked };
      }
    }
    return { ok: true, available: true };  // name not in sheet → can bind (custom)
  } catch (e) {
    return { ok: false, error: 'check_failed', message: e.message };
  }
}

/**
 * Write email to Column B of People sheet for the row matching name.
 * If name not found, append a new row (custom name case).
 * Also clears email from any OTHER row that previously had this email
 * (so one email is bound to at most one name in the sheet).
 */
function _p2b_bindEmailToNameInPeople(email, name) {
  const sh = _p2b_getPeopleSheet();
  const lastRow = sh.getLastRow();
  const now = new Date();
  let targetRow = -1;
  let oldRow = -1;

  if (lastRow >= 2) {
    const data = sh.getRange(2, 1, lastRow - 1, 2).getValues();
    for (let i = 0; i < data.length; i++) {
      const rowName = data[i][0] ? String(data[i][0]).trim() : '';
      const rowEmail = data[i][1] ? String(data[i][1]).trim() : '';
      if (rowName === name) targetRow = i + 2;
      if (rowEmail === email && rowName !== name) oldRow = i + 2;
    }
  }

  if (oldRow > 0) {
    // Clear old binding + bump timestamp on the old row
    sh.getRange(oldRow, 2).clearContent();
    sh.getRange(oldRow, P2B_PEOPLE_COL_LASTUPDATED).setValue(now);
  }

  if (targetRow > 0) {
    sh.getRange(targetRow, 2).setValue(email);
    sh.getRange(targetRow, P2B_PEOPLE_COL_LASTUPDATED).setValue(now);
    _p2b_invalidateNamesCache();
    return { ok: true, row: targetRow, action: 'updated' };
  }
  // Append new row (custom name) — write 7 columns including timestamp
  const newRow = [name, email, '', 'binding_custom_' + now.toISOString().substring(0, 10), '', '', now];
  sh.getRange(sh.getLastRow() + 1, 1, 1, 7).setValues([newRow]);
  _p2b_invalidateNamesCache();
  _p2b_syncNamesToFirebase();
  return { ok: true, row: sh.getLastRow(), action: 'appended' };
}

/**
 * Compare names from schedule data of monthValue with People sheet.
 * Add new names to People sheet's Column A.
 */
function addNamesFromScheduleIfMissing(monthValue) {
  try {
    const res = getScheduleData(monthValue);
    if (!res || res.error || !res.data) {
      return { ok: false, error: 'no_schedule_data', message: (res && res.error) || 'ไม่พบข้อมูล' };
    }
    const sh = _p2b_getPeopleSheet();
    const lastRow = sh.getLastRow();
    const existing = {};
    if (lastRow >= 2) {
      const data = sh.getRange(2, 1, lastRow - 1, 1).getValues();
      data.forEach(row => {
        const n = row[0] ? String(row[0]).trim() : '';
        if (n) existing[n] = true;
      });
    }
    const newSet = {};
    res.data.forEach(s => {
      const n = s.name ? String(s.name).trim() : '';
      if (n && !existing[n] && !newSet[n]) newSet[n] = true;
    });
    const toAdd = Object.keys(newSet);
    if (toAdd.length === 0) {
      return { ok: true, added: 0, message: 'ไม่มีชื่อใหม่' };
    }
    const source = 'schedule_' + monthValue;
    const newRows = toAdd.map(n => [n, '', '', source, '', '']);
    sh.getRange(sh.getLastRow() + 1, 1, newRows.length, 6).setValues(newRows);
    _p2b_invalidateNamesCache();
    _p2b_syncNamesToFirebase();
    return { ok: true, added: toAdd.length, names: toAdd };
  } catch (e) {
    return { ok: false, error: 'sync_failed', message: e.message };
  }
}

function _p2b_syncNamesToFirebase() {
  try {
    const all = getAllNamesFromPeople(true);  // force refresh after cache invalidation
    if (!all.ok) return false;
    const url = FIREBASE_DB_URL + '/' + P2B_FB_NAMES + '.json';
    UrlFetchApp.fetch(url, {
      method: 'put',
      contentType: 'application/json',
      payload: JSON.stringify({
        names: all.names,
        updatedAt: new Date().toISOString(),
        count: all.names.length
      }),
      muteHttpExceptions: true
    });
    return true;
  } catch (e) {
    console.warn('[P2B] Names sync to Firebase failed:', e.message);
    return false;
  }
}

// ============================================================
// PUBLIC NAME API (unified — for both main page search and binding modal)
// ============================================================

/**
 * Get all pharmacist names — uses People sheet as source of truth.
 * Falls back to schedule data if People sheet is empty.
 *
 * @param {string} [monthValue] optional — if provided, will also union schedule names
 */
function getAllPharmacistNames(monthValue) {
  // Primary: People sheet
  const peopleRes = getAllNamesFromPeople();
  let names = (peopleRes.ok ? peopleRes.names : []);

  // Union with current month's schedule names (in case sheet is out of sync)
  if (monthValue) {
    try {
      const res = getScheduleData(monthValue);
      if (res && res.data && res.data.length) {
        const seen = {};
        names.forEach(n => { seen[n] = true; });
        res.data.forEach(s => {
          const n = s.name ? String(s.name).trim() : '';
          if (n && !seen[n]) {
            seen[n] = true;
            names.push(n);
          }
        });
        names.sort((a, b) => a.localeCompare(b, 'th'));
      }
    } catch (e) { /* ignore — fallback to People-only */ }
  }

  if (names.length === 0) {
    return { ok: false, error: 'no_names', message: 'ไม่พบรายชื่อทั้งใน People sheet และ schedule' };
  }
  return { ok: true, names, source: peopleRes.ok ? 'people' : 'schedule_only' };
}

/**
 * Check if user's bound name is still present in current month.
 * If missing, suggest similar candidates (e.g., "ดวงกมล" vs "ดวงกมล (จ.)").
 *
 * @param {string} email
 * @param {string} monthValue  same input as getAllPharmacistNames
 */
function detectNameChangesForUser(email, monthValue) {
  const binding = getUserBinding(email);
  if (!binding.ok) return binding;
  if (!binding.boundName) return { ok: true, found: false, noBinding: true };

  const all = getAllPharmacistNames(monthValue);
  if (!all.ok) return all;

  if (all.names.indexOf(binding.boundName) >= 0) {
    return { ok: true, found: true, boundName: binding.boundName };
  }

  const stripParen = s => String(s).replace(/\s*\([^)]+\)\s*/g, '').trim();
  const baseBound = stripParen(binding.boundName);
  const candidates = all.names.filter(n => stripParen(n) === baseBound && n !== binding.boundName);

  return {
    ok: true,
    found: false,
    boundName: binding.boundName,
    candidates: candidates,
    message: candidates.length > 0
      ? 'ชื่อ "' + binding.boundName + '" ไม่มีในเดือนนี้ — มี ' + candidates.length + ' ชื่อใกล้เคียง'
      : 'ชื่อ "' + binding.boundName + '" ไม่มีในเดือนนี้'
  };
}

// ============================================================
// INITIALIZATION
// ============================================================

/**
 * Run once from Apps Script editor to ensure required tabs exist.
 * Creates User_Overlays in Data_Log. People tab is expected to already
 * exist in Master_Data (admin sets it up).
 * Safe to call multiple times (idempotent).
 */
function initPhase2BSheets() {
  let peopleStatus = 'unknown';
  try {
    const sh = _p2b_getPeopleSheet();
    peopleStatus = 'found (' + (sh.getLastRow() - 1) + ' names)';
  } catch (e) {
    peopleStatus = 'MISSING — ' + e.message;
  }
  _p2b_getOverlaysSheet();
  const result = {
    ok: peopleStatus.indexOf('MISSING') < 0,
    overlaysTab: 'ready',
    peopleTab: peopleStatus,
    masterDataSheet: 'https://docs.google.com/spreadsheets/d/' + P2B_MASTER_DATA_ID,
    dataLogSheet: 'https://docs.google.com/spreadsheets/d/' + P2B_DATA_LOG_ID
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/**
 * Health check — verify all P2B systems work.
 * Run from Apps Script editor → check Execution log for results.
 */
function p2bHealthCheck() {
  const result = {
    overlaysTab: false,
    peopleSheetAccess: false,
    peopleNameCount: 0,
    peopleEmailBindings: 0,
    firebaseConnect: false,
    firebaseUrlOk: false,
    errors: []
  };
  try { _p2b_getOverlaysSheet(); result.overlaysTab = true; }
  catch (e) { result.errors.push('overlays: ' + e.message); }
  try {
    const pp = getAllNamesFromPeople(true);
    if (pp.ok) {
      result.peopleSheetAccess = true;
      result.peopleNameCount = pp.names.length;
    } else {
      result.errors.push('people: ' + pp.message);
    }
    const bp = getPeopleBindings();
    if (bp.ok) result.peopleEmailBindings = Object.keys(bp.bindings).length;
  } catch (e) { result.errors.push('people: ' + e.message); }

  try {
    if (typeof FIREBASE_DB_URL === 'undefined') {
      result.errors.push('FIREBASE_DB_URL not defined in Code.gs');
    } else {
      result.firebaseUrlOk = true;
      try {
        const r = UrlFetchApp.fetch(FIREBASE_DB_URL + '/_p2b_test.json', {
          method: 'put',
          contentType: 'application/json',
          payload: '"ping"',
          muteHttpExceptions: true
        });
        result.firebaseConnect = r.getResponseCode() === 200;
        if (r.getResponseCode() !== 200) {
          result.errors.push('firebase write code=' + r.getResponseCode() + ' body=' + r.getContentText().substring(0, 200));
        }
        UrlFetchApp.fetch(FIREBASE_DB_URL + '/_p2b_test.json', { method: 'delete', muteHttpExceptions: true });
      } catch (e) { result.errors.push('firebase fetch: ' + e.message); }
    }
  } catch (e) { result.errors.push('firebase check: ' + e.message); }

  Logger.log('=== p2bHealthCheck ===');
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/**
 * Debug helper — call from Apps Script editor to verify
 * getScheduleData works with a known month value.
 * Run after picking a sheet/month in Data_Log.
 */
function p2bDebugGetNames(monthValue) {
  // If no arg, try to get list of available months
  if (!monthValue) {
    try {
      const months = getAvailableMonths();  // assumed to exist in Code.gs
      Logger.log('Available months: ' + JSON.stringify(months));
      Logger.log('Pass one of the values as argument to test getAllPharmacistNames');
      return { ok: false, hint: 'pass a monthValue', months: months };
    } catch (e) {
      Logger.log('getAvailableMonths failed: ' + e.message);
      return { ok: false, error: 'no monthValue provided' };
    }
  }
  const res = getAllPharmacistNames(monthValue);
  Logger.log('getAllPharmacistNames(' + monthValue + ') →');
  Logger.log(JSON.stringify(res, null, 2));
  return res;
}

/**
 * Debug helper — list raw contents of People sheet.
 */
function p2bDebugListPeopleSheet() {
  try {
    const sh = _p2b_getPeopleSheet();
    const lastRow = sh.getLastRow();
    const lastCol = Math.min(sh.getLastColumn(), 6);
    Logger.log('People sheet: ' + lastRow + ' rows, ' + lastCol + ' cols');
    if (lastRow >= 1) {
      const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
      Logger.log('Headers: ' + JSON.stringify(headers));
    }
    if (lastRow >= 2) {
      const data = sh.getRange(2, 1, Math.min(lastRow - 1, 50), lastCol).getValues();
      Logger.log('First 50 rows:');
      data.forEach((row, i) => Logger.log((i + 2) + ': ' + JSON.stringify(row)));
    }
    return { ok: true, totalRows: lastRow - 1 };
  } catch (e) {
    Logger.log('Error: ' + e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * Run once to populate People sheet from ALL months in Data_Log.
 * Useful for initial setup if People sheet is empty.
 */
function p2bSyncAllMonthNames() {
  let months = null;
  try {
    months = getAvailableMonths();
  } catch (e) {
    Logger.log('getAvailableMonths failed: ' + e.message);
    return { ok: false, error: e.message };
  }
  Logger.log('Found ' + (months ? months.length : 0) + ' months');
  let totalAdded = 0;
  const details = [];
  (months || []).forEach(m => {
    const v = m.value !== undefined ? m.value : (m.id !== undefined ? m.id : m);
    Logger.log('Processing month value: ' + v);
    const res = addNamesFromScheduleIfMissing(v);
    if (res.ok) {
      totalAdded += (res.added || 0);
      details.push({ monthValue: v, added: res.added, names: res.names });
    } else {
      details.push({ monthValue: v, error: res.message });
    }
  });
  const result = { ok: true, totalAdded, details };
  Logger.log('=== p2bSyncAllMonthNames result ===');
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/**
 * One-time cleanup: remove the old User_Bindings tab from Data_Log.
 * Run after migrating to People-sheet-only binding (Phase 2B v26+).
 * Idempotent — safe to skip if tab doesn't exist.
 */
function p2bRemoveOldUserBindings() {
  try {
    const ss = SpreadsheetApp.openById(P2B_DATA_LOG_ID);
    const sh = ss.getSheetByName('User_Bindings');
    if (!sh) {
      Logger.log('User_Bindings tab already removed (or never existed) — no-op.');
      return { ok: true, removed: false };
    }
    ss.deleteSheet(sh);
    Logger.log('Removed User_Bindings tab from Data_Log');
    return { ok: true, removed: true };
  } catch (e) {
    Logger.log('Remove failed: ' + e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * One-time cleanup: remove the old /user_overlays branch from Firebase.
 * Run after migrating to Sheet-only overlays (Phase 2B v26+).
 * Idempotent — safe to skip if path doesn't exist.
 */
function p2bRemoveFirebaseOverlays() {
  try {
    if (typeof FIREBASE_DB_URL === 'undefined') {
      Logger.log('FIREBASE_DB_URL not defined — skipping');
      return { ok: false, error: 'no firebase url' };
    }
    const url = FIREBASE_DB_URL + '/user_overlays.json';
    const r = UrlFetchApp.fetch(url, { method: 'delete', muteHttpExceptions: true });
    const code = r.getResponseCode();
    Logger.log('DELETE /user_overlays → HTTP ' + code);
    return { ok: code === 200, httpCode: code };
  } catch (e) {
    Logger.log('Remove failed: ' + e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * Run this AFTER manually editing the People sheet (adding/removing names by hand).
 * Forces refresh of:
 *   - CacheService cache
 *   - Firebase /pharmacist_names
 *
 * No-op if no changes detected.
 */
function p2bRefreshPeopleSheet() {
  Logger.log('=== p2bRefreshPeopleSheet ===');
  _p2b_invalidateNamesCache();
  const res = getAllNamesFromPeople(true);
  if (!res.ok) {
    Logger.log('Refresh failed: ' + res.message);
    return res;
  }
  Logger.log('Names in People sheet: ' + res.names.length);
  const fbOk = _p2b_syncNamesToFirebase();
  Logger.log('Firebase sync: ' + (fbOk ? 'OK' : 'FAILED'));
  return { ok: true, nameCount: res.names.length, firebaseSync: fbOk };
}