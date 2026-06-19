// ════════════════════════════════════════════════════════════
// 📦 [G] PASTE AS NEW FILE: Phase_Z_C1_Role.gs
//     (helpers, admin setup, schema check, tests)
// ════════════════════════════════════════════════════════════
 
/**
 * ════════════════════════════════════════════════════════════
 * 👑 C1 — Role helpers + admin setup + tests
 * ════════════════════════════════════════════════════════════
 */
 
 
// ════════════════════════════════════════════════════════════
// 🔧 Internal: resolve target user (admin can act on others)
// ════════════════════════════════════════════════════════════
/**
 * Returns target user name if action is allowed, null if permission denied
 * - actingAs empty/same as auth.name → return auth.name (self-action, always allowed)
 * - actingAs different → check admin role → return targetName or null
 */
function _phxResolveTarget(auth, actingAs) {
  const target = String(actingAs || '').trim();
  if (!target || target === auth.name) return auth.name;
 
  // Cross-user action — admin only
  const role = _phxGetRole(auth.name);
  if (role !== 'admin') return null;
 
  return target;
}
 
function _phxGetRole(name, hash) {
  // 🔐 FIX#2 (security): ถ้า caller ส่ง hash มา → ต้อง verify กับ PHX_Pharmacists
  // - External callers (URL guard, F1/F2/F3/F5): ส่ง 2 args → verify เกิดขึ้น
  // - Internal callers (_phxResolveTarget ใน B3): ส่ง 1 arg → skip verify
  //   (ปลอดภัยเพราะถูกเรียกหลัง _phxVerifyAuth ผ่านแล้ว)
  // - Hash mismatch → return 'user' (caller เช็ค === 'admin' จะ reject ทันที)
  if (hash !== undefined && hash !== null && hash !== '') {
    const pharma = _phxFindPharmacistRow(name);
    if (!pharma || pharma.passwordHash !== hash) return 'user';
  }
  const master = _phxFindMasterRow(name);
  return master ? master.role : 'user';
}
 
 
// ════════════════════════════════════════════════════════════
// 👑 Public: Set user role (admin must call this manually)
// ════════════════════════════════════════════════════════════
function phxSetUserRole(name, role) {
  const target = String(name || '').trim();
  const r = String(role || '').trim().toLowerCase();
 
  if (!target) return { success: false, error: 'name required' };
  if (r !== 'user' && r !== 'admin') {
    return { success: false, error: 'role ต้องเป็น "user" หรือ "admin"' };
  }
 
  const sh = _phxGetSheet('PHX_Pharmacists_Master');
  if (sh.getLastColumn() < 5) {
    return { success: false, error: 'PHX_Pharmacists_Master ยังไม่มี role column — รัน devAddRoleColumn ก่อน' };
  }
 
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === target) {
      sh.getRange(i + 2, 5).setValue(r);
      return { success: true, name: target, role: r };
    }
  }
  return { success: false, error: 'ไม่พบ "' + target + '" ใน Master' };
}
 
 
// ════════════════════════════════════════════════════════════
// 📊 Public: List all admins
// ════════════════════════════════════════════════════════════
function phxListAdmins() {
  const sh = _phxGetSheet('PHX_Pharmacists_Master');
  if (sh.getLastColumn() < 5) {
    Logger.log('⚠️ ยังไม่มี role column');
    return [];
  }
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues();
  const admins = [];
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][4]).trim().toLowerCase() === 'admin') {
      admins.push({ name: String(data[i][0]).trim(), email: String(data[i][1]).trim() });
    }
  }
  Logger.log('Admins (' + admins.length + '):');
  admins.forEach(function(a) { Logger.log('  - ' + a.name + ' <' + a.email + '>'); });
  return admins;
}
 
 
// ════════════════════════════════════════════════════════════
// 🛠️ Dev: Add role column to Master (one-time setup)
// ════════════════════════════════════════════════════════════
function devAddRoleColumn() {
  const sh = _phxGetSheet('PHX_Pharmacists_Master');
  const lastCol = sh.getLastColumn();
 
  if (lastCol >= 5) {
    const header = String(sh.getRange(1, 5).getValue()).trim();
    if (header === 'role') {
      Logger.log('✅ "role" column มีอยู่แล้ว — ไม่ต้องเพิ่ม');
      return;
    } else {
      Logger.log('⚠️ Column 5 มี header "' + header + '" (ไม่ใช่ "role")');
      Logger.log('   → แก้ header ใน E1 เป็น "role" หรือเพิ่ม column ใหม่');
      return;
    }
  }
 
  sh.getRange(1, 5).setValue('role');
  Logger.log('✅ เพิ่ม "role" column ที่ E1');
  Logger.log('   ทุก row ยังว่าง = default role "user"');
  Logger.log('   ใช้ phxSetUserRole(name, "admin") เพื่อตั้ง admin');
}
 
 
// ════════════════════════════════════════════════════════════
// 🛠️ Dev: ตั้งตัวเองเป็น admin
// ════════════════════════════════════════════════════════════
function devSetMeAsAdmin() {
  const MY_NAME = 'ณรพล';  // ★ แก้เป็นชื่อตัวเอง
  const r = phxSetUserRole(MY_NAME, 'admin');
  Logger.log(JSON.stringify(r, null, 2));
  if (r.success) {
    Logger.log('✅ ' + MY_NAME + ' = admin แล้ว');
    Logger.log('   → ลองรัน phxListAdmins ดู');
  }
}

// ════════════════════════════════════════════════════════════
// 🧪 Tests
// ════════════════════════════════════════════════════════════
 
function testC1LoginReturnsRole() {
  const NAME = 'ณรพล';
  const PW = 'klui2543';  // ★ แก้ตามรหัสปัจจุบัน
 
  const r = phxLogin(NAME, PW);
  Logger.log(JSON.stringify(r, null, 2));
 
  if (!r.success) { Logger.log('❌ Login failed'); return; }
  if (!r.role) { Logger.log('❌ Login ไม่มี role field — ตรวจว่า paste [B] ถูกแล้ว'); return; }
  Logger.log('✅ Login OK, role = "' + r.role + '"');
  if (r.role !== 'admin') Logger.log('   ℹ️ ไม่ใช่ admin — รัน devSetMeAsAdmin ก่อน');
}

function testC1ActingAsAdmin() {
  // Admin ลอง push actions เป็นชื่อคนอื่น
  const ADMIN_NAME = 'ณรพล';
  const ADMIN_PW = 'newpass5678';   // ★ แก้
  const VICTIM = 'someone_else';     // ★ แก้เป็นชื่อ user ที่มีอยู่ใน Master
  const pwHash = _phxHashPassword(ADMIN_NAME, ADMIN_PW);
 
  Logger.log('Admin ' + ADMIN_NAME + ' acting as ' + VICTIM + '...');
  const r = phxPushActions(ADMIN_NAME, pwHash, [
    { id: 'admin_test_001', type: 'add', monthId: 'm_พฤษภาคม_2569', shift: 'test' }
  ], VICTIM);
  Logger.log(JSON.stringify(r));
 
  if (r.success && r.actedAs === VICTIM) {
    Logger.log('✅ Admin can act as ' + VICTIM);
    // Cleanup
    phxRemoveAction(ADMIN_NAME, pwHash, 'admin_test_001', VICTIM);
    Logger.log('   (cleaned up test action)');
  } else if (r.error === 'permission denied — admin only') {
    Logger.log('❌ ' + ADMIN_NAME + ' ไม่ใช่ admin — รัน devSetMeAsAdmin ก่อน');
  } else {
    Logger.log('❌ Unexpected: ' + JSON.stringify(r));
  }
}
 
function testC1ActingAsNonAdmin() {
  // Non-admin ลอง act as คนอื่น → ต้องโดน block
  const USER_NAME = 'someone_regular';  // ★ แก้เป็น user ที่ไม่ใช่ admin
  const USER_PW = 'their_password';      // ★ แก้
  const VICTIM = 'ณรพล';
  const pwHash = _phxHashPassword(USER_NAME, USER_PW);
 
  Logger.log('Non-admin ' + USER_NAME + ' trying to act as ' + VICTIM + '...');
  const r = phxPushActions(USER_NAME, pwHash, [
    { id: 'hack_001', type: 'add', monthId: 'm_พฤษภาคม_2569', shift: 'hacked' }
  ], VICTIM);
  Logger.log(JSON.stringify(r));
 
  if (!r.success && r.error === 'permission denied — admin only') {
    Logger.log('✅ Permission denied ถูกต้อง');
  } else if (!r.success && r.error === _B3_AUTH_ERROR) {
    Logger.log('ℹ️ Auth failed — แก้ TEST credentials ก่อน');
  } else {
    Logger.log('❌ Security hole — non-admin acted as ' + VICTIM + '!');
  }
}
 
function testC1ActingAsSelf() {
  // Self-action ผ่าน actingAs=ชื่อตัวเอง — ต้องผ่าน (ไม่ต้อง admin)
  const NAME = 'ณรพล';
  const PW = 'newpass5678';  // ★ แก้
  const pwHash = _phxHashPassword(NAME, PW);
 
  const r = phxPullAll(NAME, pwHash, NAME);  // actingAs=self
  if (r.success) {
    Logger.log('✅ Self-action via actingAs works (count=' + r.count + ')');
  } else {
    Logger.log('❌ ' + r.error);
  }
}
 