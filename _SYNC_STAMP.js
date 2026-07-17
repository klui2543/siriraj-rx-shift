/**
 * ============================================================
 *  SYNC STAMP — ตัวยืนยันเวอร์ชัน (Version Verification Stamp)
 * ============================================================
 * ไฟล์นี้อยู่ทั้งบน Git และ GAS พร้อมกัน
 * วิธีดู stamp ง่ายๆ: เปิดเว็บแอปแล้วต่อท้าย URL ด้วย  ?action=version
 *   เช่น  https://script.google.com/.../exec?action=version
 *   จะเห็นหน้าแสดง หัวข้อ + เวลา push จริง ให้เทียบกับแชทได้ทันที
 *
 * การยืนยันว่า "โค้ดที่อัพโหลด = เวอร์ชันล่าสุดที่ตกลงกันในแชทจริง":
 *   เทียบ topic + updated จาก 3 ที่ให้ตรงกัน = หน้า ?action=version (GAS),
 *   ไฟล์นี้บน GitHub, และหัวข้อที่คุยกันในแชท
 *
 * ค่า topic/note ตั้งโดย Claude; ค่า updated/branch/based_on_commit ถูกปั๊ม
 * อัตโนมัติเป็น "เวลา push จริง" โดย hook clasp-autopush.sh ตอน push ขึ้น GAS
 */
function SYNC_STAMP() {
  return {
    version: 'v3.46',   // ← เลขเวอร์ชัน (bump เองตอนออกรุ่นใหม่) แสดงที่ footer เว็บ
    topic:   'โน้ตเวร — เขียนโน้ตติดบนเวรตัวเอง เลือกสาธารณะ/ส่วนตัว (แทนระบบเจ้าของร่วม)',
    updated: '2026-07-17 00:23 +0000',
    branch:  'main',
    based_on_commit: '1de8f6b',
    note:    'เวลา updated ถูกปั๊มอัตโนมัติเป็นเวลา push จริงตอนขึ้น GAS'
  };
}

/**
 * หน้าเว็บแสดง Sync Stamp — เรียกผ่าน doGet route ?action=version
 * คืน HtmlOutput สไตล์เดียวกับแอป (ฟอนต์ Kanit โทนน้ำเงิน)
 */
function renderSyncStampPage() {
  var s = SYNC_STAMP();
  var backUrl = ScriptApp.getService().getUrl();
  var esc = function (v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };
  var row = function (label, val) {
    return '<div class="row"><span class="lbl">' + esc(label) + '</span>' +
           '<span class="val">' + esc(val) + '</span></div>';
  };
  var html =
    '<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><base target="_top">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>เวอร์ชันระบบ (Sync Stamp)</title>' +
    '<link href="https://fonts.googleapis.com/css2?family=Kanit:wght@400;500;600&display=swap" rel="stylesheet">' +
    '<style>' +
    'body{font-family:"Kanit",Tahoma,Arial,sans-serif;background:linear-gradient(135deg,#1e3a8a 0%,#3b82f6 100%);' +
    'padding:40px 20px;text-align:center;color:#fff;min-height:100vh;margin:0;display:flex;align-items:center;justify-content:center;}' +
    '.card{background:#fff;color:#334155;padding:36px 28px;border-radius:16px;max-width:480px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.3);text-align:left;}' +
    '.icon{font-size:56px;margin-bottom:4px;text-align:center;}' +
    'h1{color:#1e3a8a;font-size:20px;margin:0 0 4px;font-weight:600;text-align:center;}' +
    '.sub{font-size:13px;color:#64748b;margin:0 0 20px;text-align:center;}' +
    '.row{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid #eef2f7;font-size:14px;}' +
    '.row:last-of-type{border-bottom:none;}' +
    '.lbl{color:#64748b;flex:0 0 auto;font-weight:500;}' +
    '.val{color:#0f172a;text-align:right;word-break:break-word;}' +
    '.topic{background:#eff6ff;border:1px solid #dbeafe;color:#1e40af;border-radius:10px;padding:12px 14px;font-size:15px;font-weight:500;margin:0 0 16px;}' +
    '.note{font-size:12px;color:#94a3b8;margin:16px 0 24px;line-height:1.6;}' +
    'a.btn{display:block;text-align:center;background:#1e3a8a;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:500;font-size:14px;}' +
    'a.btn:hover{background:#1e40af;}' +
    '</style></head><body><div class="card">' +
    '<div class="icon">🔖</div>' +
    '<h1>เวอร์ชันระบบที่กำลังรันบน GAS</h1>' +
    '<p class="sub">เทียบกับหัวข้อที่คุยกันในแชท เพื่อยืนยันว่าเป็นเวอร์ชันล่าสุด</p>' +
    '<div class="topic">📌 ' + esc(s.topic) + '</div>' +
    row('🏷️ เวอร์ชัน', s.version) +
    row('⏱️ เวลา push จริง', s.updated) +
    row('🌿 กิ่ง (branch)', s.branch) +
    row('🔗 commit', s.based_on_commit) +
    '<p class="note">' + esc(s.note) + '</p>' +
    '<a class="btn" href="' + backUrl + '" target="_top">← กลับหน้าหลัก</a>' +
    '</div></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setTitle('เวอร์ชันระบบ (Sync Stamp)')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
