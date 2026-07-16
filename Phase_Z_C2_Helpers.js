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

    // Normalize: add @mahidol.ac.th if not present (test mode: keep input as-is if it has @)
    const fullEmail = input.indexOf('@') >= 0 ? input : input + '@mahidol.ac.th';

    // Validate format — must be @mahidol or @testDomain (if test mode active)
    if (!/^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(fullEmail)) {
      return { success: false, error: 'รูปแบบอีเมลไม่ถูกต้อง' };
    }
    const inputDomain = fullEmail.split('@')[1].toLowerCase();
    const testDomain = _phxResolveTestDomain();
    if (inputDomain !== 'mahidol.ac.th' && inputDomain !== testDomain) {
      const allowed = testDomain ? '@mahidol.ac.th หรือ @' + testDomain : '@mahidol.ac.th';
      return { success: false, error: 'อีเมลต้องเป็น ' + allowed };
    }
    if (inputDomain === testDomain) {
      console.log('🟡 [TEST MODE] Login attempt with @' + testDomain + ': ' + fullEmail);
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

    // Validate format (test-mode aware)
    if (!/^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(fullEmail)) {
      return { success: false, error: 'รูปแบบอีเมลไม่ถูกต้อง' };
    }
    const inputDomain = fullEmail.split('@')[1].toLowerCase();
    const testDomain = _phxResolveTestDomain();
    if (inputDomain !== 'mahidol.ac.th' && inputDomain !== testDomain) {
      const allowed = testDomain ? '@mahidol.ac.th หรือ @' + testDomain : '@mahidol.ac.th';
      return { success: false, error: 'อีเมลต้องเป็น ' + allowed };
    }
    if (inputDomain === testDomain) {
      console.log('🟡 [TEST MODE] Password reset request with @' + testDomain + ': ' + fullEmail);
    }

    // Auto-detect: try Master.approvedEmail first, then Pharmacists.backupEmail
    let name = _phxFindNameByEmail_EL(fullEmail);
    if (!name) {
      name = _phxFindNameByBackupEmail_EL(fullEmail);
    }
    if (!name) {
      const masked = (typeof _phxMaskEmail === 'function') ? _phxMaskEmail(fullEmail) : fullEmail;
      return { success: false, error: 'ไม่พบ ' + masked + ' ในระบบ' };
    }

    // Delegate to B2 with explicit target email → reset link will go to the address user entered
    return phxRequestPasswordReset(name, fullEmail);
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


// ────────────────────────────────────────────────────────────
// Helper: find name by backupEmail in PHX_Pharmacists col E
// ────────────────────────────────────────────────────────────
function _phxFindNameByBackupEmail_EL(email) {
  try {
    const sh = _phxGetSheet('PHX_Pharmacists');
    if (sh.getLastRow() < 2) return null;
    const data = sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues();
    const target = String(email || '').trim().toLowerCase();
    if (!target) return null;
    for (let i = 0; i < data.length; i++) {
      const e = String(data[i][4] || '').trim().toLowerCase();  // col E
      if (e === target) return String(data[i][0] || '').trim();
    }
    return null;
  } catch (e) {
    console.error('_phxFindNameByBackupEmail_EL error: ' + e.message);
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

    // Master.approvedEmail ว่าง = ยังไม่มีใครจองชื่อนี้ → ให้ user จองด้วยอีเมลตัวเองได้
    // ไม่เขียนลง Master ตรงนี้ — เขียนใน phxVerifyToken หลังคลิกลิงก์ยืนยันแล้วเท่านั้น
    // (พิมพ์อีเมลผิดแล้วไม่ยืนยัน = ชื่อยังว่าง สมัครใหม่ได้ ไม่ล็อกตาย)
    const masterEmail = String(masterRow.approvedEmail || '').trim().toLowerCase();
    if (masterEmail) {
      if (masterEmail !== fullEmail) {
        return {
          success: false,
          error: 'อีเมลไม่ตรงกับที่ระบบบันทึกไว้สำหรับชื่อนี้ — โปรดตรวจสอบหรือติดต่อ admin'
        };
      }
    } else {
      // First claim — อีเมลต้องไม่ถูกใช้กับชื่ออื่น (1 name : 1 email)
      const takenBy = _phxFindNameByEmail_EL(fullEmail);
      if (takenBy && takenBy !== name) {
        return {
          success: false,
          error: 'อีเมล ' + _phxMaskEmail(fullEmail) + ' ถูกใช้กับชื่ออื่นแล้ว — โปรดตรวจสอบหรือติดต่อ admin'
        };
      }
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

    // Validate email (test-mode aware: allow non-mahidol domain if PHX_TEST_DOMAIN set)
    if (!eLocal) return { success: false, error: 'กรุณากรอก username หรืออีเมล' };

    const testDomain = _phxResolveTestDomain();
    let fullEmail;
    if (eLocal.indexOf('@') >= 0) {
      // User entered full email — domain must be mahidol or testDomain
      if (!/^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(eLocal)) {
        return { success: false, error: 'อีเมลผิดรูปแบบ' };
      }
      const inputDomain = eLocal.split('@')[1].toLowerCase();
      if (inputDomain !== 'mahidol.ac.th' && inputDomain !== testDomain) {
        const allowed = testDomain ? '@mahidol.ac.th หรือ @' + testDomain : '@mahidol.ac.th';
        return { success: false, error: 'อีเมลต้องเป็น ' + allowed };
      }
      fullEmail = eLocal;
      if (inputDomain === testDomain) {
        console.log('🟡 [TEST MODE] Custom registration with @' + testDomain + ': ' + eLocal);
      }
    } else {
      // Local part only — default to @mahidol
      if (!/^[a-z0-9._-]+$/.test(eLocal)) {
        return { success: false, error: 'username อีเมลผิดรูปแบบ — ใช้ได้ a-z, 0-9, จุด, ขีดล่าง, ขีดกลาง' };
      }
      fullEmail = eLocal + '@mahidol.ac.th';
    }

    // Validate password
    if (pw.length < _B1_MIN_PW_LEN) {
      return { success: false, error: 'รหัสผ่านต้องมีอย่างน้อย ' + _B1_MIN_PW_LEN + ' ตัวอักษร' };
    }

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

    // ไม่เขียน Master ตรงนี้ — phxVerifyToken สร้างแถวให้หลังคลิกลิงก์ยืนยันแล้ว
    // (พิมพ์อีเมลผิดแล้วไม่ยืนยัน = ชื่อยังว่าง สมัครใหม่ได้ ไม่ต้องให้ admin ไปลบแถว)

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


// ════════════════════════════════════════════════════════════
// 🧪 ADMIN TEST MODE — Allow non-mahidol domain for testing
// ════════════════════════════════════════════════════════════
//
// Purpose: Let admin test registration end-to-end using personal
//          @gmail.com without spamming real @mahidol users.
//
// Usage:
//   1. phxEnableTestMode('gmail.com')  — turn ON
//   2. Register via UI with @gmail.com email
//   3. Receive verify email → click → login → test
//   4. devCleanupTestUser('ชื่อทดสอบ')  — clean up rows
//   5. phxDisableTestMode()  — turn OFF (IMPORTANT)
//
// Safety: every register/login when test mode is ON logs to console.
// ════════════════════════════════════════════════════════════

const _PHX_TEST_MODE_PROP = 'PHX_TEST_DOMAIN';

function _phxResolveTestDomain() {
  try {
    const v = PropertiesService.getScriptProperties().getProperty(_PHX_TEST_MODE_PROP);
    return (v && String(v).trim()) ? String(v).trim().toLowerCase() : null;
  } catch (e) {
    return null;
  }
}

function phxEnableTestMode(domain) {
  const d = String(domain || '').trim().toLowerCase();
  if (!d || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) {
    Logger.log('❌ Invalid domain. Example: phxEnableTestMode("gmail.com")');
    return { success: false, error: 'Invalid domain' };
  }
  if (d === 'mahidol.ac.th') {
    Logger.log('⚠️ mahidol.ac.th is always allowed — no need to enable.');
    return { success: false, error: 'No-op' };
  }
  PropertiesService.getScriptProperties().setProperty(_PHX_TEST_MODE_PROP, d);
  Logger.log('✅ Test mode ENABLED for @' + d);
  Logger.log('⚠️ REMINDER: run phxDisableTestMode() when done testing!');
  return { success: true, domain: d };
}

function phxDisableTestMode() {
  PropertiesService.getScriptProperties().deleteProperty(_PHX_TEST_MODE_PROP);
  Logger.log('✅ Test mode DISABLED (production: @mahidol.ac.th only)');
  return { success: true };
}

function phxTestModeStatus() {
  const d = _phxResolveTestDomain();
  if (d) {
    Logger.log('🟡 Test mode ACTIVE — allowing @' + d);
  } else {
    Logger.log('🟢 Production mode — @mahidol.ac.th only');
  }
  return { active: !!d, domain: d };
}

function devTurnOnTestMode() { return phxEnableTestMode('gmail.com'); }