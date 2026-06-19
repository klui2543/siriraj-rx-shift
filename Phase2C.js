/**
 * Phase 2C — Google Calendar API Integration
 * ============================================
 *
 * Pushes user shifts to their Google Calendar with Smart VALARM (alarms
 * with quiet hours 22:00–06:00 — no alarms during sleep time).
 *
 * Deployment requirement:
 *   Web App must be deployed "Execute as: User accessing the web app"
 *   so that CalendarApp.getDefaultCalendar() returns the user's own calendar.
 *
 * Required OAuth scopes (auto-detected by Apps Script on first CalendarApp call):
 *   https://www.googleapis.com/auth/calendar
 *
 * Sheet Schema (in Data_Log spreadsheet):
 *   Tab: User_Calendar_Sync
 *   ┌───────┬──────────┬───────────┬──────────┬─────────────┬──────────────┬────────┐
 *   │ email │ month_id │ shift_key │ event_id │ fingerprint │ last_synced  │ status │
 *   └───────┴──────────┴───────────┴──────────┴─────────────┴──────────────┴────────┘
 *   - fingerprint = hash of (title, start, end, description) to skip unchanged updates
 *   - status = 'active' or 'deleted'
 */

const P2C_DATA_LOG_ID = '1V1Fo4rEadSYfqLDc1sZEE-fRtZ4Je5_30_EAclO3KHM';
const P2C_SYNC_TAB = 'User_Calendar_Sync';
const P2C_QUIET_START_HOUR = 22;  // 10 PM
const P2C_QUIET_END_HOUR = 6;     // 6 AM
const P2C_ALARM_OFFSETS_MIN = [60, 18 * 60];  // 1h before + 18h before (for next-day notice)
const P2C_EVENT_COLORS = {
  'เวรกลางวัน': 2,    // sage (green-ish in Google Cal)
  'เวรเช้า': 2,
  'เวรรอบ 1': 9,      // blueberry
  'เวรรอบ1': 9,
  'เวรรอบ 2': 5,      // banana (yellow)
  'เวรรอบ2': 5,
  'เวรรอบ 3': 11,     // tomato (red)
  'เวรรอบ3': 11,
  '⚠️': 3              // grape (purple) — for special clinic
};
const P2C_DEFAULT_COLOR = 8;  // graphite (gray)

// ============================================================
// SHEET ACCESSOR
// ============================================================

function _p2c_getSyncSheet() {
  const ss = SpreadsheetApp.openById(P2C_DATA_LOG_ID);
  let sh = ss.getSheetByName(P2C_SYNC_TAB);
  if (!sh) {
    sh = ss.insertSheet(P2C_SYNC_TAB);
    const headers = ['email', 'month_id', 'shift_key', 'event_id', 'fingerprint', 'last_synced', 'status'];
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#1e40af')
      .setFontColor('white')
      .setFontFamily('Kanit');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 220);
    sh.setColumnWidth(2, 170);
    sh.setColumnWidth(3, 280);
    sh.setColumnWidth(4, 240);
    sh.setColumnWidth(5, 140);
    sh.setColumnWidth(6, 170);
    sh.setColumnWidth(7, 80);
  }
  return sh;
}

// ============================================================
// SHIFT → CALENDAR EVENT
// ============================================================

/**
 * Parse shift's date+range into start/end Date objects.
 *
 * @param {Object} shift  has timestamp (YYYYMMDD int) and range ("HH:MM-HH:MM")
 * @return { start, end } or null if invalid
 */
function _p2c_parseShiftDateTime(shift) {
  if (!shift || !shift.timestamp || !shift.range) return null;
  const ts = String(shift.timestamp);
  if (ts.length !== 8) return null;
  const year = parseInt(ts.substring(0, 4), 10);
  const month = parseInt(ts.substring(4, 6), 10) - 1;  // 0-indexed
  const day = parseInt(ts.substring(6, 8), 10);

  const parts = String(shift.range).split('-');
  if (parts.length !== 2) return null;
  const [startStr, endStr] = parts;
  const sm = startStr.trim().split(':');
  const em = endStr.trim().split(':');
  if (sm.length !== 2 || em.length !== 2) return null;

  const startH = parseInt(sm[0], 10), startM = parseInt(sm[1], 10);
  const endH = parseInt(em[0], 10), endM = parseInt(em[1], 10);
  if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) return null;

  const start = new Date(year, month, day, startH, startM, 0);
  let end = new Date(year, month, day, endH, endM, 0);
  // Handle overnight shifts (end-time appears earlier than start-time)
  if (end <= start) {
    end = new Date(year, month, day + 1, endH, endM, 0);
  }
  return { start: start, end: end };
}

/**
 * Decide whether a Date is within quiet hours (22:00 to 06:00).
 */
function _p2c_isQuietHour(date) {
  const h = date.getHours();
  return h >= P2C_QUIET_START_HOUR || h < P2C_QUIET_END_HOUR;
}

/**
 * Build the list of reminder minutes-before for a given shift start time.
 * Drops any reminder that would fire during quiet hours.
 */
function _p2c_buildReminderMinutes(shiftStart) {
  const out = [];
  P2C_ALARM_OFFSETS_MIN.forEach(function(offMin) {
    const alarmAt = new Date(shiftStart.getTime() - offMin * 60 * 1000);
    if (!_p2c_isQuietHour(alarmAt)) out.push(offMin);
  });
  // Always have at least one — fallback to first non-quiet hour before shift
  if (out.length === 0) {
    // Try shorter offsets: 30 min, 15 min
    [30, 15].forEach(function(m) {
      const alarmAt = new Date(shiftStart.getTime() - m * 60 * 1000);
      if (!_p2c_isQuietHour(alarmAt)) out.push(m);
    });
  }
  return out;
}

function _p2c_buildEventTitle(shift) {
  const parts = [];
  if (shift.shift) parts.push(String(shift.shift).trim());
  if (shift.pos) parts.push(String(shift.pos).trim());
  return parts.join(' ') || 'เวร';
}

function _p2c_buildEventDescription(shift, monthValue) {
  const lines = [];
  if (shift.name) lines.push('เภสัชกร: ' + shift.name);
  if (shift.shift) lines.push('ประเภท: ' + shift.shift);
  if (shift.pos) lines.push('ตำแหน่ง: ' + shift.pos);
  if (shift.range) lines.push('เวลา: ' + shift.range);
  if (shift.room) lines.push('ห้อง: ' + shift.room);
  lines.push('');
  lines.push('— Siriraj Rx Shift —');
  return lines.join('\n');
}

function _p2c_getEventColorId(shift) {
  const s = String(shift.shift || '').toLowerCase();
  for (const key in P2C_EVENT_COLORS) {
    if (s.indexOf(key.toLowerCase()) >= 0) return P2C_EVENT_COLORS[key];
  }
  if (s.indexOf('⚠️') >= 0 || s.indexOf('คลินิก') >= 0) return P2C_EVENT_COLORS['⚠️'];
  return P2C_DEFAULT_COLOR;
}

function _p2c_fingerprint(title, start, end, description) {
  const raw = title + '|' + start.getTime() + '|' + end.getTime() + '|' + description;
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, raw);
  let hex = '';
  for (let i = 0; i < digest.length; i++) {
    let b = digest[i];
    if (b < 0) b += 256;
    const h = b.toString(16);
    hex += (h.length === 1 ? '0' : '') + h;
  }
  return hex.substring(0, 16);  // first 16 chars is plenty
}

// ============================================================
// SYNC MAP CRUD
// ============================================================

function _p2c_getSyncMapForUser(email, monthId) {
  const sh = _p2c_getSyncSheet();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return {};
  const data = sh.getRange(2, 1, lastRow - 1, 7).getValues();
  const map = {};
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === email && data[i][1] === monthId && data[i][6] !== 'deleted') {
      map[data[i][2]] = {
        rowNum: i + 2,
        eventId: data[i][3],
        fingerprint: data[i][4],
        lastSynced: data[i][5]
      };
    }
  }
  return map;
}

function _p2c_appendSyncRow(email, monthId, shiftKey, eventId, fingerprint) {
  const sh = _p2c_getSyncSheet();
  sh.appendRow([email, monthId, shiftKey, eventId, fingerprint, new Date(), 'active']);
}

function _p2c_updateSyncRow(rowNum, eventId, fingerprint) {
  const sh = _p2c_getSyncSheet();
  sh.getRange(rowNum, 4, 1, 3).setValues([[eventId, fingerprint, new Date()]]);
}

function _p2c_markSyncDeleted(rowNum) {
  const sh = _p2c_getSyncSheet();
  sh.getRange(rowNum, 7).setValue('deleted');
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Get sync status for a user/month.
 */
function getCalendarSyncStatus(email, monthId) {
  const v = _p2b_validateEmail(email);
  if (!v.ok) return v;
  try {
    const map = _p2c_getSyncMapForUser(email, monthId || '');
    const count = Object.keys(map).length;
    let lastSynced = null;
    Object.keys(map).forEach(function(key) {
      const ls = map[key].lastSynced;
      if (ls && (!lastSynced || new Date(ls) > new Date(lastSynced))) lastSynced = ls;
    });
    return {
      ok: true,
      syncedCount: count,
      lastSynced: lastSynced ? (lastSynced instanceof Date ? lastSynced.toISOString() : String(lastSynced)) : null
    };
  } catch (e) {
    return { ok: false, error: 'read_failed', message: e.message };
  }
}

/**
 * Sync the bound user's shifts for a given month into their Google Calendar.
 *
 * Workflow:
 *   1. Read shifts for user+month
 *   2. Compute diff vs existing sync map: { toCreate, toUpdate, toDelete }
 *   3. Apply changes via CalendarApp
 *   4. Update sync map
 *
 * @return { ok, created, updated, deleted, skipped, errors[], calendarName }
 */
function syncShiftsToCalendar(email, monthValue) {
  const v = _p2b_validateEmail(email);
  if (!v.ok) return v;
  if (!monthValue) return { ok: false, error: 'no_month' };

  // 1. Determine user's bound name
  const binding = getUserBinding(email);
  if (!binding.ok) return binding;
  if (!binding.boundName) {
    return { ok: false, error: 'not_bound', message: 'กรุณาผูกชื่อก่อนซิงค์ปฏิทิน' };
  }
  const boundName = binding.boundName;

  // 2. Fetch schedule
  const sched = getScheduleData(monthValue);
  if (!sched || sched.error || !sched.data) {
    return { ok: false, error: 'no_schedule', message: (sched && sched.error) || 'ไม่พบข้อมูลเดือนนี้' };
  }

  // 3. Filter to user's own shifts
  const ownShifts = sched.data.filter(function(s) { return s.name === boundName; });
  if (ownShifts.length === 0) {
    return { ok: true, created: 0, updated: 0, deleted: 0, skipped: 0, total: 0, message: 'ไม่มีเวรในเดือนนี้' };
  }

  // monthId format consistent with frontend getCurrentMonthId()
  // We don't know the label here, so use monthValue as monthId (good enough as a unique key)
  const monthId = 'm_' + String(monthValue);

  // 4. Build shift key map from current data
  const currentShifts = {};  // shift_key → shift object
  ownShifts.forEach(function(s) {
    const key = (s.date || '') + '|' + (s.pos || '') + '|' + (s.name || '') + '|' + (s.range || '');
    currentShifts[key] = s;
  });

  // 5. Get existing sync map
  const existing = _p2c_getSyncMapForUser(email, monthId);

  // 6. Compute diff
  const toCreate = [];
  const toUpdate = [];
  const toDelete = [];
  const toSkip = [];

  Object.keys(currentShifts).forEach(function(key) {
    if (!existing[key]) toCreate.push(key);
    else toUpdate.push(key);  // will check fingerprint later
  });
  Object.keys(existing).forEach(function(key) {
    if (!currentShifts[key]) toDelete.push(key);
  });

  // 7. Get user's calendar — v32: use configured target if set
  const calRes = _p2c_resolveCalendar(email);
  if (!calRes.ok) {
    return {
      ok: false,
      error: 'calendar_access',
      message: 'ไม่สามารถเข้าถึง Google Calendar — กรุณา reload และอนุญาตเมื่อ Google ถาม',
      detail: calRes.message
    };
  }
  const cal = calRes.cal;
  const calendarName = cal.getName();

  // 8. Apply changes
  let created = 0, updated = 0, deleted = 0, skipped = 0;
  const errors = [];

  // CREATE
  toCreate.forEach(function(key) {
    try {
      const shift = currentShifts[key];
      const dt = _p2c_parseShiftDateTime(shift);
      if (!dt) {
        errors.push({ key: key, error: 'parse_failed' });
        return;
      }
      const title = _p2c_buildEventTitle(shift);
      const description = _p2c_buildEventDescription(shift, monthValue);
      const event = cal.createEvent(title, dt.start, dt.end, {
        description: description,
        location: 'Siriraj Hospital'
      });
      // Reminders
      event.removeAllReminders();
      const reminders = _p2c_buildReminderMinutes(dt.start);
      reminders.forEach(function(min) { event.addPopupReminder(min); });
      // Color
      try { event.setColor(_p2c_getEventColorId(shift)); } catch (e) {}

      const eventId = event.getId();
      const fp = _p2c_fingerprint(title, dt.start, dt.end, description);
      _p2c_appendSyncRow(email, monthId, key, eventId, fp);
      created++;
    } catch (e) {
      errors.push({ key: key, error: 'create_failed', message: e.message });
    }
  });

  // UPDATE (only if fingerprint changed)
  toUpdate.forEach(function(key) {
    try {
      const shift = currentShifts[key];
      const dt = _p2c_parseShiftDateTime(shift);
      if (!dt) {
        errors.push({ key: key, error: 'parse_failed' });
        return;
      }
      const title = _p2c_buildEventTitle(shift);
      const description = _p2c_buildEventDescription(shift, monthValue);
      const fp = _p2c_fingerprint(title, dt.start, dt.end, description);

      if (existing[key].fingerprint === fp) {
        skipped++;
        return;
      }

      // Need to update — fetch the event by ID
      const eventId = existing[key].eventId;
      let ev = null;
      try { ev = cal.getEventById(eventId); } catch (e) {}
      if (!ev) {
        // Event was deleted manually — recreate
        const newEvent = cal.createEvent(title, dt.start, dt.end, {
          description: description, location: 'Siriraj Hospital'
        });
        newEvent.removeAllReminders();
        _p2c_buildReminderMinutes(dt.start).forEach(function(m) { newEvent.addPopupReminder(m); });
        try { newEvent.setColor(_p2c_getEventColorId(shift)); } catch (e) {}
        _p2c_updateSyncRow(existing[key].rowNum, newEvent.getId(), fp);
        updated++;
      } else {
        ev.setTitle(title);
        ev.setTime(dt.start, dt.end);
        ev.setDescription(description);
        ev.removeAllReminders();
        _p2c_buildReminderMinutes(dt.start).forEach(function(m) { ev.addPopupReminder(m); });
        try { ev.setColor(_p2c_getEventColorId(shift)); } catch (e) {}
        _p2c_updateSyncRow(existing[key].rowNum, eventId, fp);
        updated++;
      }
    } catch (e) {
      errors.push({ key: key, error: 'update_failed', message: e.message });
    }
  });

  // DELETE (shifts removed from schedule)
  toDelete.forEach(function(key) {
    try {
      const eventId = existing[key].eventId;
      try {
        const ev = cal.getEventById(eventId);
        if (ev) ev.deleteEvent();
      } catch (e) { /* event might already be gone */ }
      _p2c_markSyncDeleted(existing[key].rowNum);
      deleted++;
    } catch (e) {
      errors.push({ key: key, error: 'delete_failed', message: e.message });
    }
  });

  return {
    ok: true,
    created: created,
    updated: updated,
    deleted: deleted,
    skipped: skipped,
    total: ownShifts.length,
    calendarName: calendarName,
    errors: errors
  };
}

/**
 * Remove ALL synced events for the user (un-sync).
 *
 * @param {string} email
 * @param {string} [monthId]  if provided, only that month; otherwise all months
 */
function unsyncCalendarForUser(email, monthId) {
  const v = _p2b_validateEmail(email);
  if (!v.ok) return v;
  try {
    const sh = _p2c_getSyncSheet();
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return { ok: true, removed: 0 };
    const data = sh.getRange(2, 1, lastRow - 1, 7).getValues();

    const calRes = _p2c_resolveCalendar(email);
    if (!calRes.ok) {
      return { ok: false, error: 'calendar_access', message: 'ไม่สามารถเข้าถึง Calendar' };
    }
    const cal = calRes.cal;

    let removed = 0;
    for (let i = 0; i < data.length; i++) {
      if (data[i][0] === email && data[i][6] !== 'deleted') {
        if (monthId && data[i][1] !== monthId) continue;
        const eventId = data[i][3];
        try {
          const ev = cal.getEventById(eventId);
          if (ev) ev.deleteEvent();
        } catch (e) {}
        sh.getRange(i + 2, 7).setValue('deleted');
        removed++;
      }
    }
    return { ok: true, removed: removed };
  } catch (e) {
    return { ok: false, error: 'unsync_failed', message: e.message };
  }
}

// ============================================================
// INIT + HEALTH CHECK
// ============================================================

function initPhase2CSheets() {
  _p2c_getSyncSheet();
  const result = {
    ok: true,
    message: 'Phase 2C tab ready: User_Calendar_Sync',
    dataLogSheet: 'https://docs.google.com/spreadsheets/d/' + P2C_DATA_LOG_ID
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function p2cHealthCheck() {
  const result = {
    syncTab: false,
    calendarAccess: false,
    quietHoursActive: false,
    errors: []
  };
  try { _p2c_getSyncSheet(); result.syncTab = true; }
  catch (e) { result.errors.push('sync_tab: ' + e.message); }
  try {
    const cal = CalendarApp.getDefaultCalendar();
    if (cal) {
      result.calendarAccess = true;
      result.defaultCalendarName = cal.getName();
    }
  } catch (e) {
    result.errors.push('calendar: ' + e.message + ' (run from frontend with logged-in user to test properly)');
  }
  result.quietHoursActive = _p2c_isQuietHour(new Date());
  Logger.log('=== p2cHealthCheck ===');
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/**
 * Debug: see what reminders would be set for sample shift times.
 */
function p2cDebugReminders() {
  const testTimes = [
    [8, 30],   // morning
    [16, 30],  // afternoon
    [21, 30],  // evening
    [2, 30]    // overnight start
  ];
  const today = new Date();
  testTimes.forEach(function(t) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate(), t[0], t[1], 0);
    const reminders = _p2c_buildReminderMinutes(d);
    const alarmTimes = reminders.map(function(m) {
      const at = new Date(d.getTime() - m * 60000);
      return at.getHours() + ':' + (at.getMinutes() < 10 ? '0' : '') + at.getMinutes();
    });
    Logger.log('Shift ' + t[0] + ':' + (t[1] < 10 ? '0' : '') + t[1] + ' → reminders: ' + JSON.stringify(reminders) + ' min before → fires at: ' + JSON.stringify(alarmTimes));
  });
}

// ============================================================
// PHASE 2C.2 — OVERLAY-AWARE SYNC + URGENT EMAIL + BULK SYNC
// ============================================================
const P2C_URGENT_THRESHOLD_HOURS = 12;

/**
 * Sync calendar based on a pre-computed effective shift list (from frontend).
 * The frontend applies overlays and passes the actual shifts the user should
 * have in their calendar.
 *
 * @param {string} email
 * @param {string} monthValue   sheet value (for storage key)
 * @param {string} monthId      app monthId (informational only)
 * @param {Array} effectiveShifts  array of shift objects (post-overlay)
 */
function syncEffectiveShiftsToCalendar(email, monthValue, monthId, effectiveShifts) {
  const v = _p2b_validateEmail(email);
  if (!v.ok) return v;
  if (!monthValue) return { ok: false, error: 'no_month' };
  if (!Array.isArray(effectiveShifts)) {
    return { ok: false, error: 'invalid_shifts', message: 'effectiveShifts ต้องเป็น array' };
  }

  // v31: refuse if script is running as a different account than the one the user thinks
  try {
    const effective = Session.getEffectiveUser().getEmail();
    if (effective && effective !== email) {
      return {
        ok: false,
        error: 'account_mismatch',
        message: 'Account ไม่ตรง: คุณต้องการ sync ลง ' + email +
                 ' แต่ Google Calendar จะ sync ไปที่ ' + effective +
                 ' — เปลี่ยน account ก่อน',
        expected: email,
        actual: effective
      };
    }
  } catch (e) {
    console.warn('[P2C] could not verify effectiveUser:', e.message);
  }

  // Determine binding for safety check
  const binding = getUserBinding(email);
  if (!binding.ok) return binding;
  if (!binding.boundName) {
    return { ok: false, error: 'not_bound', message: 'กรุณาผูกชื่อก่อนซิงค์ปฏิทิน' };
  }

  // Use a stable storage key based on monthValue (matches existing syncShiftsToCalendar)
  const storageKey = 'm_' + String(monthValue);

  // Build map of current effective shifts
  const currentShifts = {};
  effectiveShifts.forEach(function(s) {
    const key = (s.date || '') + '|' + (s.pos || '') + '|' + (s.name || '') + '|' + (s.range || '');
    currentShifts[key] = s;
  });

  // Get existing sync map
  const existing = _p2c_getSyncMapForUser(email, storageKey);

  // Diff
  const toCreate = [];
  const toUpdate = [];
  const toDelete = [];

  Object.keys(currentShifts).forEach(function(key) {
    if (!existing[key]) toCreate.push(key);
    else toUpdate.push(key);
  });
  Object.keys(existing).forEach(function(key) {
    if (!currentShifts[key]) toDelete.push(key);
  });

  // Calendar access — v32: use configured target calendar if set
  const calRes = _p2c_resolveCalendar(email);
  if (!calRes.ok) {
    return {
      ok: false,
      error: 'calendar_access',
      message: 'ไม่สามารถเข้าถึง Google Calendar — กรุณา reload และอนุญาตเมื่อ Google ถาม',
      detail: calRes.message
    };
  }
  const cal = calRes.cal;
  const calendarName = calRes.name;

  let created = 0, updated = 0, deleted = 0, skipped = 0;
  const errors = [];

  // CREATE
  for (let i = 0; i < toCreate.length; i++) {
    const key = toCreate[i];
    try {
      const shift = currentShifts[key];
      const dt = _p2c_parseShiftDateTime(shift);
      if (!dt) { errors.push({ key: key, error: 'parse_failed' }); continue; }
      const title = _p2c_buildEventTitle(shift);
      const description = _p2c_buildEventDescription(shift, monthValue);
      const event = cal.createEvent(title, dt.start, dt.end, {
        description: description, location: 'Siriraj Hospital'
      });
      event.removeAllReminders();
      _p2c_buildReminderMinutes(dt.start).forEach(function(m) { event.addPopupReminder(m); });
      try { event.setColor(_p2c_getEventColorId(shift)); } catch (e) {}
      _p2c_appendSyncRow(email, storageKey, key, event.getId(), _p2c_fingerprint(title, dt.start, dt.end, description));
      created++;
    } catch (e) {
      // v30: detect Google Calendar rate limit and abort early
      const msg = String(e.message || '');
      if (msg.indexOf('creating or deleting too many') >= 0 ||
          msg.indexOf('Rate Limit Exceeded') >= 0 ||
          msg.indexOf('Quota exceeded') >= 0) {
        return {
          ok: false,
          error: 'rate_limit',
          message: 'Google Calendar rate-limited บัญชี ' + calendarName +
                   ' — แก้ deployment เป็น "Execute as: User accessing" และรอ 24 ชม.',
          created: created, updated: updated, deleted: deleted, skipped: skipped,
          calendarName: calendarName,
          detail: msg
        };
      }
      errors.push({ key: key, error: 'create_failed', message: e.message });
    }
  }

  // UPDATE
  toUpdate.forEach(function(key) {
    try {
      const shift = currentShifts[key];
      const dt = _p2c_parseShiftDateTime(shift);
      if (!dt) { errors.push({ key: key, error: 'parse_failed' }); return; }
      const title = _p2c_buildEventTitle(shift);
      const description = _p2c_buildEventDescription(shift, monthValue);
      const fp = _p2c_fingerprint(title, dt.start, dt.end, description);

      if (existing[key].fingerprint === fp) { skipped++; return; }

      const eventId = existing[key].eventId;
      let ev = null;
      try { ev = cal.getEventById(eventId); } catch (e) {}
      if (!ev) {
        const newEvent = cal.createEvent(title, dt.start, dt.end, { description: description, location: 'Siriraj Hospital' });
        newEvent.removeAllReminders();
        _p2c_buildReminderMinutes(dt.start).forEach(function(m) { newEvent.addPopupReminder(m); });
        try { newEvent.setColor(_p2c_getEventColorId(shift)); } catch (e) {}
        _p2c_updateSyncRow(existing[key].rowNum, newEvent.getId(), fp);
      } else {
        ev.setTitle(title);
        ev.setTime(dt.start, dt.end);
        ev.setDescription(description);
        ev.removeAllReminders();
        _p2c_buildReminderMinutes(dt.start).forEach(function(m) { ev.addPopupReminder(m); });
        try { ev.setColor(_p2c_getEventColorId(shift)); } catch (e) {}
        _p2c_updateSyncRow(existing[key].rowNum, eventId, fp);
      }
      updated++;
    } catch (e) {
      errors.push({ key: key, error: 'update_failed', message: e.message });
    }
  });

  // DELETE
  toDelete.forEach(function(key) {
    try {
      try {
        const ev = cal.getEventById(existing[key].eventId);
        if (ev) ev.deleteEvent();
      } catch (e) {}
      _p2c_markSyncDeleted(existing[key].rowNum);
      deleted++;
    } catch (e) {
      errors.push({ key: key, error: 'delete_failed', message: e.message });
    }
  });

  return {
    ok: true, created: created, updated: updated, deleted: deleted, skipped: skipped,
    total: effectiveShifts.length, calendarName: calendarName, errors: errors
  };
}

/**
 * Bulk-sync the user's effective shifts for multiple months.
 * Called from frontend with a list of {monthValue, monthId, shifts} objects.
 */
function bulkSyncCalendarMonths(email, batches) {
  const v = _p2b_validateEmail(email);
  if (!v.ok) return v;
  if (!Array.isArray(batches) || batches.length === 0) {
    return { ok: false, error: 'no_batches' };
  }
  const results = [];
  let totalCreated = 0, totalUpdated = 0, totalDeleted = 0;
  for (let i = 0; i < batches.length; i++) {
    const b = batches[i];
    const r = syncEffectiveShiftsToCalendar(email, b.monthValue, b.monthId, b.shifts || []);
    results.push(Object.assign({ monthValue: b.monthValue }, r));
    if (r.ok) {
      totalCreated += (r.created || 0);
      totalUpdated += (r.updated || 0);
      totalDeleted += (r.deleted || 0);
    }
    // Safety: don't exceed Apps Script 6-min execution limit
    // Quick heuristic: stop after 4 months if anything substantial happened
    if ((totalCreated + totalUpdated + totalDeleted) > 200) {
      results.push({ stopped: true, message: 'หยุดเพื่อไม่ให้ timeout — รันอีกครั้งสำหรับเดือนที่เหลือ' });
      break;
    }
  }
  return {
    ok: true,
    months: results.length,
    totalCreated: totalCreated,
    totalUpdated: totalUpdated,
    totalDeleted: totalDeleted,
    details: results
  };
}

// ============================================================
// URGENT EMAIL NOTIFICATIONS (for swaps/gives within 12 hours)
// ============================================================

/**
 * Send urgent notification email when a swap/give affects a shift starting soon.
 * Called from frontend after a successful overlay save.
 *
 * @param {Object} params {
 *   senderEmail, senderName,
 *   recipientName,
 *   actionType,    // 'give' or 'swap'
 *   shift,         // { date, pos, range, timestamp, shift, room }
 *   reverseShift?  // for swap — the shift the recipient is GIVING (sender receives)
 * }
 */
function sendUrgentSwapNotification(params) {
  if (!params || !params.senderEmail || !params.recipientName) {
    return { ok: false, error: 'invalid_params' };
  }
  const v = _p2b_validateEmail(params.senderEmail);
  if (!v.ok) return v;

  // Look up recipient's email from People sheet
  const bindings = getPeopleBindings();
  if (!bindings.ok) return bindings;
  const recipientEmail = bindings.bindings[params.recipientName];
  if (!recipientEmail) {
    Logger.log('[P2C urgent] No bound email for ' + params.recipientName + ' — skipping');
    return { ok: true, sent: false, reason: 'no_recipient_email' };
  }

  // Sanity check: shift must be within 12 hours
  if (!params.shift || !params.shift.timestamp || !params.shift.range) {
    return { ok: false, error: 'invalid_shift' };
  }
  const dt = _p2c_parseShiftDateTime(params.shift);
  if (!dt) return { ok: false, error: 'parse_failed' };
  const hoursUntil = (dt.start.getTime() - new Date().getTime()) / (1000 * 60 * 60);
  if (hoursUntil < 0 || hoursUntil > P2C_URGENT_THRESHOLD_HOURS) {
    return { ok: true, sent: false, reason: 'not_urgent', hoursUntil: hoursUntil };
  }

  const hoursStr = hoursUntil < 1
    ? Math.round(hoursUntil * 60) + ' นาที'
    : Math.floor(hoursUntil) + ' ชม. ' + Math.round((hoursUntil % 1) * 60) + ' นาที';

  const actionVerb = params.actionType === 'give' ? 'ยกเวรให้' : 'แลกเวรกับ';
  const subject = '⚠️ ด่วน: คุณรับเวรจาก ' + (params.senderName || 'เภสัชกร') + ' ภายใน ' + hoursStr;

  let plain = '';
  plain += 'สวัสดีคุณ ' + params.recipientName + '\n\n';
  plain += params.senderName + ' (' + params.senderEmail + ') ได้' + actionVerb + 'คุณ:\n\n';
  plain += '📅 วันที่: ' + (params.shift.date || '-') + '\n';
  plain += '📍 ตำแหน่ง: ' + (params.shift.pos || '-') + '\n';
  plain += '⏰ เวลา: ' + (params.shift.range || '-') + '\n';
  plain += '🏷️ ประเภท: ' + (params.shift.shift || '-') + '\n';
  if (params.shift.room) plain += '🚪 ห้อง: ' + params.shift.room + '\n';
  plain += '\n⚠️ เวรนี้จะเริ่มในอีก ' + hoursStr + '\n\n';
  if (params.actionType === 'swap' && params.reverseShift) {
    plain += 'การแลก: คุณจะเป็นคนทำเวรนี้แทน และ ' + params.senderName + ' จะรับเวรของคุณ:\n';
    plain += '  - วันที่: ' + (params.reverseShift.date || '-') + '\n';
    plain += '  - ตำแหน่ง: ' + (params.reverseShift.pos || '-') + '\n';
    plain += '  - เวลา: ' + (params.reverseShift.range || '-') + '\n\n';
  }
  plain += 'กรุณาตรวจสอบในระบบ Siriraj Rx Shift\n\n';
  plain += '— Siriraj Rx Shift Bot\n';
  plain += '(อีเมลนี้ส่งอัตโนมัติ ไม่ต้องตอบกลับ)';

  const htmlBody =
    '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:20px;background:#fff;">' +
    '<div style="background:#dc2626;color:#fff;padding:14px 18px;border-radius:8px 8px 0 0;font-size:14px;font-weight:700;">⚠️ ด่วน — เวรเริ่มในอีก ' + hoursStr + '</div>' +
    '<div style="padding:18px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">' +
      '<p style="margin:0 0 12px;color:#1e293b;font-size:14px;">สวัสดีคุณ <b>' + params.recipientName + '</b></p>' +
      '<p style="margin:0 0 16px;color:#475569;font-size:13px;"><b>' + params.senderName + '</b> ได้' + actionVerb + 'คุณ:</p>' +
      '<table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:6px;font-size:13px;">' +
        '<tr><td style="padding:8px 12px;color:#64748b;width:120px;">📅 วันที่</td><td style="padding:8px 12px;font-weight:600;">' + (params.shift.date || '-') + '</td></tr>' +
        '<tr><td style="padding:8px 12px;color:#64748b;">📍 ตำแหน่ง</td><td style="padding:8px 12px;font-weight:600;">' + (params.shift.pos || '-') + '</td></tr>' +
        '<tr><td style="padding:8px 12px;color:#64748b;">⏰ เวลา</td><td style="padding:8px 12px;font-weight:600;">' + (params.shift.range || '-') + '</td></tr>' +
        '<tr><td style="padding:8px 12px;color:#64748b;">🏷️ ประเภท</td><td style="padding:8px 12px;font-weight:600;">' + (params.shift.shift || '-') + '</td></tr>' +
        (params.shift.room ? '<tr><td style="padding:8px 12px;color:#64748b;">🚪 ห้อง</td><td style="padding:8px 12px;font-weight:600;">' + params.shift.room + '</td></tr>' : '') +
      '</table>' +
      (params.actionType === 'swap' && params.reverseShift
        ? '<div style="margin-top:14px;padding:10px 12px;background:#eff6ff;border-radius:6px;font-size:12px;color:#1e40af;">' +
          '<b>การแลก:</b> คุณจะเป็นคนทำเวรข้างต้น และ ' + params.senderName + ' จะรับเวรของคุณ (' + params.reverseShift.date + ' ' + params.reverseShift.pos + ' ' + params.reverseShift.range + ')' +
          '</div>'
        : '') +
      '<p style="margin:16px 0 8px;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px;">— Siriraj Rx Shift Bot · อีเมลนี้ส่งอัตโนมัติ</p>' +
    '</div>' +
    '</div>';

  try {
    MailApp.sendEmail({
      to: recipientEmail,
      cc: params.senderEmail,
      subject: subject,
      body: plain,
      htmlBody: htmlBody,
      name: 'Siriraj Rx Shift'
    });
    Logger.log('[P2C urgent] Sent to ' + recipientEmail + ' (cc ' + params.senderEmail + ')');
    return { ok: true, sent: true, recipientEmail: recipientEmail, hoursUntil: hoursUntil };
  } catch (e) {
    Logger.log('[P2C urgent] Send failed: ' + e.message);
    return { ok: false, error: 'mail_failed', message: e.message };
  }
}

/**
 * Get email quota remaining (for diagnostics — Apps Script has daily limit).
 */
function p2cMailQuota() {
  const remaining = MailApp.getRemainingDailyQuota();
  Logger.log('Mail quota remaining today: ' + remaining);
  return { ok: true, remaining: remaining };
}

// ============================================================
// CALENDAR PICKER (v32) — let user choose target calendar
// ============================================================

/**
 * List all writable calendars in the executing user's account.
 * Used by frontend's calendar picker UI.
 */
function p2cListMyCalendars() {
  try {
    const myEmail = Session.getEffectiveUser().getEmail();
    const cals = CalendarApp.getAllCalendars();
    const result = [];

    cals.forEach(function(c) {
      try {
        // Only include writable calendars
        const owned = (typeof c.isOwnedByMe === 'function') ? c.isOwnedByMe() : false;
        // Some shared calendars are also editable
        const id = c.getId();
        const isPrimary = (id === myEmail);
        if (!owned && !isPrimary) return;  // skip non-owned secondary
        let color = null;
        try { color = c.getColor(); } catch (e) {}
        result.push({
          id: id,
          name: c.getName(),
          isPrimary: isPrimary,
          isOwned: owned,
          color: color
        });
      } catch (e) {
        console.warn('[P2C list cals] skip:', e.message);
      }
    });

    // Sort: primary first, then alphabetical
    result.sort(function(a, b) {
      if (a.isPrimary) return -1;
      if (b.isPrimary) return 1;
      return a.name.localeCompare(b.name, 'th');
    });

    return { ok: true, calendars: result, currentUser: myEmail };
  } catch (e) {
    return { ok: false, error: 'list_failed', message: e.message };
  }
}

/**
 * Create a dedicated calendar for Siriraj Rx Shift events.
 * Returns the new calendar's ID so frontend can save it as the target.
 */
function p2cCreateAppCalendar() {
  try {
    const cal = CalendarApp.createCalendar('Siriraj Rx Shifts', {
      summary: 'เวรเภสัชกร Siriraj Hospital — auto-synced',
      color: CalendarApp.Color.PALE_BLUE
    });
    try { cal.setTimeZone('Asia/Bangkok'); } catch (e) {}
    return {
      ok: true,
      id: cal.getId(),
      name: cal.getName()
    };
  } catch (e) {
    return { ok: false, error: 'create_failed', message: e.message };
  }
}

/**
 * Get user's chosen target calendar ID from People sheet column H.
 * Returns null if not set (caller should default to primary calendar).
 */
function p2cGetTargetCalendar(email) {
  const v = _p2b_validateEmail(email);
  if (!v.ok) return v;
  try {
    const sh = _p2b_getPeopleSheet();
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return { ok: true, calendarId: null };
    // Read 8 columns (A..H)
    const data = sh.getRange(2, 1, lastRow - 1, 8).getValues();
    for (let i = 0; i < data.length; i++) {
      const rowEmail = data[i][1] ? String(data[i][1]).trim() : '';
      if (rowEmail === email) {
        const calId = data[i][7] ? String(data[i][7]).trim() : '';
        return { ok: true, calendarId: calId || null };
      }
    }
    return { ok: true, calendarId: null };
  } catch (e) {
    return { ok: false, error: 'read_failed', message: e.message };
  }
}

/**
 * Save user's chosen target calendar ID to People sheet column H.
 * Empty string clears it (revert to primary).
 */
function p2cSetTargetCalendar(email, calendarId) {
  const v = _p2b_validateEmail(email);
  if (!v.ok) return v;
  try {
    const sh = _p2b_getPeopleSheet();
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return { ok: false, error: 'user_not_found' };
    const data = sh.getRange(2, 1, lastRow - 1, 2).getValues();
    let targetRow = -1;
    for (let i = 0; i < data.length; i++) {
      const rowEmail = data[i][1] ? String(data[i][1]).trim() : '';
      if (rowEmail === email) { targetRow = i + 2; break; }
    }
    if (targetRow < 0) return { ok: false, error: 'user_not_found' };

    // Ensure header for column H exists
    try {
      const header = sh.getRange(1, 8).getValue();
      if (!header) sh.getRange(1, 8).setValue('Target Calendar ID');
    } catch (e) {}

    sh.getRange(targetRow, 8).setValue(calendarId || '');
    // Also bump Last Updated col
    try { sh.getRange(targetRow, P2B_PEOPLE_COL_LASTUPDATED).setValue(new Date()); } catch (e) {}
    return { ok: true, calendarId: calendarId || null };
  } catch (e) {
    return { ok: false, error: 'write_failed', message: e.message };
  }
}

/**
 * Helper: resolve calendar to use based on user's saved preference.
 * Returns the CalendarApp.Calendar instance + name + id.
 */
function _p2c_resolveCalendar(email) {
  try {
    const target = p2cGetTargetCalendar(email);
    if (target.ok && target.calendarId) {
      try {
        const cal = CalendarApp.getCalendarById(target.calendarId);
        if (cal) {
          return { ok: true, cal: cal, name: cal.getName(), id: target.calendarId, source: 'configured' };
        }
      } catch (e) {
        console.warn('[P2C] saved calendar not accessible:', e.message);
      }
    }
    const cal = CalendarApp.getDefaultCalendar();
    return { ok: true, cal: cal, name: cal.getName(), id: cal.getId(), source: 'default' };
  } catch (e) {
    return { ok: false, error: 'calendar_access', message: e.message };
  }
}

/**
 * DEBUG: returns the email + calendar info that the script actually sees.
 * Call from frontend to verify deployment mode is working correctly.
 *
 * Expected: matches the user's mahidol.ac.th account, NOT the script owner.
 * If returns admin's account → deployment is still "Execute as: Me"
 */
function p2cWhoAmI() {
  const result = {};
  try {
    result.activeUser = Session.getActiveUser().getEmail();
  } catch (e) { result.activeUser = 'error: ' + e.message; }
  try {
    result.effectiveUser = Session.getEffectiveUser().getEmail();
  } catch (e) { result.effectiveUser = 'error: ' + e.message; }
  try {
    const cal = CalendarApp.getDefaultCalendar();
    result.defaultCalendarName = cal.getName();
    result.defaultCalendarId = cal.getId();
    result.defaultCalendarOwner = (typeof cal.isOwnedByMe === 'function') ? cal.isOwnedByMe() : '(unknown)';
  } catch (e) { result.calendarError = e.message; }
  // List first 5 calendars
  try {
    const cals = CalendarApp.getAllCalendars().slice(0, 5);
    result.allCalendars = cals.map(function(c) { return { name: c.getName(), id: c.getId() }; });
  } catch (e) { result.allCalsError = e.message; }
  Logger.log('=== p2cWhoAmI ===');
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/**
 * ADMIN CLEANUP: list all calendars in the executing user's account.
 * Useful for finding leftover "SirxShift*" calendars created by old Phase 1 code.
 * Run from Apps Script editor — runs as the editor's account.
 */
function p2cListAllCalendars() {
  const cals = CalendarApp.getAllCalendars();
  const result = cals.map(function(c) {
    return {
      name: c.getName(),
      id: c.getId(),
      isOwned: c.isOwnedByMe ? c.isOwnedByMe() : '(unknown)',
      eventsCount: '(use getEvents to count)'
    };
  });
  Logger.log('=== All calendars (in editor account) ===');
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/**
 * ADMIN CLEANUP: delete all calendars whose name matches "SirxShift*".
 * SAFETY: Only deletes calendars OWNED by the executing account.
 * Run manually from editor — does NOT run on user's account.
 *
 * @param {boolean} dryRun  if true, only logs what would be deleted
 */
function p2cCleanupSirxShiftCalendars(dryRun) {
  dryRun = (dryRun === undefined) ? true : !!dryRun;  // default to dry run
  const cals = CalendarApp.getAllCalendars();
  const targets = [];
  cals.forEach(function(c) {
    const name = c.getName() || '';
    if (name.toLowerCase().indexOf('sirxshift') >= 0 ||
        name.toLowerCase().indexOf('siriraj') >= 0) {
      const owned = c.isOwnedByMe ? c.isOwnedByMe() : false;
      if (owned) targets.push({ name: name, id: c.getId(), cal: c });
    }
  });
  Logger.log('Found ' + targets.length + ' SirxShift calendar(s) owned by this account');
  targets.forEach(function(t) {
    Logger.log((dryRun ? '[DRY] would delete: ' : '[DELETE] removing: ') + t.name);
    if (!dryRun) {
      try { t.cal.deleteCalendar(); }
      catch (e) { Logger.log('  failed: ' + e.message); }
    }
  });
  return {
    ok: true,
    dryRun: dryRun,
    found: targets.length,
    names: targets.map(function(t) { return t.name; }),
    deleted: dryRun ? 0 : targets.length
  };
}