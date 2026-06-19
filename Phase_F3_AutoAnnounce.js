/**
 * Phase F3: Auto-Announce New Month
 *
 * Sends a pre-formatted LINE broadcast announcing that a new month's
 * schedule has been published. Includes the app URL for easy access.
 *
 * Two entry points:
 *   - phxAnnounceNewMonth(admin, hash, monthId) — manual, admin UI
 *   - phxAnnounceNewMonthInternal(monthId, actorName) — auto, callable from upload
 *
 * Dependencies: Phase_F1_Broadcast.gs, Phase_F2_LINE.gs
 */

function _phxFormatMonthLabel(monthId) {
  // m_มิถุนายน_2569 → "มิถุนายน 2569"
  var m = String(monthId || '').match(/^m_(.+?)_(\d{4})$/);
  if (!m) return String(monthId || '');
  return m[1] + ' ' + m[2];
}

function _phxBuildMonthAnnounceMessage(monthId) {
  var label = _phxFormatMonthLabel(monthId);
  var appUrl = ScriptApp.getService().getUrl();
  return {
    title: '📅 ตารางเวรเดือน ' + label + ' ออกแล้ว',
    body: 'ตรวจสอบเวรของท่านได้ที่:\n' + appUrl + '\n\n— Siriraj Rx Shift'
  };
}

/**
 * Admin manually triggers the announcement via UI.
 * Uses phxBroadcastCreate (which logs to PHX_Broadcasts + pushes via LINE).
 */
function phxAnnounceNewMonth(adminName, adminHash, monthId) {
  var role = (typeof _phxGetRole === 'function') ? _phxGetRole(adminName, adminHash) : null;
  if (role !== 'admin') return { ok: false, error: 'admin only' };
  if (!monthId) return { ok: false, error: 'monthId required' };

  var msg = _phxBuildMonthAnnounceMessage(monthId);
  // LINE broadcast + log to PHX_Broadcasts (email handled below for opt-out support)
  var bResult = phxBroadcastCreate(
    adminName, adminHash,
    msg.title, msg.body,
    false,  // sendEmail = no (we handle via opt-out filter below)
    true,   // sendLine = yes
    14      // expireDays
  );

  // F1: Email block with opt-out filter
  var emailQueued = 0;
  var emailErrors = [];
  try {
    var recipients = _phxGetAnnounceEmailRecipients();
    if (recipients.length > 0) {
      emailQueued = _phxQueueEmailsBatch(recipients, msg.title, msg.body);
      Logger.log('[F1 manual] queued ' + emailQueued + ' emails');
    }
  } catch(e) {
    emailErrors.push(String(e.message || e));
    Logger.log('[F1 manual] email error: ' + e);
  }

  if (bResult && typeof bResult === 'object') {
    bResult.emailQueuedCount = emailQueued;
    bResult.emailErrors = emailErrors.slice(0, 3);
  }
  return bResult;
}

/**
 * Internal auto-trigger — call this from your upload handler after successful publish.
 *
 * Example usage in your upload function:
 *   var uploadResult = doProcessUpload(...);
 *   if (uploadResult.ok && notifyAfterUpload) {
 *     phxAnnounceNewMonthInternal(uploadResult.monthId, adminName);
 *   }
 *
 * Skips auth check (internal call) but still logs to sheet for audit.
 */
function phxAnnounceNewMonthInternal(monthId, actorName) {
  if (!monthId) return { ok: false, error: 'monthId required' };

  var msg = _phxBuildMonthAnnounceMessage(monthId);

  // Push to LINE
  var lineResult = (typeof phxLineSendBroadcastToGroups === 'function')
    ? phxLineSendBroadcastToGroups(msg.title, msg.body)
    : { sent: 0, total: 0, errors: [{ error: 'Phase_F2_LINE.gs not deployed' }] };

  // 📧 B3a: queue emails to PHX_EmailQueue (drained by @mahidol sender)
  var emailQueued = 0;
  var emailErrors = [];
  try {
    var recipients = _phxGetAnnounceEmailRecipients();  // F1: opt-out filter
    if (recipients.length > 0) {
      emailQueued = _phxQueueEmailsBatch(recipients, msg.title, msg.body);
      Logger.log('[F3 AutoAnnounce] queued ' + emailQueued + ' opt-in emails (' + recipients.length + ' recipients)');
    } else {
      Logger.log('[F3 AutoAnnounce] no recipients — skipping email queue');
    }
  } catch(e) {
    emailErrors.push(String(e.message || e));
    Logger.log('[F3 AutoAnnounce] email queue error: ' + e);
  }

  // Log to PHX_Broadcasts for audit + UI banner
  try {
    var sheet = _phxGetBroadcastSheet();
    var id = _phxGenerateBroadcastId();
    var now = new Date();
    var expiresAt = new Date(now.getTime() + 14 * 86400000);
    sheet.appendRow([
      id, msg.title, msg.body,
      now.toISOString(),
      actorName || 'system (auto)',
      expiresAt.toISOString(),
      emailQueued > 0 ? 'Y' : 'N',  // emailSent (queued)
      emailQueued,                    // emailSentCount (queued count, not actual sent)
      '{}', 'active',
      'Y', lineResult.sent
    ]);
  } catch(e) {
    Logger.log('[F3 AutoAnnounce] log error: ' + e);
  }

  return {
    ok: true,
    monthId: monthId,
    label: _phxFormatMonthLabel(monthId),
    lineSentCount: lineResult.sent,
    lineTotal: lineResult.total,
    lineErrors: lineResult.errors.slice(0, 3),
    emailQueuedCount: emailQueued,
    emailErrors: emailErrors.slice(0, 3)
  };
}

/**
 * 📧 B3a — รวม recipients สำหรับแจ้งเตือนเดือนใหม่
 * Rule: ถ้า user มี backup → ใช้ backup แทน primary (ไม่ส่งทั้งคู่)
 *       ถ้าไม่มี backup → ใช้ primary
 *       Dedup โดย email address (กันคนตั้ง backup = primary ตัวเอง)
 *
 * @return {{name, email, kind:'primary'|'backup'}[]}
 */
function _phxGetNotifyRecipients() {
  // Step 1: อ่าน backup emails จาก PHX_Pharmacists col E
  var backups = {};  // name → backupEmail
  try {
    var ss = SpreadsheetApp.openById(_f1SpreadsheetId());
    var sh = ss.getSheetByName('PHX_Pharmacists');
    if (sh && sh.getLastRow() > 1) {
      var data = sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues();
      for (var i = 0; i < data.length; i++) {
        var name = String(data[i][0] || '').trim();
        var backup = String(data[i][4] || '').trim();
        if (name && backup && backup.indexOf('@') >= 0) {
          backups[name] = backup;
        }
      }
    }
  } catch(e) {
    Logger.log('[B3a] read backups error: ' + e);
  }

  // Step 2: อ่าน primaries จาก Master (active เท่านั้น)
  var primaries = _phxGetBroadcastRecipients();  // [{name, email}]

  // Step 3: merge — backup wins over primary
  var result = [];
  var seenEmails = {};
  primaries.forEach(function(p) {
    var hasBackup = !!backups[p.name];
    var targetEmail = hasBackup ? backups[p.name] : p.email;
    if (!seenEmails[targetEmail]) {
      seenEmails[targetEmail] = true;
      result.push({
        name: p.name,
        email: targetEmail,
        kind: hasBackup ? 'backup' : 'primary'
      });
    }
  });
  return result;
}

/**
 * 📧 B3a — Queue emails ลง PHX_EmailQueue (batch write — เร็วกว่า appendRow loop)
 * Sender (@mahidol project) จะ drain ต่อ trigger ทุก 5 นาที
 *
 * Schema: A=uuid, B=to, C=subject, D=body, E=status, F=created, G=sentAt, H=error
 *
 * @param {{name, email, kind}[]} recipients
 * @param {string} subject
 * @param {string} body  Plain text (newlines OK)
 * @return {number} จำนวน rows ที่เขียน
 */
function _phxQueueEmailsBatch(recipients, subject, body) {
  if (!recipients || recipients.length === 0) return 0;
  var ss = SpreadsheetApp.openById(_f1SpreadsheetId());
  var sheet = ss.getSheetByName('PHX_EmailQueue');
  if (!sheet) {
    sheet = ss.insertSheet('PHX_EmailQueue');
    sheet.getRange(1, 1, 1, 8).setValues([
      ['uuid', 'to', 'subject', 'body', 'status', 'created', 'sentAt', 'error']
    ]);
    sheet.setFrozenRows(1);
  }
  var now = new Date();
  var rows = recipients.map(function(r) {
    return [Utilities.getUuid(), r.email, subject, body, 'pending', now, '', ''];
  });
  // Batch write — แทน appendRow loop (เร็วขึ้น ~10x สำหรับ 300 rows)
  var startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, rows.length, 8).setValues(rows);
  return rows.length;
}

/**
 * Dev: test the announce message format without actually sending.
 */
function devPreviewAnnounce(monthId) {
  monthId = monthId || 'm_มิถุนายน_2569';
  var msg = _phxBuildMonthAnnounceMessage(monthId);
  Logger.log('--- Title ---\n' + msg.title);
  Logger.log('--- Body ---\n' + msg.body);
  return msg;
}

/** เช็ครายชื่อ recipients ที่จะส่ง (ไม่ queue จริง) */
function testB3a_RecipientsPreview() {
  var r = _phxGetNotifyRecipients();
  var byKind = { primary: 0, backup: 0 };
  r.forEach(function(x) { byKind[x.kind]++; });
  Logger.log('Total: ' + r.length + ' (primary: ' + byKind.primary + ', backup: ' + byKind.backup + ')');
  Logger.log('First 5:\n' + JSON.stringify(r.slice(0, 5), null, 2));
}

/** Queue email ทดสอบ 1 ฉบับหา admin */
function testB3a_QueueSingleEmail() {
  var subject = '🧪 Test B3a — ' + new Date().toLocaleString('th-TH');
  var body = 'นี่คือ email ทดสอบจาก B3a\n\nถ้าได้รับ = ระบบ queue → @mahidol sender ทำงานปกติ';
  var n = _phxQueueEmailsBatch(
    [{ name: 'admin test', email: 'norapol.uttho@gmail.com', kind: 'primary' }],
    subject, body
  );
  Logger.log('Queued: ' + n + ' row(s)');
}

/** Dry-run: ดูว่า phxAnnounceNewMonthInternal จะส่งกี่ฉบับสำหรับเดือนหนึ่ง */
function testB3a_AnnounceDryRun() {
  // อย่าใช้ใน production — แค่ดู recipients count
  var r = _phxGetNotifyRecipients();
  Logger.log('ถ้า trigger ตอนนี้ จะ queue ' + r.length + ' emails');
}