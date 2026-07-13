// =================================================================
// 🏷️ AsstNickname.gs — sync ชีท "ทำเนียบชื่อเล่น" → /people/{personKey}/nickname
// -----------------------------------------------------------------
// ชีท 2 คอลัมน์:  A=personKey (ดิบตามตารางเวร เช่น "ธนวัฒน์(ซ)")  |  B=nickname
// Admin กรอกเองผ่าน Sheet โดยตรง (ไม่มีหน้าเว็บให้ผู้ช่วยกรอก)
// การแสดงผล frontend: nickname + " " + personKey ; ไม่มี → fallback personKey เฉยๆ
// =================================================================

// Firebase RTDB key ห้ามมี . $ # [ ] /  → encode เป็น ~code~ (วงเล็บไทย/อังกฤษใช้ได้ปกติ)
function _fbSafeKey_(s) {
  return String(s).replace(/[.$#\[\]\/]/g, function (ch) {
    return '~' + ch.charCodeAt(0) + '~';
  });
}

// เรียกมือจาก editor หรือปุ่มใน Admin: sync ทั้งทำเนียบ
function syncNicknames() {
  if (!ASST_MASTER_SHEET_ID || ASST_MASTER_SHEET_ID.indexOf('PUT_') === 0) {
    return { ok: false, error: 'ยังไม่ได้ตั้งค่า ASST_MASTER_SHEET_ID' };
  }
  const ss = SpreadsheetApp.openById(ASST_MASTER_SHEET_ID);
  const sh = ss.getSheetByName(NICKNAME_TAB);
  if (!sh) return { ok: false, error: 'ไม่พบชีท "' + NICKNAME_TAB + '"' };

  const rows = sh.getDataRange().getValues();
  const people = {};
  let count = 0;
  for (let i = 1; i < rows.length; i++) {   // ข้าม header แถวแรก
    const personKey = normalizeName_(rows[i][0]);
    const nickname = fullTrim_(rows[i][1]);
    if (!personKey || !nickname) continue;
    people[_fbSafeKey_(personKey)] = { personKey: personKey, nickname: nickname };
    count++;
  }
  // เขียนทับทั้ง /people (source of truth = ชีท)
  pushToFirebase_('people', people);
  return { ok: true, count: count };
}

// helper สำหรับ setup: สร้างชีททำเนียบเปล่า + header ถ้ายังไม่มี
function setupNicknameSheet() {
  const ss = SpreadsheetApp.openById(ASST_MASTER_SHEET_ID);
  let sh = ss.getSheetByName(NICKNAME_TAB);
  if (!sh) sh = ss.insertSheet(NICKNAME_TAB);
  sh.getRange(1, 1, 1, 2).setValues([['personKey', 'nickname']]).setFontWeight('bold');
  return 'พร้อมใช้งาน: ' + NICKNAME_TAB;
}
