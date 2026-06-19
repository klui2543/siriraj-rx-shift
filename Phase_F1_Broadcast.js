/**
 * Phase F1: Broadcast (Email + LINE + In-App Banner) — v2 DEFENSIVE
 *
 * Defensive features:
 *   - Uses `var` instead of `const` (no "already declared" errors)
 *   - _f1SpreadsheetId() helper with hardcoded fallback if SPREADSHEET_ID
 *     is not globally accessible
 *
 * Sheet `PHX_Broadcasts` schema (12 columns):
 *   A: id, B: title, C: body, D: createdAt, E: createdBy,
 *   F: expiresAt, G: emailSent, H: emailSentCount, I: readBy, J: status,
 *   K: lineSent, L: lineSentCount
 */

// ⚠️ Hardcoded fallback — change to your actual spreadsheet ID
var _F1_SPREADSHEET_ID_FALLBACK = '1V1Fo4rEadSYfqLDc1sZEE-fRtZ4Je5_30_EAclO3KHM';

function _f1SpreadsheetId() {
  // Try global SPREADSHEET_ID first; fall back to hardcoded ID
  if (typeof SPREADSHEET_ID !== 'undefined' && SPREADSHEET_ID) return SPREADSHEET_ID;
  return _F1_SPREADSHEET_ID_FALLBACK;
}

var _F1_SHEET = 'PHX_Broadcasts';
var _F1_MAX_TITLE = 200;
var _F1_MAX_BODY = 4000;
var _F1_DEFAULT_EXPIRE_DAYS = 14;
var _F1_MAX_EXPIRE_DAYS = 60;

function _phxGetBroadcastSheet() {
  var ss = SpreadsheetApp.openById(_f1SpreadsheetId());
  var sheet = ss.getSheetByName(_F1_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(_F1_SHEET);
    sheet.getRange(1, 1, 1, 12).setValues([[
      'id', 'title', 'body', 'createdAt', 'createdBy',
      'expiresAt', 'emailSent', 'emailSentCount', 'readBy', 'status',
      'lineSent', 'lineSentCount'
    ]]);
    sheet.getRange(1, 1, 1, 12).setFontWeight('bold').setBackground('#1e3a8a').setFontColor('#fff');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 180);
    sheet.setColumnWidth(2, 220);
    sheet.setColumnWidth(3, 400);
    sheet.setColumnWidth(9, 250);
  } else {
    // Auto-migrate: add lineSent/lineSentCount columns if missing
    var lastCol = sheet.getLastColumn();
    if (lastCol < 12) {
      sheet.getRange(1, 11, 1, 2).setValues([['lineSent', 'lineSentCount']]);
      sheet.getRange(1, 11, 1, 2).setFontWeight('bold').setBackground('#06c755').setFontColor('#fff');
    }
  }
  return sheet;
}

function _phxGenerateBroadcastId() {
  return 'b_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
}

function phxBroadcastCreate(adminName, adminHash, title, body, sendEmail, sendLine, expireDays) {
  var role = (typeof _phxGetRole === 'function') ? _phxGetRole(adminName, adminHash) : null;
  if (role !== 'admin') return { ok: false, error: 'admin only' };

  title = String(title || '').trim();
  body = String(body || '').trim();
  if (!title) return { ok: false, error: 'title required' };
  if (title.length > _F1_MAX_TITLE) return { ok: false, error: 'title too long (max ' + _F1_MAX_TITLE + ')' };
  if (!body) return { ok: false, error: 'body required' };
  if (body.length > _F1_MAX_BODY) return { ok: false, error: 'body too long (max ' + _F1_MAX_BODY + ')' };

  expireDays = parseInt(expireDays);
  if (!expireDays || expireDays < 1) expireDays = _F1_DEFAULT_EXPIRE_DAYS;
  if (expireDays > _F1_MAX_EXPIRE_DAYS) expireDays = _F1_MAX_EXPIRE_DAYS;

  var now = new Date();
  var expiresAt = new Date(now.getTime() + expireDays * 86400000);
  var id = _phxGenerateBroadcastId();

  // ---- LINE (primary channel) ----
  var lineSentCount = 0, lineTotal = 0;
  var lineErrors = [];
  if (sendLine) {
    if (typeof phxLineSendBroadcastToGroups === 'function') {
      var lr = phxLineSendBroadcastToGroups(title, body);
      lineSentCount = lr.sent;
      lineTotal = lr.total;
      lineErrors = lr.errors;
    } else {
      lineErrors.push({ error: 'Phase_F2_LINE.gs not deployed' });
    }
  }

  // ---- Email (optional fallback) ----
  var emailSentCount = 0;
  var emailErrors = [];
  if (sendEmail) {
    var recipients = _phxGetBroadcastRecipients();
    if (recipients.length === 0) {
      emailErrors.push({ name: '-', email: '-', error: 'no recipients found' });
    } else {
      var er = _phxSendBroadcastEmails(title, body, recipients);
      emailSentCount = er.sent;
      emailErrors = er.errors;
    }
  }

  // ---- Save ----
  var sheet = _phxGetBroadcastSheet();
  sheet.appendRow([
    id, title, body, now.toISOString(), adminName,
    expiresAt.toISOString(),
    sendEmail ? 'Y' : 'N', emailSentCount,
    '{}', 'active',
    sendLine ? 'Y' : 'N', lineSentCount
  ]);

  return {
    ok: true,
    id: id,
    emailSentCount: emailSentCount,
    emailErrors: emailErrors.slice(0, 5),
    lineSentCount: lineSentCount,
    lineTotal: lineTotal,
    lineErrors: lineErrors.slice(0, 5)
  };
}

function _phxGetBroadcastRecipients() {
  // 📧 FIX#5: อีเมลอยู่ใน PHX_Pharmacists_Master (approvedEmail) ไม่ใช่ PHX_Pharmacists
  var ss = SpreadsheetApp.openById(_f1SpreadsheetId());
  var sheet = ss.getSheetByName('PHX_Pharmacists_Master');
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  var recipients = [];
  for (var i = 1; i < data.length; i++) {
    var name = data[i][0];
    var email = data[i][1];    // ช่อง 2 = approvedEmail
    var active = data[i][2];   // ช่อง 3 = active flag
    var isActive = (active === true) || (String(active).toUpperCase() === 'TRUE');
    if (name && email && String(email).indexOf('@') >= 0 && isActive) {
      recipients.push({ name: String(name), email: String(email) });
    }
  }
  return recipients;
}

function _phxSendBroadcastEmails(title, body, recipients) {
  var sent = 0;
  var errors = [];
  var appUrl = ScriptApp.getService().getUrl();
  for (var i = 0; i < recipients.length; i++) {
    var r = recipients[i];
    try {
      var html = _phxBuildBroadcastEmailHtml(title, body, r.name, appUrl);
      var text = title + '\n\n' + body + '\n\n— ทีม Siriraj Rx Shift\n' + appUrl;
      MailApp.sendEmail({
        to: r.email,
        subject: '[Siriraj Rx Shift] ' + title,
        body: text,
        htmlBody: html,
        name: 'Siriraj Rx Shift'
      });
      sent++;
    } catch(e) {
      errors.push({ name: r.name, email: r.email, error: String(e.message || e) });
    }
  }
  return { sent: sent, errors: errors };
}

function _phxBuildBroadcastEmailHtml(title, body, recipientName, appUrl) {
  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  var T = esc(title);
  var B = esc(body).replace(/\n/g, '<br>');
  var N = esc(recipientName);
  var U = esc(appUrl);
  return ''
    + '<!DOCTYPE html><html><body style="font-family:Tahoma,Arial,sans-serif;background:#f0f4f8;padding:20px;margin:0;">'
    + '<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;padding:30px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">'
    + '<div style="background:#1e3a8a;color:white;padding:15px 20px;border-radius:6px;margin-bottom:20px;">'
    + '<h1 style="margin:0;font-size:18px;">📢 Siriraj Rx Shift</h1>'
    + '<div style="font-size:13px;opacity:0.9;margin-top:4px;">ประกาศจากแอดมิน</div></div>'
    + '<h2 style="color:#1e3a8a;font-size:20px;margin:0 0 15px;">' + T + '</h2>'
    + '<div style="color:#334;font-size:15px;line-height:1.6;padding:0 0 20px;border-bottom:1px solid #e5e7eb;">' + B + '</div>'
    + '<div style="margin-top:20px;text-align:center;">'
    + '<a href="' + U + '" style="display:inline-block;background:#1e3a8a;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:500;">เปิดแอป Siriraj Rx Shift</a></div>'
    + '<div style="margin-top:25px;font-size:11px;color:#888;text-align:center;">ส่งถึง ' + N + '<br>อีเมลนี้ส่งโดยระบบ — ไม่ต้องตอบกลับ</div>'
    + '</div></body></html>';
}

function phxBroadcastList() {
  var sheet = _phxGetBroadcastSheet();
  var data = sheet.getDataRange().getValues();
  var now = new Date();
  var broadcasts = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    if ((row[9] || 'active') !== 'active') continue;
    if (new Date(row[5]) < now) continue;
    broadcasts.push({
      id: row[0], title: row[1], body: row[2],
      createdAt: row[3], createdBy: row[4], expiresAt: row[5],
      emailSent: row[6] === 'Y', emailSentCount: row[7],
      lineSent: row[10] === 'Y', lineSentCount: row[11]
    });
  }
  broadcasts.sort(function(a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
  return { ok: true, broadcasts: broadcasts };
}

function phxBroadcastMarkRead(name, hash, broadcastId) {
  if (!_phxVerifyAuth(name, hash)) return { ok: false, error: 'not authenticated' };
  var sheet = _phxGetBroadcastSheet();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === broadcastId) {
      var readBy = {};
      try { readBy = JSON.parse(data[i][8] || '{}'); } catch(e) {}
      readBy[name] = new Date().toISOString();
      sheet.getRange(i + 1, 9).setValue(JSON.stringify(readBy));
      return { ok: true };
    }
  }
  return { ok: false, error: 'broadcast not found' };
}

function phxBroadcastGetReadIds(name, hash) {
  if (!_phxVerifyAuth(name, hash)) return { ok: false, error: 'not authenticated' };
  var sheet = _phxGetBroadcastSheet();
  var data = sheet.getDataRange().getValues();
  var readIds = [];
  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    try {
      var readBy = JSON.parse(data[i][8] || '{}');
      if (readBy[name]) readIds.push(data[i][0]);
    } catch(e) {}
  }
  return { ok: true, readIds: readIds };
}

function phxBroadcastDismiss(adminName, adminHash, broadcastId) {
  var role = _phxGetRole(adminName, adminHash);
  if (role !== 'admin') return { ok: false, error: 'admin only' };
  var sheet = _phxGetBroadcastSheet();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === broadcastId) {
      sheet.getRange(i + 1, 10).setValue('archived');
      return { ok: true };
    }
  }
  return { ok: false, error: 'broadcast not found' };
}

function devSetupBroadcastSheet() {
  var sheet = _phxGetBroadcastSheet();
  Logger.log('Broadcast sheet ready: ' + sheet.getName() + ' (' + sheet.getLastRow() + ' rows)');
  Logger.log('Last column: ' + sheet.getLastColumn() + ' (should be 12)');
  Logger.log('Using spreadsheet: ' + _f1SpreadsheetId());
}