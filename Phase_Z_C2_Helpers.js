/**
 * ════════════════════════════════════════════════════════════
 * 📧 PHASE Z C2 — Email-based Login + Forgot Password (FIXED)
 * ════════════════════════════════════════════════════════════
 *
 * Self-contained — includes its own email→name lookup helper.
 * Does NOT depend on Phase_Z_C2_Helpers.gs being loaded.
 *
 * Apply: paste ทับ `Phase_Z_C2_EmailLogin.gs` เดิม
 *
 * Requires only B1: _phxGetSheet, _phxMaskEmail, phxLogin
 *           and B2: phxRequestPasswordReset
 */


// ════════════════════════════════════════════════════════════
// 🔑 Login by @mahidol email (or username only)
// ════════════════════════════════════════════════════════════
function phxLoginByEmail(emailOrLocal, password) {
  try {
    const input = String(emailOrLocal || '').trim().toLowerCase();
    if (!input) return { success: false, error: 'กรุณากรอก username หรืออีเมล' };

    // Normalize: add @mahidol.ac.th if not present
    const fullEmail = input.indexOf('@') >= 0 ? input : input + '@mahidol.ac.th';

    // Validate format — must be @mahidol.ac.th
    if (!/^[a-z0-9._-]+@mahidol\.ac\.th$/i.test(fullEmail)) {
      return { success: false, error: 'รูปแบบอีเมลไม่ถูกต้อง — ต้องเป็น @mahidol.ac.th' };
    }

    // Find the Thai name from Master via approvedEmail (self-contained — no external helper)
    const name = _phxFindNameByEmail_EL(fullEmail);
    if (!name) {
      const masked = (typeof _phxMaskEmail === 'function') ? _phxMaskEmail(fullEmail) : fullEmail;
      return { success: false, error: 'ไม่พบ ' + masked + ' ในระบบ — โปรดตรวจสอบ หรือ "สมัครใหม่"' };
    }

    // Delegate to existing B1 phxLogin (validates password + returns role + hash)
    return phxLogin(name, password);
  } catch (e) {
    console.error('phxLoginByEmail error: ' + e.message);
    return { success: false, error: 'เกิดข้อผิดพลาด: ' + e.message };
  }
}


// ════════════════════════════════════════════════════════════
// 📧 Request password reset by @mahidol email
// ════════════════════════════════════════════════════════════
function phxRequestPasswordResetByEmail(emailOrLocal) {
  try {
    const input = String(emailOrLocal || '').trim().toLowerCase();
    if (!input) return { success: false, error: 'กรุณากรอก username หรืออีเมล' };

    const fullEmail = input.indexOf('@') >= 0 ? input : input + '@mahidol.ac.th';

    if (!/^[a-z0-9._-]+@mahidol\.ac\.th$/i.test(fullEmail)) {
      return { success: false, error: 'รูปแบบอีเมลไม่ถูกต้อง — ต้องเป็น @mahidol.ac.th' };
    }

    const name = _phxFindNameByEmail_EL(fullEmail);
    if (!name) {
      const masked = (typeof _phxMaskEmail === 'function') ? _phxMaskEmail(fullEmail) : fullEmail;
      return { success: false, error: 'ไม่พบ ' + masked + ' ในระบบ' };
    }

    // Delegate to existing B2 phxRequestPasswordReset
    return phxRequestPasswordReset(name);
  } catch (e) {
    console.error('phxRequestPasswordResetByEmail error: ' + e.message);
    return { success: false, error: 'เกิดข้อผิดพลาด: ' + e.message };
  }
}


// ════════════════════════════════════════════════════════════
// 🔧 Internal helper — find Thai name by email in Master sheet
//    (suffix _EL to avoid collision with potential other _phxIs… variants)
// ════════════════════════════════════════════════════════════
function _phxFindNameByEmail_EL(email) {
  try {
    const sh = _phxGetSheet('PHX_Pharmacists_Master');
    if (sh.getLastRow() < 2) return null;
    const data = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
    const target = String(email || '').trim().toLowerCase();
    if (!target) return null;
    for (let i = 0; i < data.length; i++) {
      const e = String(data[i][1] || '').trim().toLowerCase();
      if (e === target) return String(data[i][0] || '').trim();
    }
    return null;
  } catch (e) {
    console.error('_phxFindNameByEmail_EL error: ' + e.message);
    return null;
  }
}


// ════════════════════════════════════════════════════════════
// 🧪 Tests
// ════════════════════════════════════════════════════════════

function testLoginByEmailLocal() {
  // ★ แก้ username + password
  const r = phxLoginByEmail('norapol.utt', 'klui2543');
  Logger.log('Login by local: ' + JSON.stringify(r, null, 2));
}

function testLoginByEmailFull() {
  const r = phxLoginByEmail('norapol.utt@mahidol.ac.th', 'klui2543');
  Logger.log('Login by full: ' + JSON.stringify(r, null, 2));
}

function testForgotByEmail() {
  const r = phxRequestPasswordResetByEmail('norapol.utt');
  Logger.log('Forgot: ' + JSON.stringify(r, null, 2));
}

function testEmailNotFound() {
  const r = phxLoginByEmail('nobody.xyz', 'anything');
  Logger.log('Expected fail: ' + JSON.stringify(r));
}

function testDirectFindHelper() {
  // Verify helper alone works
  const n = _phxFindNameByEmail_EL('norapol.utt@mahidol.ac.th');
  Logger.log('Helper returned: ' + (n || '(null)'));
}

// ════════════════════════════════════════════════════════════
// 📝 PHASE Z C2 — Email-based Registration (V2 + Custom)
// ════════════════════════════════════════════════════════════
//
// V2: ชื่อใน Master/dropdown → email ต้องตรงกับที่ admin ตั้งใน Master
// Custom: ชื่อใหม่ → auto-add row ใหม่ใน Master (active=true, role='user')
//
// Return: {success: true, message: "..."} | {success: false, error: "..."}
//
// Requires B1: _phxFindMasterRow, _phxFindPharmacistRow, _phxGetSheet,
//              _phxHashPassword, _phxGenerateToken, _phxQueueVerifyEmail,
//              _phxMaskEmail, _phxClearPendingByName, _B1_TOKEN_EXPIRY_MS, _B1_MIN_PW_LEN
// ════════════════════════════════════════════════════════════


// ────────────────────────────────────────────────────────────
// 🌐 V2: Register with name from dropdown (must be in Master)
// ────────────────────────────────────────────────────────────
function phxStartRegistrationV2(rawName, password, emailLocal) {
  try {
    const name = String(rawName || '').trim();
    const pw = String(password || '');
    const eLocal = String(emailLocal || '').trim().toLowerCase();

    // Validate
    if (!name) return { success: false, error: 'กรุณาเลือกชื่อ' };
    if (!eLocal) return { success: false, error: 'กรุณากรอก username อีเมล' };
    if (!/^[a-z0-9._-]+$/.test(eLocal)) {
      return { success: false, error: 'username อีเมลผิดรูปแบบ — ใช้ได้ a-z, 0-9, จุด, ขีดล่าง, ขีดกลาง' };
    }
    if (pw.length < _B1_MIN_PW_LEN) {
      return { success: false, error: 'รหัสผ่านต้องมีอย่างน้อย ' + _B1_MIN_PW_LEN + ' ตัวอักษร' };
    }

    const fullEmail = eLocal + '@mahidol.ac.th';

    // Must exist in Master
    const masterRow = _phxFindMasterRow(name);
    if (!masterRow) {
      return { success: false, error: 'ไม่พบชื่อ "' + name + '" ใน Master — โปรดเลือกใหม่หรือใช้ "ไม่พบชื่อ — ใส่เอง"' };
    }
    if (masterRow.active !== true && String(masterRow.active).toUpperCase() !== 'TRUE') {
      return { success: false, error: 'ชื่อนี้ถูกระงับ — โปรดติดต่อ admin' };
    }

    // Email must match Master's approvedEmail (security: prevent random hijack)
    const masterEmail = String(masterRow.approvedEmail || '').trim().toLowerCase();
    if (!masterEmail) {
      return { success: false, error: 'admin ยังไม่ได้ตั้งค่าอีเมลสำหรับ "' + name + '" — โปรดติดต่อ admin' };
    }
    if (masterEmail !== fullEmail) {
      return {
        success: false,
        error: 'อีเมลไม่ตรงกับที่ admin ตั้งไว้สำหรับชื่อนี้ — โปรดตรวจสอบหรือติดต่อ admin'
      };
    }

    // Must not be registered yet
    if (_phxFindPharmacistRow(name)) {
      return { success: false, error: 'ชื่อนี้ลงทะเบียนแล้ว — กรุณา login หรือ "ลืมรหัส"' };
    }

    // Proceed: clear stale pending, write new
    _phxClearPendingByName(name);

    const passwordHash = _phxHashPassword(name, pw);
    const token = _phxGenerateToken();
    const expiresAt = new Date(Date.now() + _B1_TOKEN_EXPIRY_MS);
    const now = new Date();

    _phxGetSheet('PHX_PendingVerifications')
      .appendRow([token, name, passwordHash, fullEmail, expiresAt, now]);

    _phxQueueVerifyEmail(name, fullEmail, token);

    return {
      success: true,
      message: 'ส่งอีเมลยืนยันไปยัง ' + _phxMaskEmail(fullEmail) + ' แล้ว — กรุณาตรวจกล่องจดหมาย (อาจอยู่ใน Spam)'
    };
  } catch (e) {
    console.error('phxStartRegistrationV2 error: ' + e.message);
    return { success: false, error: 'เกิดข้อผิดพลาด: ' + e.message };
  }
}


// ────────────────────────────────────────────────────────────
// 🌐 Custom: Register with NEW name — auto-add to Master
// ────────────────────────────────────────────────────────────
function phxStartRegistrationCustom(rawName, password, emailLocal) {
  try {
    const name = String(rawName || '').trim();
    const pw = String(password || '');
    const eLocal = String(emailLocal || '').trim().toLowerCase();

    // Validate name
    if (!name) return { success: false, error: 'กรุณากรอกชื่อเต็ม' };
    if (name.length < 2) return { success: false, error: 'ชื่อสั้นเกินไป' };
    if (name.length > 100) return { success: false, error: 'ชื่อยาวเกินไป (จำกัด 100 ตัวอักษร)' };

    // Validate email
    if (!eLocal) return { success: false, error: 'กรุณากรอก username อีเมล' };
    if (!/^[a-z0-9._-]+$/.test(eLocal)) {
      return { success: false, error: 'username อีเมลผิดรูปแบบ — ใช้ได้ a-z, 0-9, จุด, ขีดล่าง, ขีดกลาง' };
    }

    // Validate password
    if (pw.length < _B1_MIN_PW_LEN) {
      return { success: false, error: 'รหัสผ่านต้องมีอย่างน้อย ' + _B1_MIN_PW_LEN + ' ตัวอักษร' };
    }

    const fullEmail = eLocal + '@mahidol.ac.th';

    // Name must NOT be in Master
    if (_phxFindMasterRow(name)) {
      return {
        success: false,
        error: 'ชื่อ "' + name + '" มีอยู่ในระบบแล้ว — กรุณาเลือกจาก dropdown แทน'
      };
    }

    // Name must NOT be already registered
    if (_phxFindPharmacistRow(name)) {
      return { success: false, error: 'ชื่อนี้ลงทะเบียนแล้ว — กรุณา login' };
    }

    // Email must be unique (1 name : 1 email policy)
    const existingName = _phxFindNameByEmail_EL(fullEmail);
    if (existingName) {
      return {
        success: false,
        error: 'อีเมล ' + _phxMaskEmail(fullEmail) + ' มีคนใช้แล้ว — โปรดใช้อีเมลอื่นหรือติดต่อ admin'
      };
    }

    // 🆕 Auto-add to PHX_Pharmacists_Master
    // Schema: [name, approvedEmail, active, notes, role]
    _phxGetSheet('PHX_Pharmacists_Master').appendRow([
      name,
      fullEmail,
      true,
      'auto-added from custom registration @ ' + new Date().toISOString(),
      'user'
    ]);

    // Clear any stale pending (defensive)
    _phxClearPendingByName(name);

    // Standard pending verification flow
    const passwordHash = _phxHashPassword(name, pw);
    const token = _phxGenerateToken();
    const expiresAt = new Date(Date.now() + _B1_TOKEN_EXPIRY_MS);
    const now = new Date();

    _phxGetSheet('PHX_PendingVerifications')
      .appendRow([token, name, passwordHash, fullEmail, expiresAt, now]);

    _phxQueueVerifyEmail(name, fullEmail, token);

    return {
      success: true,
      message: '✅ เพิ่มชื่อใหม่ในระบบ และส่งอีเมลยืนยันไปยัง ' + _phxMaskEmail(fullEmail) + ' แล้ว — กรุณาตรวจกล่องจดหมาย'
    };
  } catch (e) {
    console.error('phxStartRegistrationCustom error: ' + e.message);
    return { success: false, error: 'เกิดข้อผิดพลาด: ' + e.message };
  }
}


// ────────────────────────────────────────────────────────────
// 🧪 Tests
// ────────────────────────────────────────────────────────────
function testRegisterV2_ok() {
  // ★ ต้อง: ชื่ออยู่ใน Master + email ตรงกับ Master's approvedEmail + ยังไม่ register
  const r = phxStartRegistrationV2('ชื่อทดสอบในMaster', 'test1234', 'username.email');
  Logger.log(JSON.stringify(r, null, 2));
}

function testRegisterV2_emailMismatch() {
  const r = phxStartRegistrationV2('ณรพล', 'test1234', 'wrong.email');
  Logger.log(JSON.stringify(r, null, 2));
}

function testRegisterCustom_ok() {
  // ★ ชื่อต้องไม่อยู่ใน Master
  const r = phxStartRegistrationCustom('ภญ.ทดสอบ G2', 'test1234', 'test.g2.unique');
  Logger.log(JSON.stringify(r, null, 2));
}

function testRegisterCustom_nameInMasterRejected() {
  // ชื่อใน Master → ต้องถูก reject
  const r = phxStartRegistrationCustom('ณรพล', 'test1234', 'whatever');
  Logger.log(JSON.stringify(r, null, 2));
}

// ════════════════════════════════════════════════════════════
// 🧪 Dev: Verify pending registration by name (bypass email)
// ════════════════════════════════════════════════════════════
function devVerifyByName(name) {
  const target = String(name || 'ภญ.ทดสอบ G2').trim();
  if (!target) { Logger.log('❌ ใส่ชื่อด้วย'); return; }

  const sh = _phxGetSheet('PHX_PendingVerifications');
  if (sh.getLastRow() < 2) { Logger.log('❌ ไม่มี pending verifications เลย'); return; }

  // Schema: [token, name, passwordHash, approvedEmail, expiresAt, createdAt]
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues();
  let token = null;
  for (let i = data.length - 1; i >= 0; i--) {  // ล่าสุดก่อน
    if (String(data[i][1] || '').trim() === target) {
      token = String(data[i][0] || '').trim();
      break;
    }
  }
  if (!token) { Logger.log('❌ ไม่พบ pending token สำหรับ "' + target + '"'); return; }

  Logger.log('Token: ' + token);
  const r = phxVerifyToken(token);
  Logger.log('Verify result: ' + JSON.stringify(r, null, 2));
}


// ════════════════════════════════════════════════════════════
// 🧹 Dev: Cleanup test user from all sheets
// ════════════════════════════════════════════════════════════
function devCleanupTestUser(name) {
  const target = String(name || 'ภญ.ทดสอบ G2').trim();
  if (!target) { Logger.log('❌ ใส่ชื่อด้วย'); return; }

  // [tab, col index of name (0-based)]
  const tabs = [
    ['PHX_Pharmacists_Master', 0],
    ['PHX_Pharmacists', 0],
    ['PHX_PendingVerifications', 1]
  ];
  let total = 0;
  tabs.forEach(function(t) {
    const sh = _phxGetSheet(t[0]);
    if (sh.getLastRow() < 2) return;
    const data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
    for (let i = data.length - 1; i >= 0; i--) {
      if (String(data[i][t[1]] || '').trim() === target) {
        sh.deleteRow(i + 2);
        total++;
      }
    }
    Logger.log('✓ Cleaned ' + t[0]);
  });
  Logger.log('Total rows removed: ' + total);
}