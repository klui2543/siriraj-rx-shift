/**
 * ════════════════════════════════════════════════════════════
 * ⚙️ PHASE Z H — User Preferences Sync
 * ════════════════════════════════════════════════════════════
 *
 * Stores per-user UI preferences as JSON in PHX_Pharmacists column 5.
 * Settings synced across devices when "บันทึกการตั้งค่า" enabled.
 *
 * Schema (PHX_Pharmacists):
 *   1 name | 2 passwordHash | 3 createdAt | 4 lastSeenAt | 5 preferences (JSON)
 *
 * Public API:
 *   phxGetPreferences(name, hash)
 *   phxSetPreferences(name, hash, prefsJson)
 *   devAddPreferencesColumn()   ← run once to add column header
 *
 * Apply: paste เป็นไฟล์ใหม่ `Phase_Z_H_Preferences.gs`
 * Then run devAddPreferencesColumn() once.
 *
 * Requires B1: _phxGetSheet, _phxFindPharmacistRow, _phxTouchLastSeen
 *          B3: _phxVerifyAuth (or equivalent)
 */

const _H_PREFS_COL = 10;  // col J (col E=backupEmail, F-G=reminder, H=announceChannels, I=reserved F2)
const _H_MAX_PREFS_LEN = 4000;  // safety cap


// ════════════════════════════════════════════════════════════
// 📖 Get preferences for a user
// ════════════════════════════════════════════════════════════
function phxGetPreferences(name, hash) {
  try {
    // Auth via B3 helper (or use _phxFindPharmacistRow directly for compat)
    const row = _phxFindPharmacistRow(name);
    if (!row) return { success: false, error: 'not found' };
    if (String(row.passwordHash) !== String(hash)) {
      return { success: false, error: 'auth failed' };
    }
    if (typeof _phxTouchLastSeen === 'function') _phxTouchLastSeen(name);

    const sh = _phxGetSheet('PHX_Pharmacists');
    const lastCol = sh.getLastColumn();
    if (lastCol < _H_PREFS_COL) {
      // Column missing — return empty prefs
      return { success: true, prefs: {} };
    }
    const raw = sh.getRange(row.rowIndex, _H_PREFS_COL).getValue();
    if (!raw) return { success: true, prefs: {} };
    let prefs = {};
    try { prefs = JSON.parse(String(raw)); }
    catch (e) { prefs = {}; }
    return { success: true, prefs: prefs };
  } catch (e) {
    console.error('phxGetPreferences error: ' + e.message);
    return { success: false, error: e.message };
  }
}


// ════════════════════════════════════════════════════════════
// 💾 Set preferences for a user
// ════════════════════════════════════════════════════════════
function phxSetPreferences(name, hash, prefsJson) {
  try {
    const row = _phxFindPharmacistRow(name);
    if (!row) return { success: false, error: 'not found' };
    if (String(row.passwordHash) !== String(hash)) {
      return { success: false, error: 'auth failed' };
    }
    if (typeof _phxTouchLastSeen === 'function') _phxTouchLastSeen(name);

    const str = String(prefsJson || '{}');
    if (str.length > _H_MAX_PREFS_LEN) {
      return { success: false, error: 'preferences too large (>4KB)' };
    }
    // Validate it's JSON
    try { JSON.parse(str); }
    catch (e) { return { success: false, error: 'invalid JSON' }; }

    const sh = _phxGetSheet('PHX_Pharmacists');
    // Ensure column exists
    if (sh.getLastColumn() < _H_PREFS_COL) {
      sh.getRange(1, _H_PREFS_COL).setValue('preferences');
    }
    sh.getRange(row.rowIndex, _H_PREFS_COL).setValue(str);
    return { success: true };
  } catch (e) {
    console.error('phxSetPreferences error: ' + e.message);
    return { success: false, error: e.message };
  }
}


// ════════════════════════════════════════════════════════════
// 🔧 One-time migration: add preferences column header
// ════════════════════════════════════════════════════════════
function devAddPreferencesColumn() {
  try {
    const sh = _phxGetSheet('PHX_Pharmacists');
    const lastCol = sh.getLastColumn();
    if (lastCol >= _H_PREFS_COL) {
      const existing = String(sh.getRange(1, _H_PREFS_COL).getValue() || '').trim();
      if (existing) {
        Logger.log('Column ' + _H_PREFS_COL + ' already exists: "' + existing + '"');
        return { success: true, message: 'already exists', existing: existing };
      }
    }
    sh.getRange(1, _H_PREFS_COL).setValue('preferences');
    Logger.log('Added "preferences" header at column ' + _H_PREFS_COL);
    return { success: true, message: 'header added' };
  } catch (e) {
    Logger.log('devAddPreferencesColumn error: ' + e.message);
    return { success: false, error: e.message };
  }
}


// ════════════════════════════════════════════════════════════
// 🧪 Tests
// ════════════════════════════════════════════════════════════

function testHGet() {
  // ★ แก้ชื่อ + password
  const NAME = 'ณรพล';
  const HASH = _phxHashPassword(NAME, 'klui2543');
  const r = phxGetPreferences(NAME, HASH);
  Logger.log('Get prefs: ' + JSON.stringify(r, null, 2));
}

function testHSet() {
  const NAME = 'ณรพล';
  const HASH = _phxHashPassword(NAME, 'klui2543');
  const PREFS = { hideStruck: true, theme: 'dark', round3Mode: 'next' };
  const r = phxSetPreferences(NAME, HASH, JSON.stringify(PREFS));
  Logger.log('Set prefs: ' + JSON.stringify(r));
}

function testHRoundtrip() {
  const NAME = 'ณรพล';
  const HASH = _phxHashPassword(NAME, 'klui2543');
  // Set
  const prefsIn = { hideStruck: true, theme: 'dark', round3Mode: 'start', testTimestamp: new Date().toISOString() };
  const rSet = phxSetPreferences(NAME, HASH, JSON.stringify(prefsIn));
  Logger.log('SET: ' + JSON.stringify(rSet));
  // Get
  const rGet = phxGetPreferences(NAME, HASH);
  Logger.log('GET: ' + JSON.stringify(rGet, null, 2));
  // Verify match
  if (rGet.success && JSON.stringify(rGet.prefs) === JSON.stringify(prefsIn)) {
    Logger.log('✅ MATCH');
  } else {
    Logger.log('❌ MISMATCH');
  }
}
