/**
 * ════════════════════════════════════════════════════════════
 * 🔑 PHASE Z STAGE B2 — Password Management
 * ════════════════════════════════════════════════════════════
 *
 * Public API:
 *   phxChangePassword(name, oldPw, newPw)       — change pw while logged in
 *   phxRequestPasswordReset(name)               — queue reset email
 *   phxConfirmPasswordReset(token, newPw)       — set new pw via reset link
 *
 * doGet handler:
 *   _phxHandleResetRoute(e)                     — renders the reset form HTML
 *
 * Requires: Phase_Z_B1_Auth.gs (reuses helpers: _phxHashPassword, _phxGetSheet, etc.)
 *
 * ════════════════════════════════════════════════════════════
 * วิธี Apply
 * ════════════════════════════════════════════════════════════
 *
 * 1. สร้างไฟล์ใหม่ `Phase_Z_B2_Password.gs` → paste ฉบับนี้ (B1 ต้อง paste ก่อน)
 *
 * 2. ใน Code.gs `doGet(e)` เพิ่ม 3 บรรทัดสำหรับ reset route
 *    (วางใต้ verify route ของ B1):
 *
 *      function doGet(e) {
 *        if (e && e.parameter && e.parameter.action === 'verify') {
 *          return _phxHandleVerifyRoute(e);
 *        }
 *        // ★ B2: reset-link handler (เพิ่ม 3 บรรทัดนี้)
 *        if (e && e.parameter && e.parameter.action === 'reset') {
 *          return _phxHandleResetRoute(e);
 *        }
 *        // ─── ของเดิม ───
 *        if (e && e.parameter && e.parameter.name) return serveICS(e);
 *        // ...
 *      }
 *
 * 3. Deploy ใหม่
 *
 * 4. ทดสอบ:
 *    - testB2Change       — เปลี่ยนรหัส (ต้อง register ก่อนจาก B1)
 *    - testB2RequestReset — ขอ reset → ดูเมล
 *    - คลิกลิงก์ในเมล → ใส่รหัสใหม่ในฟอร์ม → submit
 *    - ลอง login ด้วยรหัสใหม่ผ่าน testB1Login (ต้องผ่าน)
 */


// ════════════════════════════════════════════════════════════
// 🔧 Constants
// ════════════════════════════════════════════════════════════
const _B2_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
const _B2_MIN_PW_LEN = 4;


// ════════════════════════════════════════════════════════════
// 🌐 Public: Change password (in-app, requires old pw)
// ════════════════════════════════════════════════════════════
function phxChangePassword(rawName, oldPassword, newPassword) {
  try {
    const name = String(rawName || '').trim();
    const oldPw = String(oldPassword || '');
    const newPw = String(newPassword || '');

    if (!name) return { success: false, error: 'กรุณาใส่ชื่อ' };
    if (!oldPw) return { success: false, error: 'กรุณาใส่รหัสเดิม' };
    if (newPw.length < _B2_MIN_PW_LEN) {
      return { success: false, error: 'รหัสใหม่ต้องมีอย่างน้อย ' + _B2_MIN_PW_LEN + ' ตัวอักษร' };
    }
    if (oldPw === newPw) {
      return { success: false, error: 'รหัสใหม่ต้องไม่เหมือนรหัสเดิม' };
    }

    const row = _phxFindPharmacistRow(name);
    if (!row) {
      return { success: false, error: 'ไม่พบชื่อในระบบ — โปรดลงทะเบียนก่อน' };
    }

    // Verify old password
    if (_phxHashPassword(name, oldPw) !== row.passwordHash) {
      return { success: false, error: 'รหัสเดิมไม่ถูกต้อง' };
    }

    // Update hash
    const newHash = _phxHashPassword(name, newPw);
    const sh = _phxGetSheet('PHX_Pharmacists');
    sh.getRange(row.rowIndex, 2).setValue(newHash);            // col 2 = passwordHash
    sh.getRange(row.rowIndex, 4).setValue(new Date());         // col 4 = lastSeen

    return {
      success: true,
      message: 'เปลี่ยนรหัสผ่านสำเร็จ',
      newPasswordHash: newHash  // frontend จะใช้อัปเดต localStorage
    };
  } catch (e) {
    console.error('phxChangePassword error: ' + e.message);
    return { success: false, error: 'เกิดข้อผิดพลาด: ' + e.message };
  }
}


// ════════════════════════════════════════════════════════════
// 🌐 Public: Request password reset (queues email)
// ════════════════════════════════════════════════════════════
function phxRequestPasswordReset(rawName, targetEmailArg) {
  try {
    const name = String(rawName || '').trim();
    if (!name) return { success: false, error: 'กรุณาใส่ชื่อ' };

    const pharmaRow = _phxFindPharmacistRow(name);
    if (!pharmaRow) {
      return { success: false, error: 'ไม่พบชื่อนี้ในระบบ — กรุณาลงทะเบียนก่อน' };
    }

    const masterRow = _phxFindMasterRow(name);
    if (!masterRow || !masterRow.approvedEmail || masterRow.approvedEmail.indexOf('@') < 0) {
      return { success: false, error: 'ไม่พบอีเมลสำหรับชื่อนี้ — โปรดติดต่อ admin' };
    }

    // Determine target email + label
    // Default: send to Master's approvedEmail (label = "หลัก")
    // Optional: caller may specify targetEmailArg (must match approvedEmail or backupEmail)
    let targetEmail = String(targetEmailArg || '').trim().toLowerCase();
    let emailLabel = 'หลัก';
    if (targetEmail) {
      const approvedLc = String(masterRow.approvedEmail || '').trim().toLowerCase();
      const backupLc = _phxGetBackupEmailRaw(name).toLowerCase();
      if (targetEmail === approvedLc) {
        emailLabel = 'หลัก';
      } else if (backupLc && targetEmail === backupLc) {
        emailLabel = 'สำรอง';
      } else {
        return { success: false, error: 'อีเมลไม่ตรงกับที่ระบบบันทึกไว้สำหรับชื่อนี้' };
      }
    } else {
      targetEmail = String(masterRow.approvedEmail || '').trim().toLowerCase();
    }

    _phxClearPendingResetsByName(name);

    const token = _phxGenerateToken();
    const expiresAt = new Date(Date.now() + _B2_TOKEN_EXPIRY_MS);
    const sh = _phxGetSheet('PHX_PendingResets');
    // Cols: token | name | targetEmail | expiresAt | createdAt
    sh.appendRow([token, name, targetEmail, expiresAt, new Date()]);

    _phxQueueResetEmail(name, targetEmail, token);

    return {
      success: true,
      message: 'ส่งอีเมลรีเซ็ตไปยัง ' + _phxMaskEmail(targetEmail) + ' (อีเมล' + emailLabel + ') แล้ว — กรุณาตรวจกล่องจดหมาย'
    };
  } catch (e) {
    console.error('phxRequestPasswordReset error: ' + e.message);
    return { success: false, error: 'เกิดข้อผิดพลาด: ' + e.message };
  }
}


// ────────────────────────────────────────────────────────────
// Helper: read backupEmail from PHX_Pharmacists col E (no auth)
//   Used by reset flow which can't verify password (user forgot it)
// ────────────────────────────────────────────────────────────
function _phxGetBackupEmailRaw(name) {
  try {
    const sh = _phxGetSheet('PHX_Pharmacists');
    if (sh.getLastRow() < 2) return '';
    const data = sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues();
    const target = String(name).trim();
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0]).trim() === target) {
        return String(data[i][4] || '').trim();  // col E (0-indexed = 4)
      }
    }
    return '';
  } catch (e) { return ''; }
}


// ════════════════════════════════════════════════════════════
// 🌐 Public: Confirm password reset (via token from email)
// ════════════════════════════════════════════════════════════
function phxConfirmPasswordReset(token, newPassword) {
  try {
    const t = String(token || '').trim();
    const newPw = String(newPassword || '');
    if (!t) return { success: false, error: 'Token ไม่ถูกต้อง' };
    if (newPw.length < _B2_MIN_PW_LEN) {
      return { success: false, error: 'รหัสใหม่ต้องมีอย่างน้อย ' + _B2_MIN_PW_LEN + ' ตัวอักษร' };
    }

    const pending = _phxFindPendingResetByToken(t);
    if (!pending) {
      return { success: false, error: 'Token ไม่ถูกต้องหรือถูกใช้แล้ว' };
    }

    // Check expiry
    const expiresAt = pending.expiresAt instanceof Date ? pending.expiresAt : new Date(pending.expiresAt);
    if (Date.now() > expiresAt.getTime()) {
      _phxGetSheet('PHX_PendingResets').deleteRow(pending.rowIndex);
      return { success: false, error: 'ลิงก์หมดอายุแล้ว — โปรดขอใหม่' };
    }

    // Find user
    const pharmaRow = _phxFindPharmacistRow(pending.name);
    if (!pharmaRow) {
      return { success: false, error: 'ผู้ใช้ไม่อยู่ในระบบ — โปรดลงทะเบียนใหม่' };
    }

    // Update password
    const newHash = _phxHashPassword(pending.name, newPw);
    const pharmaSh = _phxGetSheet('PHX_Pharmacists');
    pharmaSh.getRange(pharmaRow.rowIndex, 2).setValue(newHash);      // col 2
    pharmaSh.getRange(pharmaRow.rowIndex, 4).setValue(new Date());   // col 4 = lastSeen

    // Delete pending row
    _phxGetSheet('PHX_PendingResets').deleteRow(pending.rowIndex);

    return { success: true, name: pending.name, message: 'ตั้งรหัสผ่านใหม่สำเร็จ' };
  } catch (e) {
    console.error('phxConfirmPasswordReset error: ' + e.message);
    return { success: false, error: 'เกิดข้อผิดพลาด: ' + e.message };
  }
}


// ════════════════════════════════════════════════════════════
// 🌐 doGet handler — render reset form HTML page
// (Called from doGet when ?action=reset&token=XXX)
// ════════════════════════════════════════════════════════════
function _phxHandleResetRoute(e) {
  const token = (e && e.parameter && e.parameter.token || '').trim();
  if (!token) return _phxRenderHTML('ไม่พบ Token', 'URL ไม่ถูกต้อง', false);

  const pending = _phxFindPendingResetByToken(token);
  if (!pending) {
    return _phxRenderHTML('ลิงก์ไม่ถูกต้อง', 'Token ถูกใช้แล้วหรือไม่มีในระบบ — กรุณาขอลิงก์ใหม่', false);
  }
  const expiresAt = pending.expiresAt instanceof Date ? pending.expiresAt : new Date(pending.expiresAt);
  if (Date.now() > expiresAt.getTime()) {
    return _phxRenderHTML('ลิงก์หมดอายุ', 'ลิงก์หมดอายุแล้ว — กรุณาขอใหม่', false);
  }

  return _phxRenderResetForm(token, pending.name);
}


// ════════════════════════════════════════════════════════════
// 🔧 Helpers (B2-specific)
// ════════════════════════════════════════════════════════════

function _phxFindPendingResetByToken(token) {
  const sh = _phxGetSheet('PHX_PendingResets');
  if (sh.getLastRow() < 2) return null;
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues();
  // Cols: token | name | approvedEmail | expiresAt | createdAt
  const target = String(token).trim();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === target) {
      return {
        rowIndex: i + 2,
        token: String(data[i][0]).trim(),
        name: String(data[i][1] || '').trim(),
        approvedEmail: String(data[i][2] || '').trim(),
        expiresAt: data[i][3],
        createdAt: data[i][4]
      };
    }
  }
  return null;
}

function _phxClearPendingResetsByName(name) {
  const sh = _phxGetSheet('PHX_PendingResets');
  if (sh.getLastRow() < 2) return;
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues();
  const target = String(name).trim();
  for (let i = data.length - 1; i >= 0; i--) {
    if (String(data[i][1]).trim() === target) {
      sh.deleteRow(i + 2);
    }
  }
}

function _phxQueueResetEmail(name, email, token) {
  const baseUrl = ScriptApp.getService().getUrl();
  const resetUrl = baseUrl + (baseUrl.indexOf('?') >= 0 ? '&' : '?') +
                   'action=reset&token=' + encodeURIComponent(token);

  const subject = '🔑 รีเซ็ตรหัสผ่าน — Siriraj Rx Shift';
  const body =
    'สวัสดี ' + name + '\n\n' +
    'คลิกลิงก์ด้านล่างเพื่อตั้งรหัสผ่านใหม่:\n\n' +
    resetUrl + '\n\n' +
    'ลิงก์นี้จะหมดอายุภายใน 24 ชั่วโมง\n\n' +
    'หากคุณไม่ได้ทำการ reset — โปรดละเลยอีเมลฉบับนี้ (รหัสเดิมยังใช้ได้)\n\n' +
    '— Siriraj Rx Shift';

  const sh = _phxGetSheet('PHX_EmailQueue');
  sh.appendRow([Utilities.getUuid(), email, subject, body, 'pending', new Date(), '', '']);
}

function _phxRenderResetForm(token, name) {
  const safeToken = JSON.stringify(token);
  const safeName = JSON.stringify(name);
  const baseUrl = ScriptApp.getService().getUrl();
 
  const html = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ตั้งรหัสผ่านใหม่ — Siriraj Rx Shift</title>
<link href="https://fonts.googleapis.com/css2?family=Kanit:wght@400;500;600;700&display=swap" rel="stylesheet">
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
  }
  .card {
    width: 100%;
    max-width: 520px;
    text-align: center;
  }
  .header { margin-bottom: 36px; }
  .badge {
    display: inline-block;
    background: #eff6ff; color: #2563eb;
    border: 4px solid #93c5fd;
    padding: 30px 40px; border-radius: 24px;
    font-size: 36px; font-weight: 700;
    margin-bottom: 20px;
    box-shadow: 0 12px 36px rgba(0,0,0,0.08);
  }
  .badge.success { background: #f0fdf4; color: #16a34a; border-color: #86efac; }
  .badge.error   { background: #fef2f2; color: #dc2626; border-color: #fca5a5; }
  h1 { font-size: 26px; color: #1e293b; margin-bottom: 10px; }
  .who {
    color: #1e293b; font-size: 20px; font-weight: 500;
    margin-top: 12px;
  }
  .who b { color: #0f172a; font-weight: 700; }
  .field { margin-bottom: 20px; text-align: left; }
  label {
    display: block; font-size: 16px; color: #334155;
    margin-bottom: 10px; font-weight: 600;
  }
  input[type=password] {
    width: 100%; padding: 18px 20px;
    border: 2px solid #cbd5e1; border-radius: 12px;
    font-size: 18px; font-family: inherit; background: white;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  input[type=password]:focus {
    outline: none; border-color: #2563eb;
    box-shadow: 0 0 0 4px rgba(37,99,235,0.12);
  }
  button {
    width: 100%; background: #2563eb; color: white; border: 0;
    padding: 22px; border-radius: 14px;
    font-size: 22px; font-weight: 700;
    cursor: pointer; font-family: inherit; margin-top: 16px;
    box-shadow: 0 12px 28px rgba(37,99,235,0.35);
  }
  button:hover:not(:disabled) { background: #1d4ed8; }
  button:disabled { background: #94a3b8; cursor: not-allowed; box-shadow: none; }
  #msg {
    margin-top: 20px; font-size: 17px; color: #dc2626;
    min-height: 22px; text-align: center; font-weight: 500;
  }
  #msg.ok { color: #16a34a; }
  .meta { margin-top: 48px; font-size: 14px; color: #94a3b8; text-align: center; }
  .btn-link {
    display: inline-block; background: #2563eb; color: white;
    padding: 22px 56px; border-radius: 14px;
    text-decoration: none; font-weight: 700; font-size: 22px;
    margin-top: 16px;
    box-shadow: 0 12px 28px rgba(37,99,235,0.35);
  }
  .btn-link:hover { background: #1d4ed8; }
  p.msg {
    color: #1e293b; font-size: 22px; line-height: 1.65; font-weight: 500;
    margin-bottom: 28px; text-align: center;
  }
  @media (max-width: 500px) {
    body { padding: 24px 16px; }
    .badge { padding: 24px 30px; font-size: 28px; border-width: 3px; }
    .who { font-size: 18px; }
    label { font-size: 15px; }
    input[type=password] { padding: 16px 18px; font-size: 17px; }
    button { padding: 20px; font-size: 20px; }
    .btn-link { padding: 20px 44px; font-size: 20px; }
    p.msg { font-size: 19px; }
  }
</style>
</head>
<body>
  <div class="card" id="card">
    <div class="header">
      <div class="badge">🔑 ตั้งรหัสผ่านใหม่</div>
      <div class="who">สำหรับ: <b id="who">...</b></div>
    </div>
    <div class="field">
      <label for="newPw">รหัสผ่านใหม่ (อย่างน้อย 4 ตัว)</label>
      <input type="password" id="newPw" autocomplete="new-password" autofocus>
    </div>
    <div class="field">
      <label for="confirmPw">ยืนยันรหัสผ่าน</label>
      <input type="password" id="confirmPw" autocomplete="new-password">
    </div>
    <button id="submitBtn" type="button">ตั้งรหัสใหม่</button>
    <div id="msg"></div>
    <div class="meta">Siriraj Rx Shift</div>
  </div>
 
<script>
const TOKEN = ${safeToken};
const NAME = ${safeName};
const APP_URL = ${JSON.stringify(baseUrl)};
 
document.getElementById('who').textContent = NAME;
document.getElementById('submitBtn').addEventListener('click', submitReset);
document.getElementById('confirmPw').addEventListener('keypress', function(e) {
  if (e.key === 'Enter') submitReset();
});
 
function submitReset() {
  const newPw = document.getElementById('newPw').value;
  const confirmPw = document.getElementById('confirmPw').value;
  const msgDiv = document.getElementById('msg');
  const btn = document.getElementById('submitBtn');
  msgDiv.className = '';
  msgDiv.textContent = '';
 
  if (newPw.length < 4) { msgDiv.textContent = 'รหัสต้องมีอย่างน้อย 4 ตัว'; return; }
  if (newPw !== confirmPw) { msgDiv.textContent = 'รหัสไม่ตรงกัน'; return; }
 
  btn.disabled = true;
  btn.textContent = 'กำลังบันทึก...';
  msgDiv.textContent = '';
 
  google.script.run
    .withSuccessHandler(function(r) {
      if (r && r.success) {
        showSuccess();
      } else {
        showError((r && r.error) || 'เกิดข้อผิดพลาด');
      }
    })
    .withFailureHandler(function(err) {
      showError((err && err.message) || 'เกิดข้อผิดพลาด');
    })
    .phxConfirmPasswordReset(TOKEN, newPw);
}
 
function showSuccess() {
  // Use button + window.top.location for max reliability across iframe contexts
  document.getElementById('card').innerHTML =
    '<div class="header" style="text-align:center;">' +
    '<div class="badge success">✅ บันทึกรหัสใหม่สำเร็จ</div>' +
    '</div>' +
    '<p class="msg">กลับไปที่แอปและ login ด้วยรหัสใหม่ได้เลย</p>' +
    '<div style="text-align:center;">' +
    '<a class="btn-link" href="' + APP_URL + '" target="_top" ' +
    'onclick="try{window.top.location.href=this.href;return false;}catch(e){return true;}">เปิดแอป</a>' +
    '</div>' +
    '<div class="meta">Siriraj Rx Shift</div>';
}
 
function showError(msg) {
  const msgDiv = document.getElementById('msg');
  msgDiv.className = '';
  msgDiv.textContent = '❌ ' + msg;
  const btn = document.getElementById('submitBtn');
  btn.disabled = false;
  btn.textContent = 'ตั้งรหัสใหม่';
}
</script>
</body>
</html>`;
 
  return HtmlService.createHtmlOutput(html)
    .setTitle('ตั้งรหัสผ่านใหม่ — Siriraj Rx Shift')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ════════════════════════════════════════════════════════════
// 🧪 Test functions
// ════════════════════════════════════════════════════════════

function testB2Change() {
  // ★ แก้ค่าตรงนี้ก่อนรัน (ต้อง register ผ่าน B1 ก่อน)
  const NAME = 'ณรพล';
  const OLD_PW = 'test1234';
  const NEW_PW = 'newpass5678';
  Logger.log('Change: ' + NAME + ' | ' + OLD_PW + ' → ' + NEW_PW);
  const result = phxChangePassword(NAME, OLD_PW, NEW_PW);
  Logger.log(JSON.stringify(result, null, 2));
}

function testB2RequestReset() {
  const NAME = 'ณรพล';
  Logger.log('Request reset for: ' + NAME);
  const result = phxRequestPasswordReset(NAME);
  Logger.log(JSON.stringify(result, null, 2));
}

function testB2ConfirmReset() {
  // ★ Copy token จาก PHX_PendingResets sheet หรือจาก email ที่ได้รับ
  const TOKEN = 'paste-token-here';
  const NEW_PW = 'resetpass9999';
  if (TOKEN === 'paste-token-here') {
    Logger.log('⚠️ แก้ตัวแปร TOKEN ก่อน — copy จาก PHX_PendingResets sheet column A');
    return;
  }
  Logger.log('Confirming reset with token: ' + TOKEN.substring(0, 8) + '...');
  const result = phxConfirmPasswordReset(TOKEN, NEW_PW);
  Logger.log(JSON.stringify(result, null, 2));
}