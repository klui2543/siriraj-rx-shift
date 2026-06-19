// ════════════════════════════════════════════════════════════
// 🔐 PHASE Z B2 — Backup Email (user-set, stored PHX_Pharmacists col E)
// ════════════════════════════════════════════════════════════

function phxSetBackupEmail(rawName, passwordHash, rawEmail) {
  try {
    const name = String(rawName || '').trim();
    const hash = String(passwordHash || '').trim();
    const email = String(rawEmail || '').trim();
    if (!name || !hash) return { success: false, error: 'ยังไม่ได้ login' };

    const row = _phxFindPharmacistRow(name);
    if (!row) return { success: false, error: 'ไม่พบชื่อในระบบ' };
    if (row.passwordHash !== hash) return { success: false, error: 'ยืนยันตัวตนไม่ผ่าน' };

    // email ว่าง = ลบสำรอง / มีค่า = ต้องถูก format
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return { success: false, error: 'รูปแบบอีเมลไม่ถูกต้อง' };
    }

    const sh = _phxGetSheet('PHX_Pharmacists');
    // ตั้ง header col E ครั้งแรก (กันลืม)
    if (String(sh.getRange(1, 5).getValue() || '').trim() !== 'backupEmail') {
      sh.getRange(1, 5).setValue('backupEmail');
    }
    sh.getRange(row.rowIndex, 5).setValue(email);

    return {
      success: true,
      masked: email ? _phxMaskEmail(email) : '',
      message: email ? 'บันทึกอีเมลสำรองแล้ว' : 'ลบอีเมลสำรองแล้ว'
    };
  } catch (e) {
    console.error('phxSetBackupEmail: ' + e.message);
    return { success: false, error: 'เกิดข้อผิดพลาด: ' + e.message };
  }
}

function phxGetBackupEmail(rawName, passwordHash) {
  try {
    const name = String(rawName || '').trim();
    const hash = String(passwordHash || '').trim();
    const row = _phxFindPharmacistRow(name);
    if (!row || row.passwordHash !== hash) return { success: false, error: 'auth' };

    const sh = _phxGetSheet('PHX_Pharmacists');
    const email = String(sh.getRange(row.rowIndex, 5).getValue() || '').trim();
    return { success: true, hasBackup: !!email, masked: email ? _phxMaskEmail(email) : '' };
  } catch (e) {
    return { success: false, error: String(e.message || e) };
  }
}

// ════════════════════════════════════════════════════════════
// B3b — Pre-shift Reminder Settings
// col F = eveningReminderTime: '' or 'HH:MM' (e.g., '18:00')
// col G = hoursBeforeReminder: '' or integer string '1'-'24'
// ════════════════════════════════════════════════════════════

function phxSetReminderSettings(rawName, passwordHash, rawEveningTime, rawHoursBefore) {
  try {
    const name = String(rawName || '').trim();
    const hash = String(passwordHash || '').trim();
    const eveningTime = String(rawEveningTime || '').trim();
    const hoursBefore = String(rawHoursBefore || '').trim();

    if (!name || !hash) return { success: false, error: 'ยังไม่ได้ login' };

    const row = _phxFindPharmacistRow(name);
    if (!row) return { success: false, error: 'ไม่พบชื่อในระบบ' };
    if (row.passwordHash !== hash) return { success: false, error: 'ยืนยันตัวตนไม่ผ่าน' };

    // Validate evening time (empty OR HH:MM)
    if (eveningTime && !/^(0?[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/.test(eveningTime)) {
      return { success: false, error: 'รูปแบบเวลาไม่ถูกต้อง (ต้องเป็น HH:MM)' };
    }

    // Validate hours (empty OR integer 1-24)
    if (hoursBefore) {
      const h = parseInt(hoursBefore, 10);
      if (isNaN(h) || h < 1 || h > 24 || String(h) !== hoursBefore) {
        return { success: false, error: 'ชั่วโมงต้องเป็นจำนวนเต็ม 1-24' };
      }
    }

    const sh = _phxGetSheet('PHX_Pharmacists');
    // ตั้ง header col F + G ครั้งแรก (กันลืม)
    if (String(sh.getRange(1, 6).getValue() || '').trim() !== 'eveningReminderTime') {
      sh.getRange(1, 6).setValue('eveningReminderTime');
    }
    if (String(sh.getRange(1, 7).getValue() || '').trim() !== 'hoursBeforeReminder') {
      sh.getRange(1, 7).setValue('hoursBeforeReminder');
    }

    // Normalize HH:MM (pad leading 0)
    let normalizedTime = eveningTime;
    if (eveningTime) {
      const parts = eveningTime.split(':');
      normalizedTime = parts[0].padStart(2, '0') + ':' + parts[1];
    }

    // Force text format กัน Sheets auto-convert '17:30' → Date object
    sh.getRange(row.rowIndex, 6).setNumberFormat('@').setValue(normalizedTime);
    sh.getRange(row.rowIndex, 7).setNumberFormat('@').setValue(hoursBefore);

    return {
      success: true,
      eveningReminderTime: normalizedTime,
      hoursBeforeReminder: hoursBefore,
      message: 'บันทึกการตั้งค่าแล้ว'
    };
  } catch (e) {
    console.error('phxSetReminderSettings: ' + e.message);
    return { success: false, error: 'เกิดข้อผิดพลาด: ' + e.message };
  }
}

function phxGetReminderSettings(rawName, passwordHash) {
  try {
    const name = String(rawName || '').trim();
    const hash = String(passwordHash || '').trim();
    const row = _phxFindPharmacistRow(name);
    if (!row || row.passwordHash !== hash) return { success: false, error: 'auth' };

    const sh = _phxGetSheet('PHX_Pharmacists');

    // Defensive: handle Date object (legacy data before text-format fix)
    const rawF = sh.getRange(row.rowIndex, 6).getValue();
    let eveningTime = '';
    if (rawF instanceof Date) {
      eveningTime = Utilities.formatDate(rawF, Session.getScriptTimeZone(), 'HH:mm');
    } else {
      eveningTime = String(rawF || '').trim();
    }
    const hoursBefore = String(sh.getRange(row.rowIndex, 7).getValue() || '').trim();

    return {
      success: true,
      eveningReminderTime: eveningTime,
      hoursBeforeReminder: hoursBefore,
      anyEnabled: !!(eveningTime || hoursBefore)
    };
  } catch (e) {
    return { success: false, error: String(e.message || e) };
  }
}

function testB3b_SettingsBasic() {
  const hash = _phxHashPassword('ณรพล', 'klui2543');

  Logger.log('--- SET: evening=17:30, hours=4 ---');
  Logger.log(JSON.stringify(phxSetReminderSettings('ณรพล', hash, '17:30', '4'), null, 2));

  Logger.log('--- GET ---');
  Logger.log(JSON.stringify(phxGetReminderSettings('ณรพล', hash), null, 2));

  Logger.log('--- SET: clear both (disabled) ---');
  Logger.log(JSON.stringify(phxSetReminderSettings('ณรพล', hash, '', ''), null, 2));

  Logger.log('--- GET after clear ---');
  Logger.log(JSON.stringify(phxGetReminderSettings('ณรพล', hash), null, 2));
}

function testB3b_SettingsValidation() {
  const hash = _phxHashPassword('ณรพล', 'klui2543');

  Logger.log('--- Bad time 25:00 ---');
  Logger.log(JSON.stringify(phxSetReminderSettings('ณรพล', hash, '25:00', ''), null, 2));

  Logger.log('--- Bad time 18:60 ---');
  Logger.log(JSON.stringify(phxSetReminderSettings('ณรพล', hash, '18:60', ''), null, 2));

  Logger.log('--- Bad hours 25 ---');
  Logger.log(JSON.stringify(phxSetReminderSettings('ณรพล', hash, '', '25'), null, 2));

  Logger.log('--- Bad hours 5.5 (not int) ---');
  Logger.log(JSON.stringify(phxSetReminderSettings('ณรพล', hash, '', '5.5'), null, 2));

  Logger.log('--- Bad hours 0 ---');
  Logger.log(JSON.stringify(phxSetReminderSettings('ณรพล', hash, '', '0'), null, 2));
}

// ════════════════════════════════════════════════════════════
// B3b — Scanner + Email Queue Helpers (no triggers yet)
// ════════════════════════════════════════════════════════════

const _PHX_B3B_THAI_MONTHS = [
  'มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'
];

/** JS Date → Thai month label (e.g., 'มิถุนายน 2569') — สำหรับ debug + lookup */
function _phxDateToMonthLabel(jsDate) {
  return _PHX_B3B_THAI_MONTHS[jsDate.getMonth()] + ' ' + (jsDate.getFullYear() + 543);
}

/** JS Date → actual monthId (e.g., 'm_1781304482466579') — lookup via getAvailableMonths */

function _phxDateToMonthId(jsDate) {
  const targetLabel = _phxDateToMonthLabel(jsDate);
  try {
    const months = getAvailableMonths();
    if (!months || !Array.isArray(months)) return null;
    for (let i = 0; i < months.length; i++) {
      if (months[i] && months[i].label === targetLabel) return months[i].id;
    }
    return null;
  } catch(e) {
    Logger.log('[B3b _phxDateToMonthId] error: ' + e);
    return null;
  }
}

/** Convert backend monthId 'm_1781304482466579' → frontend key 'm_มิถุนายน_2569' */
function _phxMonthIdToFrontendKey(monthId) {
  if (!monthId) return monthId;
  // ถ้ามี Thai chars → frontend format อยู่แล้ว
  if (/[\u0E00-\u0E7F]/.test(monthId)) return monthId;
  // Backend ID → lookup label
  try {
    const months = getAvailableMonths();
    if (!months || !Array.isArray(months)) return monthId;
    for (let i = 0; i < months.length; i++) {
      if (months[i] && months[i].id === monthId) {
        return 'm_' + String(months[i].label).replace(/\s+/g, '_');
      }
    }
  } catch(e) { Logger.log('[_phxMonthIdToFrontendKey] ' + e); }
  return monthId;
}

/** Parse shift's absolute start datetime (handles cross-day for night shifts) */
function _phxParseShiftStartTime(shift) {
  if (!shift || !shift.range) return null;
  const rangeMatch = String(shift.range).match(/^(\d{1,2}):(\d{2})/);
  if (!rangeMatch) return null;
  const startHour = parseInt(rangeMatch[1], 10);
  const startMin = parseInt(rangeMatch[2], 10);

  // Prefer timestamp (YYYYMMDD integer) for date
  if (shift.timestamp) {
    const ts = shift.timestamp;
    const y = Math.floor(ts / 10000);
    const m = Math.floor((ts % 10000) / 100) - 1;
    const d = ts % 100;
    return new Date(y, m, d, startHour, startMin, 0);
  }
  // Fallback: parse from date string + current month
  const dayMatch = String(shift.date || '').match(/^(\d{1,2})/);
  if (!dayMatch) return null;
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), parseInt(dayMatch[1], 10), startHour, startMin, 0);
}

/** Build {userName: email} map (backup wins over primary, Master-active only) */
function _phxBuildUserEmailMap() {
  const result = {};
  try {
    const ss = SpreadsheetApp.openById(_f1SpreadsheetId());

    // Backups from PHX_Pharmacists col E
    const phSh = ss.getSheetByName('PHX_Pharmacists');
    const backups = {};
    if (phSh && phSh.getLastRow() > 1) {
      const data = phSh.getRange(2, 1, phSh.getLastRow() - 1, 5).getValues();
      data.forEach(function(row) {
        const name = String(row[0] || '').trim();
        const backup = String(row[4] || '').trim();
        if (name && backup && backup.indexOf('@') >= 0) backups[name] = backup;
      });
    }

    // Primaries from Master (active only)
    const mSh = ss.getSheetByName('PHX_Pharmacists_Master');
    if (mSh) {
      const mData = mSh.getDataRange().getValues();
      for (let i = 1; i < mData.length; i++) {
        const name = String(mData[i][0] || '').trim();
        const email = String(mData[i][1] || '').trim();
        const active = mData[i][2];
        const isActive = (active === true) || (String(active).toUpperCase() === 'TRUE');
        if (name && email && email.indexOf('@') >= 0 && isActive) {
          result[name] = backups[name] || email;
        }
      }
    }
  } catch(e) {
    Logger.log('[B3b _phxBuildUserEmailMap] ' + e);
  }
  return result;
}

/** Scan a specific date → {userName: [shifts]} */
function _phxScanShiftsByUserForDate(targetDate) {
  const monthId = _phxDateToMonthId(targetDate);
  if (!monthId) {
    Logger.log('[B3b scanByUser] no monthId for ' + _phxDateToMonthLabel(targetDate));
    return {};
  }
  const targetDay = targetDate.getDate();
  const targetYear = targetDate.getFullYear();
  const targetMonth = targetDate.getMonth();

  let res;
  try {
    res = getScheduleData(monthId);
  } catch(e) {
    Logger.log('[B3b scanByUser] cannot read ' + monthId + ': ' + e);
    return {};
  }
  if (!res || res.error || !res.schedule) {
    if (res && res.error) Logger.log('[B3b scanByUser] getScheduleData error: ' + res.error);
    return {};
  }

  const byUser = {};
  res.schedule.forEach(function(s) {
    if (!s.date || !s.name) return;
    let matches = false;
    if (s.timestamp) {
      const ts = s.timestamp;
      const y = Math.floor(ts / 10000);
      const m = Math.floor((ts % 10000) / 100) - 1;
      const d = ts % 100;
      matches = (y === targetYear && m === targetMonth && d === targetDay);
    } else {
      const dayMatch = String(s.date).match(/^(\d{1,2})/);
      matches = dayMatch && (parseInt(dayMatch[1], 10) === targetDay);
    }
    if (!matches) return;
    if (!byUser[s.name]) byUser[s.name] = [];
    byUser[s.name].push(s);
  });
  return byUser;
}

/** Scan shifts STARTING in [start, end) — strict end exclusion ป้องกัน double-queue */
function _phxScanShiftsInTimeWindow(start, end) {
  const monthIds = {};
  const startId = _phxDateToMonthId(start);
  const endId = _phxDateToMonthId(end);
  if (startId) monthIds[startId] = true;
  if (endId) monthIds[endId] = true;
  if (Object.keys(monthIds).length === 0) {
    Logger.log('[B3b scanWindow] no monthId resolved for window');
    return [];
  }

  const result = [];
  Object.keys(monthIds).forEach(function(monthId) {
    let res;
    try { res = getScheduleData(monthId); } catch(e) {
      Logger.log('[B3b scanWindow] cannot read ' + monthId + ': ' + e);
      return;
    }
    if (!res || res.error || !res.schedule) {
      if (res && res.error) Logger.log('[B3b scanWindow] getScheduleData error: ' + res.error);
      return;
    }
    res.schedule.forEach(function(s) {
      const startTime = _phxParseShiftStartTime(s);
      if (!startTime) return;
      const t = startTime.getTime();
      if (t >= start.getTime() && t < end.getTime()) {
        result.push(Object.assign({}, s, { _startTime: startTime }));
      }
    });
  });
  return result;
}

/** Build email content for evening reminder (1 email per user, combine multi-shifts) */
function _phxBuildEveningEmailContent(userName, shifts) {
  const n = shifts.length;
  const dateStr = (shifts[0] && shifts[0].date) || '';
  const subject = (n === 1)
    ? 'พรุ่งนี้คุณมีเวร ' + (shifts[0].pos || '') + (dateStr ? ' [' + dateStr + ']' : '')
    : 'พรุ่งนี้คุณมีเวร ' + n + ' เวร' + (dateStr ? ' [' + dateStr + ']' : '');

  let body = 'สวัสดีคุณ ' + userName + '\n\n';
  body += 'แจ้งเตือนว่าพรุ่งนี้ ' + dateStr + ' คุณมีเวร:\n\n';
  shifts.forEach(function(s, i) {
    body += (n > 1 ? (i + 1) + '. ' : '') + 'ตำแหน่ง ' + (s.pos || '-');
    if (s.range && s.range !== '-') body += ' เวลา ' + s.range;
    if (s.room) body += ' (ห้อง ' + s.room + ')';
    body += '\n';
  });
  body += '\n— Siriraj Rx Shift';
  return { subject: subject, body: body };
}

/** Build email content for hours-before reminder (1 email per shift) */
function _phxBuildHoursBeforeEmailContent(userName, shift, leadHours) {
  const dateStr = shift.date || '';
  const subject = 'อีก ' + leadHours + ' ชม. เริ่มเวร ' + (shift.pos || '') + (dateStr ? ' [' + dateStr + ']' : '');
  let body = 'สวัสดีคุณ ' + userName + '\n\n';
  body += 'อีก ' + leadHours + ' ชั่วโมง คุณจะเริ่มเวรในวัน ' + dateStr + ':\n';
  body += '- ตำแหน่ง: ' + (shift.pos || '-') + '\n';
  if (shift.range && shift.range !== '-') body += '- เวลา: ' + shift.range + '\n';
  if (shift.room) body += '- ห้อง: ' + shift.room + '\n';
  body += '\n— Siriraj Rx Shift';
  return { subject: subject, body: body };
}

/** Helper: append rows to PHX_EmailQueue (batch write) */
function _phxAppendToEmailQueue(rows) {
  if (!rows || rows.length === 0) return 0;
  const ss = SpreadsheetApp.openById(_f1SpreadsheetId());
  let sh = ss.getSheetByName('PHX_EmailQueue');
  if (!sh) {
    sh = ss.insertSheet('PHX_EmailQueue');
    sh.getRange(1, 1, 1, 8).setValues([['uuid','to','subject','body','status','created','sentAt','error']]);
    sh.setFrozenRows(1);
  }
  const startRow = sh.getLastRow() + 1;
  sh.getRange(startRow, 1, rows.length, 8).setValues(rows);
  return rows.length;
}

/**
 * Queue evening reminders.
 * - ถ้าส่ง (hour, min) → match HH:MM ตรง (production mode)
 * - ถ้าส่ง (hour) → match HH only (backwards-compat สำหรับ test helper เดิม)
 */
function _phxQueueEveningReminders(currentHour, currentMin) {
  const result = { queued: 0, errors: [], skippedNoEmail: 0, skippedNoShifts: 0 };
  try {
    const exactMode = (typeof currentMin === 'number' && !isNaN(currentMin));
    const sh = _phxGetSheet('PHX_Pharmacists');
    if (!sh || sh.getLastRow() < 2) return result;
    const data = sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues();

    const targetUsers = {};
    data.forEach(function(row) {
      const name = String(row[0] || '').trim();
      let evTime = row[5];
      if (evTime instanceof Date) {
        evTime = Utilities.formatDate(evTime, Session.getScriptTimeZone(), 'HH:mm');
      } else {
        evTime = String(evTime || '').trim();
      }
      if (!name || !evTime) return;
      const parts = evTime.split(':');
      const evHour = parseInt(parts[0], 10);
      const evMin = parseInt(parts[1], 10);
      if (isNaN(evHour) || evHour !== currentHour) return;
      if (exactMode && (isNaN(evMin) || evMin !== currentMin)) return;
      targetUsers[name] = true;
    });

    if (Object.keys(targetUsers).length === 0) {
      // silent unless something to report (1440 runs/วัน — log จะ spam)
      return result;
    }

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const shiftsByUser = _phxScanShiftsByUserForDateWithOverlay(tomorrow);
    const emailMap = _phxBuildUserEmailMap();
    const now = new Date();
    const queueRows = [];

    Object.keys(targetUsers).forEach(function(userName) {
      const userShifts = shiftsByUser[userName];
      if (!userShifts || userShifts.length === 0) { result.skippedNoShifts++; return; }
      const email = emailMap[userName];
      if (!email) {
        result.errors.push('no email for ' + userName);
        result.skippedNoEmail++;
        return;
      }
      const content = _phxBuildEveningEmailContent(userName, userShifts);
      queueRows.push([Utilities.getUuid(), email, content.subject, content.body, 'pending', now, '', '']);
    });

    result.queued = _phxAppendToEmailQueue(queueRows);
  } catch(e) {
    result.errors.push(String(e.message || e));
    Logger.log('[B3b _phxQueueEveningReminders] ' + e);
  }
  return result;
}

/**
 * Queue hours-before reminders for users with hoursBeforeReminder set.
 * Scans shifts starting in [now+leadHours-0.5h, now+leadHours+0.5h) per user-group.
 */
function _phxQueueHoursBeforeReminders(now, tightWindow) {
  const result = { queued: 0, errors: [], skippedNoEmail: 0 };
  try {
    if (!now || !(now instanceof Date)) now = new Date();  // defensive default
    // tightWindow=true → 1-min window (production every-1-min trigger)
    // tightWindow=false/undefined → ±30 min legacy (backwards-compat test helper)
    const tight = !!tightWindow;
    const sh = _phxGetSheet('PHX_Pharmacists');
    if (!sh || sh.getLastRow() < 2) return result;
    const data = sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues();

    const usersByHours = {};
    data.forEach(function(row) {
      const name = String(row[0] || '').trim();
      const hours = String(row[6] || '').trim();
      if (!name || !hours) return;
      const h = parseInt(hours, 10);
      if (isNaN(h) || h < 1 || h > 24) return;
      if (!usersByHours[h]) usersByHours[h] = [];
      usersByHours[h].push(name);
    });

    if (Object.keys(usersByHours).length === 0) return result;

    const emailMap = _phxBuildUserEmailMap();
    const queueRows = [];
    // Floor to current minute → window เสถียรแม้ trigger fire ที่วินาทีต่างกันใน minute เดียวกัน
    const flooredMs = Math.floor(now.getTime() / 60000) * 60000;

    Object.keys(usersByHours).forEach(function(hoursStr) {
      const leadHours = parseInt(hoursStr, 10);
      let winStart, winEnd;
      if (tight) {
        // [flooredMin + leadH, flooredMin + leadH + 1min) — exact 1-min slot
        winStart = new Date(flooredMs + leadHours * 3600 * 1000);
        winEnd = new Date(winStart.getTime() + 60 * 1000);
      } else {
        // ±30 min legacy window
        winStart = new Date(now.getTime() + (leadHours - 0.5) * 3600 * 1000);
        winEnd = new Date(now.getTime() + (leadHours + 0.5) * 3600 * 1000);
      }
      const userSet = {};
      usersByHours[hoursStr].forEach(function(n) { userSet[n] = true; });

      const shifts = _phxScanShiftsInTimeWindowWithOverlay(winStart, winEnd);
      shifts.forEach(function(s) {
        if (!userSet[s.name]) return;
        const email = emailMap[s.name];
        if (!email) {
          result.errors.push('no email for ' + s.name);
          result.skippedNoEmail++;
          return;
        }
        const content = _phxBuildHoursBeforeEmailContent(s.name, s, leadHours);
        queueRows.push([Utilities.getUuid(), email, content.subject, content.body, 'pending', new Date(), '', '']);
      });
    });

    result.queued = _phxAppendToEmailQueue(queueRows);
  } catch(e) {
    result.errors.push(String(e.message || e));
    Logger.log('[B3b _phxQueueHoursBeforeReminders] ' + e);
  }
  return result;
}

function testB3b_EmailMap() {
  const map = _phxBuildUserEmailMap();
  const names = Object.keys(map);
  Logger.log('Total users with email: ' + names.length);
  Logger.log('First 5: ' + JSON.stringify(names.slice(0, 5).map(function(n) {
    return { name: n, email: map[n] };
  }), null, 2));
}

function testB3b_TomorrowScan() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  Logger.log('Scanning tomorrow: ' + tomorrow.toDateString());
  Logger.log('monthId: ' + _phxDateToMonthId(tomorrow));
  const byUser = _phxScanShiftsByUserForDateWithOverlay(tomorrow);
  const userCount = Object.keys(byUser).length;
  let totalShifts = 0;
  Object.keys(byUser).forEach(function(n) { totalShifts += byUser[n].length; });
  Logger.log('Found ' + userCount + ' users, ' + totalShifts + ' total shifts');
  // Show first 3 users
  Object.keys(byUser).slice(0, 3).forEach(function(n) {
    Logger.log('  ' + n + ': ' + byUser[n].map(function(s) { return s.pos + ' ' + s.range; }).join(', '));
  });
}

function testB3b_WindowScan() {
  const now = new Date();
  const winStart = new Date(now.getTime() + 4.5 * 3600 * 1000);
  const winEnd = new Date(now.getTime() + 5.5 * 3600 * 1000);
  Logger.log('Scanning window: ' + winStart.toString() + ' → ' + winEnd.toString());
  const shifts = _phxScanShiftsInTimeWindowWithOverlay(winStart, winEnd);
  Logger.log('Found ' + shifts.length + ' shifts in 5h window');
  shifts.slice(0, 5).forEach(function(s) {
    Logger.log('  ' + s.name + ' / ' + s.pos + ' / ' + s.range);
  });
}

function testB3b_EveningQueueNow() {
  // ใช้ชั่วโมงปัจจุบัน — รัน test นี้ตอนที่ตรงกับ eveningReminderTime ของคุณ
  const currentHour = parseInt(Utilities.formatDate(new Date(), 'Asia/Bangkok', 'HH'), 10);
  Logger.log('Running evening queue for hour=' + currentHour);
  const r = _phxQueueEveningReminders(currentHour);
  Logger.log(JSON.stringify(r, null, 2));
}

function testB3b_HoursBeforeQueueNow() {
  const r = _phxQueueHoursBeforeReminders(new Date());
  Logger.log(JSON.stringify(r, null, 2));
}

function testB3b_EmailContent_Sample() {
  // Show email content for review
  const sampleShifts = [
    { pos: 'NM5-12', range: '08:00-16:00', room: 'NM5' },
    { pos: 'IPD-3', range: '16:00-23:00', room: 'IPD' }
  ];
  Logger.log('--- Evening (multi-shift) ---');
  Logger.log(JSON.stringify(_phxBuildEveningEmailContent('ณรพล', sampleShifts), null, 2));
  Logger.log('--- Hours-before (single) ---');
  Logger.log(JSON.stringify(_phxBuildHoursBeforeEmailContent('ณรพล', sampleShifts[0], 5), null, 2));
}

function testB3b_Diagnose() {
  const monthId = 'm_มิถุนายน_2569';
  Logger.log('=== Test 1: getScheduleData(' + monthId + ') ===');
  let res;
  try { res = getScheduleData(monthId); } catch(e) {
    Logger.log('ERROR: ' + e.message + '\n' + e.stack);
    return;
  }
  Logger.log('typeof: ' + typeof res + ' / null: ' + (res === null));
  if (!res) return;
  Logger.log('keys: ' + Object.keys(res).join(', '));
  if (res.data) {
    Logger.log('data length: ' + res.data.length);
    if (res.data.length > 0) {
      Logger.log('first shift:\n' + JSON.stringify(res.data[0], null, 2));
      // Check timestamps
      const tsList = res.data.map(function(s) { return s.timestamp; }).filter(Boolean).sort();
      if (tsList.length > 0) {
        Logger.log('timestamp range: ' + tsList[0] + ' → ' + tsList[tsList.length-1]);
        Logger.log('expected today/tomorrow: 20260617 / 20260618');
      } else {
        Logger.log('NO timestamps in any shift');
      }
      // Day 18 check
      const day18 = res.data.filter(function(s) {
        if (s.timestamp) return (s.timestamp % 100) === 18;
        const m = String(s.date || '').match(/^(\d{1,2})/);
        return m && parseInt(m[1], 10) === 18;
      });
      Logger.log('shifts on day 18: ' + day18.length);
      if (day18.length > 0) Logger.log('sample day-18: ' + JSON.stringify(day18[0]));
    }
  }

  Logger.log('\n=== Test 2: getAvailableMonths() ===');
  try {
    const months = getAvailableMonths();
    Logger.log('available: ' + JSON.stringify(months));
  } catch(e) { Logger.log('ERROR: ' + e.message); }
}

function testB3b_Diagnose2() {
  const monthId = 'm_1781304482466579';
  Logger.log('=== getScheduleData(' + monthId + ') ===');
  let res;
  try { res = getScheduleData(monthId); } catch(e) {
    Logger.log('THROWN: ' + e.message + '\n' + e.stack);
    return;
  }
  Logger.log('typeof: ' + typeof res);
  Logger.log('null: ' + (res === null));
  Logger.log('keys: ' + Object.keys(res || {}).join(', '));
  Logger.log('--- full response (first 3000 chars) ---');
  Logger.log(JSON.stringify(res, null, 2).substring(0, 3000));
}

/**
 * Auto: หา main shift ถัดไปของ ณรพล แล้ว queue email ทดสอบ
 * รันครั้งเดียวจบ — ไม่ต้องเดาวัน
 */
function testB3b_AutoFindAndQueue() {
  const monthId = 'm_1781304482466579';
  const res = getScheduleData(monthId);
  if (!res || !res.schedule) { Logger.log('no data'); return; }

  const myName = 'ณรพล';
  const myShifts = res.schedule.filter(function(s) { return s.name === myName; });
  Logger.log('Total main shifts: ' + myShifts.length);

  // Filter ถัดไป (วันนี้หรืออนาคต)
  const todayTs = parseInt(Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMdd'), 10);
  const upcoming = myShifts.filter(function(s) { return s.timestamp && s.timestamp >= todayTs; });
  upcoming.sort(function(a, b) { return a.timestamp - b.timestamp; });

  if (upcoming.length === 0) {
    Logger.log('ไม่มี main shift ที่ยังมาไม่ถึง — list ทั้งหมด:');
    myShifts.forEach(function(s) {
      Logger.log('  date=' + s.date + ' pos=' + s.pos + ' range=' + s.range);
    });
    return;
  }

  Logger.log('Upcoming main shifts:');
  upcoming.forEach(function(s) {
    Logger.log('  ' + s.date + ' / pos=' + s.pos + ' / range=' + s.range + ' / room=' + s.room);
  });

  // Build email สำหรับ shift ถัดไป (จำลองว่าเป็น "พรุ่งนี้")
  const next = upcoming[0];
  Logger.log('\n>>> Test queue for next shift: ' + next.date);

  const emailMap = _phxBuildUserEmailMap();
  const myEmail = emailMap[myName];
  if (!myEmail) { Logger.log('no email for ' + myName); return; }

  const content = _phxBuildEveningEmailContent(myName, [next]);
  Logger.log('Subject: ' + content.subject);
  Logger.log('Body:\n' + content.body);

  const now = new Date();
  const rows = [[Utilities.getUuid(), myEmail, content.subject, content.body, 'pending', now, '', '']];
  const n = _phxAppendToEmailQueue(rows);
  Logger.log('\n>>> Queued: ' + n + ' email to ' + myEmail);
  Logger.log('รอ sender drain ภายใน 5 นาที → check Gmail');
}

// ════════════════════════════════════════════════════════════
// Option C — Overlay Sync (frontend pushes effective shifts → backend reads)
// PHX_UserOverlays schema: A=userName, B=monthId, C=shiftsJSON, D=updatedAt
// One row per (userName, monthId).
// ════════════════════════════════════════════════════════════

/**
 * Frontend calls this เมื่อ overlay state เปลี่ยน
 * @param {string} shiftsJSON — JSON array ของ effective shifts (post-overlay) ของ user นี้
 *                              format เหมือน schedule data: {name,date,pos,range,room,timestamp,...}
 */
function phxSyncOverlay(rawName, passwordHash, monthId, shiftsJSON) {
  try {
    const name = String(rawName || '').trim();
    const hash = String(passwordHash || '').trim();
    if (!name || !hash) return { success: false, error: 'ยังไม่ได้ login' };
    if (!monthId) return { success: false, error: 'monthId required' };

    const row = _phxFindPharmacistRow(name);
    if (!row || row.passwordHash !== hash) return { success: false, error: 'ยืนยันตัวตนไม่ผ่าน' };

    let shifts;
    try {
      shifts = (!shiftsJSON || shiftsJSON === '[]') ? [] : JSON.parse(shiftsJSON);
      if (!Array.isArray(shifts)) return { success: false, error: 'shifts must be array' };
    } catch(e) {
      return { success: false, error: 'JSON parse error: ' + e.message };
    }

    const ss = SpreadsheetApp.openById(_f1SpreadsheetId());
    let sh = ss.getSheetByName('PHX_UserOverlays');
    if (!sh) {
      sh = ss.insertSheet('PHX_UserOverlays');
      sh.getRange(1, 1, 1, 4).setValues([['userName', 'monthId', 'shiftsJSON', 'updatedAt']]);
      sh.setFrozenRows(1);
    }

    // Find existing row by (userName, monthId)
    let foundRow = 0;
    if (sh.getLastRow() > 1) {
      const data = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
      for (let i = 0; i < data.length; i++) {
        if (String(data[i][0]).trim() === name && String(data[i][1]).trim() === monthId) {
          foundRow = i + 2;
          break;
        }
      }
    }

    const now = new Date();
    const jsonOut = JSON.stringify(shifts);

    if (foundRow > 0) {
      sh.getRange(foundRow, 3, 1, 2).setValues([[jsonOut, now]]);
    } else {
      sh.appendRow([name, monthId, jsonOut, now]);
    }

    return { success: true, shiftCount: shifts.length };
  } catch(e) {
    console.error('phxSyncOverlay: ' + e.message);
    return { success: false, error: 'เกิดข้อผิดพลาด: ' + e.message };
  }
}

/** Get effective shifts สำหรับ user — return null ถ้าไม่มี (caller fallback to main schedule)
 *  Accepts BOTH backend ID format and frontend label format */
function _phxGetUserOverlayShifts(userName, monthId) {
  try {
    const ss = SpreadsheetApp.openById(_f1SpreadsheetId());
    const sh = ss.getSheetByName('PHX_UserOverlays');
    if (!sh || sh.getLastRow() < 2) return null;

    const candidates = {};
    candidates[monthId] = true;
    const alt = _phxMonthIdToFrontendKey(monthId);
    if (alt && alt !== monthId) candidates[alt] = true;

    const data = sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues();
    let result = null;
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0]).trim() !== userName) continue;
      if (!candidates[String(data[i][1]).trim()]) continue;
      try {
        const parsed = JSON.parse(data[i][2]);
        if (Array.isArray(parsed)) {
          // Prefer non-empty if multiple rows match
          if (parsed.length > 0 || !result) result = parsed;
        }
      } catch(e) { /* skip */ }
    }
    return result;
  } catch(e) {
    Logger.log('[B3b _phxGetUserOverlayShifts] ' + e);
    return null;
  }
}

/** Get all overlay records for a month → {userName: shiftsArray}
 *  Accepts BOTH backend ID format ('m_1781...') and frontend label format ('m_มิถุนายน_2569') */
function _phxGetAllUserOverlaysForMonth(monthId) {
  const result = {};
  try {
    const ss = SpreadsheetApp.openById(_f1SpreadsheetId());
    const sh = ss.getSheetByName('PHX_UserOverlays');
    if (!sh || sh.getLastRow() < 2) return result;

    // Build candidate set — match either backend or frontend key
    const candidates = {};
    candidates[monthId] = true;
    const alt = _phxMonthIdToFrontendKey(monthId);
    if (alt && alt !== monthId) candidates[alt] = true;

    const data = sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues();
    data.forEach(function(row) {
      const name = String(row[0]).trim();
      const mid = String(row[1]).trim();
      if (!name || !candidates[mid]) return;
      try {
        const parsed = JSON.parse(row[2]);
        // Prefer non-empty result (frontend writes empty array บางกรณี)
        if (Array.isArray(parsed) && parsed.length > 0) {
          result[name] = parsed;
        } else if (Array.isArray(parsed) && !result[name]) {
          result[name] = parsed;
        }
      } catch(e) { /* skip */ }
    });
  } catch(e) {
    Logger.log('[B3b _phxGetAllUserOverlaysForMonth] ' + e);
  }
  return result;
}

function testB3b_C_SyncOverlaySample() {
  const hash = _phxHashPassword('ณรพล', 'klui2543');
  // Simulate ณรพล มี overlay shift บน Jun 19 (อก position) — เพิ่มจาก main 6 shifts
  const sample = [
    { name: 'ณรพล', date: '19/06 (ศ.)', timestamp: 20260619, pos: 'อก', range: '08:00-16:00', room: 'IPD' }
  ];
  const r = phxSyncOverlay('ณรพล', hash, 'm_1781304482466579', JSON.stringify(sample));
  Logger.log(JSON.stringify(r, null, 2));
}

function testB3b_C_ReadOverlay() {
  const r = _phxGetUserOverlayShifts('ณรพล', 'm_1781304482466579');
  Logger.log('Overlay for ณรพล:\n' + JSON.stringify(r, null, 2));
}

function testB3b_C_ReadAll() {
  const r = _phxGetAllUserOverlaysForMonth('m_1781304482466579');
  Logger.log('Total overlay users: ' + Object.keys(r).length);
  Object.keys(r).forEach(function(n) {
    Logger.log('  ' + n + ': ' + (r[n] || []).length + ' shifts');
  });
}

/** ลบ overlay ทดสอบออก (sync empty array) */
function testB3b_C_ClearOverlay() {
  const hash = _phxHashPassword('ณรพล', 'klui2543');
  const r = phxSyncOverlay('ณรพล', hash, 'm_1781304482466579', '[]');
  Logger.log(JSON.stringify(r, null, 2));
}

// ════════════════════════════════════════════════════════════
// B3b Option C-3 — Apply overlay shifts to scanner results
// Wrapper pattern: ไม่แตะ scanner เดิม — เพิ่ม layer ด้านบน
// ════════════════════════════════════════════════════════════

// ─── Helpers ───

/** JS Date → YYYYMMDD integer (matches shift.timestamp format) */
function _phxDateToYMD(jsDate) {
  if (!jsDate) return 0;
  return jsDate.getFullYear() * 10000
       + (jsDate.getMonth() + 1) * 100
       + jsDate.getDate();
}

/** Check if shift falls on a specific date (by timestamp) */
function _phxShiftIsOnDate(shift, targetDate) {
  if (!shift || !targetDate) return false;
  if (!shift.timestamp) return false;
  return Number(shift.timestamp) === _phxDateToYMD(targetDate);
}

/** List all monthIds covering [startDate, endDate] inclusive */
function _phxGetMonthIdsForRange(startDate, endDate) {
  const monthIds = [];
  const seen = {};
  const cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const endMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  while (cur.getTime() <= endMonth.getTime()) {
    const mid = _phxDateToMonthId(cur);
    if (mid && !seen[mid]) {
      seen[mid] = true;
      monthIds.push(mid);
    }
    cur.setMonth(cur.getMonth() + 1);
  }
  return monthIds;
}

// ─── Apply functions ───

/**
 * Apply overlay corrections to a by-user-date scan.
 * For each user with overlay record on this month:
 *   - Replace their entry with overlay shifts filtered to target date
 *   - Delete entry if overlay user has no shifts on this date
 */
function _phxApplyOverlaysToScanByDate(byUser, targetDate) {
  if (!byUser) byUser = {};
  if (!targetDate) return byUser;

  const monthId = _phxDateToMonthId(targetDate);
  if (!monthId) {
    Logger.log('[C-3 byDate] no monthId for ' + targetDate);
    return byUser;
  }

  let overlayMap;
  try {
    overlayMap = _phxGetAllUserOverlaysForMonth(monthId);
  } catch(e) {
    Logger.log('[C-3 byDate] overlay fetch err: ' + e.message);
    return byUser;
  }
  if (!overlayMap) return byUser;

  const overlayUserCount = Object.keys(overlayMap).length;
  Logger.log('[C-3 byDate] monthId=' + monthId + ' overlayUsers=' + overlayUserCount);

  Object.keys(overlayMap).forEach(function(userName) {
    const userShifts = overlayMap[userName] || [];
    const onDate = userShifts.filter(function(s) {
      return _phxShiftIsOnDate(s, targetDate);
    });
    if (onDate.length > 0) {
      byUser[userName] = onDate;
    } else {
      delete byUser[userName];
    }
  });

  return byUser;
}

/**
 * Apply overlay corrections to a time-window scan.
 * For users with overlay record:
 *   - Drop their raw shifts from the result
 *   - Add their overlay shifts that fall in [start, end)
 */
function _phxApplyOverlaysToScanInWindow(shifts, startDate, endDate) {
  if (!shifts) shifts = [];
  if (!startDate || !endDate) return shifts;

  const monthIds = _phxGetMonthIdsForRange(startDate, endDate);
  if (monthIds.length === 0) return shifts;

  Logger.log('[C-3 window] monthIds=' + JSON.stringify(monthIds));

  // Aggregate overlay users across all relevant months
  const overlayUsers = {};  // userName → [shifts]
  monthIds.forEach(function(monthId) {
    let map;
    try { map = _phxGetAllUserOverlaysForMonth(monthId); }
    catch(e) { Logger.log('[C-3 window] fetch err ' + monthId + ': ' + e.message); return; }
    if (!map) return;
    Object.keys(map).forEach(function(userName) {
      if (!overlayUsers[userName]) overlayUsers[userName] = [];
      overlayUsers[userName] = overlayUsers[userName].concat(map[userName] || []);
    });
  });

  const overlayUserCount = Object.keys(overlayUsers).length;
  Logger.log('[C-3 window] overlayUsers=' + overlayUserCount);

  // Drop raw shifts for users who have overlay records
  const filtered = shifts.filter(function(s) {
    return s && !overlayUsers[s.name];
  });

  // Add overlay shifts that fall in window
  Object.keys(overlayUsers).forEach(function(userName) {
    const userShifts = overlayUsers[userName] || [];
    userShifts.forEach(function(s) {
      const startTime = _phxParseShiftStartTime(s);
      if (!startTime) return;
      if (startTime >= startDate && startTime < endDate) {
        filtered.push(s);
      }
    });
  });

  return filtered;
}

// ─── Wrapped scanners (overlay-aware) ───

function _phxScanShiftsByUserForDateWithOverlay(targetDate) {
  const byUser = _phxScanShiftsByUserForDate(targetDate);
  return _phxApplyOverlaysToScanByDate(byUser, targetDate);
}

function _phxScanShiftsInTimeWindowWithOverlay(start, end) {
  const shifts = _phxScanShiftsInTimeWindow(start, end);
  return _phxApplyOverlaysToScanInWindow(shifts, start, end);
}

// ─── Test functions ───

function testB3b_C3_DateScanWithOverlay() {
  // Pick a date where ณรพล (already has overlay from C-2) has shifts
  // Adjust if needed — use any date that has overlay records
  const testDate = new Date(2026, 5, 26);  // 26 June 2026 (เวรที่แลกในรูป)
  const monthId = _phxDateToMonthId(testDate);
  Logger.log('=== Date scan WITH overlay ===');
  Logger.log('Test date: ' + testDate.toLocaleDateString() + ' (YMD=' + _phxDateToYMD(testDate) + ')');
  Logger.log('MonthId: ' + monthId);

  const beforeMap = _phxGetAllUserOverlaysForMonth(monthId);
  Logger.log('Overlay users in this month: ' + Object.keys(beforeMap || {}));

  const rawByUser = _phxScanShiftsByUserForDateWithOverlay(testDate);
  Logger.log('RAW scan — users on this date: ' + Object.keys(rawByUser).length);
  Logger.log('RAW ณรพล: ' + JSON.stringify(rawByUser['ณรพล']));

  const withOverlay = _phxScanShiftsByUserForDateWithOverlay(testDate);
  Logger.log('WITH overlay — users on this date: ' + Object.keys(withOverlay).length);
  Logger.log('OVERLAY ณรพล: ' + JSON.stringify(withOverlay['ณรพล']));

  return {
    monthId: monthId,
    rawCount: Object.keys(rawByUser).length,
    overlayCount: Object.keys(withOverlay).length,
    rawNorapol: rawByUser['ณรพล'],
    overlayNorapol: withOverlay['ณรพล']
  };
}

function testB3b_C3_WindowScanWithOverlay() {
  // 24-hour window covering test date
  const start = new Date(2026, 5, 26, 0, 0, 0);
  const end = new Date(2026, 5, 27, 0, 0, 0);
  Logger.log('=== Window scan WITH overlay ===');
  Logger.log('Window: ' + start + ' → ' + end);

  const rawShifts = _phxScanShiftsInTimeWindowWithOverlay(start, end);
  Logger.log('RAW window count: ' + rawShifts.length);

  const withOverlay = _phxScanShiftsInTimeWindowWithOverlay(start, end);
  Logger.log('OVERLAY window count: ' + withOverlay.length);
  Logger.log('Sample (first 3): ' + JSON.stringify(withOverlay.slice(0, 3)));

  return { rawCount: rawShifts.length, overlayCount: withOverlay.length };
}

function testB3b_C3_NoOverlayMonth() {
  // Scan a month/date with no overlay records → should match raw scan exactly
  const testDate = new Date(2026, 10, 15);  // Nov 15 — likely no overlay
  Logger.log('=== No-overlay test ===');
  const raw = _phxScanShiftsByUserForDateWithOverlay(testDate);
  const wrapped = _phxScanShiftsByUserForDateWithOverlay(testDate);
  const same = JSON.stringify(raw) === JSON.stringify(wrapped);
  Logger.log('Raw vs wrapped identical: ' + same);
  return { identical: same, rawCount: Object.keys(raw).length, wrappedCount: Object.keys(wrapped).length };
}

// ════════════════════════════════════════════════════════════
// B3b Patch 3 — Hourly trigger + retry with exponential backoff
// ════════════════════════════════════════════════════════════

const PHX_B3B_TRIGGER_FN = 'phxB3bHourlyTrigger';
const PHX_B3B_RETRY_FN = 'phxB3bRetryTrigger';
const PHX_B3B_RETRY_PROP_KEY = 'phxB3bRetryState';
const PHX_B3B_MAX_RETRIES = 5;
const PHX_B3B_BACKOFF_MINS = [1, 2, 4, 8, 16];  // total = 31 min

/** Main trigger entry — fires every 1 minute (handler name คงไว้สำหรับ trigger UID compat) */
function phxB3bHourlyTrigger() {
  const startTime = new Date();
  const currentHour = parseInt(Utilities.formatDate(startTime, 'Asia/Bangkok', 'HH'), 10);
  const currentMin = parseInt(Utilities.formatDate(startTime, 'Asia/Bangkok', 'mm'), 10);
  const hhmm = String(currentHour).padStart(2,'0') + ':' + String(currentMin).padStart(2,'0');
  // ไม่ log ทุกนาที — silent unless มี queue หรือ error

  const results = {
    timestamp: startTime.toISOString(),
    hour: currentHour,
    minute: currentMin,
    evening: null,
    hoursBefore: null,
    success: true,
    errors: []
  };

  try {
    results.evening = _phxQueueEveningReminders(currentHour, currentMin);
    if (results.evening.queued > 0) {
      Logger.log('[B3b ' + hhmm + '] evening queued ' + results.evening.queued + ': ' + JSON.stringify(results.evening));
    }
  } catch(e) {
    results.success = false;
    results.errors.push('evening: ' + e.message);
    Logger.log('[B3b ' + hhmm + '] evening FAILED: ' + e.message);
  }

  try {
    results.hoursBefore = _phxQueueHoursBeforeReminders(startTime, true);  // tight=true
    if (results.hoursBefore.queued > 0) {
      Logger.log('[B3b ' + hhmm + '] hoursBefore queued ' + results.hoursBefore.queued + ': ' + JSON.stringify(results.hoursBefore));
    }
  } catch(e) {
    results.success = false;
    results.errors.push('hoursBefore: ' + e.message);
    Logger.log('[B3b ' + hhmm + '] hoursBefore FAILED: ' + e.message);
  }

  if (results.success) {
    _phxClearRetryState();
    // ไม่ log DONE — silent
  } else {
    Logger.log('=== B3b FAILED at ' + hhmm + ' — scheduling retry ===');
    _phxScheduleRetry(currentHour, currentMin, 0);
  }

  return results;
}

/** Retry trigger entry — fires after backoff delay */
function phxB3bRetryTrigger() {
  const state = _phxGetRetryState();
  if (!state) {
    Logger.log('[B3b retry] no state — abort');
    return;
  }
  const nextAttempt = state.attempt + 1;
  const origHHMM = String(state.originalHour).padStart(2,'0') + ':' +
                   String(state.originalMin || 0).padStart(2,'0');
  Logger.log('=== B3b RETRY attempt ' + nextAttempt + '/' + PHX_B3B_MAX_RETRIES +
              ' | original=' + origHHMM + ' ===');

  const results = { evening: null, hoursBefore: null, success: true, errors: [] };
  try {
    // Retry ใช้ original HH:MM — reproduce slot ที่ miss
    results.evening = _phxQueueEveningReminders(state.originalHour, state.originalMin);
  } catch(e) { results.success = false; results.errors.push('evening: ' + e.message); }
  try {
    // hours-before: ใช้ now ปัจจุบัน + tight window (best-effort — slot อาจ pass ไปแล้ว)
    results.hoursBefore = _phxQueueHoursBeforeReminders(new Date(), true);
  } catch(e) { results.success = false; results.errors.push('hoursBefore: ' + e.message); }

  if (results.success) {
    Logger.log('=== B3b retry SUCCESS on attempt ' + nextAttempt + ' ===');
    _phxClearRetryState();
  } else if (nextAttempt >= PHX_B3B_MAX_RETRIES) {
    Logger.log('=== B3b retry GAVE UP after ' + PHX_B3B_MAX_RETRIES + ' attempts ===');
    Logger.log('Final errors: ' + JSON.stringify(results.errors));
    _phxClearRetryState();
  } else {
    Logger.log('=== B3b retry attempt ' + nextAttempt + ' FAILED — scheduling next ===');
    _phxScheduleRetry(state.originalHour, state.originalMin, nextAttempt);
  }
}

function _phxScheduleRetry(originalHour, originalMin, attemptCount) {
  if (attemptCount >= PHX_B3B_MAX_RETRIES) {
    Logger.log('[B3b] max retries — abort');
    _phxClearRetryState();
    return;
  }
  const delayMins = PHX_B3B_BACKOFF_MINS[attemptCount];
  Logger.log('[B3b] scheduling retry #' + (attemptCount + 1) + ' in ' + delayMins + ' min');

  _phxSaveRetryState({
    originalHour: originalHour,
    originalMin: originalMin,
    attempt: attemptCount,
    scheduledAt: new Date().toISOString()
  });
  _phxRemoveRetryTriggers();
  ScriptApp.newTrigger(PHX_B3B_RETRY_FN)
    .timeBased()
    .after(delayMins * 60 * 1000)
    .create();
}

function _phxGetRetryState() {
  try {
    const json = PropertiesService.getScriptProperties().getProperty(PHX_B3B_RETRY_PROP_KEY);
    return json ? JSON.parse(json) : null;
  } catch(e) { return null; }
}

function _phxSaveRetryState(state) {
  try {
    PropertiesService.getScriptProperties().setProperty(PHX_B3B_RETRY_PROP_KEY, JSON.stringify(state));
  } catch(e) { Logger.log('[B3b] save state err: ' + e.message); }
}

function _phxClearRetryState() {
  try { PropertiesService.getScriptProperties().deleteProperty(PHX_B3B_RETRY_PROP_KEY); }
  catch(e) {}
}

function _phxRemoveRetryTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === PHX_B3B_RETRY_FN) ScriptApp.deleteTrigger(t);
  });
}

// ─── Admin functions ───

/** Install trigger — run ONCE (admin). Trigger fires every 1 minute. */
function phxB3bInstallTrigger() {
  phxB3bUninstallTrigger();  // clean first
  ScriptApp.newTrigger(PHX_B3B_TRIGGER_FN).timeBased().everyMinutes(1).create();
  Logger.log('✓ B3b minute trigger installed (every 1 min)');
  phxB3bStatus();
}

/** Remove all B3b triggers (admin) */
function phxB3bUninstallTrigger() {
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(function(t) {
    const fn = t.getHandlerFunction();
    if (fn === PHX_B3B_TRIGGER_FN || fn === PHX_B3B_RETRY_FN) {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });
  _phxClearRetryState();
  Logger.log('✓ Removed ' + removed + ' B3b trigger(s)');
}

/** Show trigger status */
function phxB3bStatus() {
  const all = ScriptApp.getProjectTriggers().filter(function(t) {
    const fn = t.getHandlerFunction();
    return fn === PHX_B3B_TRIGGER_FN || fn === PHX_B3B_RETRY_FN;
  });
  const retryState = _phxGetRetryState();
  Logger.log('=== B3b Trigger Status ===');
  Logger.log('Active B3b triggers: ' + all.length);
  all.forEach(function(t) {
    Logger.log('  ' + t.getHandlerFunction() + ' | uid=' + t.getUniqueId());
  });
  Logger.log('Retry state: ' + (retryState ? JSON.stringify(retryState) : 'none'));
  return { count: all.length, retryState: retryState };
}

// ─── Test functions ───

/** Dry-run hourly trigger logic (ไม่ install) */
function testB3b_TriggerDryRun() {
  Logger.log('=== Simulating hourly trigger ===');
  const r = phxB3bHourlyTrigger();
  Logger.log('--- Result ---');
  Logger.log(JSON.stringify(r, null, 2));
}

/** Test retry scheduling (จะมี trigger 1 ตัวรออยู่ — clean ด้วย phxB3bUninstallTrigger) */
function testB3b_RetryFlow() {
  Logger.log('=== Test retry scheduling ===');
  _phxClearRetryState();
  _phxScheduleRetry(18, 0);  // simulate failure at hour 18
  Logger.log('State after schedule:');
  Logger.log(JSON.stringify(_phxGetRetryState(), null, 2));
  phxB3bStatus();
  Logger.log('\n⚠️ มี retry trigger รออยู่ — รัน phxB3bUninstallTrigger() เพื่อล้าง');
}

/**
 * End-to-end smoke test — ไม่ต้องตั้งเวลาตรงชั่วโมงปัจจุบัน
 * Usage: testB3b_FullPipelineSmoke('ณรพล')  // override hour จะใช้เวลาที่ตั้งไว้ใน col F
 */
function testB3b_FullPipelineSmoke(targetName) {
  targetName = targetName || 'ณรพล';
  Logger.log('=== B3b Full Pipeline Smoke Test ===');
  Logger.log('Target: ' + targetName);

  // 1. อ่าน setting ปัจจุบันของ user
  const ss = SpreadsheetApp.openById('1V1Fo4rEadSYfqLDc1sZEE-fRtZ4Je5_30_EAclO3KHM');
  const sheet = ss.getSheetByName('PHX_Pharmacists');
  const data = sheet.getDataRange().getValues();
  let row = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === targetName) { row = i; break; }
  }
  if (row < 0) { Logger.log('❌ ไม่พบ ' + targetName); return; }

  const eveningTime = String(data[row][5] || '').trim();  // col F
  const hoursBefore = String(data[row][6] || '').trim();  // col G
  Logger.log('Settings — evening: "' + eveningTime + '" | hours-before: "' + hoursBefore + '"');

  if (!eveningTime && !hoursBefore) {
    Logger.log('⚠️ ยังไม่ได้ตั้ง reminder — เปิด modal ตั้งก่อนแล้วรันใหม่');
    return;
  }

  // 2. รัน evening queue ด้วย hour จาก setting (bypass current hour)
  if (eveningTime) {
    const hour = parseInt(eveningTime.split(':')[0], 10);
    Logger.log('--- Running evening queue with override hour=' + hour + ' ---');
    const r1 = _phxQueueEveningReminders(hour);
    Logger.log('evening result: ' + JSON.stringify(r1));
  }

  // 3. รัน hours-before queue (ใช้ new Date() เป็น "now" — scan window = now ± 30min ของ leadHours)
  if (hoursBefore) {
    const now = new Date();
    Logger.log('--- Running hours-before window scan (now=' + now.toISOString() + ') ---');
    const r2 = _phxQueueHoursBeforeReminders(now);
    Logger.log('hoursBefore result: ' + JSON.stringify(r2));
  }

  // 4. ตรวจ PHX_EmailQueue
  const qSheet = ss.getSheetByName('PHX_EmailQueue');
  const qData = qSheet ? qSheet.getDataRange().getValues() : [];
  Logger.log('--- PHX_EmailQueue rows: ' + (qData.length - 1) + ' ---');
  if (qData.length > 1) {
    // โชว์ 3 แถวล่าสุด
    const recent = qData.slice(Math.max(1, qData.length - 3));
    recent.forEach((r, i) => Logger.log('  row ' + (qData.length - recent.length + i) + ': ' + JSON.stringify(r)));
  }

  Logger.log('=== Done — ตรวจ inbox + ตรวจ PHX_EmailQueue ใน Sheet ===');
  Logger.log('ขั้นถัดไป: รัน flush queue function เพื่อส่ง email จริง');
}

function _phxNukeAllB3b() {
  const triggers = ScriptApp.getProjectTriggers();
  let removed = 0;
  triggers.forEach(function(t) {
    const fn = t.getHandlerFunction();
    if (fn === 'phxB3bHourlyTrigger' || fn === 'phxB3bRetryTrigger') {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });
  PropertiesService.getScriptProperties().deleteProperty('phxB3bRetryState');
  Logger.log('✓ Nuked ' + removed + ' B3b triggers + cleared retry state');
}

/**
 * Auto-find ที่ apply overlay เหมือน production code
 * Usage: testB3b_AutoFindAndQueueWithOverlay()
 *        testB3b_AutoFindAndQueueWithOverlay('ชื่ออื่น')
 */
function testB3b_AutoFindAndQueueWithOverlay(targetName) {
  targetName = targetName || 'ณรพล';
  const monthId = 'm_1781304482466579';
  Logger.log('=== Auto-find WITH overlay ===');
  Logger.log('Target: ' + targetName + ' | monthId: ' + monthId);

  // 1. ดึง effective shifts — overlay ก่อน, fallback เป็น raw
  let myShifts = null;
  const overlay = _phxGetUserOverlayShifts(targetName, monthId);
  if (overlay && overlay.length > 0) {
    myShifts = overlay;
    Logger.log('Source: OVERLAY (effective shifts) — ' + overlay.length + ' shifts');
  } else {
    const res = getScheduleData(monthId);
    if (!res || !res.schedule) { Logger.log('❌ no schedule data'); return; }
    myShifts = res.schedule.filter(function(s) { return s.name === targetName; });
    Logger.log('Source: RAW schedule (no overlay record) — ' + myShifts.length + ' shifts');
  }

  if (myShifts.length === 0) {
    Logger.log('❌ ' + targetName + ' ไม่มีเวรในเดือนนี้');
    return;
  }

  // 2. Filter ถัดไป + sort
  const todayTs = parseInt(Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMdd'), 10);
  Logger.log('todayTs: ' + todayTs);
  const upcoming = myShifts.filter(function(s) { return s.timestamp && s.timestamp >= todayTs; });
  upcoming.sort(function(a, b) { return a.timestamp - b.timestamp; });

  Logger.log('All ' + myShifts.length + ' shifts:');
  myShifts.slice().sort(function(a, b) { return (a.timestamp || 0) - (b.timestamp || 0); }).forEach(function(s) {
    const mark = (s.timestamp && s.timestamp >= todayTs) ? '→' : '  ';
    Logger.log('  ' + mark + ' ts=' + s.timestamp + ' date=' + s.date + ' pos=' + s.pos + ' range=' + s.range);
  });

  if (upcoming.length === 0) {
    Logger.log('❌ ไม่มี shift ที่ยังมาไม่ถึง');
    return;
  }

  Logger.log('\nUpcoming (' + upcoming.length + '):');
  upcoming.forEach(function(s) {
    Logger.log('  ' + s.date + ' / pos=' + s.pos + ' / range=' + s.range + ' / room=' + s.room);
  });

  // 3. Queue email สำหรับ shift ถัดไป
  const next = upcoming[0];
  Logger.log('\n>>> Test queue for next shift: ' + next.date);

  const emailMap = _phxBuildUserEmailMap();
  const myEmail = emailMap[targetName];
  if (!myEmail) { Logger.log('❌ no email for ' + targetName); return; }

  const content = _phxBuildEveningEmailContent(targetName, [next]);
  Logger.log('Subject: ' + content.subject);
  Logger.log('Body:\n' + content.body);

  const rows = [[Utilities.getUuid(), myEmail, content.subject, content.body, 'pending', new Date(), '', '']];
  const n = _phxAppendToEmailQueue(rows);
  Logger.log('\n>>> Queued: ' + n + ' email to ' + myEmail);
  Logger.log('รอ sender drain ภายใน 5 นาที → check Gmail');
}

function testB3b_C_CheckOverlayStatus() {
  const ss = SpreadsheetApp.openById('1V1Fo4rEadSYfqLDc1sZEE-fRtZ4Je5_30_EAclO3KHM');
  const sh = ss.getSheetByName('PHX_UserOverlays');
  if (!sh) {
    Logger.log('❌ Sheet PHX_UserOverlays ยังไม่มี — frontend ยังไม่เคย push เลย');
    return;
  }
  if (sh.getLastRow() < 2) {
    Logger.log('⚠️ Sheet มีอยู่แต่ไม่มี data — frontend ยังไม่ push');
    return;
  }
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();
  Logger.log('Total rows: ' + data.length);
  data.forEach(function(row, i) {
    const name = String(row[0]).trim();
    const mid = String(row[1]).trim();
    const json = String(row[2]);
    let count = 0;
    try { count = JSON.parse(json).length; } catch(e) {}
    Logger.log('  [' + (i+2) + '] ' + name + ' | ' + mid + ' | ' + count + ' shifts | updated=' + row[3]);
  });
}

function debugB3b_DumpOverlay() {
  const ss = SpreadsheetApp.openById('1V1Fo4rEadSYfqLDc1sZEE-fRtZ4Je5_30_EAclO3KHM');
  const sh = ss.getSheetByName('PHX_UserOverlays');
  if (!sh || sh.getLastRow() < 2) { Logger.log('No data'); return; }
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();
  data.forEach(function(row, i) {
    Logger.log('=== Row ' + (i+2) + ': ' + row[0] + ' | ' + row[1] + ' | updated=' + row[3] + ' ===');
    try {
      const parsed = JSON.parse(row[2]);
      Logger.log('Shifts (' + parsed.length + '):');
      parsed.forEach(function(s) {
        Logger.log('  ts=' + s.timestamp + ' date=' + s.date + ' pos=' + s.pos + ' range=' + s.range);
      });
    } catch(e) { Logger.log('Parse err: ' + e.message); }
  });
}

// ════════════════════════════════════════════════════════════
// 🔔 F1 — Announce Channels (LINE always-on, Email opt-out)
// col H = announceChannels CSV: "" (default both) | "line" | "line,email"
// ════════════════════════════════════════════════════════════

function phxGetAnnounceChannels(rawName, passwordHash) {
  try {
    const name = String(rawName || '').trim();
    const hash = String(passwordHash || '').trim();
    const row = _phxFindPharmacistRow(name);
    if (!row || row.passwordHash !== hash) return { success: false, error: 'auth' };

    const sh = _phxGetSheet('PHX_Pharmacists');
    const raw = String(sh.getRange(row.rowIndex, 8).getValue() || '').trim().toLowerCase();
    // Default empty = both opted in
    const emailOn = !raw || raw.indexOf('email') >= 0;
    return { success: true, channels: raw, emailOn: emailOn };
  } catch (e) {
    return { success: false, error: String(e.message || e) };
  }
}

function phxSetAnnounceChannels(rawName, passwordHash, channelsCSV) {
  try {
    const name = String(rawName || '').trim();
    const hash = String(passwordHash || '').trim();
    const raw = String(channelsCSV || '').trim().toLowerCase();
    if (!name || !hash) return { success: false, error: 'ยังไม่ได้ login' };

    // Validate whitelist (LINE always-on by design — แต่รับ "" ไว้เผื่อ unset)
    const valid = ['', 'line', 'line,email', 'email,line', 'email'];
    if (valid.indexOf(raw) < 0) {
      return { success: false, error: 'invalid channels: ' + raw };
    }

    const row = _phxFindPharmacistRow(name);
    if (!row) return { success: false, error: 'ไม่พบชื่อในระบบ' };
    if (row.passwordHash !== hash) return { success: false, error: 'ยืนยันตัวตนไม่ผ่าน' };

    // Normalize: "email,line" → "line,email"
    let normalized = raw;
    if (raw === 'email,line') normalized = 'line,email';

    const sh = _phxGetSheet('PHX_Pharmacists');
    if (String(sh.getRange(1, 8).getValue() || '').trim() !== 'announceChannels') {
      sh.getRange(1, 8).setValue('announceChannels');
    }
    sh.getRange(row.rowIndex, 8).setNumberFormat('@').setValue(normalized);

    const emailOn = !normalized || normalized.indexOf('email') >= 0;
    return {
      success: true,
      channels: normalized,
      emailOn: emailOn,
      message: 'บันทึกการตั้งค่าแล้ว'
    };
  } catch (e) {
    console.error('phxSetAnnounceChannels: ' + e.message);
    return { success: false, error: 'เกิดข้อผิดพลาด: ' + e.message };
  }
}

/**
 * F1 — Recipients filtered by opt-out (col H = "line" → skip email)
 * Default (empty col H) = email ON. Mirror pattern of _phxGetNotifyRecipients
 * but exclude opted-out users.
 */
function _phxGetAnnounceEmailRecipients() {
  const backups = {};
  const optedOut = {};
  try {
    const ss = SpreadsheetApp.openById(_f1SpreadsheetId());
    const sh = ss.getSheetByName('PHX_Pharmacists');
    if (sh && sh.getLastRow() > 1) {
      const lastCol = Math.max(8, sh.getLastColumn());
      const data = sh.getRange(2, 1, sh.getLastRow() - 1, lastCol).getValues();
      for (let i = 0; i < data.length; i++) {
        const name = String(data[i][0] || '').trim();
        const backup = String(data[i][4] || '').trim();
        const channels = String(data[i][7] || '').trim().toLowerCase();
        if (!name) continue;
        if (backup && backup.indexOf('@') >= 0) backups[name] = backup;
        // Empty channels = default = email ON. ถ้ามี value แต่ไม่มี "email" = opted out
        if (channels && channels.indexOf('email') < 0) optedOut[name] = true;
      }
    }
  } catch(e) {
    Logger.log('[F1 _phxGetAnnounceEmailRecipients] read err: ' + e);
  }

  const primaries = _phxGetBroadcastRecipients();
  const result = [];
  const seenEmails = {};
  primaries.forEach(function(p) {
    if (optedOut[p.name]) return;
    const targetEmail = backups[p.name] || p.email;
    if (!seenEmails[targetEmail]) {
      seenEmails[targetEmail] = true;
      result.push({
        name: p.name,
        email: targetEmail,
        kind: backups[p.name] ? 'backup' : 'primary'
      });
    }
  });
  return result;
}

// ─── F1 tests ───

function testF1_AnnounceChannelsCycle() {
  const hash = _phxHashPassword('ณรพล', 'klui2543');
  Logger.log('--- GET initial ---');
  Logger.log(JSON.stringify(phxGetAnnounceChannels('ณรพล', hash), null, 2));

  Logger.log('--- SET to "line" (opt-out email) ---');
  Logger.log(JSON.stringify(phxSetAnnounceChannels('ณรพล', hash, 'line'), null, 2));

  Logger.log('--- SET back to "line,email" ---');
  Logger.log(JSON.stringify(phxSetAnnounceChannels('ณรพล', hash, 'line,email'), null, 2));

  Logger.log('--- SET invalid "foo" ---');
  Logger.log(JSON.stringify(phxSetAnnounceChannels('ณรพล', hash, 'foo'), null, 2));

  Logger.log('--- GET final ---');
  Logger.log(JSON.stringify(phxGetAnnounceChannels('ณรพล', hash), null, 2));
}

function testF1_RecipientFilter() {
  const r1 = _phxGetNotifyRecipients();
  const r2 = _phxGetAnnounceEmailRecipients();
  Logger.log('Old (all): ' + r1.length);
  Logger.log('New (opt-out filtered): ' + r2.length);
  Logger.log('Diff: ' + (r1.length - r2.length) + ' users opted out');
  // List opted-out names
  const optedNames = {};
  r1.forEach(function(p) { optedNames[p.name] = true; });
  r2.forEach(function(p) { delete optedNames[p.name]; });
  Logger.log('Opted-out users: ' + Object.keys(optedNames).join(', '));
}

function testF1_CheckQueue() {
  const ss = SpreadsheetApp.openById('1V1Fo4rEadSYfqLDc1sZEE-fRtZ4Je5_30_EAclO3KHM');
  const sh = ss.getSheetByName('PHX_EmailQueue');
  if (!sh) { Logger.log('❌ PHX_EmailQueue sheet not found'); return; }
  const last = sh.getLastRow();
  Logger.log('Total rows: ' + (last - 1));
  if (last < 2) return;
  // Show last 3 rows
  const start = Math.max(2, last - 2);
  const data = sh.getRange(start, 1, last - start + 1, 8).getValues();
  data.forEach(function(r, i) {
    Logger.log('row ' + (start + i) + ': to=' + r[1] + ' | subj=' + r[2].substring(0, 40) + ' | status=' + r[4] + ' | created=' + r[5] + ' | sentAt=' + r[6] + ' | err=' + r[7]);
  });
}

function testF1_VerifyPatchedFuncs() {
  // Patch 2 verification — phxAnnounceNewMonth (manual) ต้องเรียก _phxGetAnnounceEmailRecipients
  const src1 = phxAnnounceNewMonth.toString();
  const p2Applied = src1.indexOf('_phxGetAnnounceEmailRecipients') >= 0;
  Logger.log('Patch 2 (manual) applied: ' + p2Applied);

  // Patch 3 verification — phxAnnounceNewMonthInternal (auto) ต้องเรียก _phxGetAnnounceEmailRecipients แทน _phxGetNotifyRecipients
  const src2 = phxAnnounceNewMonthInternal.toString();
  const p3Applied = src2.indexOf('_phxGetAnnounceEmailRecipients') >= 0;
  Logger.log('Patch 3 (auto) applied: ' + p3Applied);

  Logger.log('--- 1st 500 chars of manual ---');
  Logger.log(src1.substring(0, 500));
}

// ════════════════════════════════════════════════════════════
// 🔔 ICS VALARM helper — no-auth getter for col F/G
// ใช้โดย Code.gs `_buildICS` เพื่อสร้าง VALARM ตาม user settings
// ════════════════════════════════════════════════════════════

/**
 * Read reminder settings by name (no auth — for ICS endpoint)
 * Returns {eveningTime: 'HH:MM'|'', hoursBefore: '1-24'|''} or null
 */
function _phxGetUserReminderSettings(rawName) {
  try {
    const name = String(rawName || '').trim();
    if (!name) return null;

    const sh = _phxGetSheet('PHX_Pharmacists');
    if (!sh || sh.getLastRow() < 2) return null;

    const data = sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues();
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0] || '').trim() !== name) continue;

      // col F (index 5) — defensive Date handling
      let eveningTime = data[i][5];
      if (eveningTime instanceof Date) {
        eveningTime = Utilities.formatDate(eveningTime, Session.getScriptTimeZone(), 'HH:mm');
      } else {
        eveningTime = String(eveningTime || '').trim();
      }

      // col G (index 6)
      const hoursBefore = String(data[i][6] || '').trim();

      return { eveningTime: eveningTime, hoursBefore: hoursBefore };
    }
    return null;
  } catch(e) {
    Logger.log('[_phxGetUserReminderSettings] ' + e);
    return null;
  }
}

function testA1_GetSettings() {
  Logger.log('--- ณรพล ---');
  Logger.log(JSON.stringify(_phxGetUserReminderSettings('ณรพล'), null, 2));
  Logger.log('--- (ไม่มีใน sheet) ---');
  Logger.log(JSON.stringify(_phxGetUserReminderSettings('XYZ_NONE_USER'), null, 2));
}