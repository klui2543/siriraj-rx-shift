/**
 * ════════════════════════════════════════════════════════════
 * 🔐 PHASE Z STAGE B1 — Authentication Core (with C1 role)
 * ════════════════════════════════════════════════════════════
 *
 * Public API:
 *   phxStartRegistration(name, password)
 *   phxLogin(name, password)            → returns { ..., role }
 *   phxVerifyToken(token)
 *
 * doGet handler: _phxHandleVerifyRoute(e)
 */


// ════════════════════════════════════════════════════════════
// 🔧 Constants
// ════════════════════════════════════════════════════════════
const _B1_APP_SALT = 'siriraj-rx-shift-app-2026';
const _B1_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;
const _B1_MIN_PW_LEN = 4;


// ════════════════════════════════════════════════════════════
// 🌐 Public: List registrable names (frontend register dropdown)
//    = (Master ∪ schedule extras) − already-registered
// ════════════════════════════════════════════════════════════
function phxListRegistrableNames(extras) {
  try {
    const ss = SpreadsheetApp.openById(SCHEDULE_SHEET_ID);

    // 1. Master names (PHX_Pharmacists_Master, col A)
    const masterSh = ss.getSheetByName('PHX_Pharmacists_Master');
    const masterNames = new Set();
    if (masterSh && masterSh.getLastRow() > 1) {
      const data = masterSh.getRange(2, 1, masterSh.getLastRow() - 1, 1).getValues();
      data.forEach(function(row) {
        const n = String(row[0] || '').trim();
        if (n) masterNames.add(n);
      });
    }

    // 2. Already-registered names (PHX_Pharmacists)
    const authSh = ss.getSheetByName('PHX_Pharmacists');
    const registered = new Set();
    if (authSh && authSh.getLastRow() > 1) {
      const data = authSh.getRange(2, 1, authSh.getLastRow() - 1, 1).getValues();
      data.forEach(function(row) {
        const n = String(row[0] || '').trim();
        if (n) registered.add(n);
      });
    }

    // 3. Extras from frontend (current schedule names)
    const extraSet = new Set();
    if (Array.isArray(extras)) {
      extras.forEach(function(name) {
        const clean = String(name || '').trim();
        if (clean) extraSet.add(clean);
      });
    }

    // 4. Combine + exclude already-registered
    const allCandidates = new Set();
    masterNames.forEach(function(n) { allCandidates.add(n); });
    extraSet.forEach(function(n) { allCandidates.add(n); });

    const result = [];
    allCandidates.forEach(function(name) {
      if (registered.has(name)) return;
      result.push({ name: name, inMaster: masterNames.has(name) });
    });

    // 5. Sort Thai-aware
    result.sort(function(a, b) {
      return a.name.localeCompare(b.name, 'th');
    });

    return { success: true, names: result };
  } catch (e) {
    console.error('phxListRegistrableNames error: ' + e.message);
    return { success: false, error: String(e.message || e), names: [] };
  }
}


// ════════════════════════════════════════════════════════════
// 🌐 Public: Start registration
// ════════════════════════════════════════════════════════════
function phxStartRegistration(rawName, password) {
  try {
    const name = String(rawName || '').trim();
    const pw = String(password || '');

    if (!name) return { success: false, error: 'กรุณาใส่ชื่อ' };
    if (pw.length < _B1_MIN_PW_LEN) {
      return { success: false, error: 'รหัสผ่านต้องมีอย่างน้อย ' + _B1_MIN_PW_LEN + ' ตัวอักษร' };
    }

    const masterRow = _phxFindMasterRow(name);
    if (!masterRow) {
      return { success: false, error: 'ไม่พบชื่อ "' + name + '" ในรายชื่อเภสัชกร — โปรดติดต่อ admin' };
    }
    if (masterRow.active !== true && String(masterRow.active).toUpperCase() !== 'TRUE') {
      return { success: false, error: 'ชื่อนี้ถูกระงับ — โปรดติดต่อ admin' };
    }
    if (!masterRow.approvedEmail || masterRow.approvedEmail.indexOf('@') < 0) {
      return { success: false, error: 'admin ยังไม่ได้ตั้งค่าอีเมลสำหรับ "' + name + '" — โปรดติดต่อ admin' };
    }

    if (_phxFindPharmacistRow(name)) {
      return { success: false, error: 'ชื่อนี้ลงทะเบียนแล้ว — กรุณา login หรือใช้ "ลืมรหัส"' };
    }

    _phxClearPendingByName(name);

    const passwordHash = _phxHashPassword(name, pw);
    const token = _phxGenerateToken();
    const expiresAt = new Date(Date.now() + _B1_TOKEN_EXPIRY_MS);
    const now = new Date();

    const pendingSh = _phxGetSheet('PHX_PendingVerifications');
    pendingSh.appendRow([token, name, passwordHash, masterRow.approvedEmail, expiresAt, now]);

    _phxQueueVerifyEmail(name, masterRow.approvedEmail, token);

    return {
      success: true,
      message: 'ส่งอีเมลยืนยันไปยัง ' + _phxMaskEmail(masterRow.approvedEmail) + ' แล้ว — กรุณาตรวจกล่องจดหมาย (อาจอยู่ใน Spam)'
    };
  } catch (e) {
    console.error('phxStartRegistration error: ' + e.message);
    return { success: false, error: 'เกิดข้อผิดพลาด: ' + e.message };
  }
}


// ════════════════════════════════════════════════════════════
// 🌐 Public: Verify token
// ════════════════════════════════════════════════════════════
function phxVerifyToken(token) {
  try {
    const t = String(token || '').trim();
    if (!t) return { success: false, error: 'Token ไม่ถูกต้อง' };

    const pendingSh = _phxGetSheet('PHX_PendingVerifications');
    const found = _phxFindPendingByToken(t);
    if (!found) {
      return { success: false, error: 'Token ไม่ถูกต้องหรือถูกใช้แล้ว — โปรดสมัครใหม่' };
    }

    const expiresAt = found.expiresAt instanceof Date ? found.expiresAt : new Date(found.expiresAt);
    if (Date.now() > expiresAt.getTime()) {
      pendingSh.deleteRow(found.rowIndex);
      return { success: false, error: 'ลิงก์หมดอายุแล้ว — โปรดสมัครใหม่' };
    }

    const pharmaSh = _phxGetSheet('PHX_Pharmacists');
    const now = new Date();
    pharmaSh.appendRow([found.name, found.passwordHash, now, now]);

    pendingSh.deleteRow(found.rowIndex);

    return { success: true, name: found.name };
  } catch (e) {
    console.error('phxVerifyToken error: ' + e.message);
    return { success: false, error: 'เกิดข้อผิดพลาด: ' + e.message };
  }
}


// ════════════════════════════════════════════════════════════
// 🌐 Public: Login (returns hash + role for client localStorage)
// ════════════════════════════════════════════════════════════
function phxLogin(rawName, password) {
  try {
    const name = String(rawName || '').trim();
    const pw = String(password || '');
    if (!name) return { success: false, error: 'กรุณาใส่ชื่อ' };
    if (!pw) return { success: false, error: 'กรุณาใส่รหัสผ่าน' };

    const row = _phxFindPharmacistRow(name);
    if (!row) {
      return { success: false, error: 'ไม่พบชื่อนี้ในระบบ — โปรดลงทะเบียนก่อน' };
    }

    const computedHash = _phxHashPassword(name, pw);
    if (computedHash !== row.passwordHash) {
      return { success: false, error: 'รหัสผ่านไม่ถูกต้อง' };
    }

    // Update lastSeen
    try {
      const sh = _phxGetSheet('PHX_Pharmacists');
      sh.getRange(row.rowIndex, 4).setValue(new Date());
    } catch (e) { /* non-critical */ }

    // 🆕 C1: lookup role from master (default 'user')
    const master = _phxFindMasterRow(name);
    const role = master ? master.role : 'user';

    return {
      success: true,
      name: name,
      passwordHash: row.passwordHash,
      role: role  // frontend stores in localStorage.siriraj_logged_in_role
    };
  } catch (e) {
    console.error('phxLogin error: ' + e.message);
    return { success: false, error: 'เกิดข้อผิดพลาด: ' + e.message };
  }
}


// ════════════════════════════════════════════════════════════
// 🌐 Public: Verify password only (v3.45)
//   Identity re-check for destructive actions (e.g. cancelling a PUBLISHED
//   swap/give) — proves the logged-in session's owner typed their password.
//   Read-only: no session created, no lastSeen update, no state change.
// ════════════════════════════════════════════════════════════
function phxVerifyPassword(rawName, password) {
  try {
    const name = String(rawName || '').trim();
    const pw = String(password || '');
    if (!name || !pw) return { success: false, valid: false, error: 'กรุณาใส่ชื่อและรหัสผ่าน' };

    const row = _phxFindPharmacistRow(name);
    if (!row) return { success: true, valid: false, error: 'ไม่พบชื่อนี้ในระบบ' };

    const valid = _phxHashPassword(name, pw) === row.passwordHash;
    return { success: true, valid: valid, error: valid ? null : 'รหัสผ่านไม่ถูกต้อง' };
  } catch (e) {
    console.error('phxVerifyPassword error: ' + e.message);
    return { success: false, valid: false, error: 'เกิดข้อผิดพลาด: ' + e.message };
  }
}


// ════════════════════════════════════════════════════════════
// 🌐 doGet handler — render verify success/error HTML page
// ════════════════════════════════════════════════════════════
function _phxHandleVerifyRoute(e) {
  const token = (e && e.parameter && e.parameter.token || '').trim();
  if (!token) return _phxRenderHTML('ไม่พบ Token', 'URL ไม่ถูกต้อง — กรุณาคัดลอกลิงก์จากอีเมลใหม่', false);

  const result = phxVerifyToken(token);
  if (result.success) {
    return _phxRenderHTML(
      '✅ ยืนยันสำเร็จ!',
      'สวัสดีครับ <b>' + _phxEscapeHTML(result.name) + '</b><br>ตอนนี้สามารถ login เข้าใช้งานได้แล้ว',
      true
    );
  } else {
    return _phxRenderHTML('❌ ยืนยันไม่สำเร็จ', _phxEscapeHTML(result.error), false);
  }
}


// ════════════════════════════════════════════════════════════
// 🔧 Helpers
// ════════════════════════════════════════════════════════════

function _phxGetSheet(tabName) {
  const sh = SpreadsheetApp.openById(SCHEDULE_SHEET_ID).getSheetByName(tabName);
  if (!sh) throw new Error('Sheet not found: "' + tabName + '" — กรุณารัน phxSetupAllSheets() จาก Stage A');
  return sh;
}

function _phxHashPassword(name, password) {
  const str = _B1_APP_SALT + ':' + String(name).trim() + ':' + String(password);
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    const v = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
    hex += (v < 16 ? '0' : '') + v.toString(16);
  }
  return hex;
}

function _phxGenerateToken() {
  const seed = Date.now() + ':' + Math.random() + ':' + Math.random();
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, seed);
  let hex = '';
  for (let i = 0; i < 16; i++) {
    const v = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
    hex += (v < 16 ? '0' : '') + v.toString(16);
  }
  return hex;
}

// C1 version — reads role column (col 5), defaults 'user'
function _phxFindMasterRow(name) {
  const sh = _phxGetSheet('PHX_Pharmacists_Master');
  if (sh.getLastRow() < 2) return null;
  const lastCol = Math.min(5, Math.max(4, sh.getLastColumn()));
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, lastCol).getValues();
  const target = String(name).trim();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === target) {
      return {
        rowIndex: i + 2,
        name: String(data[i][0]).trim(),
        approvedEmail: String(data[i][1] || '').trim(),
        active: data[i][2],
        notes: String(data[i][3] || ''),
        role: (data[i].length >= 5 ? String(data[i][4] || 'user').trim().toLowerCase() : 'user') || 'user'
      };
    }
  }
  return null;
}

function _phxFindPharmacistRow(name) {
  const sh = _phxGetSheet('PHX_Pharmacists');
  if (sh.getLastRow() < 2) return null;
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();
  const target = String(name).trim();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === target) {
      return {
        rowIndex: i + 2,
        name: String(data[i][0]).trim(),
        passwordHash: String(data[i][1] || '').trim(),
        createdAt: data[i][2],
        lastSeen: data[i][3]
      };
    }
  }
  return null;
}

function _phxFindPendingByToken(token) {
  const sh = _phxGetSheet('PHX_PendingVerifications');
  if (sh.getLastRow() < 2) return null;
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues();
  const target = String(token).trim();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === target) {
      return {
        rowIndex: i + 2,
        token: String(data[i][0]).trim(),
        name: String(data[i][1] || '').trim(),
        passwordHash: String(data[i][2] || '').trim(),
        approvedEmail: String(data[i][3] || '').trim(),
        expiresAt: data[i][4],
        createdAt: data[i][5]
      };
    }
  }
  return null;
}

function _phxClearPendingByName(name) {
  const sh = _phxGetSheet('PHX_PendingVerifications');
  if (sh.getLastRow() < 2) return;
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues();
  const target = String(name).trim();
  for (let i = data.length - 1; i >= 0; i--) {
    if (String(data[i][1]).trim() === target) {
      sh.deleteRow(i + 2);
    }
  }
}

function _phxQueueVerifyEmail(name, email, token) {
  const baseUrl = ScriptApp.getService().getUrl();
  const verifyUrl = baseUrl + (baseUrl.indexOf('?') >= 0 ? '&' : '?') +
                    'action=verify&token=' + encodeURIComponent(token);

  const subject = '✅ ยืนยันการลงทะเบียน — Siriraj Rx Shift';
  const body =
    'สวัสดี ' + name + '\n\n' +
    'คลิกลิงก์ด้านล่างเพื่อยืนยันการลงทะเบียน:\n\n' +
    verifyUrl + '\n\n' +
    'ลิงก์นี้จะหมดอายุภายใน 24 ชั่วโมง\n\n' +
    'หากคุณไม่ได้สมัครเอง — โปรดละเลยอีเมลฉบับนี้\n\n' +
    '— Siriraj Rx Shift';

  const sh = _phxGetSheet('PHX_EmailQueue');
  sh.appendRow([Utilities.getUuid(), email, subject, body, 'pending', new Date(), '', '']);
}

function _phxMaskEmail(email) {
  const at = String(email || '').indexOf('@');
  if (at < 2) return email;
  const local = email.substring(0, at);
  const domain = email.substring(at);
  if (local.length <= 2) return local + domain;
  return local.charAt(0) + '*'.repeat(Math.min(local.length - 2, 5)) + local.charAt(local.length - 1) + domain;
}

function _phxEscapeHTML(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _phxRenderHTML(title, message, isSuccess) {
  const color = isSuccess ? '#16a34a' : '#dc2626';
  const bgColor = isSuccess ? '#f0fdf4' : '#fef2f2';
  const borderColor = isSuccess ? '#86efac' : '#fca5a5';
  const baseUrl = ScriptApp.getService().getUrl();

  const html = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${_phxEscapeHTML(title)} — Siriraj Rx Shift</title>
<link href="https://fonts.googleapis.com/css2?family=Kanit:wght@400;500;700&display=swap" rel="stylesheet">
<base target="_top">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Kanit', sans-serif;
    background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
    min-height: 100vh;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    padding: 32px 20px;
    text-align: center;
  }
  .card {
    width: 100%;
    max-width: 560px;
  }
  .badge {
    display: inline-block;
    background: ${bgColor};
    color: ${color};
    border: 4px solid ${borderColor};
    padding: 40px 56px;
    border-radius: 28px;
    font-size: 48px;
    font-weight: 700;
    margin-bottom: 40px;
    box-shadow: 0 12px 36px rgba(0,0,0,0.08);
  }
  h1 { font-size: 34px; color: #1e293b; margin-bottom: 24px; }
  p {
    color: #1e293b; font-size: 24px; line-height: 1.65; font-weight: 500;
    margin-bottom: 52px;
    max-width: 520px;
    margin-left: auto; margin-right: auto;
  }
  p b { font-weight: 700; color: #0f172a; }
  a.btn, button.btn {
    display: inline-block;
    background: #2563eb;
    color: white;
    padding: 24px 72px;
    border-radius: 14px;
    text-decoration: none;
    font-weight: 700;
    font-size: 24px;
    border: 0;
    cursor: pointer;
    font-family: inherit;
    box-shadow: 0 12px 28px rgba(37,99,235,0.35);
  }
  a.btn:hover, button.btn:hover { background: #1d4ed8; }
  .meta { margin-top: 56px; font-size: 15px; color: #94a3b8; }
  @media (max-width: 500px) {
    body { padding: 24px 16px; }
    .badge { padding: 32px 36px; font-size: 38px; border-width: 3px; }
    h1 { font-size: 28px; }
    p { font-size: 21px; margin-bottom: 40px; }
    a.btn, button.btn { padding: 22px 52px; font-size: 22px; width: 100%; max-width: 360px; font-weight: 700; }
  }
</style>
</head>
<body>
  <div class="card">
    <div class="badge">${_phxEscapeHTML(title)}</div>
    <p>${message}</p>
    <a href="${baseUrl}" target="_top" class="btn" onclick="try{window.top.location.href=this.href;return false;}catch(e){return true;}">เปิดแอป</a>
    <div class="meta">Siriraj Rx Shift</div>
  </div>
</body>
</html>`;

  return HtmlService.createHtmlOutput(html)
    .setTitle(title + ' — Siriraj Rx Shift')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


// ════════════════════════════════════════════════════════════
// 🧪 Test functions
// ════════════════════════════════════════════════════════════

function testB1Hash() {
  const h1 = _phxHashPassword('ณรพล', 'test1234');
  const h2 = _phxHashPassword('ณรพล', 'test1234');
  const h3 = _phxHashPassword('ณรพล', 'different');
  const h4 = _phxHashPassword('สุพัฒนา', 'test1234');
  Logger.log('Same input → same hash:    ' + (h1 === h2 ? '✅' : '❌'));
  Logger.log('Different pw → different:  ' + (h1 !== h3 ? '✅' : '❌'));
  Logger.log('Different name → different:' + (h1 !== h4 ? '✅' : '❌'));
  Logger.log('Hash length 64 (hex):      ' + (h1.length === 64 ? '✅' : '❌ got ' + h1.length));
  Logger.log('Sample hash: ' + h1);
}

function testB1Token() {
  const t1 = _phxGenerateToken();
  const t2 = _phxGenerateToken();
  Logger.log('Token 1: ' + t1);
  Logger.log('Token 2: ' + t2);
  Logger.log('Unique:  ' + (t1 !== t2 ? '✅' : '❌'));
  Logger.log('Length 32 (hex): ' + (t1.length === 32 ? '✅' : '❌ got ' + t1.length));
}

function testB1Register() {
  const TEST_NAME = 'ณรพล';
  const TEST_PASSWORD = 'klui2543';
  Logger.log('Registering: ' + TEST_NAME);
  const result = phxStartRegistration(TEST_NAME, TEST_PASSWORD);
  Logger.log(JSON.stringify(result, null, 2));
}

function testB1Login() {
  const TEST_NAME = 'ณรพล';
  const TEST_PASSWORD = 'klui2543';
  Logger.log('Login: ' + TEST_NAME);
  const result = phxLogin(TEST_NAME, TEST_PASSWORD);
  Logger.log(JSON.stringify(result, null, 2));
}

function testB1MaskEmail() {
  Logger.log(_phxMaskEmail('norapol.uttho@mahidol.ac.th'));
  Logger.log(_phxMaskEmail('a@b.com'));
  Logger.log(_phxMaskEmail('ab@b.com'));
}

function debugScheduleIndexDups() {
  const ss = SpreadsheetApp.openById(SCHEDULE_SHEET_ID);
  const idx = ss.getSheetByName(SCHEDULE_INDEX_TAB);
  const data = idx.getRange(2, 1, idx.getLastRow() - 1, 9).getValues();
  
  const byLabel = {};
  data.forEach(function(r) {
    if (r[8] !== 'active' || !r[2]) return;
    if (!byLabel[r[1]]) byLabel[r[1]] = [];
    byLabel[r[1]].push(r[2]);
  });
  
  Object.keys(byLabel).forEach(function(label) {
    const tabs = byLabel[label];
    if (tabs.length < 2) return;
    Logger.log('━━━ ' + label + ': ' + tabs.length + ' tabs ━━━');
    tabs.forEach(function(t) {
      const sh = ss.getSheetByName(t);
      Logger.log('  ' + t + ': ' + (sh ? (sh.getLastRow() - 1) : 'MISSING') + ' rows');
    });
  });
}

/**
 * Returns all registered user names from PHX_Pharmacists (col A).
 * ใช้ใน search dropdown — รวม users ที่ register แล้วแม้ไม่มีเวรเดือนนี้
 */
function phxListAllUsers() {
  try {
    var sheet = _phxGetSheet('PHX_Pharmacists');
    if (!sheet) return { success: false, names: [], error: 'sheet not found' };
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { success: true, names: [] };
    var data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    var names = [];
    for (var i = 0; i < data.length; i++) {
      var n = String(data[i][0] || '').trim();
      if (n) names.push(n);
    }
    return { success: true, names: names };
  } catch(e) {
    return { success: false, names: [], error: String(e.message || e) };
  }
}

/**
 * Test wrapper สำหรับ phxListAllUsers — รันใน GAS Editor เพื่อดูผล
 */
function devTestPhxListAllUsers() {
  var r = phxListAllUsers();
  Logger.log('success: ' + r.success);
  Logger.log('count: ' + (r.names ? r.names.length : 0));
  Logger.log('first 10: ' + (r.names || []).slice(0, 10).join(' | '));
  if (r.error) Logger.log('error: ' + r.error);
}