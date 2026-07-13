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
var ALARM_OFFSETS_MIN = [60, 18 * 60];  // เตือน 1 ชม.ก่อน + 18 ชม.ก่อน (กันลืมข้ามวัน)

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

// ============================================================
// WEB ENTRY
// ============================================================
function doGet() {
  return HtmlService.createHtmlOutputFromFile('connect')
    .setTitle('เชื่อมต่อ Google Calendar — Siriraj Rx Shift')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** ตัวตนของผู้ใช้ที่กำลังรัน (มาจาก scope userinfo.email) */
function whoAmI() {
  return { ok: true, email: Session.getEffectiveUser().getEmail() };
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

function _isQuietHour(date) {
  var h = date.getHours();
  return h >= QUIET_START_HOUR || h < QUIET_END_HOUR;
}

function _buildReminderMinutes(shiftStart) {
  var out = [];
  ALARM_OFFSETS_MIN.forEach(function (offMin) {
    var alarmAt = new Date(shiftStart.getTime() - offMin * 60 * 1000);
    if (!_isQuietHour(alarmAt)) out.push(offMin);
  });
  if (out.length === 0) {
    [30, 15].forEach(function (m) {
      var alarmAt = new Date(shiftStart.getTime() - m * 60 * 1000);
      if (!_isQuietHour(alarmAt)) out.push(m);
    });
  }
  return out;
}

function _buildEventTitle(shift) {
  var parts = [];
  if (shift.shift) parts.push(String(shift.shift).trim());
  if (shift.pos) parts.push(String(shift.pos).trim());
  return parts.join(' ') || 'เวร';
}

function _buildEventDescription(shift) {
  var lines = [];
  if (shift.name) lines.push('เภสัชกร: ' + shift.name);
  if (shift.shift) lines.push('ประเภท: ' + shift.shift);
  if (shift.pos) lines.push('ตำแหน่ง: ' + shift.pos);
  if (shift.range) lines.push('เวลา: ' + shift.range);
  if (shift.room) lines.push('ห้อง: ' + shift.room);
  lines.push('');
  lines.push('— Siriraj Rx Shift —');
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
 * @param {Object} payload { monthValue: string, shifts: Array<shift> }
 *   shift = { date, timestamp(YYYYMMDD), range("HH:MM-HH:MM"), name, pos, shift, room }
 * @return { ok, created, updated, deleted, skipped, total, calendarName, errors[] }
 */
function syncEffectiveShifts(payload) {
  if (!payload || !payload.monthValue) return { ok: false, error: 'no_month' };
  if (!Array.isArray(payload.shifts)) return { ok: false, error: 'invalid_shifts' };

  var monthValue = String(payload.monthValue);
  var email = Session.getEffectiveUser().getEmail();

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
      var dt = _parseShiftDateTime(shift);
      if (!dt) { errors.push({ key: key, error: 'parse_failed' }); continue; }
      var title = _buildEventTitle(shift);
      var desc = _buildEventDescription(shift);
      var ev = cal.createEvent(title, dt.start, dt.end, { description: desc, location: 'Siriraj Hospital' });
      ev.removeAllReminders();
      _buildReminderMinutes(dt.start).forEach(function (m) { ev.addPopupReminder(m); });
      try { ev.setColor(_getEventColorId(shift)); } catch (e) {}
      existing[key] = { eventId: ev.getId(), fingerprint: _fingerprint(title, dt.start, dt.end, desc) };
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
      var dt = _parseShiftDateTime(shift);
      if (!dt) { errors.push({ key: key, error: 'parse_failed' }); return; }
      var title = _buildEventTitle(shift);
      var desc = _buildEventDescription(shift);
      var fp = _fingerprint(title, dt.start, dt.end, desc);
      if (existing[key].fingerprint === fp) { skipped++; return; }

      var ev = null;
      try { ev = cal.getEventById(existing[key].eventId); } catch (e) {}
      if (!ev) {
        var ne = cal.createEvent(title, dt.start, dt.end, { description: desc, location: 'Siriraj Hospital' });
        ne.removeAllReminders();
        _buildReminderMinutes(dt.start).forEach(function (m) { ne.addPopupReminder(m); });
        try { ne.setColor(_getEventColorId(shift)); } catch (e) {}
        existing[key] = { eventId: ne.getId(), fingerprint: fp };
      } else {
        ev.setTitle(title);
        ev.setTime(dt.start, dt.end);
        ev.setDescription(desc);
        ev.removeAllReminders();
        _buildReminderMinutes(dt.start).forEach(function (m) { ev.addPopupReminder(m); });
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
    monthCount: months.length
  };
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
 * ยกเลิกการเชื่อมต่อทั้งหมด — ทำ 3 อย่าง:
 *   1. ลบ event เวรที่แอปสร้างไว้ "ทุกเดือน" ออกจากปฏิทินผู้ใช้ (ไม่ทิ้งขยะค้าง)
 *   2. ล้างข้อมูล mapping ทั้งหมดใน UserProperties
 *   3. เพิกถอน OAuth grant ของสคริปต์นี้ (invalidateAuth) → ครั้งหน้าจะถามยินยอมใหม่
 *
 * หมายเหตุ: นี่คือการถอนสิทธิ์ "ฝั่งแอป" — ผู้ใช้ยังถอนเพิ่มได้เองที่
 * https://myaccount.google.com/permissions (ดู README §วิธีถอนสิทธิ์)
 */
function disconnectAndRevoke() {
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

  // ล้าง property ทั้งหมด (รวม targetCalendarId)
  _up().deleteAllProperties();

  // เพิกถอนสิทธิ์ — ครั้งหน้าผู้ใช้จะเจอหน้า consent ใหม่
  var authRevoked = true;
  try { ScriptApp.invalidateAuth(); } catch (e) { authRevoked = false; }

  return {
    ok: true,
    removed: removed,
    authRevoked: authRevoked,
    calendarReachable: calRes.ok,
    note: calRes.ok ? null : 'เข้าถึงปฏิทินไม่ได้ตอนถอนสิทธิ์ — event บางส่วนอาจค้าง ให้ลบเองในปฏิทิน'
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
  if (calendarId) _up().setProperty(PROP_TARGET_CAL, String(calendarId));
  else _up().deleteProperty(PROP_TARGET_CAL);  // ล้าง = กลับไปใช้ปฏิทินหลัก
  return { ok: true, calendarId: calendarId || null };
}
