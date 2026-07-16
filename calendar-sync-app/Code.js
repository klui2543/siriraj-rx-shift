/**
 * Siriraj Rx Shift — Calendar Sync (โปรเจกต์แยก)
 * ================================================
 * โปรเจกต์เล็ก "ประตู Calendar" ที่แยกออกจากแอปหลัก เพื่อให้ scope ที่ผู้ใช้
 * ต้องยินยอมเหลือแค่ปฏิทิน (calendar) + อีเมล (userinfo.email) เท่านั้น —
 * ไม่ลาก Gmail/Drive/Sheets (restricted scope) เข้ามาในหน้า consent ของผู้ใช้
 * จึง verify แบบ sensitive ได้ (ไม่ต้องผ่าน CASA)
 *
 * หลักการสำคัญ 3 ข้อ:
 *   1. โค้ดนี้แตะแค่ CalendarApp + Session(email) + PropertiesService เท่านั้น
 *      → scope = calendar + userinfo.email (ดู appsscript.json)
 *   2. "ใครถือเวรอะไรบ้าง" ไม่ได้อ่านจากชีต — แอปหลัก "ส่งเข้ามา" (effectiveShifts)
 *      ผ่าน google.script.run จากหน้า connect.html (ดู README §การเชื่อมกับแอปหลัก)
 *   3. mapping "shift ↔ event id" เก็บใน PropertiesService.getUserProperties()
 *      (per-user, ไม่ใช้ scope เพิ่ม) แทนการเขียนชีตแบบเดิม
 *
 * Deploy: Web app, "Execute as: User accessing the web app", "Anyone with a Google account"
 */

// ============================================================
// CONFIG
// ============================================================
var CAL_TZ = 'Asia/Bangkok';
var QUIET_START_HOUR = 22;   // 22:00
var QUIET_END_HOUR = 6;      // 06:00 — ไม่เตือนช่วงนอน
// v3.49: ALARM_OFFSETS_MIN + _buildReminderMinutes เอาออกแล้ว — ถูกแทนด้วย _smartReminderMins()
//   ที่ลอกตรรกะจาก ICS มาเป๊ะ (ดู git history ถ้าต้องการของเดิม)
var ALLDAY_REMIND_MIN = 240;            // เตือน 20:00 คืนก่อน — ใช้กับ all-day เท่านั้น (คลินิก/ไม่รู้เวลา)
                                        //   event ทั้งวันนับถอยหลังจากเที่ยงคืน → เตือนตามเวลาเวรไม่ได้

var EVENT_COLORS = {
  'เวรกลางวัน': 2, 'เวรเช้า': 2,
  'เวรรอบ 1': 9, 'เวรรอบ1': 9,
  'เวรรอบ 2': 5, 'เวรรอบ2': 5,
  'เวรรอบ 3': 11, 'เวรรอบ3': 11,
  '⚠️': 3
};
var DEFAULT_COLOR = 8;

var PROP_TARGET_CAL = 'targetCalendarId';   // UserProperty: ปฏิทินปลายทางที่ผู้ใช้เลือก
var PROP_MAP_PREFIX = 'map_';                // UserProperty: map_<monthValue> → JSON sync map

// --- Auto-sync (background trigger เก็บตกตอนผู้ใช้ปิดแอป) ---
// แอปหลักเขียน "เวรล่าสุดของผู้ใช้" ลง Firebase node: <FEED_PATH>/<encAppName> = { <monthValue>: {shifts:[...], updatedAt} }
// trigger ของผู้ใช้ (รันในนามผู้ใช้เอง) มาอ่าน node นี้ทุก ๆ ไม่กี่นาที แล้ว sync
var FIREBASE_BASE = 'https://siriraj-rx-shift-default-rtdb.asia-southeast1.firebasedatabase.app';  // RTDB ตัวเดียวกับแอปหลัก
var FEED_PATH = 'calFeed';                       // ต้องตรงกับที่แอปหลักเขียน
var AUTO_SYNC_INTERVAL_MIN = 5;                  // GAS รองรับ 1/5/10/15/30 — 5 = สมดุลระหว่างไว vs โควตา trigger
var PROP_APP_NAME = 'appName';                   // ชื่อผู้ใช้ในแอปหลัก (รับจาก handshake) → ใช้เป็น key ของ feed
var PROP_AUTO_ON = 'autoSyncOn';                 // '1' = เปิด auto-sync

// ============================================================
// WEB ENTRY
// ============================================================
function doGet(e) {
  // รับ ?name=<ชื่อในแอปหลัก> ที่แอปหลักแนบมาตอนเปิด popup → เคาน์เตอร์เอาไปหยิบเวรจาก Firebase feed เอง
  var t = HtmlService.createTemplateFromFile('connect');
  t.paramName = (e && e.parameter && e.parameter.name) ? String(e.parameter.name) : '';
  return t.evaluate()
    .setTitle('เชื่อมต่อ Google Calendar — Siriraj Rx Shift')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** ตัวตนของผู้ใช้ที่กำลังรัน (มาจาก scope userinfo.email) */
function whoAmI() {
  return { ok: true, email: Session.getEffectiveUser().getEmail() };
}

/** รับ "ชื่อในแอปหลัก" ของผู้ใช้ (จาก handshake) มาเก็บไว้ ใช้เป็น key ของ Firebase feed */
function setAppName(appName) {
  if (appName) _up().setProperty(PROP_APP_NAME, String(appName).trim());
  return { ok: true, appName: _up().getProperty(PROP_APP_NAME) || null };
}

// ============================================================
// PER-USER STORAGE (PropertiesService — ไม่ใช้ scope เพิ่ม)
// ============================================================
function _up() { return PropertiesService.getUserProperties(); }

function _getMap(monthValue) {
  var raw = _up().getProperty(PROP_MAP_PREFIX + monthValue);
  return raw ? JSON.parse(raw) : {};
}
function _saveMap(monthValue, map) {
  _up().setProperty(PROP_MAP_PREFIX + monthValue, JSON.stringify(map));
}
function _allMonthMapKeys() {
  var all = _up().getProperties();
  return Object.keys(all).filter(function (k) { return k.indexOf(PROP_MAP_PREFIX) === 0; });
}

// ============================================================
// PURE HELPERS (ไม่มี scope — ยกมาจาก Phase2C.js)
// ============================================================
function _parseShiftDateTime(shift) {
  if (!shift || !shift.timestamp || !shift.range) return null;
  var ts = String(shift.timestamp);
  if (ts.length !== 8) return null;
  var year = parseInt(ts.substring(0, 4), 10);
  var month = parseInt(ts.substring(4, 6), 10) - 1;
  var day = parseInt(ts.substring(6, 8), 10);

  var parts = String(shift.range).split('-');
  if (parts.length !== 2) return null;
  var sm = parts[0].trim().split(':');
  var em = parts[1].trim().split(':');
  if (sm.length !== 2 || em.length !== 2) return null;

  var startH = parseInt(sm[0], 10), startM = parseInt(sm[1], 10);
  var endH = parseInt(em[0], 10), endM = parseInt(em[1], 10);
  if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) return null;

  var start = new Date(year, month, day, startH, startM, 0);
  var end = new Date(year, month, day, endH, endM, 0);
  if (end <= start) end = new Date(year, month, day + 1, endH, endM, 0);  // ข้ามคืน
  return { start: start, end: end };
}

// v3.47: all-day date (midnight ของวันเวร) จาก timestamp — ไม่ต้องใช้ range.
//   ⚠️ v3.49: ใช้กับ "เวรที่ไม่รู้เวลา" เท่านั้นแล้ว (คลินิก / range อ่านไม่ออก) — ดู _shiftTimes()
function _shiftAllDayStart(shift) {
  if (!shift || !shift.timestamp) return null;
  var ts = String(shift.timestamp);
  if (ts.length !== 8) return null;
  var year = parseInt(ts.substring(0, 4), 10);
  var month = parseInt(ts.substring(4, 6), 10) - 1;
  var day = parseInt(ts.substring(6, 8), 10);
  var d = new Date(year, month, day, 0, 0, 0);
  return isNaN(d.getTime()) ? null : d;
}

// v3.49: เวลาเริ่ม/จบจริงของเวร (Klui: "แก้ Gcal sync ให้เป็นตาม ICS เรื่องเวลา")
//   เดิม v3.47 sync เป็น all-day ทุกใบ → เวลาเวรหาย ปฏิทินโชว์ 7 โมงเช้า (บั๊กเดียวกับ ICS ที่เพิ่งกู้)
//   กติกาเดียวกับ ICS เป๊ะ: คลินิก = เวลาไม่แน่นอนจริง → all-day · อ่าน range ไม่ออก → all-day
//   · นอกนั้น → timed ตามเวลาจริง
//   วันที่มาจาก timestamp (ฝั่งแอปเลื่อนรอบ 3 มาให้แล้ว) + เวลามาจาก range
//   ♻️ ใช้ _parseShiftDateTime() ที่มีอยู่แล้ว (v3.47 ตัดสายทิ้งจนกลายเป็นโค้ดตาย) — มันทำ
//      timestamp+range → start/end + ทดวันตอนข้ามคืนไว้ครบแล้ว ไม่ต้องเขียนใหม่ให้ซ้ำซ้อน
//   → { start, end, allDay }  |  null ถ้าอ่านวันที่ไม่ได้
function _shiftTimes(shift) {
  var base = _shiftAllDayStart(shift);
  if (!base) return null;
  if (_isClinicShift(shift)) return { start: base, end: base, allDay: true };
  var t = _parseShiftDateTime(shift);
  if (!t) return { start: base, end: base, allDay: true };
  return { start: t.start, end: t.end, allDay: false };
}

// v3.49: ลอก _buildSmartAlarms (Index.html — ตัวสร้าง ICS) มาให้ตรงกันเป๊ะ แต่คืน "นาทีก่อนเข้าเวร"
//   แทน trigger string เพราะ GCal ใช้ addPopupReminder(minutesBefore)
//   ค่า default = เตือน 18:00 วันก่อน + อีกที 5 ชม. ก่อนเข้าเวร (เลี่ยงช่วงนอน 22:00-06:00)
//   userSettings = {eveningTime:'HH:MM', hoursBefore:'1-24'} ส่งมาจากแอปหลัก (ค่าเดียวกับ ICS)
//   ⚠️ ถ้าแก้ตรรกะที่ Index.html ต้องมาแก้ที่นี่ด้วย ไม่งั้น ICS กับ GCal จะเตือนคนละจังหวะ
//   ♻️ ช่วงนอนใช้ QUIET_START_HOUR/QUIET_END_HOUR ที่ไฟล์นี้มีอยู่แล้ว (22/06 = ค่าเดียวกับฝั่ง ICS)
function _smartReminderMins(startH, startM, userSettings) {
  var SLEEP_START = QUIET_START_HOUR, SLEEP_END = QUIET_END_HOUR;
  var startMins = startH * 60 + startM;
  var evH = 18, evM = 0, hoursBefore = 5, useEv = true, useHb = true;
  if (userSettings && (userSettings.eveningTime || userSettings.hoursBefore)) {
    useEv = !!userSettings.eveningTime;
    useHb = !!userSettings.hoursBefore;
    if (useEv) {
      var m = String(userSettings.eveningTime).match(/^(\d{1,2}):(\d{1,2})$/);
      if (m) { evH = parseInt(m[1], 10); evM = parseInt(m[2], 10); } else { useEv = false; }
    }
    if (useHb) {
      var hb = parseInt(userSettings.hoursBefore, 10);
      if (!isNaN(hb) && hb >= 1 && hb <= 24) hoursBefore = hb; else useHb = false;
    }
  }
  var out = [], alarm1 = -1;
  // เตือน 1: เวลา evH:evM ของวันก่อนเข้าเวร
  if (useEv) {
    alarm1 = (1440 - (evH * 60 + evM)) + startMins;
    if (alarm1 > 0) out.push(alarm1);
  }
  // เตือน 2: hoursBefore ชม. ก่อนเข้าเวร — ถ้าตกช่วงนอนให้เลื่อน
  if (useHb) {
    var baseOffset = hoursBefore * 60;
    var natural = (startMins - baseOffset + 1440 * 2) % 1440;
    var naturalH = Math.floor(natural / 60);
    var inSleep = (naturalH >= SLEEP_START || naturalH < SLEEP_END);
    var alarm2;
    if (!inSleep) alarm2 = baseOffset;
    else if (startH >= SLEEP_END && startH < 11) alarm2 = startMins - SLEEP_END * 60;  // เวรเช้า → 06:00 วันเวร
    else if (startH < SLEEP_END) alarm2 = 180 + startMins;                             // เวรดึก → 21:00 คืนก่อน
    else alarm2 = baseOffset;
    if (alarm2 > 0 && alarm2 !== alarm1) out.push(alarm2);
  }
  return out;
}

// v3.49: ตั้งแจ้งเตือนให้ event — timed = ตามเวลาเวรจริง · all-day = 20:00 คืนก่อน (เตือนตามเวลาไม่ได้
//   เพราะ event ทั้งวันนับถอยหลังจากเที่ยงคืนเท่านั้น)
function _applyReminders(ev, shift, t, userSettings) {
  ev.removeAllReminders();
  if (t.allDay) { ev.addPopupReminder(ALLDAY_REMIND_MIN); return; }
  var mins = _smartReminderMins(t.start.getHours(), t.start.getMinutes(), userSettings);
  if (!mins.length) mins = [ALLDAY_REMIND_MIN];
  mins.forEach(function (m) { try { ev.addPopupReminder(m); } catch (e) {} });
}

// v3.47: clinic detection (shift มี ⚠️ หรือ range = 'ตรวจสอบ')
function _isClinicShift(shift) {
  return !!(shift && ((shift.shift && String(shift.shift).indexOf('⚠️') >= 0) ||
                      String(shift.range || '') === 'ตรวจสอบ'));
}
// v3.49: ลอกให้ตรงกับ ICS เป๊ะ (Index.html `normalizeShiftType` / `stripPrefix` ในตัวสร้าง ICS)
//   ⚠️ ถ้าแก้ format ฝั่ง ICS ต้องมาแก้ 2 ฟังก์ชันนี้ให้ตรงกันด้วย ไม่งั้นชื่อ/รายละเอียดจะเพี้ยนกัน
function _normalizeShiftType(shift) {
  var s = String(shift || '').trim();
  if (/รอบ\s*1/.test(s)) return 'รอบ 1';
  if (/รอบ\s*2/.test(s)) return 'รอบ 2';
  if (/รอบ\s*3/.test(s)) return 'รอบ 3';
  if (s.indexOf('⚠️') >= 0) return 'คลินิกพิเศษ';
  return s;   // เช้า, กลางวัน, ฯลฯ
}
function _stripPrefix(name) {
  return String(name || '').replace(/^\s*(ภก\.|ภญ\.)\s*/i, '').trim();
}
function _shiftTypeLabel(shift) {
  if (_isClinicShift(shift)) return 'คลินิกพิเศษ';
  return _normalizeShiftType(shift.shift);   // v3.49: เดิมใช้ค่าดิบ → ได้ "รอบ 3 230-830" แทน "รอบ 3"
}

// v3.47: title format = ICS ("<ตำแหน่ง> <ประเภท>", คลินิกพิเศษ สำหรับเวรคลินิก)
function _buildEventTitle(shift) {
  var parts = [];
  if (shift.pos) parts.push(String(shift.pos).trim());
  var t = _shiftTypeLabel(shift);
  if (t) parts.push(t);
  var title = parts.join(' ') || 'เวร';
  // v3.49: เวรที่รับ/แลกมา → ต่อท้าย " จาก <ชื่อ>" เหมือน ICS
  if (shift._ghost && shift._ghostPartnerName) title += ' จาก ' + _stripPrefix(shift._ghostPartnerName);
  return title;
}

// v3.47: description ลอก format จาก ICS — เภสัชกร / ตำแหน่ง / เวลา (ตัด "ประเภท:" + "ห้อง:" ออก).
//   เวรคลินิกพิเศษ: เวลาไม่แน่นอน → "โปรดตรวจสอบจากตารางเวรอีกครั้ง"
function _buildEventDescription(shift) {
  var lines = [];
  if (shift.name) lines.push('เภสัชกร: ' + _stripPrefix(shift.name));   // v3.49: ตัดคำนำหน้า ภก./ภญ. เหมือน ICS
  if (shift.pos) lines.push('ตำแหน่ง: ' + shift.pos);
  if (_isClinicShift(shift)) {
    lines.push('เวลา: โปรดตรวจสอบจากตารางเวรอีกครั้ง');
  } else if (shift.range && shift.range !== '-' && shift.range !== 'ตรวจสอบ') {
    lines.push('เวลา: ' + shift.range);
  }
  // v3.49: บรรทัดสัมปทานเวร เหมือน ICS
  if (shift._ghost) {
    if (shift._ghostType === 'swap' && shift._ghostPartnerName) {
      lines.push('แลกเวรกับ: ' + _stripPrefix(shift._ghostPartnerName) +
                 (shift._ghostSourcePos ? ' (เวรเดิม: ' + shift._ghostSourcePos + ')' : ''));
    } else if (shift._ghostType === 'add' && shift._ghostPartnerName) {
      lines.push('รับจาก: ' + _stripPrefix(shift._ghostPartnerName));
    }
  }
  return lines.join('\n');
}

function _getEventColorId(shift) {
  var s = String(shift.shift || '').toLowerCase();
  for (var key in EVENT_COLORS) {
    if (s.indexOf(key.toLowerCase()) >= 0) return EVENT_COLORS[key];
  }
  if (s.indexOf('⚠️') >= 0 || s.indexOf('คลินิก') >= 0) return EVENT_COLORS['⚠️'];
  return DEFAULT_COLOR;
}

function _fingerprint(title, start, end, description) {
  var raw = title + '|' + start.getTime() + '|' + end.getTime() + '|' + description;
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, raw);
  var hex = '';
  for (var i = 0; i < digest.length; i++) {
    var b = digest[i];
    if (b < 0) b += 256;
    var h = b.toString(16);
    hex += (h.length === 1 ? '0' : '') + h;
  }
  return hex.substring(0, 16);
}

function _shiftKey(s) {
  return (s.date || '') + '|' + (s.pos || '') + '|' + (s.name || '') + '|' + (s.range || '');
}

// ============================================================
// CALENDAR RESOLUTION
// ============================================================
function _resolveCalendar() {
  var targetId = _up().getProperty(PROP_TARGET_CAL);
  if (targetId) {
    try {
      var c = CalendarApp.getCalendarById(targetId);
      if (c) return { ok: true, cal: c, name: c.getName() };
    } catch (e) { /* fall through to default */ }
  }
  try {
    var def = CalendarApp.getDefaultCalendar();
    return { ok: true, cal: def, name: def.getName() };
  } catch (e) {
    return { ok: false, error: 'calendar_access', message: e.message };
  }
}

// ============================================================
// CORE SYNC — รับ effectiveShifts จากแอปหลัก
// ============================================================
/**
 * Sync เวรของผู้ใช้ (ที่แอปหลักคำนวณ overlay แล้วส่งเข้ามา) ลงปฏิทินของผู้ใช้เอง
 *
 * @param {Object} payload { monthValue: string, shifts: Array<shift>, reminder?: {eveningTime,hoursBefore} }
 *   shift = { date, timestamp(YYYYMMDD), range("HH:MM-HH:MM"), name, pos, shift, room }
 * @return { ok, created, updated, deleted, skipped, total, calendarName, errors[] }
 */
function syncEffectiveShifts(payload) {
  if (!payload || !payload.monthValue) return { ok: false, error: 'no_month' };
  if (!Array.isArray(payload.shifts)) return { ok: false, error: 'invalid_shifts' };

  var monthValue = String(payload.monthValue);
  var email = Session.getEffectiveUser().getEmail();
  // v3.49: ค่าตั้งค่าแจ้งเตือนของผู้ใช้ (มาจากแอปหลัก — ตัวเดียวกับที่ ICS ใช้) → ICS/GCal เตือนตรงกัน
  //   ไม่ส่งมา = null → _smartReminderMins ใช้ค่า default (18:00 วันก่อน + 5 ชม.ก่อนเข้าเวร)
  var reminderSettings = payload.reminder || null;

  // ปฏิทินปลายทาง
  var calRes = _resolveCalendar();
  if (!calRes.ok) {
    return { ok: false, error: 'calendar_access',
             message: 'ไม่สามารถเข้าถึง Google Calendar — reload แล้วอนุญาตเมื่อ Google ถาม',
             detail: calRes.message };
  }
  var cal = calRes.cal;

  // เวรปัจจุบัน (ที่ควรมีในปฏิทิน)
  var currentShifts = {};
  payload.shifts.forEach(function (s) { currentShifts[_shiftKey(s)] = s; });

  // sync map เดิม
  var existing = _getMap(monthValue);

  // diff
  var toCreate = [], toUpdate = [], toDelete = [];
  Object.keys(currentShifts).forEach(function (k) {
    if (!existing[k]) toCreate.push(k); else toUpdate.push(k);
  });
  Object.keys(existing).forEach(function (k) {
    if (!currentShifts[k]) toDelete.push(k);
  });

  var created = 0, updated = 0, deleted = 0, skipped = 0;
  var errors = [];

  // CREATE
  for (var i = 0; i < toCreate.length; i++) {
    var key = toCreate[i];
    try {
      var shift = currentShifts[key];
      var t = _shiftTimes(shift);   // v3.49: timed ตามเวลาเวรจริง (คลินิก/ไม่รู้เวลา → all-day)
      if (!t) { errors.push({ key: key, error: 'parse_failed' }); continue; }
      var title = _buildEventTitle(shift);
      var desc = _buildEventDescription(shift);
      var ev = t.allDay
        ? cal.createAllDayEvent(title, t.start, { description: desc, location: 'Siriraj Hospital' })
        : cal.createEvent(title, t.start, t.end, { description: desc, location: 'Siriraj Hospital' });
      _applyReminders(ev, shift, t, reminderSettings);
      try { ev.setColor(_getEventColorId(shift)); } catch (e) {}
      existing[key] = { eventId: ev.getId(), fingerprint: _fingerprint(title, t.start, t.end, desc) };
      created++;
    } catch (e) {
      var msg = String(e.message || '');
      if (msg.indexOf('too many') >= 0 || msg.indexOf('Rate Limit') >= 0 || msg.indexOf('Quota') >= 0) {
        _saveMap(monthValue, existing);
        return { ok: false, error: 'rate_limit',
                 message: 'Google Calendar จำกัดอัตรา — รอสักครู่แล้วลองใหม่',
                 created: created, updated: updated, deleted: deleted, skipped: skipped };
      }
      errors.push({ key: key, error: 'create_failed', message: e.message });
    }
  }

  // UPDATE (เฉพาะที่ fingerprint เปลี่ยน)
  toUpdate.forEach(function (key) {
    try {
      var shift = currentShifts[key];
      var t = _shiftTimes(shift);   // v3.49: timed ตามเวลาเวรจริง (คลินิก/ไม่รู้เวลา → all-day)
      if (!t) { errors.push({ key: key, error: 'parse_failed' }); return; }
      var title = _buildEventTitle(shift);
      var desc = _buildEventDescription(shift);
      var fp = _fingerprint(title, t.start, t.end, desc);
      if (existing[key].fingerprint === fp) { skipped++; return; }

      var ev = null;
      try { ev = cal.getEventById(existing[key].eventId); } catch (e) {}
      if (!ev) {
        var ne = t.allDay
          ? cal.createAllDayEvent(title, t.start, { description: desc, location: 'Siriraj Hospital' })
          : cal.createEvent(title, t.start, t.end, { description: desc, location: 'Siriraj Hospital' });
        _applyReminders(ne, shift, t, reminderSettings);
        try { ne.setColor(_getEventColorId(shift)); } catch (e) {}
        existing[key] = { eventId: ne.getId(), fingerprint: fp };
      } else {
        ev.setTitle(title);
        // v3.49: setTime() แปลง all-day → timed ให้เอง / setAllDayDate() แปลงกลับได้
        //   → event เก่าที่เคยเป็น all-day จะถูกย้ายมาเป็นเวลาจริง ไม่ต้องลบสร้างใหม่
        if (t.allDay) ev.setAllDayDate(t.start); else ev.setTime(t.start, t.end);
        ev.setDescription(desc);
        _applyReminders(ev, shift, t, reminderSettings);
        try { ev.setColor(_getEventColorId(shift)); } catch (e) {}
        existing[key].fingerprint = fp;
      }
      updated++;
    } catch (e) {
      errors.push({ key: key, error: 'update_failed', message: e.message });
    }
  });

  // DELETE (เวรที่หายไปจากตาราง)
  toDelete.forEach(function (key) {
    try {
      try {
        var ev = cal.getEventById(existing[key].eventId);
        if (ev) ev.deleteEvent();
      } catch (e) {}
      delete existing[key];
      deleted++;
    } catch (e) {
      errors.push({ key: key, error: 'delete_failed', message: e.message });
    }
  });

  _saveMap(monthValue, existing);

  return {
    ok: true, created: created, updated: updated, deleted: deleted, skipped: skipped,
    total: payload.shifts.length, calendarName: calRes.name, errors: errors
  };
}

// ============================================================
// STATUS
// ============================================================
function getStatus() {
  var email = Session.getEffectiveUser().getEmail();
  var calRes = _resolveCalendar();
  var count = 0, months = _allMonthMapKeys();
  months.forEach(function (k) {
    var raw = _up().getProperty(k);
    if (raw) count += Object.keys(JSON.parse(raw)).length;
  });
  return {
    ok: true,
    email: email,
    calendarName: calRes.ok ? calRes.name : null,
    syncedCount: count,
    monthCount: months.length,
    autoSyncOn: _up().getProperty(PROP_AUTO_ON) === '1',
    appName: _up().getProperty(PROP_APP_NAME) || null
  };
}

// ============================================================
// AUTO-SYNC — background trigger เก็บตกตอนผู้ใช้ปิดแอป (ไฮบริดส่วนที่ 2)
// ============================================================
/** แปลงชื่อเป็น Firebase-safe key — ต้องตรงกับ encoder ของแอปหลักที่เขียน feed */
function _encName(name) {
  return String(name || '').trim().replace(/[.$#\[\]\/\s]+/g, '_');
}

/** อ่านเวรล่าสุดของผู้ใช้จาก Firebase feed (ที่แอปหลักเขียนไว้) */
function _fetchMyFeed() {
  var appName = _up().getProperty(PROP_APP_NAME);
  if (!appName) return null;
  if (!FIREBASE_BASE || FIREBASE_BASE.indexOf('<<') === 0) return null;  // ยังไม่ตั้งค่า URL
  // encodeURIComponent สำคัญ — ชื่อไทย/อักขระพิเศษต้อง encode ไม่งั้น Firebase หา key ไม่เจอ
  var url = FIREBASE_BASE.replace(/\/+$/, '') + '/' + FEED_PATH + '/' + encodeURIComponent(_encName(appName)) + '.json';
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) return null;
  var txt = resp.getContentText();
  if (!txt || txt === 'null') return null;
  return JSON.parse(txt);  // { <monthValue>: { shifts:[...], updatedAt } }
}

/** ตัว trigger — ทำงานเองในนามผู้ใช้ทุก ๆ ไม่กี่นาที (แม้ผู้ใช้ปิดแอป) */
function _autoSyncTick() {
  try {
    var feed = _fetchMyFeed();
    if (!feed) return;
    Object.keys(feed).forEach(function (monthValue) {
      var m = feed[monthValue];
      if (m && Array.isArray(m.shifts)) {
        syncEffectiveShifts({ monthValue: monthValue, shifts: m.shifts, reminder: m.reminder });
      }
    });
  } catch (e) {
    console.error('[autoSync] ' + (e && e.message ? e.message : e));
  }
}

/** เปิด auto-sync: จำชื่อแอปหลัก + ติดตั้ง time trigger (1 ตัว/ผู้ใช้) */
function installAutoSync(appName, intervalMin) {
  if (appName) _up().setProperty(PROP_APP_NAME, String(appName).trim());
  removeAutoSync();  // กันซ้ำ — เหลือ trigger เดียว
  var mins = intervalMin || AUTO_SYNC_INTERVAL_MIN;
  ScriptApp.newTrigger('_autoSyncTick').timeBased().everyMinutes(mins).create();
  _up().setProperty(PROP_AUTO_ON, '1');
  return { ok: true, intervalMin: mins, appName: _up().getProperty(PROP_APP_NAME) || null };
}

/** ปิด auto-sync: ลบ time trigger ทั้งหมดของ handler นี้ */
function removeAutoSync() {
  var trigs = ScriptApp.getProjectTriggers();
  var n = 0;
  trigs.forEach(function (t) {
    if (t.getHandlerFunction() === '_autoSyncTick') { ScriptApp.deleteTrigger(t); n++; }
  });
  _up().deleteProperty(PROP_AUTO_ON);
  return { ok: true, removed: n };
}

/** ทดสอบ trigger ด้วยมือ (รันในเว็บ editor) — ต้องตั้ง FIREBASE_BASE + มี feed แล้ว */
function autoSyncTickManual() {
  _autoSyncTick();
  return getStatus();
}

/**
 * ดึงเวรของผู้ใช้จาก Firebase feed (ที่แอปหลักฝากไว้) แล้วซิงค์ — ใช้แทน postMessage
 * (public — google.script.run เรียกได้; on-demand + ตอนเปิด popup จากแอปหลัก)
 * @param {string} [appNameOpt] ถ้าส่งมา จะตั้งเป็นชื่อผู้ใช้ก่อนดึง
 */
function pullAndSyncFromFeed(appNameOpt) {
  if (appNameOpt) _up().setProperty(PROP_APP_NAME, String(appNameOpt).trim());
  var feed = _fetchMyFeed();
  if (!feed) {
    return { ok: true, note: 'no_feed', created: 0, updated: 0, deleted: 0, months: 0 };
  }
  var tot = { created: 0, updated: 0, deleted: 0, months: 0 };
  Object.keys(feed).forEach(function (mv) {
    var m = feed[mv];
    if (m && Array.isArray(m.shifts)) {
      var r = syncEffectiveShifts({ monthValue: mv, shifts: m.shifts, reminder: m.reminder });
      if (r && r.ok) { tot.created += r.created || 0; tot.updated += r.updated || 0; tot.deleted += r.deleted || 0; tot.months++; }
    }
  });
  var calRes = _resolveCalendar();
  return { ok: true, created: tot.created, updated: tot.updated, deleted: tot.deleted, months: tot.months, calendarName: calRes.ok ? calRes.name : null };
}

// ============================================================
// ถอนสิทธิ์ / ยกเลิกการเชื่อมต่อ (REVOKE)
// ============================================================
/**
 * ลบ event ที่แอปสร้างไว้ "เฉพาะเดือนเดียว" + ล้าง map ของเดือนนั้น
 */
function unsyncMonth(monthValue) {
  var calRes = _resolveCalendar();
  if (!calRes.ok) return { ok: false, error: 'calendar_access' };
  var map = _getMap(String(monthValue));
  var removed = 0;
  Object.keys(map).forEach(function (k) {
    try {
      var ev = calRes.cal.getEventById(map[k].eventId);
      if (ev) ev.deleteEvent();
    } catch (e) {}
    removed++;
  });
  _up().deleteProperty(PROP_MAP_PREFIX + String(monthValue));
  return { ok: true, removed: removed };
}

/**
 * ลบ event ที่แอปสร้างไว้ "ทุกเดือน" ออกจากปฏิทิน "ปัจจุบัน" + ล้าง map ทั้งหมด
 * (ใช้ร่วมกันโดย disconnectAndRevoke และ setTargetCalendar — ไม่แตะ auth/trigger/appName)
 */
function _unsyncAllEvents() {
  var calRes = _resolveCalendar();
  var removed = 0;
  var monthKeys = _allMonthMapKeys();
  if (calRes.ok) {
    monthKeys.forEach(function (mk) {
      var raw = _up().getProperty(mk);
      if (!raw) return;
      var map = JSON.parse(raw);
      Object.keys(map).forEach(function (k) {
        try {
          var ev = calRes.cal.getEventById(map[k].eventId);
          if (ev) ev.deleteEvent();
        } catch (e) {}
        removed++;
      });
    });
  }
  monthKeys.forEach(function (mk) { _up().deleteProperty(mk); });
  return { removed: removed, calendarReachable: calRes.ok };
}

/**
 * ล้าง event เวรทั้งหมดที่แอปสร้างไว้ (ทุกเดือน) ออกจากปฏิทินปลายทาง + ล้าง map
 * แต่ "ไม่ถอนสิทธิ์" (ยังเชื่อมต่ออยู่ ซิงค์ใหม่ได้ทันที) — เหมาะกับการเทสซ้ำ
 * (ต้องเป็น public function ไม่ขึ้นต้น _ เพื่อให้ google.script.run เรียกได้)
 */
function clearAllSyncedEvents() {
  var r = _unsyncAllEvents();
  return { ok: true, removed: r.removed, calendarReachable: r.calendarReachable };
}

/**
 * ยกเลิกการเชื่อมต่อทั้งหมด — ทำ 4 อย่าง:
 *   1. หยุด auto-sync trigger (ไม่งั้นมันจะรันต่อแล้วสร้าง event กลับมา)
 *   2. ลบ event เวรที่แอปสร้างไว้ "ทุกเดือน" ออกจากปฏิทินผู้ใช้ (ไม่ทิ้งขยะค้าง)
 *   3. ล้างข้อมูล property ทั้งหมดใน UserProperties
 *   4. เพิกถอน OAuth grant ของสคริปต์นี้ (invalidateAuth) → ครั้งหน้าจะถามยินยอมใหม่
 *
 * หมายเหตุ: นี่คือการถอนสิทธิ์ "ฝั่งแอป" — ผู้ใช้ยังถอนเพิ่มได้เองที่
 * https://myaccount.google.com/permissions (ดู README §วิธีถอนสิทธิ์)
 */
function disconnectAndRevoke() {
  // 1) หยุด trigger ก่อน
  var trigRemoved = 0;
  try { trigRemoved = removeAutoSync().removed; } catch (e) {}

  // 2) ลบ event + ล้าง map
  var cleaned = _unsyncAllEvents();

  // 3) ล้าง property ที่เหลือ (targetCalendarId, appName, autoSyncOn)
  _up().deleteAllProperties();

  // 4) เพิกถอนสิทธิ์
  var authRevoked = true;
  try { ScriptApp.invalidateAuth(); } catch (e) { authRevoked = false; }

  return {
    ok: true,
    removed: cleaned.removed,
    triggersRemoved: trigRemoved,
    authRevoked: authRevoked,
    calendarReachable: cleaned.calendarReachable,
    note: cleaned.calendarReachable ? null : 'เข้าถึงปฏิทินไม่ได้ตอนถอนสิทธิ์ — event บางส่วนอาจค้าง ให้ลบเองในปฏิทิน'
  };
}

// ============================================================
// CALENDAR PICKER (ทางเลือก — ให้ผู้ใช้เลือกปฏิทินปลายทางเอง)
// ============================================================
function listMyCalendars() {
  try {
    var myEmail = Session.getEffectiveUser().getEmail();
    var cals = CalendarApp.getAllCalendars();
    var result = [];
    cals.forEach(function (c) {
      try {
        var owned = (typeof c.isOwnedByMe === 'function') ? c.isOwnedByMe() : false;
        var id = c.getId();
        var isPrimary = (id === myEmail);
        if (!owned && !isPrimary) return;
        result.push({ id: id, name: c.getName(), isPrimary: isPrimary, isOwned: owned });
      } catch (e) {}
    });
    result.sort(function (a, b) {
      if (a.isPrimary) return -1;
      if (b.isPrimary) return 1;
      return a.name.localeCompare(b.name, 'th');
    });
    var currentTarget = _up().getProperty(PROP_TARGET_CAL) || null;
    return { ok: true, calendars: result, currentUser: myEmail, currentTarget: currentTarget };
  } catch (e) {
    return { ok: false, error: 'list_failed', message: e.message };
  }
}

function createAppCalendar() {
  try {
    var cal = CalendarApp.createCalendar('Siriraj Rx Shifts', {
      summary: 'เวรเภสัชกร Siriraj Hospital — auto-synced',
      color: CalendarApp.Color.PALE_BLUE
    });
    try { cal.setTimeZone(CAL_TZ); } catch (e) {}
    return { ok: true, id: cal.getId(), name: cal.getName() };
  } catch (e) {
    return { ok: false, error: 'create_failed', message: e.message };
  }
}

function getTargetCalendar() {
  return { ok: true, calendarId: _up().getProperty(PROP_TARGET_CAL) || null };
}

function setTargetCalendar(calendarId) {
  // ลบ event เดิมจากปฏิทิน "เดิม" + ล้าง map ก่อน กันซ้ำ (พอเปลี่ยนปฏิทินแล้วซิงค์ใหม่จะลงที่ใหม่สะอาด)
  var cleaned = _unsyncAllEvents();
  if (calendarId) _up().setProperty(PROP_TARGET_CAL, String(calendarId));
  else _up().deleteProperty(PROP_TARGET_CAL);  // ล้าง = กลับไปใช้ปฏิทินหลัก
  return { ok: true, calendarId: calendarId || null, movedOff: cleaned.removed };
}
