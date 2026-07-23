/**
 * Phase F4: LINE Identity Linking (v3.54)
 *
 * Links a LINE 1:1 chat (source.type === 'user') to an existing Siriraj Rx Shift account,
 * via a one-time 6-digit code — no LIFF/LINE Login channel needed, reuses the existing
 * Messaging API channel already configured in Phase_F2_LINE.js.
 *
 * Flow:
 *   1. Logged-in user opens "เชื่อมต่อ LINE" in the web app → phxLineGenerateLinkCode(name, hash)
 *      → 6-digit code, valid 10 minutes.
 *   2. User sends that code to the OA in a 1:1 chat.
 *   3. Phase_F2_LINE.js routes it here via _phxLineHandleLinkAttempt(userId, text).
 *
 * Public API:
 *   phxLineGenerateLinkCode(name, pwHash)
 *
 * Called from Phase_F2_LINE.js:
 *   _phxLineHandleLinkAttempt(lineUserId, text)
 *   _phxFindPharmacistRowByLineUserId(lineUserId)
 *
 * Sheet: PHX_LineLinkCodes
 *   Columns: code | name | createdAt | expiresAt | status(pending/used/expired) | lineUserId | usedAt
 *
 * Requires: Phase_Z_B1_Auth.js (_phxGetSheet, _phxFindPharmacistRow)
 *           Phase_Z_B3_Sync.js (_phxVerifyAuth)
 *           Phase_G_AuditLog.js (phxLogAuditSystem)
 */

var _F4_LINK_CODES_SHEET = 'PHX_LineLinkCodes';
var _F4_LINK_TTL_MS = 10 * 60 * 1000; // 10 minutes

function _phxLineGetLinkCodesSheet() {
  var ss = SpreadsheetApp.openById(SCHEDULE_SHEET_ID);
  var sh = ss.getSheetByName(_F4_LINK_CODES_SHEET);
  if (!sh) {
    sh = ss.insertSheet(_F4_LINK_CODES_SHEET);
    sh.getRange(1, 1, 1, 7).setValues([['code', 'name', 'createdAt', 'expiresAt', 'status', 'lineUserId', 'usedAt']]);
    sh.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#06c755').setFontColor('#fff');
    sh.setFrozenRows(1);
    sh.hideSheet();
  }
  return sh;
}

function _phxLineGenerateCode6_() {
  var n = Math.floor(100000 + Math.random() * 900000);
  return String(n);
}

// ════════════════════════════════════════════════════════════
// 🌐 Public: called from Index.html (logged-in user, name + passwordHash from localStorage)
// ════════════════════════════════════════════════════════════
function phxLineGenerateLinkCode(rawName, pwHash) {
  try {
    var auth = _phxVerifyAuth(rawName, pwHash); // from Phase_Z_B3_Sync.js — same auth as the rest of the app
    if (!auth) return { success: false, error: 'auth failed — กรุณา login ใหม่' };

    var sh = _phxLineGetLinkCodesSheet();
    _phxLineExpireOldCodes_(sh);

    var code = _phxLineGenerateCode6_();
    var now = new Date();
    var expiresAt = new Date(now.getTime() + _F4_LINK_TTL_MS);
    sh.appendRow([code, auth.name, now, expiresAt, 'pending', '', '']);

    return {
      success: true,
      code: code,
      expiresAt: expiresAt.toISOString(),
      ttlSeconds: Math.floor(_F4_LINK_TTL_MS / 1000)
    };
  } catch (e) {
    console.error('phxLineGenerateLinkCode error: ' + e.message);
    return { success: false, error: 'เกิดข้อผิดพลาด: ' + e.message };
  }
}

// housekeeping — mark stale pending codes as expired (best-effort, runs opportunistically
// whenever a new code is issued; a code past its TTL is already rejected by _phxLineFindActiveLinkCode
// regardless, this just keeps the sheet's status column honest for anyone reading it directly)
function _phxLineExpireOldCodes_(sh) {
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return;
  var data = sh.getRange(2, 1, lastRow - 1, 5).getValues();
  var now = Date.now();
  for (var i = 0; i < data.length; i++) {
    var status = String(data[i][4] || '').trim();
    if (status !== 'pending') continue;
    var expiresAt = data[i][3] instanceof Date ? data[i][3].getTime() : Date.parse(data[i][3]);
    if (!isNaN(expiresAt) && now > expiresAt) {
      sh.getRange(i + 2, 5).setValue('expired');
    }
  }
}

function _phxLineFindActiveLinkCode(code) {
  var sh = _phxLineGetLinkCodesSheet();
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return null;
  var data = sh.getRange(2, 1, lastRow - 1, 7).getValues();
  var target = String(code || '').trim();
  var now = Date.now();
  // scan newest→oldest so a re-issued code (same 6 digits recycled) resolves to the latest one
  for (var i = data.length - 1; i >= 0; i--) {
    if (String(data[i][0]).trim() !== target) continue;
    var expiresAt = data[i][3] instanceof Date ? data[i][3].getTime() : Date.parse(data[i][3]);
    return {
      rowIndex: i + 2,
      code: target,
      name: String(data[i][1] || '').trim(),
      status: String(data[i][4] || '').trim(),
      expired: !isNaN(expiresAt) && now > expiresAt
    };
  }
  return null;
}

function _phxLineConsumeLinkCode(rowIndex, lineUserId) {
  var sh = _phxLineGetLinkCodesSheet();
  sh.getRange(rowIndex, 5).setValue('used');
  sh.getRange(rowIndex, 6).setValue(lineUserId);
  sh.getRange(rowIndex, 7).setValue(new Date());
}

// ════════════════════════════════════════════════════════════
// 🌐 Reverse lookup — used by the webhook + Phase_F6_LineChat.js to identify a linked caller
// ════════════════════════════════════════════════════════════
function _phxFindPharmacistRowByLineUserId(lineUserId) {
  var id = String(lineUserId || '').trim();
  if (!id) return null;
  var sh = _phxGetSheet('PHX_Pharmacists');
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return null;
  var data = sh.getRange(2, 1, lastRow - 1, 5).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][4] || '').trim() === id) {
      return {
        rowIndex: i + 2,
        name: String(data[i][0] || '').trim(),
        passwordHash: String(data[i][1] || '').trim(),
        lineUserId: id
      };
    }
  }
  return null;
}

function _phxLineBindUserId(pharmacistRowIndex, lineUserId) {
  _phxGetSheet('PHX_Pharmacists').getRange(pharmacistRowIndex, 5).setValue(lineUserId);
}

// ════════════════════════════════════════════════════════════
// Webhook-side entry point (called from Phase_F2_LINE.js for 1:1 messages from an
// unlinked LINE userId). Always returns a reply string — never null.
// ════════════════════════════════════════════════════════════
function _phxLineHandleLinkAttempt(lineUserId, text) {
  var trimmed = String(text || '').trim();
  if (!/^\d{6}$/.test(trimmed)) {
    return 'พิมพ์รหัสเชื่อมต่อ 6 หลักจากหน้าเว็บแอป (เมนู "เชื่อมต่อ LINE") เพื่อผูกบัญชีก่อนใช้งานครับ';
  }

  var found = _phxLineFindActiveLinkCode(trimmed);
  if (!found || found.status !== 'pending' || found.expired) {
    return '❌ รหัสไม่ถูกต้องหรือหมดอายุแล้ว — กรุณาขอรหัสใหม่จากหน้าเว็บแอป';
  }

  // guard: this LINE account already linked to a DIFFERENT name — do not silently overwrite
  var existingLink = _phxFindPharmacistRowByLineUserId(lineUserId);
  if (existingLink && existingLink.name !== found.name) {
    return '❌ LINE บัญชีนี้ผูกกับชื่อ "' + existingLink.name + '" อยู่แล้ว — หากต้องการเปลี่ยน โปรดติดต่อ admin';
  }

  var pharmacist = _phxFindPharmacistRow(found.name);
  if (!pharmacist) {
    return '❌ ไม่พบบัญชีผู้ใช้ที่ขอรหัสนี้ — กรุณาลองใหม่';
  }

  // guard: this pharmacist name already linked to a DIFFERENT LINE account
  if (pharmacist.lineUserId && pharmacist.lineUserId !== lineUserId) {
    return '❌ ชื่อ "' + found.name + '" ผูกกับ LINE บัญชีอื่นอยู่แล้ว — หากต้องการเปลี่ยน โปรดติดต่อ admin';
  }

  _phxLineBindUserId(pharmacist.rowIndex, lineUserId);
  _phxLineConsumeLinkCode(found.rowIndex, lineUserId);

  try { phxLogAuditSystem('line_link', found.name, null, { lineUserId: lineUserId }); } catch (e) {}

  return '✅ เชื่อมต่อ LINE สำเร็จ! สวัสดีครับคุณ ' + found.name + '\nพิมพ์ "เวรวันนี้" เพื่อดูเวรของคุณได้เลย';
}

// ════════════════════════════════════════════════════════════
// 🧪 Manual tests (run from GAS editor)
// ════════════════════════════════════════════════════════════
function testF4LinkFlow() {
  var TEST_NAME = 'ณรพล';
  var TEST_PW = 'klui2543';
  var FAKE_LINE_ID = 'Utest_line_user_001';

  var pwHash = _phxHashPassword(TEST_NAME, TEST_PW);
  Logger.log('[1] generate code...');
  var gen = phxLineGenerateLinkCode(TEST_NAME, pwHash);
  Logger.log('    ' + JSON.stringify(gen));
  if (!gen.success) { Logger.log('❌ FAIL — abort'); return; }

  Logger.log('\n[2] simulate wrong code...');
  Logger.log('    ' + _phxLineHandleLinkAttempt(FAKE_LINE_ID, '000000'));

  Logger.log('\n[3] simulate correct code...');
  Logger.log('    ' + _phxLineHandleLinkAttempt(FAKE_LINE_ID, gen.code));

  Logger.log('\n[4] reverse lookup...');
  var row = _phxFindPharmacistRowByLineUserId(FAKE_LINE_ID);
  Logger.log('    ' + JSON.stringify(row));
  if (!row || row.name !== TEST_NAME) Logger.log('❌ reverse lookup mismatch');
  else Logger.log('✅ PASSED');

  Logger.log('\n[5] re-send same code (already used)...');
  Logger.log('    ' + _phxLineHandleLinkAttempt(FAKE_LINE_ID, gen.code));
}
