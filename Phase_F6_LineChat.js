/**
 * Phase F6: LINE Chat Commands — schedule queries + structured-command shift swap (v3.54)
 *
 * Entry point (called from Phase_F2_LINE.js for 1:1 messages from an already-LINE-linked
 * pharmacist — see _phxFindPharmacistRowByLineUserId in Phase_F4_LineIdentity.js):
 *
 *   _phxLineRouteCommand(pharmacist, text) → reply string
 *
 * Commands:
 *   "เวรวันนี้" / "เวรพรุ่งนี้"                     — Phase 2, read-only, always on
 *   "แลก <วันที่ของฉัน> กับ <ชื่อ> <วันที่ของเขา>"   — Phase 3, gated by LINE_CHAT_SWAP_ENABLED
 *   "ยืนยัน" / "ยกเลิก"                              — confirm/cancel a pending swap intent
 *
 * No LLM/free-text parsing — every command must match a fixed structured pattern. This keeps
 * the feature shippable without a decision on LLM provider/cost/privacy (tracked separately;
 * see HANDOFF_v3.53_llm_swap_assist_design.md for a possible future Phase 4 built on top of
 * this same two-step-confirm flow).
 *
 * Sheet: PHX_LineChatState — one row per swap intent (pending/confirmed/cancelled/expired/stale)
 *   Columns: lineUserId | name | pendingIntentJson | createdAt | expiresAt | status
 *
 * Requires: Phase_F4_LineIdentity.js (_phxFindPharmacistRow, reverse lookup)
 *           Phase_PathB_Global.js (phxGetAllActiveOverlaysForMonth, _phxApplyOverlaysGlobally, _phxPBKey)
 *           Phase_Z_B3_Sync.js (_phxWriteOverlayActionsInternal)
 *           Phase_G_AuditLog.js (phxLogAuditSystem)
 *           Phase_F2_LINE.js (_phxLinePushText)
 *           code.js (getScheduleData, getAvailableMonths, monthKeyFromLabel_)
 */

var _F6_CHAT_STATE_SHEET = 'PHX_LineChatState';
var _F6_PENDING_TTL_MS = 5 * 60 * 1000; // 5 minutes
var _F6_SWAP_ENABLED_PROP = 'LINE_CHAT_SWAP_ENABLED';
var _F6_THAI_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
                        'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
var _F6_SWAP_RE = /^แลก\s+(\d{1,2})\s+กับ\s+(.+?)\s+(\d{1,2})$/;

// ════════════════════════════════════════════════════════════
// 🌐 Top-level dispatcher — called from Phase_F2_LINE.js
// ════════════════════════════════════════════════════════════
function _phxLineRouteCommand(pharmacist, text) {
  var trimmed = String(text || '').trim();

  if (trimmed === 'ยืนยัน') return _phxLineHandleConfirm_(pharmacist);
  if (trimmed === 'ยกเลิก') return _phxLineHandleCancel_(pharmacist);
  if (trimmed === 'เวรวันนี้') return _phxLineHandleScheduleQuery_(pharmacist, 0);
  if (trimmed === 'เวรพรุ่งนี้') return _phxLineHandleScheduleQuery_(pharmacist, 1);

  var swapParsed = _phxLineParseSwapCommand_(trimmed);
  if (swapParsed) return _phxLineHandleSwapCommand_(pharmacist, swapParsed);

  return 'สวัสดีครับคุณ ' + pharmacist.name + '\n' +
         'พิมพ์ "เวรวันนี้" หรือ "เวรพรุ่งนี้" เพื่อดูเวร\n' +
         'หรือ "แลก <วันที่ของคุณ> กับ <ชื่อ> <วันที่ของเขา>" เพื่อขอแลกเวร เช่น "แลก 20 กับ ตี๋ 22"';
}

// ════════════════════════════════════════════════════════════
// Phase 2 — read-only schedule query
// ════════════════════════════════════════════════════════════
function _phxLineHandleScheduleQuery_(pharmacist, dayOffset) {
  var tz = 'Asia/Bangkok';
  var target = new Date(Date.now() + dayOffset * 86400000);
  var targetTs = Utilities.formatDate(target, tz, 'yyyyMMdd');

  var monthEntry = _phxLineFindCurrentScheduleMonthId_();
  if (!monthEntry) return '⚠️ ไม่พบตารางเวรของเดือนนี้ในระบบ';

  var consensus = _phxLineGetConsensusSchedule_(monthEntry);
  if (!consensus) return '⚠️ โหลดตารางเวรไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';

  var mine = consensus.shifts.filter(function(s) {
    return String(s.name || '').trim() === pharmacist.name && String(s.timestamp || '') === targetTs;
  });

  var label = dayOffset === 0 ? 'วันนี้' : 'พรุ่งนี้';
  if (mine.length === 0) return '📅 ' + label + ' คุณไม่มีเวรครับ';

  var lines = mine.map(function(s) {
    return '• ' + s.pos + ' ' + s.range + (s.room ? ' (' + s.room + ')' : '');
  });
  return '📅 เวร' + label + 'ของคุณ ' + pharmacist.name + ':\n' + lines.join('\n');
}

// ════════════════════════════════════════════════════════════
// Phase 3 — structured-command swap
// ════════════════════════════════════════════════════════════
function _phxLineParseSwapCommand_(text) {
  var m = String(text || '').trim().match(_F6_SWAP_RE);
  if (!m) return null;
  var myDay = parseInt(m[1], 10);
  var partnerDay = parseInt(m[3], 10);
  if (isNaN(myDay) || myDay < 1 || myDay > 31) return null;
  if (isNaN(partnerDay) || partnerDay < 1 || partnerDay > 31) return null;
  return { myDay: myDay, partnerName: m[2].trim(), partnerDay: partnerDay };
}

function _phxLineHandleSwapCommand_(pharmacist, parsed) {
  var flagOn = (PropertiesService.getScriptProperties().getProperty(_F6_SWAP_ENABLED_PROP) || '') === 'true';
  if (!flagOn) return 'ฟีเจอร์แลกเวรผ่านแชทยังไม่เปิดใช้งาน กรุณาใช้หน้าเว็บแอปแทนก่อนนะครับ';

  var monthEntry = _phxLineFindCurrentScheduleMonthId_();
  if (!monthEntry) return '⚠️ ไม่พบตารางเวรของเดือนนี้ในระบบ';

  var consensus = _phxLineGetConsensusSchedule_(monthEntry);
  if (!consensus) return '⚠️ โหลดตารางเวรไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';

  var mine = _phxLineResolveShiftsByDay_(consensus.shifts, pharmacist.name, parsed.myDay);
  if (mine.length === 0) return '❌ ไม่พบเวรของคุณวันที่ ' + parsed.myDay;
  if (mine.length > 1) {
    return '⚠️ วันที่ ' + parsed.myDay + ' คุณมีหลายเวร (' + mine.map(function(s) { return s.pos; }).join(', ') +
           ') — กรุณาใช้หน้าเว็บแอปเพื่อเลือกเวรที่ต้องการแลกให้ชัดเจน';
  }

  var partnerName = _phxLineResolvePartnerName_(parsed.partnerName, consensus.shifts);
  if (!partnerName) return '❌ ไม่พบชื่อ "' + parsed.partnerName + '" ในตารางเวรเดือนนี้ (พิมพ์ชื่อให้ตรงกับตารางเวร)';

  var theirs = _phxLineResolveShiftsByDay_(consensus.shifts, partnerName, parsed.partnerDay);
  if (theirs.length === 0) return '❌ ไม่พบเวรของ ' + partnerName + ' วันที่ ' + parsed.partnerDay;
  if (theirs.length > 1) {
    return '⚠️ วันที่ ' + parsed.partnerDay + ' ของ ' + partnerName + ' มีหลายเวร — กรุณาใช้หน้าเว็บแอปเพื่อเลือกเวรที่ต้องการแลกให้ชัดเจน';
  }

  var myShift = mine[0], partnerShift = theirs[0];
  var myShiftKey = _phxPBKey(myShift.date, myShift.pos, pharmacist.name, myShift.range);
  var partnerShiftKey = _phxPBKey(partnerShift.date, partnerShift.pos, partnerName, partnerShift.range);

  var intent = {
    monthId: consensus.pbMonthId,
    scheduleMonthId: monthEntry.id,
    myName: pharmacist.name,
    myShiftKey: myShiftKey,
    myShiftLabel: myShift.date + ' ' + myShift.pos + ' ' + myShift.range,
    partnerName: partnerName,
    partnerShiftKey: partnerShiftKey,
    partnerShiftLabel: partnerShift.date + ' ' + partnerShift.pos + ' ' + partnerShift.range
  };

  _phxLineSavePendingIntent_(pharmacist.lineUserId, pharmacist.name, intent);

  return '📋 สรุปคำขอแลกเวร:\n' +
         'เวรของคุณ: ' + intent.myShiftLabel + '\n' +
         'แลกกับ: ' + partnerName + ' — ' + intent.partnerShiftLabel + '\n\n' +
         'พิมพ์ "ยืนยัน" เพื่อยืนยัน หรือ "ยกเลิก" เพื่อยกเลิก (คำขอหมดอายุใน 5 นาที)';
}

function _phxLineHandleConfirm_(pharmacist) {
  var pending = _phxLineFindPendingIntent_(pharmacist.lineUserId);
  if (!pending || !pending.intent) return 'ไม่มีคำขอแลกเวรที่รอการยืนยันครับ';
  if (pending.expired) {
    _phxLineSetPendingStatus_(pending.rowIndex, 'expired');
    return '⌛ คำขอหมดอายุแล้ว กรุณาพิมพ์คำสั่งแลกเวรใหม่';
  }

  var intent = pending.intent;

  var list = getAvailableMonths();
  var monthEntry = list.filter(function(m) { return m.id === intent.scheduleMonthId; })[0];
  if (!monthEntry) {
    _phxLineSetPendingStatus_(pending.rowIndex, 'error');
    return '⚠️ ไม่พบตารางเวรเดือนนี้แล้ว — กรุณาลองใหม่';
  }

  // v3.54: re-validate against the LIVE schedule — it may have changed since the parse step
  // (someone else may have swapped/claimed the same shift in the meantime).
  var consensus = _phxLineGetConsensusSchedule_(monthEntry);
  if (!consensus) return '⚠️ โหลดตารางเวรไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';

  var myOk = consensus.shifts.some(function(s) {
    return String(s.name || '').trim() === intent.myName &&
           _phxPBKey(s.date, s.pos, s.name, s.range) === intent.myShiftKey;
  });
  var theirOk = consensus.shifts.some(function(s) {
    return String(s.name || '').trim() === intent.partnerName &&
           _phxPBKey(s.date, s.pos, s.name, s.range) === intent.partnerShiftKey;
  });

  if (!myOk || !theirOk) {
    _phxLineSetPendingStatus_(pending.rowIndex, 'stale');
    return '❌ เวรที่ระบุเปลี่ยนแปลงไปแล้ว (อาจถูกแลก/แก้ไขไปก่อนหน้านี้) — กรุณาพิมพ์คำสั่งแลกเวรใหม่';
  }

  var actionResult = phxCreateSwapAction_(intent.myName, intent.partnerName, intent.monthId,
                                           intent.myShiftKey, intent.partnerShiftKey, 'line');
  if (!actionResult || !actionResult.success) {
    _phxLineSetPendingStatus_(pending.rowIndex, 'error');
    return '❌ บันทึกการแลกเวรไม่สำเร็จ: ' + ((actionResult && actionResult.error) || 'unknown error');
  }

  _phxLineSetPendingStatus_(pending.rowIndex, 'confirmed');

  try {
    phxLogAuditSystem('line_swap', intent.myName, null, {
      partnerName: intent.partnerName,
      myShiftKey: intent.myShiftKey,
      partnerShiftKey: intent.partnerShiftKey,
      actionId: actionResult.actionId
    });
  } catch (e) {}

  // best-effort courtesy notice to partner, only if they've linked LINE too — never blocks the reply
  try {
    var partnerRow = _phxFindPharmacistRow(intent.partnerName);
    if (partnerRow && partnerRow.lineUserId) {
      _phxLinePushText(partnerRow.lineUserId,
        '🔄 ' + intent.myName + ' แลกเวรกับคุณแล้ว: ' + intent.myShiftLabel + ' ↔ ' + intent.partnerShiftLabel);
    }
  } catch (e) {}

  return '✅ แลกเวรสำเร็จ!\n' + intent.myShiftLabel + ' ↔ ' + intent.partnerName + ' (' + intent.partnerShiftLabel + ')';
}

function _phxLineHandleCancel_(pharmacist) {
  var pending = _phxLineFindPendingIntent_(pharmacist.lineUserId);
  if (!pending) return 'ไม่มีคำขอที่รอการยืนยันครับ';
  _phxLineSetPendingStatus_(pending.rowIndex, 'cancelled');
  return '✅ ยกเลิกคำขอแลกเวรแล้ว';
}

// ════════════════════════════════════════════════════════════
// Write path — shared validation + write, callable by both LINE chat (here) and, in the
// future, a refactored Index.html swap flow (not wired up yet — Index.html still writes
// via phxPushActions directly, per the existing draft/publish flow).
// ════════════════════════════════════════════════════════════
function phxCreateSwapAction_(myName, partnerName, monthId, myShiftKey, partnerShiftKey, source) {
  try {
    var action = {
      id: 'line_' + Utilities.getUuid(),
      monthId: monthId,
      action: 'swap',
      shiftKey: myShiftKey,
      partnerShiftKey: partnerShiftKey,
      partnerName: partnerName,
      originalOwner: myName,
      viewerName: myName,
      createdAt: new Date().toISOString(),
      _visibility: 'public',
      _source: source || 'line'
    };
    var result = _phxWriteOverlayActionsInternal(myName, [action]);
    if (!result || !result.success) return { success: false, error: (result && result.error) || 'write failed' };
    return { success: true, actionId: action.id };
  } catch (e) {
    return { success: false, error: String(e.message || e) };
  }
}

// ════════════════════════════════════════════════════════════
// Schedule/consensus helpers
// ════════════════════════════════════════════════════════════
function _phxLineTodayLabel_() {
  var tz = 'Asia/Bangkok';
  var now = new Date();
  var monthIdx = Number(Utilities.formatDate(now, tz, 'M')) - 1;
  var yearBE = Number(Utilities.formatDate(now, tz, 'yyyy')) + 543;
  return _F6_THAI_MONTHS[monthIdx] + ' ' + yearBE;
}

function _phxLineFindCurrentScheduleMonthId_() {
  var label = _phxLineTodayLabel_();
  var list = getAvailableMonths();
  for (var i = 0; i < list.length; i++) {
    if (list[i].label === label) return list[i];
  }
  return list.length > 0 ? list[0] : null; // fallback: most recently synced month
}

function _phxLineGetConsensusSchedule_(monthEntry) {
  var schedData = getScheduleData(monthEntry.id);
  if (!schedData || schedData.error || !Array.isArray(schedData.schedule)) return null;
  var pbMonthId = monthKeyFromLabel_(String(monthEntry.label || '').trim());
  var ovRes = phxGetAllActiveOverlaysForMonth(pbMonthId);
  var overlays = (ovRes && ovRes.ok && Array.isArray(ovRes.overlays)) ? ovRes.overlays : [];
  var consensus = _phxApplyOverlaysGlobally(schedData.schedule, overlays);
  return { pbMonthId: pbMonthId, shifts: consensus };
}

function _phxLineResolveShiftsByDay_(shifts, name, day) {
  var dd = (day < 10 ? '0' : '') + day;
  return shifts.filter(function(s) {
    return String(s.name || '').trim() === name && String(s.timestamp || '').slice(6, 8) === dd;
  });
}

// exact-match only (no fuzzy/nickname matching yet — MVP for the structured-command phase)
function _phxLineResolvePartnerName_(rawName, shifts) {
  var target = String(rawName || '').trim();
  if (!target) return null;
  var found = shifts.some(function(s) { return String(s.name || '').trim() === target; });
  return found ? target : null;
}

// ════════════════════════════════════════════════════════════
// Pending intent storage — one row per swap request, TTL'd
// ════════════════════════════════════════════════════════════
function _phxLineGetChatStateSheet_() {
  var ss = SpreadsheetApp.openById(SCHEDULE_SHEET_ID);
  var sh = ss.getSheetByName(_F6_CHAT_STATE_SHEET);
  if (!sh) {
    sh = ss.insertSheet(_F6_CHAT_STATE_SHEET);
    sh.getRange(1, 1, 1, 6).setValues([['lineUserId', 'name', 'pendingIntentJson', 'createdAt', 'expiresAt', 'status']]);
    sh.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#06c755').setFontColor('#fff');
    sh.setFrozenRows(1);
    sh.hideSheet();
  }
  return sh;
}

function _phxLineSavePendingIntent_(lineUserId, name, intent) {
  var sh = _phxLineGetChatStateSheet_();
  _phxLineClearPendingFor_(sh, lineUserId); // one live pending intent per user at a time
  var now = new Date();
  var expiresAt = new Date(now.getTime() + _F6_PENDING_TTL_MS);
  sh.appendRow([lineUserId, name, JSON.stringify(intent), now, expiresAt, 'pending']);
}

function _phxLineClearPendingFor_(sh, lineUserId) {
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return;
  var data = sh.getRange(2, 1, lastRow - 1, 6).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === lineUserId && String(data[i][5]).trim() === 'pending') {
      sh.getRange(i + 2, 6).setValue('superseded');
    }
  }
}

function _phxLineFindPendingIntent_(lineUserId) {
  var sh = _phxLineGetChatStateSheet_();
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return null;
  var data = sh.getRange(2, 1, lastRow - 1, 6).getValues();
  var now = Date.now();
  for (var i = data.length - 1; i >= 0; i--) { // newest first
    if (String(data[i][0]).trim() !== lineUserId) continue;
    if (String(data[i][5]).trim() !== 'pending') continue;
    var expiresAt = data[i][4] instanceof Date ? data[i][4].getTime() : Date.parse(data[i][4]);
    var intent = null;
    try { intent = JSON.parse(data[i][2]); } catch (e) {}
    return {
      rowIndex: i + 2,
      intent: intent,
      expired: !isNaN(expiresAt) && now > expiresAt
    };
  }
  return null;
}

function _phxLineSetPendingStatus_(rowIndex, status) {
  _phxLineGetChatStateSheet_().getRange(rowIndex, 6).setValue(status);
}

// ════════════════════════════════════════════════════════════
// 🔧 Admin: enable/disable the chat-swap write path (Phase 3 pilot gate)
// ════════════════════════════════════════════════════════════
function phxLineEnableChatSwap() {
  PropertiesService.getScriptProperties().setProperty(_F6_SWAP_ENABLED_PROP, 'true');
  Logger.log('✅ LINE chat-swap ENABLED');
  return { ok: true };
}

function phxLineDisableChatSwap() {
  PropertiesService.getScriptProperties().deleteProperty(_F6_SWAP_ENABLED_PROP);
  Logger.log('✅ LINE chat-swap DISABLED');
  return { ok: true };
}

// ════════════════════════════════════════════════════════════
// 🧪 Manual tests (run from GAS editor)
// ════════════════════════════════════════════════════════════
function testF6ScheduleQuery() {
  var TEST_NAME = 'ณรพล';
  var pharmacist = _phxFindPharmacistRow(TEST_NAME);
  if (!pharmacist) { Logger.log('❌ test user not registered'); return; }
  pharmacist.lineUserId = pharmacist.lineUserId || 'Utest_line_user_001';
  Logger.log('เวรวันนี้: ' + _phxLineHandleScheduleQuery_(pharmacist, 0));
  Logger.log('เวรพรุ่งนี้: ' + _phxLineHandleScheduleQuery_(pharmacist, 1));
}

function testF6ParseSwapCommand() {
  Logger.log(JSON.stringify(_phxLineParseSwapCommand_('แลก 20 กับ ตี๋ 22')));
  Logger.log(JSON.stringify(_phxLineParseSwapCommand_('แลกเวรวันที่ 20 กับตี๋')));  // should be null — not structured
  Logger.log(JSON.stringify(_phxLineParseSwapCommand_('ยืนยัน')));                 // should be null
}
