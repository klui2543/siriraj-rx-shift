/**
 * Phase F2: LINE Messaging API — v2 DEFENSIVE
 *
 * Uses _f2SpreadsheetId() helper with hardcoded fallback if
 * SPREADSHEET_ID is not globally accessible from Code.gs.
 */

// ⚠️ Hardcoded fallback — change to your actual spreadsheet ID
var _F2_SPREADSHEET_ID_FALLBACK = '1V1Fo4rEadSYfqLDc1sZEE-fRtZ4Je5_30_EAclO3KHM';

function _f2SpreadsheetId() {
  if (typeof SPREADSHEET_ID !== 'undefined' && SPREADSHEET_ID) return SPREADSHEET_ID;
  return _F2_SPREADSHEET_ID_FALLBACK;
}

var _F2_LINE_GROUPS_SHEET = 'PHX_LineGroups';
var _F2_LINE_API_BASE = 'https://api.line.me/v2/bot';
var _F2_LINE_MAX_MSG_LEN = 4500;

function _phxLineGetToken() {
  return PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN') || '';
}
function _phxLineGetSecret() {
  return PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_SECRET') || '';
}

function _phxLineGetGroupsSheet() {
  var ss = SpreadsheetApp.openById(_f2SpreadsheetId());
  var sheet = ss.getSheetByName(_F2_LINE_GROUPS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(_F2_LINE_GROUPS_SHEET);
    sheet.getRange(1, 1, 1, 5).setValues([['groupId', 'sourceType', 'joinedAt', 'lastSeen', 'status']]);
    sheet.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#06c755').setFontColor('#fff');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 280);
  }
  return sheet;
}

function _phxLineCall(endpoint, payload) {
  var token = _phxLineGetToken();
  if (!token) return { ok: false, error: 'LINE_CHANNEL_ACCESS_TOKEN not set in Script Properties' };
  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': 'Bearer ' + token },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  try {
    var res = UrlFetchApp.fetch(_F2_LINE_API_BASE + endpoint, options);
    var code = res.getResponseCode();
    var body = res.getContentText();
    return { ok: code >= 200 && code < 300, code: code, body: body };
  } catch(e) {
    return { ok: false, error: String(e.message || e) };
  }
}

function _phxLinePushText(to, text) {
  var safeText = String(text || '').substring(0, _F2_LINE_MAX_MSG_LEN);
  return _phxLineCall('/message/push', {
    to: to,
    messages: [{ type: 'text', text: safeText }]
  });
}

function _phxLineGetActiveGroups() {
  var sheet = _phxLineGetGroupsSheet();
  var data = sheet.getDataRange().getValues();
  var groups = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    if ((row[4] || 'active') !== 'active') continue;
    groups.push({
      groupId: row[0],
      sourceType: row[1] || 'group',
      joinedAt: row[2],
      lastSeen: row[3]
    });
  }
  return groups;
}

function _phxLineAddGroup(groupId, sourceType) {
  var sheet = _phxLineGetGroupsSheet();
  var data = sheet.getDataRange().getValues();
  var now = new Date().toISOString();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === groupId) {
      sheet.getRange(i + 1, 4).setValue(now);
      sheet.getRange(i + 1, 5).setValue('active');
      Logger.log('[LINE] Reactivated group: ' + groupId);
      return;
    }
  }
  sheet.appendRow([groupId, sourceType || 'group', now, now, 'active']);
  Logger.log('[LINE] Added new group: ' + groupId);
}

function _phxLineMarkGroupLeft(groupId) {
  var sheet = _phxLineGetGroupsSheet();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === groupId) {
      sheet.getRange(i + 1, 5).setValue('left');
      Logger.log('[LINE] Marked group as left: ' + groupId);
      return;
    }
  }
}

function _phxLineUpdateLastSeen(groupId) {
  var sheet = _phxLineGetGroupsSheet();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === groupId) {
      sheet.getRange(i + 1, 4).setValue(new Date().toISOString());
      return;
    }
  }
}

function _phxLineHandleEvents(events) {
  if (!Array.isArray(events)) return;
  events.forEach(function(ev) {
    try {
      var src = ev.source || {};
      var type = src.type;
      var id = src.groupId || src.roomId || src.userId;
      if (!id) return;

      if (ev.type === 'join') {
        _phxLineAddGroup(id, type);
        if (ev.replyToken) {
          _phxLineCall('/message/reply', {
            replyToken: ev.replyToken,
            messages: [{
              type: 'text',
              text: '👋 ระบบ Siriraj Rx Shift พร้อมแล้ว\nกลุ่มนี้จะได้รับการแจ้งเตือนจากแอดมิน\n\nGroup ID: ' + id
            }]
          });
        }
      } else if (ev.type === 'leave') {
        _phxLineMarkGroupLeft(id);
      } else if (ev.type === 'message') {
        _phxLineUpdateLastSeen(id);
        if (ev.message && ev.message.type === 'text' && ev.replyToken) {
          var text = String(ev.message.text || '').trim().toLowerCase();
          if (text === '/ping' || text === 'ping') {
            _phxLineCall('/message/reply', {
              replyToken: ev.replyToken,
              messages: [{ type: 'text', text: 'pong 🏓 (' + id + ')' }]
            });
          }
        }
      }
    } catch(e) {
      Logger.log('[LINE webhook] event error: ' + e + ' | event: ' + JSON.stringify(ev));
    }
  });
}

function phxLineSendBroadcastToGroups(title, body) {
  var token = _phxLineGetToken();
  if (!token) return { sent: 0, total: 0, errors: [{ error: 'LINE token not configured' }] };
  var groups = _phxLineGetActiveGroups();
  if (groups.length === 0) return { sent: 0, total: 0, errors: [{ error: 'no active LINE groups' }] };
  var text = '📢 ' + (title || '') + '\n\n' + (body || '');
  var sent = 0;
  var errors = [];
  groups.forEach(function(g) {
    var r = _phxLinePushText(g.groupId, text);
    if (r.ok) sent++;
    else errors.push({ groupId: g.groupId, code: r.code, error: r.error || r.body });
    Utilities.sleep(80);
  });
  return { sent: sent, total: groups.length, errors: errors };
}

function phxLineListGroups(adminName, adminHash) {
  var role = _phxGetRole(adminName, adminHash);
  if (role !== 'admin') return { ok: false, error: 'admin only' };
  return { ok: true, groups: _phxLineGetActiveGroups() };
}

function phxLineTestPush(adminName, adminHash, groupId, text) {
  var role = _phxGetRole(adminName, adminHash);
  if (role !== 'admin') return { ok: false, error: 'admin only' };
  if (!groupId) return { ok: false, error: 'groupId required' };
  var r = _phxLinePushText(groupId, text || '🧪 Test from Siriraj Rx Shift @ ' + new Date().toISOString());
  return { ok: r.ok, code: r.code, body: r.body, error: r.error };
}

function phxLineGetStatus() {
  var token = _phxLineGetToken();
  var groups = token ? _phxLineGetActiveGroups() : [];
  return {
    configured: !!token,
    activeGroups: groups.length,
    groups: groups.map(function(g) {
      return { groupId: g.groupId.substring(0, 8) + '...', sourceType: g.sourceType };
    })
  };
}

function devSetupLineGroupsSheet() {
  var sheet = _phxLineGetGroupsSheet();
  Logger.log('Line groups sheet ready: ' + sheet.getName() + ' (' + sheet.getLastRow() + ' rows)');
  Logger.log('Using spreadsheet: ' + _f2SpreadsheetId());
  Logger.log('Token configured: ' + (!!_phxLineGetToken()));
}

// doPost — handles LINE webhook events
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput('OK');
    }
    var bodyText = e.postData.contents;
    var body;
    try { body = JSON.parse(bodyText); } catch(_) { return ContentService.createTextOutput('OK'); }

    if (body && Array.isArray(body.events)) {
      _phxLineHandleEvents(body.events);
      return ContentService.createTextOutput('OK');
    }

    return ContentService.createTextOutput('OK');
  } catch(err) {
    Logger.log('[doPost] error: ' + err);
    return ContentService.createTextOutput('OK');
  }
}