/**
 * ═══════════════════════════════════════════════════════════════
 * 🔥 Phase G1 — Hot Polling + Schedule + No-Timeout Admin
 *
 * วาง .gs file นี้ทั้งไฟล์ใน Apps Script project (ไฟล์ใหม่)
 * + apply patches ใน Code.gs ตามด้านล่าง
 * ═══════════════════════════════════════════════════════════════
 */


// ════════════════════════════════════════════════════════
// 🔥 HOT POLLING — Manual + Scheduled
// ════════════════════════════════════════════════════════
const HOT_POLLING_FLAG = 'HOT_POLLING_ACTIVE';
const HOT_POLLING_STARTED = 'HOT_POLLING_STARTED_AT';
const HOT_POLLING_MAX_HOURS = 24;
const SCHED_HP_AT = 'SCHEDULED_HOT_POLLING_AT';
const SCHED_HP_TRIGGER = 'SCHEDULED_HOT_POLLING_TRIGGER_ID';

/** ลบ trigger autoUpdateFromGmail_Automatic ทั้งหมด */
function _phxClearAutoSyncTriggers() {
  var deleted = 0;
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'autoUpdateFromGmail_Automatic') {
      ScriptApp.deleteTrigger(t);
      deleted++;
    }
  });
  return deleted;
}

/** เปิด Hot Polling — สร้าง trigger ทุก 1 นาที */
function enableHotPolling() {
  _phxClearAutoSyncTriggers();
  ScriptApp.newTrigger('autoUpdateFromGmail_Automatic')
    .timeBased().everyMinutes(1).create();
  const props = PropertiesService.getScriptProperties();
  props.setProperty(HOT_POLLING_FLAG, 'true');
  props.setProperty(HOT_POLLING_STARTED, new Date().toISOString());
  console.log('🔥 Hot Polling เปิด — ทุก 1 นาที');
  // ถ้าเปิดจาก scheduler — ล้าง flag ตารางที่ตั้งไว้
  props.deleteProperty(SCHED_HP_AT);
  props.deleteProperty(SCHED_HP_TRIGGER);
  return { success: true, mode: 'hot' };
}

/** ปิด Hot Polling — ลบ trigger ทั้งหมด (ไม่มี trigger = ไม่ poll) */
function disableHotPolling() {
  const deleted = _phxClearAutoSyncTriggers();
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty(HOT_POLLING_FLAG);
  props.deleteProperty(HOT_POLLING_STARTED);
  console.log('❄️ Hot Polling ปิด — ลบ ' + deleted + ' trigger');
  return { success: true, mode: 'off', deleted: deleted };
}

/** สถานะปัจจุบัน — สำหรับแสดงใน Admin panel */
function getPollingStatus() {
  const props = PropertiesService.getScriptProperties();
  const isHot = props.getProperty(HOT_POLLING_FLAG) === 'true';
  const startedAt = props.getProperty(HOT_POLLING_STARTED);
  const scheduledAt = props.getProperty(SCHED_HP_AT);

  let autoSyncTriggers = 0, scheduledTriggers = 0;
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'autoUpdateFromGmail_Automatic') autoSyncTriggers++;
    if (t.getHandlerFunction() === 'enableHotPolling') scheduledTriggers++;
  });

  return {
    active: isHot,
    startedAt: startedAt,
    hoursActive: startedAt
      ? Math.round((Date.now() - new Date(startedAt).getTime()) / 360000) / 10
      : null,
    scheduledAt: scheduledAt,
    autoSyncTriggers: autoSyncTriggers,
    scheduledTriggers: scheduledTriggers
  };
}

/** ตั้งเวลา Hot Polling ล่วงหน้า (one-shot trigger) */
function scheduleHotPolling(targetDateISO) {
  const target = new Date(targetDateISO);
  if (isNaN(target.getTime())) throw new Error('วันที่ไม่ถูกต้อง');
  if (target.getTime() <= Date.now() + 60000) {
    throw new Error('ต้องตั้งเวลาในอนาคต (อย่างน้อย 1 นาทีจากนี้)');
  }
  cancelScheduledHotPolling();

  const trigger = ScriptApp.newTrigger('enableHotPolling').timeBased().at(target).create();
  const props = PropertiesService.getScriptProperties();
  props.setProperty(SCHED_HP_AT, target.toISOString());
  props.setProperty(SCHED_HP_TRIGGER, trigger.getUniqueId());

  console.log('⏰ ตั้งเวลา Hot Polling: ' + target.toLocaleString('th-TH'));
  return { success: true, scheduledAt: target.toISOString() };
}

/** ยกเลิกตารางที่ตั้งไว้ */
function cancelScheduledHotPolling() {
  const props = PropertiesService.getScriptProperties();
  const triggerId = props.getProperty(SCHED_HP_TRIGGER);
  let deleted = 0;
  if (triggerId) {
    ScriptApp.getProjectTriggers().forEach(function(t) {
      if (t.getUniqueId() === triggerId) {
        ScriptApp.deleteTrigger(t);
        deleted++;
      }
    });
  }
  // safety: ลบ trigger enableHotPolling ทั้งหมด เผื่อหลุดรอด
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'enableHotPolling') {
      ScriptApp.deleteTrigger(t);
      deleted++;
    }
  });
  props.deleteProperty(SCHED_HP_AT);
  props.deleteProperty(SCHED_HP_TRIGGER);
  return { success: true, deleted: deleted };
}


// ════════════════════════════════════════════════════════
// 🔐 Admin Token — ScriptProperties = ไม่มี timeout
// ════════════════════════════════════════════════════════
// 
// ⚠️ REPLACE 3 functions ใน Code.gs ของคุณด้วยตัวด้านล่าง
//    (verifyAdminLogin, guardCheck_, + ใหม่: logoutAdmin)
//

function verifyAdminLogin(password) {
  if (!password) return { success: false, message: "กรุณาใส่รหัสผ่าน" };
  const inputHash = hashPassword_(String(password));
  if (inputHash !== getAdminHash_()) {
    return { success: false, message: "รหัสผ่านไม่ถูกต้อง" };
  }
  const t = Utilities.getUuid();
  // 🆕 ScriptProperties = persistent (ไม่หมดอายุ จนกว่า logoutAdmin)
  PropertiesService.getScriptProperties().setProperty('ADMIN_TOKEN_' + t, 'VALID');
  return { success: true, token: t };
}

function guardCheck_(t) {
  if (t === SYSTEM_BOT_TOKEN) return;
  if (!t) throw new Error("❌ ล็อกอินหมดอายุ");
  // ใหม่: เช็ค ScriptProperties ก่อน (no-timeout)
  if (PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN_' + t) === 'VALID') return;
  // เก่า: fallback ไป cache (token เก่าก่อน migration)
  if (CacheService.getScriptCache().get('ADMIN_TOKEN_' + t) === 'VALID') return;
  throw new Error("❌ ล็อกอินหมดอายุ");
}

function logoutAdmin(token) {
  if (token) {
    try { PropertiesService.getScriptProperties().deleteProperty('ADMIN_TOKEN_' + token); } catch(e) {}
    try { CacheService.getScriptCache().remove('ADMIN_TOKEN_' + token); } catch(e) {}
  }
  return { success: true };
}

/** Cleanup: ลบ admin token เก่าทั้งหมด (รัน manual เมื่อต้องการ reset) */
function devCleanupAllAdminTokens() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  let deleted = 0;
  Object.keys(all).forEach(function(k) {
    if (k.indexOf('ADMIN_TOKEN_') === 0) {
      props.deleteProperty(k);
      deleted++;
    }
  });
  console.log('ลบ admin tokens ทั้งหมด: ' + deleted);
  return deleted;
}